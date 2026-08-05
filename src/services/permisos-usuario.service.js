import prisma from "../config/db.js";

const ROL_ASISTENTE_PROD_ID = 11;

function toMin(val) {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  const parts = s.split(":");
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minToHHMM(min) {
  if (min == null || isNaN(min)) return null;
  min = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function fmtLocalDate(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(str) {
  if (!str) return null;
  const parts = str.split("-");
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

const DAY_ID_BY_GETDAY = { 0: null, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };

class PermisosUsuarioService {

  // Listar permisos de un usuario en un rango
  async listar({ usuario_id, fecha_desde, fecha_hasta } = {}) {
    const conditions = ["pu.estado = true"];
    const params = [];
    let idx = 0;

    if (usuario_id) {
      idx++;
      params.push(Number(usuario_id));
      conditions.push(`pu.usuario_id = $${idx}`);
    }
    if (fecha_desde) {
      idx++;
      params.push(fecha_desde);
      conditions.push(`pu.fecha >= $${idx}::date`);
    }
    if (fecha_hasta) {
      idx++;
      params.push(fecha_hasta);
      conditions.push(`pu.fecha <= $${idx}::date`);
    }

    const rows = await prisma.$queryRawUnsafe(
      `SELECT
         pu.id,
         pu.usuario_id,
         TO_CHAR(pu.fecha, 'YYYY-MM-DD') AS fecha,
         TO_CHAR(pu.hora_inicio::time, 'HH24:MI') AS hora_inicio,
         TO_CHAR(pu.hora_fin::time, 'HH24:MI') AS hora_fin,
         pu.motivo,
         pu.estado,
         pu.created_at,
         u.usuario AS usuario_nombre,
         p.nombres || ' ' || p.apellidos AS usuario_persona
       FROM permisos_usuario pu
       LEFT JOIN usuarios u ON u.id = pu.usuario_id
       LEFT JOIN personas p ON p.id = u.persona_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY pu.fecha DESC, pu.hora_inicio ASC`,
      ...params,
    );

    return (rows || []).map((r) => ({
      id: Number(r.id),
      usuario_id: r.usuario_id ? Number(r.usuario_id) : null,
      fecha: r.fecha || null,
      hora_inicio: r.hora_inicio || null,
      hora_fin: r.hora_fin || null,
      motivo: r.motivo || null,
      estado: Boolean(r.estado),
      created_at: r.created_at || null,
      usuario_nombre: r.usuario_nombre || null,
      usuario_persona: r.usuario_persona || null,
    }));
  }

  // Vista previa: qué actividades serían afectadas por el permiso
  async preview({ usuario_id, fecha, hora_inicio, hora_fin } = {}) {
    const uid = Number(usuario_id);
    const fechaLocal = parseLocalDate(fecha);
    if (!uid || !fechaLocal || !hora_inicio || !hora_fin) {
      const err = new Error("Faltan parámetros requeridos.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    const fechaStr = fmtLocalDate(fechaLocal);
    const inicioMin = toMin(hora_inicio);
    const finMin = toMin(hora_fin);
    if (inicioMin == null || finMin == null || finMin <= inicioMin) {
      const err = new Error("hora_inicio y hora_fin inválidos.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    // Buscar actividades en horario_usuario que CAIGAN dentro del rango
    const rows = await prisma.$queryRawUnsafe(
      `SELECT
         hu.id AS horario_id,
         hu.actividad_id,
         hu.usuario_id,
         TO_CHAR(hu.fecha, 'YYYY-MM-DD') AS fecha,
         TO_CHAR(hu.hora_inicio::time, 'HH24:MI') AS hora_inicio,
         TO_CHAR(hu.hora_fin::time, 'HH24:MI') AS hora_fin,
         hu.duracion_minutos,
         hu.marca,
         a.prioridad,
         a.estado_progreso,
         a.bloqueada,
         a.tiempo_estimado_minutos,
         a.tarea_id,
         t.nombre AS tarea_nombre,
         p.titulo_prospecto,
         TO_CHAR(p.fecha_entrega, 'YYYY-MM-DD') AS fecha_entrega
       FROM horario_usuario hu
       LEFT JOIN actividades a ON a.id = hu.actividad_id
       LEFT JOIN tarea t ON t.id = a.tarea_id
       LEFT JOIN prospectos p ON p.id = a.prospecto_id
       WHERE hu.usuario_id = $1
         AND hu.estado = true
         AND hu.fecha = $2::date
         AND hu.hora_inicio::time < $4::time
         AND hu.hora_fin::time > $3::time
       ORDER BY hu.hora_inicio ASC`,
      uid,
      fechaStr,
      hora_inicio,
      hora_fin,
    );

    const afectadas = (rows || [])
      .filter((r) => r.actividad_id != null) // solo actividades reales
      .map((r) => ({
        horario_id: Number(r.horario_id),
        actividad_id: Number(r.actividad_id),
        usuario_id: Number(r.usuario_id),
        fecha: r.fecha || null,
        hora_inicio: r.hora_inicio || null,
        hora_fin: r.hora_fin || null,
        duracion_minutos: r.duracion_minutos ? Number(r.duracion_minutos) : null,
        prioridad: r.prioridad || null,
        estado_progreso: r.estado_progreso || null,
        bloqueada: Boolean(r.bloqueada) || r.bloqueada === "true",
        tarea_nombre: r.tarea_nombre || null,
        titulo_prospecto: r.titulo_prospecto || null,
        fecha_entrega: r.fecha_entrega || null,
      }));

    return {
      fecha: fechaStr,
      hora_inicio: minToHHMM(inicioMin),
      hora_fin: minToHHMM(finMin),
      usuario_id: uid,
      actividades: afectadas,
      urgentes: afectadas.filter(
        (a) => a.prioridad === "ALTA" || a.bloqueada,
      ),
      no_movibles: [],
    };
  }

  // Crear permiso + bloquear horario + reprogramar actividades
  async crear({ usuario_id, fecha, hora_inicio, hora_fin, motivo, asistente_id } = {}) {
    const uid = Number(usuario_id);
    const fechaLocal = parseLocalDate(fecha);
    if (!uid || !fechaLocal || !hora_inicio || !hora_fin) {
      const err = new Error("Faltan parámetros requeridos.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    const fechaStr = fmtLocalDate(fechaLocal);
    const inicioMin = toMin(hora_inicio);
    const finMin = toMin(hora_fin);
    if (inicioMin == null || finMin == null || finMin <= inicioMin) {
      const err = new Error("hora_inicio y hora_fin inválidos.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    // Obtener preview primero para saber qué actividades serán afectadas
    const preview = await this.preview({ usuario_id: uid, fecha: fechaStr, hora_inicio, hora_fin });

    return await prisma.$transaction(async (tx) => {
      // 1. Insertar el registro de permiso
      const [permiso] = await tx.$queryRawUnsafe(
        `INSERT INTO permisos_usuario (usuario_id, fecha, hora_inicio, hora_fin, motivo, estado, created_at, updated_at)
         VALUES ($1, $2::date, $3::time, $4::time, $5, true, NOW(), NOW())
         RETURNING id`,
        uid,
        fechaStr,
        hora_inicio,
        hora_fin,
        motivo || null,
      );
      const permisoId = Number(permiso.id);

      // 2. Crear bloque(s) en horario_usuario con marca='permiso'
      //    Un permiso puede abarcar múltiples bloques de jornada.
      //    Obtenemos los bloques de jornada del usuario para ese día
      const diaSemana = DAY_ID_BY_GETDAY[fechaLocal.getDay()] || null;
      let jornadaBloques = [];
      if (diaSemana) {
        const jRows = await tx.horario_jornada_detalle.findMany({
          where: {
            usuario_id: uid,
            dia_semana: diaSemana,
            estado: true,
            hora_inicio: { not: null },
            hora_fin: { not: null },
          },
          select: { hora_inicio: true, hora_fin: true },
          orderBy: { hora_inicio: "asc" },
        });
        jornadaBloques = jRows
          .map((r) => ({ ini: toMin(r.hora_inicio), fin: toMin(r.hora_fin) }))
          .filter((b) => b.ini != null && b.fin != null && b.fin > b.ini)
          .sort((a, b) => a.ini - b.ini);
      }

      // Intersectar el permiso con los bloques de jornada
      for (const jb of jornadaBloques) {
        const blockIni = Math.max(inicioMin, jb.ini);
        const blockFin = Math.min(finMin, jb.fin);
        if (blockFin > blockIni) {
          await tx.$queryRawUnsafe(
            `INSERT INTO horario_usuario
               (usuario_id, fecha, hora_inicio, hora_fin, estado, marca, duracion_minutos, created_at, updated_at)
             VALUES ($1, $2::date, $3::time, $4::time, true, 'permiso', $5, NOW(), NOW())`,
            uid,
            fechaStr,
            minToHHMM(blockIni),
            minToHHMM(blockFin),
            blockFin - blockIni,
          );
        }
      }

      // Si no hay bloques de jornada, crear un solo bloque con el rango completo
      if (jornadaBloques.length === 0) {
        await tx.$queryRawUnsafe(
          `INSERT INTO horario_usuario
             (usuario_id, fecha, hora_inicio, hora_fin, estado, marca, duracion_minutos, created_at, updated_at)
           VALUES ($1, $2::date, $3::time, $4::time, true, 'permiso', $5, NOW(), NOW())`,
          uid,
          fechaStr,
          hora_inicio,
          hora_fin,
          finMin - inicioMin,
        );
      }

      // 3. Reprogramar actividades afectadas
      //    Separar urgentes (no se mueven) del resto
      const urgentes = preview.actividades.filter(
        (a) => a.prioridad === "ALTA" || a.bloqueada,
      );
      const movibles = preview.actividades.filter(
        (a) => a.prioridad !== "ALTA" && !a.bloqueada,
      );

      const reprogramadas = [];
      const no_movibles = [];

      for (const act of movibles) {
        // Verificar fecha de entrega (deadline)
        // Buscar el próximo slot libre después del permiso
        // Por ahora, reprogramar al día siguiente
        const fechaActual = new Date(fechaLocal);
        fechaActual.setDate(fechaActual.getDate() + 1);

        let colocado = false;
        let intentos = 0;
        while (!colocado && intentos < 30) {
          intentos++;
          const diaId = DAY_ID_BY_GETDAY[fechaActual.getDay()];
          if (!diaId) {
            fechaActual.setDate(fechaActual.getDate() + 1);
            continue;
          }

          const curStr = fmtLocalDate(fechaActual);

          // Verificar deadline
          if (act.fecha_entrega && curStr > act.fecha_entrega) {
            no_movibles.push({
              ...act,
              motivo: "Excede fecha de entrega",
            });
            break;
          }

          // Cargar bloques existentes de ese día
          const existing = await tx.$queryRawUnsafe(
            `SELECT
               TO_CHAR(hu.hora_inicio::time, 'HH24:MI:SS') AS hi,
               TO_CHAR(hu.hora_fin::time, 'HH24:MI:SS') AS hf
             FROM horario_usuario hu
             WHERE hu.usuario_id = $1
               AND hu.estado = true
               AND hu.fecha = $2::date
             ORDER BY hu.hora_inicio ASC`,
            uid,
            curStr,
          );

          const ocupado = (existing || []).map((r) => ({
            ini: toMin(r.hi),
            fin: toMin(r.hf),
          }));

          // Obtener bloques de jornada
          const jRows2 = await tx.horario_jornada_detalle.findMany({
            where: {
              usuario_id: uid,
              dia_semana: diaId,
              estado: true,
              hora_inicio: { not: null },
              hora_fin: { not: null },
            },
            select: { hora_inicio: true, hora_fin: true },
            orderBy: { hora_inicio: "asc" },
          });
          const jornada = jRows2
            .map((r) => ({ ini: toMin(r.hora_inicio), fin: toMin(r.hora_fin) }))
            .filter((b) => b.ini != null && b.fin != null && b.fin > b.ini)
            .sort((a, b) => a.ini - b.ini);

          const duracion = act.duracion_minutos || 60;

          // Encontrar el primer slot libre
          for (const jb of jornada) {
            let cursor = jb.ini;
            for (const oc of ocupado) {
              if (oc.fin <= cursor) continue;
              if (oc.ini >= jb.fin) break;
              const gapIni = Math.max(cursor, oc.fin);
              const gapFin = jb.fin;
              if (gapFin - gapIni >= duracion) {
                // Colocar aquí
                const nuevoIni = gapIni;
                const nuevoFin = gapIni + duracion;

                // Marcar slot anterior como inactivo
                await tx.$queryRawUnsafe(
                  `UPDATE horario_usuario SET estado = false, updated_at = NOW() WHERE id = $1`,
                  act.horario_id,
                );

                // Crear nuevo slot
                await tx.$queryRawUnsafe(
                  `INSERT INTO horario_usuario
                     (actividad_id, usuario_id, fecha, hora_inicio, hora_fin, estado, duracion_minutos, created_at, updated_at)
                   VALUES ($1, $2, $3::date, $4::time, $5::time, true, $6, NOW(), NOW())`,
                  act.actividad_id,
                  uid,
                  curStr,
                  minToHHMM(nuevoIni),
                  minToHHMM(nuevoFin),
                  duracion,
                );

                reprogramadas.push({
                  actividad_id: act.actividad_id,
                  tarea_nombre: act.tarea_nombre,
                  titulo_prospecto: act.titulo_prospecto,
                  fecha_origen: act.fecha,
                  hora_origen: act.hora_inicio,
                  fecha_destino: curStr,
                  hora_destino: minToHHMM(nuevoIni),
                });

                colocado = true;
                break;
              }
              cursor = Math.max(cursor, oc.fin);
            }
            if (colocado) break;

            // También verificar el gap después del último ocupado
            const ultOcup = ocupado.length > 0 ? ocupado[ocupado.length - 1].fin : jb.ini;
            if (jb.fin - Math.max(cursor, ultOcup) >= duracion) {
              const inicio = Math.max(cursor, ultOcup);
              await tx.$queryRawUnsafe(
                `UPDATE horario_usuario SET estado = false, updated_at = NOW() WHERE id = $1`,
                act.horario_id,
              );
              await tx.$queryRawUnsafe(
                `INSERT INTO horario_usuario
                   (actividad_id, usuario_id, fecha, hora_inicio, hora_fin, estado, duracion_minutos, created_at, updated_at)
                 VALUES ($1, $2, $3::date, $4::time, $5::time, true, $6, NOW(), NOW())`,
                act.actividad_id,
                uid,
                curStr,
                minToHHMM(inicio),
                minToHHMM(inicio + duracion),
                duracion,
              );
              reprogramadas.push({
                actividad_id: act.actividad_id,
                tarea_nombre: act.tarea_nombre,
                titulo_prospecto: act.titulo_prospecto,
                fecha_origen: act.fecha,
                hora_origen: act.hora_inicio,
                fecha_destino: curStr,
                hora_destino: minToHHMM(inicio),
              });
              colocado = true;
              break;
            }
          }

          if (!colocado) {
            fechaActual.setDate(fechaActual.getDate() + 1);
          }
        }

        if (!colocado) {
          no_movibles.push({
            ...act,
            motivo: "No se encontró slot disponible en 30 días",
          });
        }
      }

      return {
        permiso_id: permisoId,
        fecha: fechaStr,
        hora_inicio: minToHHMM(inicioMin),
        hora_fin: minToHHMM(finMin),
        urgentes: urgentes.map((a) => ({
          actividad_id: a.actividad_id,
          tarea_nombre: a.tarea_nombre,
          titulo_prospecto: a.titulo_prospecto,
        })),
        no_movibles: no_movibles.map((a) => ({
          actividad_id: a.actividad_id,
          tarea_nombre: a.tarea_nombre,
          titulo_prospecto: a.titulo_prospecto,
          motivo: a.motivo,
        })),
        reprogramadas,
      };
    });
  }

  // Eliminar permiso (baja lógica) + restaurar horario
  async eliminar(permisoId) {
    const id = Number(permisoId);
    if (!id) {
      const err = new Error("ID de permiso inválido.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    return await prisma.$transaction(async (tx) => {
      const [permiso] = await tx.$queryRawUnsafe(
        `SELECT
           id, usuario_id,
           TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha,
           TO_CHAR(hora_inicio::time, 'HH24:MI') AS hora_inicio,
           TO_CHAR(hora_fin::time, 'HH24:MI') AS hora_fin
         FROM permisos_usuario
         WHERE id = $1 AND estado = true`,
        id,
      );

      if (!permiso) {
        const err = new Error("Permiso no encontrado.");
        err.code = "NOT_FOUND";
        throw err;
      }

      // Marcar permiso como inactivo
      await tx.$queryRawUnsafe(
        `UPDATE permisos_usuario SET estado = false, updated_at = NOW() WHERE id = $1`,
        id,
      );

      // Eliminar bloques de horario_usuario con marca='permiso' que coincidan
      await tx.$queryRawUnsafe(
        `UPDATE horario_usuario
            SET estado = false, updated_at = NOW()
          WHERE usuario_id = $1
            AND fecha = $2::date
            AND marca = 'permiso'
            AND hora_inicio::time >= $3::time
            AND hora_fin::time <= $4::time`,
        Number(permiso.usuario_id),
        String(permiso.fecha || "").slice(0, 10),
        String(permiso.hora_inicio || ""),
        String(permiso.hora_fin || ""),
      );

      return { id, eliminado: true };
    });
  }

  // -----------------------------------------------------------------------
  // Preview actividades de un usuario en un rango de fechas (ausencia)
  // -----------------------------------------------------------------------
  async previewAusencia({ usuario_id, fecha_desde, fecha_hasta } = {}) {
    const uid = Number(usuario_id);
    if (!uid || !fecha_desde || !fecha_hasta) {
      const err = new Error("usuario_id, fecha_desde y fecha_hasta requeridos.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    const rows = await prisma.$queryRawUnsafe(
      `SELECT
         hu.id AS horario_id,
         hu.actividad_id,
         TO_CHAR(hu.fecha, 'YYYY-MM-DD') AS fecha,
         TO_CHAR(hu.hora_inicio::time, 'HH24:MI') AS hora_inicio,
         TO_CHAR(hu.hora_fin::time, 'HH24:MI') AS hora_fin,
         hu.duracion_minutos,
         hu.marca,
         a.prioridad,
         a.estado_progreso,
         a.bloqueada,
         a.tiempo_estimado_minutos,
         a.usuario_id,
         a.tarea_id,
         t.nombre AS tarea_nombre,
         p.id AS prospecto_id,
         p.titulo_prospecto,
         TO_CHAR(p.fecha_entrega, 'YYYY-MM-DD') AS fecha_entrega
       FROM horario_usuario hu
       JOIN actividades a ON a.id = hu.actividad_id
       LEFT JOIN tarea t ON t.id = a.tarea_id
       LEFT JOIN prospectos p ON p.id = a.prospecto_id
       WHERE hu.usuario_id = $1
         AND hu.estado = true
         AND hu.fecha BETWEEN $2::date AND $3::date
         AND (a.estado_progreso IS NULL OR a.estado_progreso NOT IN ('completada','cancelada'))
       ORDER BY hu.fecha ASC, hu.hora_inicio ASC`,
      uid,
      fecha_desde,
      fecha_hasta,
    );

    return (rows || []).map((r) => ({
      horario_id: Number(r.horario_id),
      actividad_id: r.actividad_id ? Number(r.actividad_id) : null,
      fecha: r.fecha || null,
      hora_inicio: r.hora_inicio || null,
      hora_fin: r.hora_fin || null,
      duracion_minutos: r.duracion_minutos ? Number(r.duracion_minutos) : null,
      prioridad: r.prioridad || null,
      estado_progreso: r.estado_progreso || null,
      bloqueada: Boolean(r.bloqueada) || r.bloqueada === "true",
      usuario_id: r.usuario_id ? Number(r.usuario_id) : null,
      tarea_nombre: r.tarea_nombre || null,
      prospecto_id: r.prospecto_id ? Number(r.prospecto_id) : null,
      titulo_prospecto: r.titulo_prospecto || null,
      fecha_entrega: r.fecha_entrega || null,
    }));
  }

  // -----------------------------------------------------------------------
  // Ejecutar acciones masivas sobre actividades de un usuario ausente
  // -----------------------------------------------------------------------
  async ejecutarAusencia({ usuario_id, fecha_desde, fecha_hasta, motivo, acciones, asistente_id } = {}) {
    const uid = Number(usuario_id);
    if (!uid || !fecha_desde || !fecha_hasta || !Array.isArray(acciones) || acciones.length === 0) {
      const err = new Error("Parámetros inválidos.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    const reasignadas = [];
    const bonos = [];
    const errores = [];

    for (const acc of acciones) {
      const actividadId = Number(acc.actividad_id);
      if (!actividadId) continue;

      try {
        if (acc.accion === "bono") {
          const result = await this.#marcarComoBono(actividadId, uid);
          if (result) bonos.push(result);
        } else if (acc.accion === "reasignar") {
          const destinoId = Number(acc.usuario_destino_id);
          if (!destinoId) {
            errores.push({ actividad_id: actividadId, error: "Falta usuario destino" });
            continue;
          }
          const result = await this.#reasignarOBono(actividadId, destinoId);
          if (result.tipo === "reasignada") {
            reasignadas.push(result);
          } else {
            bonos.push(result);
          }
        }
      } catch (e) {
        errores.push({ actividad_id: actividadId, error: e.message });
      }
    }

    return { reasignadas, bonos, errores };
  }

  async #marcarComoBono(actividadId, usuarioOrigenId) {
    return await prisma.$transaction(async (tx) => {
      // Obtener el bloque activo de la actividad
      const [bloque] = await tx.$queryRawUnsafe(
        `SELECT id, usuario_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha,
                TO_CHAR(hora_inicio::time, 'HH24:MI') AS hora_inicio,
                TO_CHAR(hora_fin::time, 'HH24:MI') AS hora_fin,
                duracion_minutos
         FROM horario_usuario
         WHERE actividad_id = $1 AND estado = true
         ORDER BY id DESC LIMIT 1`,
        actividadId,
      );

      if (!bloque) {
        return null;
      }

      // Deshabilitar el bloque actual
      await tx.$queryRawUnsafe(
        `UPDATE horario_usuario SET estado = false, updated_at = NOW() WHERE id = $1`,
        Number(bloque.id),
      );

      // Crear registro en horas_extras con tipo='bono'
      await tx.$queryRawUnsafe(
        `INSERT INTO horas_extras
           (actividad_id, usuario_id, fecha, minutos, tipo, estado, created_at, updated_at)
         VALUES ($1, $2, $3::date, $4, 'bono', 'pendiente', NOW(), NOW())`,
        actividadId,
        Number(bloque.usuario_id),
        String(bloque.fecha || "").slice(0, 10),
        String(bloque.duracion_minutos || "60"),
      );

      return {
        actividad_id: actividadId,
        tipo: "bono",
        fecha: bloque.fecha || null,
        hora_inicio: bloque.hora_inicio || null,
      };
    });
  }

  async #reasignarOBono(actividadId, destinoId) {
    return await prisma.$transaction(async (tx) => {
      // Obtener actividad con su deadline
      const [act] = await tx.$queryRawUnsafe(
        `SELECT
           a.id, a.tiempo_estimado_minutos, a.usuario_id,
           TO_CHAR(p.fecha_entrega, 'YYYY-MM-DD') AS fecha_entrega,
           p.titulo_prospecto,
           t.nombre AS tarea_nombre,
           TO_CHAR(hu.fecha, 'YYYY-MM-DD') AS fecha_actual,
           TO_CHAR(hu.hora_inicio::time, 'HH24:MI') AS hora_actual
         FROM actividades a
         LEFT JOIN prospectos p ON p.id = a.prospecto_id
         LEFT JOIN tarea t ON t.id = a.tarea_id
         LEFT JOIN horario_usuario hu ON hu.actividad_id = a.id AND hu.estado = true
         WHERE a.id = $1
         LIMIT 1`,
        actividadId,
      );

      if (!act) {
        return { tipo: "error", actividad_id: actividadId, error: "Actividad no encontrada" };
      }

      const duracion = act.tiempo_estimado_minutos ? Number(act.tiempo_estimado_minutos) : 60;
      const deadline = act.fecha_entrega || null;

      // Buscar primer slot libre en el usuario destino desde hoy
      const destino = await this.#buscarSlotLibre(tx, destinoId, duracion, deadline);
      if (destino) {
        // Marcar los bloques actuales como inactivos
        await tx.$queryRawUnsafe(
          `UPDATE horario_usuario SET estado = false, updated_at = NOW()
            WHERE actividad_id = $1 AND estado = true`,
          actividadId,
        );

        // Actualizar actividad al nuevo usuario
        await tx.$queryRawUnsafe(
          `UPDATE actividades SET usuario_id = $1, updated_at = NOW() WHERE id = $2`,
          destinoId,
          actividadId,
        );

        // Crear nuevo bloque
        await tx.$queryRawUnsafe(
          `INSERT INTO horario_usuario
             (actividad_id, usuario_id, fecha, hora_inicio, hora_fin, estado, duracion_minutos, created_at, updated_at)
           VALUES ($1, $2, $3::date, $4::time, $5::time, true, $6, NOW(), NOW())`,
          actividadId,
          destinoId,
          destino.fecha,
          destino.hora_inicio,
          destino.hora_fin,
          duracion,
        );

        return {
          actividad_id: actividadId,
          tipo: "reasignada",
          tarea_nombre: act.tarea_nombre || null,
          titulo_prospecto: act.titulo_prospecto || null,
          fecha_origen: act.fecha_actual || null,
          hora_origen: act.hora_actual || null,
          fecha_destino: destino.fecha,
          hora_destino: destino.hora_inicio,
          usuario_destino_id: destinoId,
        };
      }

      // No cabe antes del deadline → pasar a bono automáticamente
      const bono = await this.#marcarComoBonoEnTx(tx, actividadId, duracion);
      return {
        ...bono,
        tipo: "bono_auto",
        tarea_nombre: act.tarea_nombre || null,
        titulo_prospecto: act.titulo_prospecto || null,
        motivo: "No cabe antes de fecha de entrega",
      };
    });
  }

  async #buscarSlotLibre(tx, usuarioId, duracionMinutos, deadline) {
    const uid = Number(usuarioId);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Iterar días desde hoy hasta deadline (máx 60 días)
    const maxDays = deadline ? Math.min(60, Math.ceil(
      (new Date(deadline + "T00:00:00") - hoy) / 86400000
    )) : 60;

    // Pre-cargar feriados activos en el rango para evitar N queries
    const fechaFin = new Date(hoy);
    fechaFin.setDate(fechaFin.getDate() + maxDays);
    const feriadosRows = await tx.feriados.findMany({
      where: { estado: true },
      select: { fecha: true },
    });
    const feriadosSet = new Set(
      feriadosRows.map((f) => {
        // fecha viene como UTC midnight desde la BD — usar getUTC* para comparar
        const d = new Date(f.fecha);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      }),
    );

    for (let i = 0; i <= maxDays; i++) {
      const cursor = new Date(hoy);
      cursor.setDate(cursor.getDate() + i);
      const fechaStr = fmtLocalDate(cursor);
      const diaId = DAY_ID_BY_GETDAY[cursor.getDay()];
      if (!diaId) continue;

      // Verificar deadline
      if (deadline && fechaStr > deadline) return null;

      // Saltar feriados
      if (feriadosSet.has(fechaStr)) continue;

      // Cargar bloques de jornada
      const jRows = await tx.horario_jornada_detalle.findMany({
        where: {
          usuario_id: uid,
          dia_semana: diaId,
          estado: true,
          hora_inicio: { not: null },
          hora_fin: { not: null },
        },
        select: { hora_inicio: true, hora_fin: true },
        orderBy: { hora_inicio: "asc" },
      });
      const jornada = jRows
        .map((r) => ({ ini: toMin(r.hora_inicio), fin: toMin(r.hora_fin) }))
        .filter((b) => b.ini != null && b.fin != null && b.fin > b.ini);

      if (jornada.length === 0) continue;

      // Cargar bloques ocupados
      const ocupados = await tx.$queryRawUnsafe(
        `SELECT TO_CHAR(hora_inicio::time, 'HH24:MI:SS') AS hi,
                TO_CHAR(hora_fin::time, 'HH24:MI:SS') AS hf
         FROM horario_usuario
         WHERE usuario_id = $1 AND estado = true AND fecha = $2::date
         ORDER BY hora_inicio ASC`,
        uid,
        fechaStr,
      );
      const ocupado = (ocupados || []).map((r) => ({ ini: toMin(r.hi), fin: toMin(r.hf) }));

      for (const jb of jornada) {
        let cursorMin = jb.ini;
        for (const oc of ocupado) {
          if (oc.fin <= cursorMin) continue;
          if (oc.ini >= jb.fin) break;
          const gap = oc.ini - cursorMin;
          if (gap >= duracionMinutos) {
            return {
              fecha: fechaStr,
              hora_inicio: minToHHMM(cursorMin),
              hora_fin: minToHHMM(cursorMin + duracionMinutos),
            };
          }
          cursorMin = Math.max(cursorMin, oc.fin);
        }
        // Gap después del último ocupado
        if (jb.fin - cursorMin >= duracionMinutos) {
          return {
            fecha: fechaStr,
            hora_inicio: minToHHMM(cursorMin),
            hora_fin: minToHHMM(cursorMin + duracionMinutos),
          };
        }
      }
    }
    return null;
  }

  async #marcarComoBonoEnTx(tx, actividadId, duracion) {
    const [bloque] = await tx.$queryRawUnsafe(
      `SELECT id, usuario_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha,
              TO_CHAR(hora_inicio::time, 'HH24:MI') AS hora_inicio,
              TO_CHAR(hora_fin::time, 'HH24:MI') AS hora_fin
       FROM horario_usuario
       WHERE actividad_id = $1 AND estado = true
       ORDER BY id DESC LIMIT 1`,
      actividadId,
    );
    if (!bloque) return null;

    await tx.$queryRawUnsafe(
      `UPDATE horario_usuario SET estado = false, updated_at = NOW() WHERE id = $1`,
      Number(bloque.id),
    );
    await tx.$queryRawUnsafe(
      `INSERT INTO horas_extras
         (actividad_id, usuario_id, fecha, minutos, tipo, estado, created_at, updated_at)
       VALUES ($1, $2, $3::date, $4, 'bono', 'pendiente', NOW(), NOW())`,
      actividadId,
      Number(bloque.usuario_id),
      String(bloque.fecha || "").slice(0, 10),
      String(duracion || "60"),
    );

    return {
      actividad_id: actividadId,
      tipo: "bono",
      fecha: bloque.fecha || null,
      hora_inicio: bloque.hora_inicio || null,
    };
  }
}

export default new PermisosUsuarioService();
