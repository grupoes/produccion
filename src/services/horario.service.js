import prisma from "../config/db.js";

// Mapea getDay() (0=Dom, 1=Lun..6=Sáb) al id de la tabla `dias`
// (1=Lunes .. 6=Sábado). Domingo no existe en `dias`.
const DAY_ID_BY_GETDAY = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

class HorarioService {
  // Devuelve los eventos del `usuario_id` dentro del rango [desde, hasta]
  // (ambos inclusivos), listos para FullCalendar.
  // Une `horario_usuario` con `actividades`, `tarea`, `prospectos` y
  // `personas` para dar contexto al título y al modal de detalle.
  async getEventosPorUsuario(usuarioId, desde, hasta) {
    const uid = Number(usuarioId);
    if (!uid) return [];

    const params = [uid];
    let whereSql = "WHERE hu.usuario_id = $1 AND hu.estado = true";
    if (desde) {
      params.push(desde);
      whereSql += ` AND hu.fecha >= $${params.length}::date`;
    }
    if (hasta) {
      params.push(hasta);
      whereSql += ` AND hu.fecha <= $${params.length}::date`;
    }

    // Formateamos fecha y horas en SQL con TO_CHAR para que no se
    // vean afectados por la zona horaria del servidor ni por la del
    // driver de pg al devolver `Date`/`Timetz`. Así siempre recibimos
    // strings "YYYY-MM-DD" y "HH:MM:SS" exactos.
    const rows = await prisma.$queryRawUnsafe(
      `SELECT
         hu.id,
         hu.actividad_id,
         hu.usuario_id,
         TO_CHAR(hu.fecha,                 'YYYY-MM-DD')  AS fecha,
         TO_CHAR(hu.hora_inicio::time,     'HH24:MI:SS')  AS hora_inicio,
         TO_CHAR(hu.hora_fin::time,        'HH24:MI:SS')  AS hora_fin,
         hu.estado,
         hu.tipo,
         hu.categoria,
         hu.duracion_minutos,
         a.id            AS a_id,
         a.estado_progreso,
         a.prioridad,
         a.tarea_id,
         a.color         AS color,
         a.bloqueada     AS bloqueada,
         a.fecha_inicio_real,
         TO_CHAR(a.fecha_inicio_real,   'YYYY-MM-DD')  AS fir_fecha,
         TO_CHAR(a.hora_inicio_real::time,  'HH24:MI:SS') AS fir_hora,
         a.fecha_termino_real,
         TO_CHAR(a.fecha_termino_real,  'YYYY-MM-DD')  AS ftr_fecha,
         TO_CHAR(a.hora_termino_real::time, 'HH24:MI:SS') AS ftr_hora,
         a.tiempo_real_minutos,
         t.nombre        AS tarea_nombre,
         a.prospecto_id,
         p.titulo_prospecto,
         p.estado_cliente,
         p.fecha_contacto,
         p.fecha_entrega,
         p.contenido,
         p.link_drive,
         (
           SELECT json_agg(
             json_build_object(
               'id', per.id,
               'nombres', per.nombres,
               'apellidos', per.apellidos,
               'celular', per.celular,
               'email', per.email
             ) ORDER BY per.id
           )
           FROM prospecto_persona pp
           JOIN personas per ON per.id = pp.persona_id
           WHERE pp.prospecto_id = p.id
         ) AS contactos
       FROM horario_usuario hu
       LEFT JOIN actividades a ON a.id = hu.actividad_id
       LEFT JOIN tarea t       ON t.id = a.tarea_id
       LEFT JOIN prospectos p  ON p.id = a.prospecto_id
       ${whereSql}
       ORDER BY hu.fecha ASC, hu.hora_inicio ASC NULLS LAST`,
      ...params,
    );

    return rows.map((r) => {
      const fechaStr = r.fecha || "";
      const hi = r.hora_inicio || "08:00:00";
      const hf = r.hora_fin || null;
      const start = `${fechaStr}T${hi}`;
      const end = hf ? `${fechaStr}T${hf}` : null;

      const tarea = r.tarea_nombre || "Actividad";
      const titulo = r.titulo_prospecto
        ? `${tarea} — ${r.titulo_prospecto}`
        : tarea;
      const contactos = Array.isArray(r.contactos) ? r.contactos : [];
      const contactosTxt = contactos
        .map((c) => [c.nombres, c.apellidos].filter(Boolean).join(" ").trim())
        .filter(Boolean)
        .join(", ");
      const fullTitle = contactosTxt
        ? `${titulo} (${contactosTxt})`
        : titulo;

      // Color de la actividad. Si no hay, no seteamos backgroundColor
      // para que FullCalendar use el default del tema.
      const ev = {
        id: `hu-${r.id}`,
        title: fullTitle,
        start,
        end,
        allDay: false,
        extendedProps: {
          horario_id: r.id,
          actividad_id: r.actividad_id,
          prospecto_id: r.prospecto_id,
          estado_progreso: r.estado_progreso,
          prioridad: r.prioridad,
          bloqueada: r.bloqueada === true || r.bloqueada === "true",
          categoria: r.categoria,
          tipo: r.tipo,
          duracion_minutos: r.duracion_minutos,
          fecha: fechaStr,
          hora_inicio: hi,
          hora_fin: hf,
          tarea: r.tarea_nombre,
          titulo_prospecto: r.titulo_prospecto,
          estado_cliente: r.estado_cliente,
          fecha_contacto: r.fecha_contacto,
          fecha_entrega: r.fecha_entrega,
          contenido: r.contenido,
          link_drive: r.link_drive,
          contactos,
          color: r.color || null,
          fecha_inicio_real: r.fir_fecha || null,
          hora_inicio_real: r.fir_hora || null,
          fecha_termino_real: r.ftr_fecha || null,
          hora_termino_real: r.ftr_hora || null,
          tiempo_real_minutos: r.tiempo_real_minutos
            ? Number(r.tiempo_real_minutos)
            : null,
        },
      };
      if (r.color) {
        ev.backgroundColor = r.color;
        ev.borderColor = r.color;
        ev.textColor = "#fff";
        ev.className = "border-0 fw-medium";
      } else {
        ev.className =
          "bg-transparent text-body border rounded border-light fw-medium";
      }
      // Estilo según estado_progreso: completada → opaca; en_progreso →
      // borde sólido (clase por defecto pero reforzamos via className).
      const estado = String(r.estado_progreso || "").toLowerCase();
      if (estado === "completada" || estado === "completado") {
        ev.className = (ev.className || "") + " opacity-50";
      }
      return ev;
    });
  }

