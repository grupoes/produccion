import prisma from "../config/db.js";

// Estados válidos de `actividades.estado_progreso` que se persisten en
// `actividad_estado_historial.estado_progreso`.
const ESTADOS_VALIDOS = ["pendiente", "en_progreso", "completada"];

/**
 * Servicio central para registrar las transiciones de estado de una
 * actividad en la tabla `actividad_estado_historial`.
 *
 * Esquema del historial (una fila por cada "estadia" en un estado):
 *
 *   id                PK
 *   actividad_id      FK → actividades
 *   estado_progreso   "pendiente" | "en_progreso" | "completada"
 *   fecha_inicio      Timestamptz — cuándo entró a este estado
 *   fecha_fin         Timestamptz — cuándo salió (NULL si sigue en él)
 *   duracion_segundos Int        — segundos en este estado
 *
 * El helper `transicion()` se ocupa de mantener la consistencia:
 *   1) Cierra la fila abierta del estado anterior (si existe y es
 *      distinto al nuevo) calculando `duracion_segundos = now - fecha_inicio`.
 *   2) Abre una nueva fila para el nuevo estado con `fecha_inicio = now`
 *      y `fecha_fin = null`.
 *   3) Es idempotente: si ya hay una fila abierta con el mismo estado,
 *      no hace nada (útil ante reintentos).
 *
 * Casos de uso:
 *   - Al crear la actividad: `transicion(tx, id, "pendiente", created_at)`.
 *   - Al iniciar trabajo:    `transicion(tx, id, "en_progreso", now)`.
 *   - Al cerrar:             `transicion(tx, id, "completada", now, { duracionSegOverride })`.
 *   - En drag&drop del Kanban: `transicion(tx, id, estado, now)`.
 */
class ActividadEstadoHistorialService {
  /**
   * @param {object} txOrPrisma - cliente de Prisma (transacción o global).
   * @param {number} actividadId
   * @param {"pendiente"|"en_progreso"|"completada"} nuevoEstado
   * @param {Date} [now] - timestamp de la transición (default new Date()).
   * @param {object} [opts]
   * @param {number} [opts.duracionSegOverride] - duración calculada por el
   *   caller (ej. el endpoint `end` que resta `pausa_minutos`); si no se
   *   pasa, se calcula como `now - fecha_inicio` de la fila abierta.
   * @param {Date} [opts.creadaEn] - para inserts iniciales sin fila previa,
   *   usar como `fecha_inicio` en vez de `now` (típicamente
   *   `actividades.created_at` para que la duración "pendiente" sea exacta).
   * @returns {Promise<{id:number, cerrada:object|null, yaExistia:boolean}>}
   */
  static async transicion(
    txOrPrisma,
    actividadId,
    nuevoEstado,
    now = new Date(),
    opts = {},
  ) {
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) {
      throw new Error(
        `Estado de progreso inválido para historial: ${nuevoEstado}`,
      );
    }
    const client = txOrPrisma || prisma;
    const aid = Number(actividadId);
    if (!aid) {
      throw new Error(`actividadId inválido: ${actividadId}`);
    }

    // 1) Buscar la fila abierta (fecha_fin IS NULL) más reciente.
    const abierta = await client.actividad_estado_historial.findFirst({
      where: { actividad_id: aid, fecha_fin: null },
      orderBy: { id: "desc" },
    });

    // 2) Idempotencia: si ya hay una fila abierta del mismo estado, salir.
    if (abierta && abierta.estado_progreso === nuevoEstado) {
      return { id: abierta.id, cerrada: null, yaExistia: true };
    }

    // 3) Cerrar la fila abierta (si hay y es de otro estado).
    let cerrada = null;
    if (abierta) {
      let duracionSeg = opts.duracionSegOverride;
      if (duracionSeg == null) {
        duracionSeg = abierta.fecha_inicio
          ? Math.max(
              0,
              Math.floor(
                (now.getTime() - new Date(abierta.fecha_inicio).getTime()) /
                  1000,
              ),
            )
          : null;
      }
      await client.actividad_estado_historial.update({
        where: { id: abierta.id },
        data: { fecha_fin: now, duracion_segundos: duracionSeg },
      });
      cerrada = { id: abierta.id, duracion_segundos: duracionSeg };
    }

    // 4) Abrir nueva fila para el nuevo estado.
    const nueva = await client.actividad_estado_historial.create({
      data: {
        actividad_id: aid,
        estado_progreso: nuevoEstado,
        fecha_inicio: opts.creadaEn || now,
        fecha_fin: null,
        duracion_segundos: null,
      },
    });

    return { id: nueva.id, cerrada, yaExistia: false };
  }

  /**
   * Devuelve el historial completo de una actividad, ordenado del más
   * reciente al más antiguo. Útil para mostrar la línea de tiempo en el
   * modal de detalle del Kanban o en otra vista de "auditoría".
   *
   * @param {number} actividadId
   * @returns {Promise<Array<{
   *   id:number, estado_progreso:string, fecha_inicio:Date|null,
   *   fecha_fin:Date|null, duracion_segundos:number|null
   * }>>}
   */
  static async getHistorial(actividadId) {
    const aid = Number(actividadId);
    if (!aid) return [];
    return await prisma.actividad_estado_historial.findMany({
      where: { actividad_id: aid },
      orderBy: { id: "asc" },
      select: {
        id: true,
        estado_progreso: true,
        fecha_inicio: true,
        fecha_fin: true,
        duracion_segundos: true,
      },
    });
  }
}

export default ActividadEstadoHistorialService;