  // Devuelve si el usuario tiene un bloque de horario configurado para el
  // día de la semana de `fecha` (YYYY-MM-DD). Se considera "sin jornada"
  // si: no existe el usuario, está inactivo, su tipo de jornada no es
  // full/part time, o no hay filas en horario_jornada_detalle para ese
  // día. Lo usa el modal de "Agregar Cliente" para mostrar un warning
  // inline antes de programar manualmente.
  async usuarioTieneJornada(usuarioId, fechaStr) {
    const uid = Number(usuarioId);
    if (!uid || !fechaStr) return { tiene_jornada: false, motivo: "Datos inválidos." };

    const fm = String(fechaStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!fm) return { tiene_jornada: false, motivo: "Fecha inválida." };
    const fechaLocal = new Date(Number(fm[1]), Number(fm[2]) - 1, Number(fm[3]));

    const diaId = DAY_ID_BY_GETDAY[fechaLocal.getDay()] || null;
    if (!diaId) {
      // Domingo → no se trabaja en este sistema.
      return {
        tiene_jornada: false,
        motivo: "Domingo: no se configura jornada.",
      };
    }

    const usuario = await prisma.usuarios.findUnique({
      where: { id: uid },
      select: {
        estado: true,
        tipo_jornada: { select: { id: true, nombre_jornada: true } },
      },
    });
    if (!usuario) return { tiene_jornada: false, motivo: "Usuario no existe." };
    if (!usuario.estado) {
      return { tiene_jornada: false, motivo: "Usuario inactivo." };
    }
    const nombreJornada = usuario.tipo_jornada?.nombre_jornada;
    if (!nombreJornada || !norm(nombreJornada).match(/full time|part time/)) {
      return {
        tiene_jornada: false,
        motivo: "El usuario no tiene tipo de jornada (full/part time).",
      };
    }

    const count = await prisma.horario_jornada_detalle.count({
      where: { usuario_id: uid, dia_semana: diaId, estado: true },
    });

    return {
      tiene_jornada: count > 0,
      motivo: count > 0 ? null : "Sin bloques de horario para este día.",
    };
  }
}

export default new HorarioService();
