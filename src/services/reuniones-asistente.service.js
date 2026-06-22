import prisma from "../config/db.js";
import schedulerService from "./scheduler.service.js";
import overflowService from "./overflow.service.js";

// ============================================================================
// Reuniones — vista del Asistente de Producción (rol_id=11)
// ----------------------------------------------------------------------------
// Responsabilidad: CRUD + reprogramación + reasignación + cancelación de
// reuniones (actividades de tipo REUNION) sobre el calendario de OTROS
// usuarios. Reusa schedulerService (placeActivity + applyMoves) y
// overflowService (suggest) sin tocarlos.
//
// Reglas de diseño:
//   1. Una reunión SIEMPRE se persiste con fila en `horario_usuario` (la
//      fuente de verdad del scheduler). Si la actividad venía del flujo de
//      potenciales y no tenía fila, la creamos acá (ensureHorarioUsuarioForDay).
//   2. La reprogramación/reasignación respeta el horario_jornada_detalle del
//      usuario asignado. No hay modo "ignorar jornada".
//   3. Si el scheduler no encuentra hueco, se devuelve el overflow.suggest()
//      tal cual lo entrega el service (otros usuarios con hueco, horas
//      extras, mover deadline).
//   4. Permisos: el handler que llame a estos métodos debe haber validado
//      que la sesión es de un Asistente de Producción.
// ============================================================================

const ROL_ASISTENTE_PROD_ID = 11;

// "REUNION" matchea id=2 de tipo_tarea o nombre que contenga "reunion"
// (case + accent insensitive). Mismo criterio que
// calendario-asistente.service.js:74-76 y potenciales-clientes.service.js:158-178.
const TIPO_REUNION_ID = 2;

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const isReunionTarea = (tarea) => {
  if (!tarea) return false;
  if (Number(tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea?.id) === TIPO_REUNION_ID) {
    return true;
  }
  const nombre = norm(tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea?.tipo);
  return nombre.includes("reunion");
};

// ---------- Helpers de input ----------------------------------------------

// "HH:MM[:SS]" o Date Timetz → minutos desde medianoche. null si no parsea.
// Las columnas `@db.Timetz(6)` se escriben con `Date.UTC(...)` (ver
// `potenciales-clientes.service.js#toTime`), así que al leer un Date
// tenemos que usar `getUTCHours`/`getUTCMinutes` para que el round-trip
// sea consistente con lo que el usuario tipeó. Sin esto, en zonas con
// offset (p.ej. Perú UTC-5) el front mostraba 07:00 cuando el usuario
// había cargado 12:00.
const hmsToMin = (s) => {
  if (s == null) return null;
  if (s instanceof Date && !Number.isNaN(s.getTime())) {
    return s.getUTCHours() * 60 + s.getUTCMinutes();
  }
  // Acepta "HH:MM[:SS]" o "T HH:MM" dentro de un ISO.
  const str = String(s);
  const mIso = str.match(/T(\d{2}):(\d{2})/);
  if (mIso) return Number(mIso[1]) * 60 + Number(mIso[2]);
  const mHms = str.match(/^(\d{1,2}):(\d{2})/);
  return mHms ? Number(mHms[1]) * 60 + Number(mHms[2]) : null;
};

const minToHHMM = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// "YYYY-MM-DD" → Date local (no UTC, para no caer en off-by-one).
const parseLocalDate = (s) => {
  if (s instanceof Date) return s;
  const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtLocalDate = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "HH:MM" o "HH:MM:SS" → Date 1970-01-01Thh:mm:ss UTC. Usamos Date.UTC
// (no el constructor local) para que la columna @db.Timetz almacene la
// hora EXACTA que recibimos del front, sin que el huso horario del
// servidor la desplace. Los readers de los endpoints del calendario
// (calendario-asistente.service.js, este mismo service) extraen las
// horas con `getUTCHours()`, así que la convención writer=UTC y
// reader=UTC es la única autoconsistente.
const hmsToLocalDate = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(
    Date.UTC(1970, 0, 1, Number(m[1]), Number(m[2]), Number(m[3] || 0)),
  );
};

class ReunionesAsistenteService {
  // -----------------------------------------------------------------------
  // Búsqueda de prospectos para el modal "Nueva reunión"
  // -----------------------------------------------------------------------
  // Devuelve prospectos ACTIVOS con sus contactos. Filtra por:
  //   - titulo_prospecto (ILIKE)
  //   - nombres / apellidos / número de documento de los contactos
  // El Asistente puede asignar reuniones a "potencial cliente" O "cliente".
  async listarProspectosParaReunion({ q, limit } = {}) {
    const term = String(q || "").trim();
    const lim = Math.max(1, Math.min(50, Number(limit) || 20));

    // Armamos un query crudo para hacer un solo viaje a la BD con la
    // subconsulta de contactos agregada como JSON.
    const params = [];
    let where = `WHERE p.estado = true`;
    if (term) {
      params.push(`%${term}%`);
      const i = params.length;
      where += `
        AND (
          p.titulo_prospecto ILIKE $${i}
          OR EXISTS (
            SELECT 1
              FROM prospecto_persona pp
              JOIN personas per ON per.id = pp.persona_id
             WHERE pp.prospecto_id = p.id
               AND (
                 per.nombres ILIKE $${i}
                 OR per.apellidos ILIKE $${i}
                 OR per.numero_documento ILIKE $${i}
               )
          )
        )`;
    }
    params.push(lim);
    const limIdx = params.length;

    const rows = await prisma.$queryRawUnsafe(
      `SELECT
         p.id,
         p.titulo_prospecto,
         p.estado_cliente,
         TO_CHAR(p.fecha_contacto, 'YYYY-MM-DD') AS fecha_contacto,
         TO_CHAR(p.fecha_entrega,  'YYYY-MM-DD') AS fecha_entrega,
         p.prioridad,
         (
           SELECT json_agg(
             json_build_object(
               'id', per.id,
               'nombres', per.nombres,
               'apellidos', per.apellidos,
               'celular', per.celular,
               'email', per.email,
               'numero_documento', per.numero_documento
             ) ORDER BY per.id
           )
           FROM prospecto_persona pp
           JOIN personas per ON per.id = pp.persona_id
           WHERE pp.prospecto_id = p.id
         ) AS contactos
       FROM prospectos p
       ${where}
       ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
       LIMIT $${limIdx}`,
      ...params,
    );

    return (rows || []).map((r) => ({
      id: Number(r.id),
      titulo_prospecto: r.titulo_prospecto,
      estado_cliente: r.estado_cliente,
      fecha_contacto: r.fecha_contacto || null,
      fecha_entrega: r.fecha_entrega || null,
      prioridad: r.prioridad || null,
      contactos: Array.isArray(r.contactos) ? r.contactos : [],
    }));
  }

  // -----------------------------------------------------------------------
  // Listar clientes con sus actividades (tab CLIENTES del modal Programar)
  // -----------------------------------------------------------------------
  async listarClientesConActividades({ q, limit } = {}) {
    const term = String(q || "").trim();
    const lim = Math.max(1, Math.min(100, Number(limit) || 50));
    const params = [];
    let where = `WHERE p.estado = true`;
    if (term) {
      params.push(`%${term}%`);
      const i = params.length;
      where += ` AND p.titulo_prospecto ILIKE $${i}`;
    }
    params.push(lim);
    const limIdx = params.length;

    const rows = await prisma.$queryRawUnsafe(
      `SELECT
         p.id,
         p.titulo_prospecto,
         p.estado_cliente,
         TO_CHAR(p.fecha_entrega, 'YYYY-MM-DD') AS fecha_entrega,
         (
           SELECT json_agg(
             json_build_object(
               'id', per.id,
               'nombres', per.nombres,
               'apellidos', per.apellidos,
               'celular', per.celular
             ) ORDER BY per.id
           )
           FROM prospecto_persona pp
           JOIN personas per ON per.id = pp.persona_id
           WHERE pp.prospecto_id = p.id
         ) AS contactos,
         (
           SELECT json_agg(
             json_build_object(
               'id', a.id,
               'tarea_id', a.tarea_id,
               'tarea_nombre', t.nombre,
               'tipo_tarea', tt.tipo,
               'tipo_tarea_id', tt.id,
               'estado_progreso', a.estado_progreso,
               'tiempo_estimado_minutos', a.tiempo_estimado_minutos,
               'usuario_id', a.usuario_id,
               'tiene_slot', EXISTS(
                 SELECT 1 FROM horario_usuario hu
                 WHERE hu.actividad_id = a.id AND hu.estado = true
               )
             ) ORDER BY a.created_at DESC
           )
           FROM actividades a
           LEFT JOIN tarea t ON t.id = a.tarea_id
            LEFT JOIN tipo_tarea tt ON tt.id = t.tipo_tarea
           WHERE a.prospecto_id = p.id AND a.estado = true
             AND (a.estado_progreso IS NULL OR a.estado_progreso NOT IN ('completada','cancelada'))
         ) AS actividades
       FROM prospectos p
       ${where}
       ORDER BY p.updated_at DESC NULLS LAST, p.id DESC
       LIMIT $${limIdx}`,
      ...params,
    );

    return (rows || []).map((r) => ({
      id: Number(r.id),
      titulo_prospecto: r.titulo_prospecto,
      estado_cliente: r.estado_cliente,
      fecha_entrega: r.fecha_entrega || null,
      contactos: Array.isArray(r.contactos) ? r.contactos : [],
      actividades: (Array.isArray(r.actividades) ? r.actividades : [])
        .filter((a) => a != null)
        .map((a) => ({
          id: Number(a.id),
          tarea_id: a.tarea_id ? Number(a.tarea_id) : null,
          tarea_nombre: a.tarea_nombre || null,
          tipo_tarea: a.tipo_tarea || null,
          tipo_tarea_id: a.tipo_tarea_id ? Number(a.tipo_tarea_id) : null,
          estado_progreso: a.estado_progreso || null,
          tiempo_estimado_minutos: a.tiempo_estimado_minutos
            ? Number(a.tiempo_estimado_minutos)
            : null,
          usuario_id: a.usuario_id ? Number(a.usuario_id) : null,
          tiene_slot: Boolean(a.tiene_slot),
        })),
    }));
  }

  // -----------------------------------------------------------------------
  // Detalle completo de una reunión (para el modal)
  // -----------------------------------------------------------------------
  async obtenerReunionDetalle(actividadId) {
    const id = Number(actividadId);
    if (!id) return null;

    const a = await prisma.actividades.findUnique({
      where: { id },
      include: {
        tarea: {
          include: {
            tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
              select: { id: true, tipo: true, color: true },
            },
          },
        },
        prospectos: {
          include: {
            prospecto_persona: {
              include: {
                personas: {
                  select: {
                    id: true,
                    nombres: true,
                    apellidos: true,
                    celular: true,
                    email: true,
                    numero_documento: true,
                  },
                },
              },
            },
          },
        },
        horario_usuario: {
          where: { estado: true },
          orderBy: { id: "desc" },
          take: 1,
          select: {
            id: true,
            fecha: true,
            hora_inicio: true,
            hora_fin: true,
            duracion_minutos: true,
          },
        },
      },
    });
    if (!a) return null;

    const slot = a.horario_usuario?.[0] || null;
    const tt = a.tarea?.tipo_tarea_tarea_tipo_tareaTotipo_tarea || null;
    const contactos = (a.prospectos?.prospecto_persona || [])
      .map((pp) => pp.personas)
      .filter(Boolean);

    // Auditoría: usuario que REGISTRÓ la actividad. El schema NO
    // declara la relación navegable `actividades.usuario_register →
    // usuarios`, así que leemos el id y resolvemos el nombre en una
    // segunda query. Nullable para actividades legacy.
    let registrado_por = null;
    if (a.usuario_register != null) {
      const u = await prisma.usuarios.findUnique({
        where: { id: a.usuario_register },
        select: {
          id: true,
          usuario: true,
          personas: { select: { nombres: true, apellidos: true } },
        },
      });
      if (u) {
        const nom = u.personas?.nombres || "";
        const ape = u.personas?.apellidos || "";
        registrado_por = {
          id: u.id,
          usuario: u.usuario,
          nombre_completo:
            `${nom} ${ape}`.trim() || u.usuario || `#${u.id}`,
        };
      }
    }

    return {
      id: a.id,
      estado_progreso: a.estado_progreso,
      prioridad: a.prioridad,
      bloqueada: a.bloqueada === true,
      estado: a.estado,
      fecha_inicio: a.fecha_inicio
        ? (a.fecha_inicio instanceof Date
            ? fmtLocalDate(a.fecha_inicio)
            : String(a.fecha_inicio).slice(0, 10))
        : null,
      hora_inicio: a.hora_inicio
        ? minToHHMM(hmsToMin(a.hora_inicio) ?? 0)
        : null,
      tiempo_estimado_minutos: a.tiempo_estimado_minutos || null,
      fecha_inicio_real: a.fecha_inicio_real
        ? (a.fecha_inicio_real instanceof Date
            ? fmtLocalDate(a.fecha_inicio_real)
            : String(a.fecha_inicio_real).slice(0, 10))
        : null,
      hora_inicio_real: a.hora_inicio_real
        ? minToHHMM(hmsToMin(a.hora_inicio_real) ?? 0)
        : null,
      fecha_termino_real: a.fecha_termino_real
        ? (a.fecha_termino_real instanceof Date
            ? fmtLocalDate(a.fecha_termino_real)
            : String(a.fecha_termino_real).slice(0, 10))
        : null,
      hora_termino_real: a.hora_termino_real
        ? minToHHMM(hmsToMin(a.hora_termino_real) ?? 0)
        : null,
      motivo_reprograma: a.motivo_reprograma || null,
      usuario_id: a.usuario_id || null,
      prospecto_id: a.prospecto_id || null,
      tarea: a.tarea
        ? {
            id: a.tarea.id,
            nombre: a.tarea.nombre,
            horas_estimadas: a.tarea.horas_estimadas,
            tipo_tarea: tt
              ? { id: tt.id, tipo: tt.tipo, color: tt.color }
              : null,
          }
        : null,
      prospecto: a.prospectos
        ? {
            id: a.prospectos.id,
            titulo: a.prospectos.titulo_prospecto,
            estado_cliente: a.prospectos.estado_cliente,
            fecha_contacto: a.prospectos.fecha_contacto
              ? (a.prospectos.fecha_contacto instanceof Date
                  ? fmtLocalDate(a.prospectos.fecha_contacto)
                  : String(a.prospectos.fecha_contacto).slice(0, 10))
              : null,
            fecha_entrega: a.prospectos.fecha_entrega
              ? (a.prospectos.fecha_entrega instanceof Date
                  ? fmtLocalDate(a.prospectos.fecha_entrega)
                  : String(a.prospectos.fecha_entrega).slice(0, 10))
              : null,
            link_drive: a.prospectos.link_drive || null,
            contactos: contactos.map((c) => ({
              id: c.id,
              nombres: c.nombres,
              apellidos: c.apellidos,
              celular: c.celular,
              email: c.email,
              numero_documento: c.numero_documento,
            })),
          }
        : null,
      slot: slot
        ? {
            id: slot.id,
            fecha: slot.fecha
              ? (slot.fecha instanceof Date
                  ? fmtLocalDate(slot.fecha)
                  : String(slot.fecha).slice(0, 10))
              : null,
            hora_inicio: slot.hora_inicio
              ? minToHHMM(hmsToMin(slot.hora_inicio) ?? 0)
              : null,
            hora_fin: slot.hora_fin
              ? minToHHMM(hmsToMin(slot.hora_fin) ?? 0)
              : null,
            duracion_minutos: slot.duracion_minutos || null,
          }
        : null,
      registrado_por,
    };
  }

  // -----------------------------------------------------------------------
  // Normalización: crear horario_usuario para actividades legacy
  // -----------------------------------------------------------------------
  // Hay actividades de tipo REUNION creadas por el flujo de potenciales que
  // tienen fila en `actividades` pero NO en `horario_usuario` (ver
  // potenciales-clientes.service.js:966-972). El scheduler solo lee
  // horario_usuario, así que esas reuniones son "invisibles" al calcular
  // huecos. Antes de programar, normalizamos: si el usuario tiene reuniones
  // ese día que no tienen slot, se las creamos con la duración que ya
  // figura en la actividad. Idempotente.
  async ensureHorarioUsuarioForDay(usuarioId, fecha, tx = prisma) {
    const uid = Number(usuarioId);
    const fechaLocal = parseLocalDate(fecha);
    if (!uid || !fechaLocal) return 0;
    const fechaStr = fmtLocalDate(fechaLocal);

    // Actividades del usuario, ese día, activas, que tengan fecha/hora
    // definidas, y que NO tengan ya un slot activo en horario_usuario.
    const candidatas = await tx.actividades.findMany({
      where: {
        usuario_id: uid,
        fecha_inicio: new Date(fechaStr),
        estado: true,
        // Importante: incluye legacy (sin horario_usuario) y también las
        // que tengan un slot viejo ya con estado=false.
        horario_usuario: {
          none: { estado: true },
        },
      },
      select: {
        id: true,
        fecha_inicio: true,
        hora_inicio: true,
        tiempo_estimado_minutos: true,
      },
    });
    if (candidatas.length === 0) return 0;

    let creadas = 0;
    for (const a of candidatas) {
      const iniMin = hmsToMin(a.hora_inicio);
      if (iniMin == null) continue;
      const dur = Math.max(5, Number(a.tiempo_estimado_minutos) || 60);
      await tx.horario_usuario.create({
        data: {
          actividad_id: a.id,
          usuario_id: uid,
          fecha: a.fecha_inicio,
          hora_inicio: hmsToLocalDate(minToHHMM(iniMin)),
          hora_fin: hmsToLocalDate(minToHHMM(iniMin + dur)),
          estado: true,
          tipo: "reunion",
          categoria: "potencial_cliente",
          duracion_minutos: dur,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
      creadas++;
    }
    return creadas;
  }

  // -----------------------------------------------------------------------
  // Validación de fecha contra feriados y cumpleaños del usuario
  // -----------------------------------------------------------------------
  // Rechaza la fecha si:
  //   (1) cae en un `feriados` activo.
  //   (2) coincide (día + mes) con la `fecha_nacimiento` del usuario
  //       asignado.
  // Devuelve { ok:true } si la fecha es válida, o { ok:false, message }
  // con el motivo del rechazo.
  //
  // Mismo criterio que el flujo de potenciales-clientes
  // (potenciales-clientes.service.js:1001-1100). Acá lo aplicamos también
  // a las reuniones porque el scheduler mueve actividades para hacer
  // hueco, y no queremos terminar moviendo una actividad a un día que es
  // feriado o el cumpleaños del usuario.
  async validateFechaParaUsuario(usuarioId, fechaYmd, tx = prisma) {
    const fechaLocal = parseLocalDate(fechaYmd);
    if (!fechaLocal) {
      return { ok: false, message: "Fecha inválida." };
    }
    const fechaStr = fmtLocalDate(fechaLocal);

    // (1) Feriados
    const feriado = await tx.feriados.findFirst({
      where: { fecha: new Date(fechaStr), estado: true },
      select: { id: true, nombre: true },
    });
    if (feriado) {
      return {
        ok: false,
        message: `La fecha seleccionada es feriado${feriado.nombre ? `: ${feriado.nombre}` : "."}`,
      };
    }

    // (2) Cumpleaños del usuario (día + mes, no importa el año)
    const uid = Number(usuarioId);
    if (uid) {
      const usuario = await tx.usuarios.findUnique({
        where: { id: uid },
        select: { personas: { select: { fecha_nacimiento: true } } },
      });
      const fnac = usuario?.personas?.fecha_nacimiento;
      if (fnac) {
        const fnacDate = fnac instanceof Date ? fnac : new Date(fnac);
        if (!Number.isNaN(fnacDate.getTime())) {
          if (
            fnacDate.getDate() === fechaLocal.getDate() &&
            fnacDate.getMonth() === fechaLocal.getMonth()
          ) {
            return {
              ok: false,
              message:
                "La fecha seleccionada coincide con el cumpleaños del usuario. No se pueden agendar reuniones ese día.",
            };
          }
        }
      }
    }

    return { ok: true };
  }

  // -----------------------------------------------------------------------
  // Validación de slot libre (evita doble agendamiento)
  // -----------------------------------------------------------------------
  // Verifica que el rango [horaInicio, horaInicio+duracion] esté libre de
  // OTRAS REUNIONES en el horario del usuario para la fecha dada.
  // ignora la actividad con `ignorarActividadId` si se pasa (útil para
  // reprogramación).
  //
  // NOTA IMPORTANTE: sólo las actividades tipo REUNIÓN cuentan como
  // obstáculo. Si el slot está ocupado por una actividad NO-reunión
  // (valorador, auxiliar, etc.), el scheduler la va a MOVER o PARTIR
  // automáticamente para hacerle hueco a la reunión — no rechazamos el
  // agendamiento. Si la no-reunión es ALTA y no se puede mover, eso lo
  // detecta `placeActivity` más adelante (reason='choca con ALTA') y se
  // devuelve como 409 con la lista de actividades afectadas.
  //
  // Cuando el slot está ocupado por una REUNIÓN (o el día no tiene
  // bloques), devuelve además `suggestions` (mismo shape que
  // `overflowService.suggest`) para que el front muestre "otros usuarios
  // / horas extras / mover deadline" en el mismo 409, en vez de un
  // mensaje aislado.
  //
  // `opts` (opcional): { prioridad, deadline, prospectoId } — se reenvían
  // a `overflowService.suggest` para que el cálculo de sugerencias tenga
  // contexto. Si no se pasan, las sugerencias salen genéricas.
  async validarSlotLibre(
    usuarioId,
    fechaYmd,
    horaInicio,
    duracionMinutos,
    ignorarActividadId = null,
    opts = {},
  ) {
    const fechaLocal = parseLocalDate(fechaYmd);
    if (!fechaLocal) return { ok: false, message: "Fecha inválida." };
    const fechaStr = fmtLocalDate(fechaLocal);
    const iniMin = hmsToMin(horaInicio);
    if (iniMin == null) return { ok: false, message: "Hora de inicio inválida." };
    const finMin = iniMin + Math.max(5, Number(duracionMinutos) || 0);

    const ctx = await schedulerService.loadDayContext(usuarioId, fechaStr);
    if (!ctx || ctx.bloques.length === 0) {
      const suggestions = await this.#safeOverflowSuggest(
        usuarioId,
        fechaStr,
        finMin - iniMin,
        opts,
      );
      return {
        ok: false,
        message: "El usuario no tiene bloques de horario configurados para ese día.",
        suggestions,
      };
    }
    if (ignorarActividadId) {
      ctx.eventos = ctx.eventos.filter((e) => e.actividad_id !== ignorarActividadId);
    }
    // Sólo las REUNIONES cuentan como obstáculo. Filtramos el resto
    // (valorador, auxiliares, etc.) para que NO bloqueen el slot — el
    // scheduler se encarga de moverlas/partirlas. Ver nota en el header.
    const ctxSoloReuniones = {
      ...ctx,
      eventos: ctx.eventos.filter((e) => e.esReunion === true),
    };
    const slots = schedulerService.computeFreeSlots(ctxSoloReuniones);
    const libre = slots.some((s) => iniMin >= s.ini && finMin <= s.fin);
    if (!libre) {
      const suggestions = await this.#safeOverflowSuggest(
        usuarioId,
        fechaStr,
        finMin - iniMin,
        opts,
      );
      return {
        ok: false,
        message: `El horario de ${minToHHMM(iniMin)} a ${minToHHMM(finMin)} ya está ocupado. Elegí otro horario.`,
        suggestions,
      };
    }
    return { ok: true };
  }

  // Wrapper que llama a overflowService.suggest sin tirar si algo falla:
  // la sugerencia es un plus, no debe romper la validación.
  async #safeOverflowSuggest(usuarioId, fechaStr, duracion, opts) {
    try {
      return await overflowService.suggest(usuarioId, fechaStr, duracion, opts || {});
    } catch {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Crear reunión
  // -----------------------------------------------------------------------
  // body: {
  //   prospecto_id, tarea_id, usuario_id, fecha ('YYYY-MM-DD'),
  //   hora_inicio ('HH:MM'), duracion_minutos, prioridad, motivo
  // }
  async crearReunion({
    prospectoId,
    tareaId,
    usuarioId,
    fecha,
    horaInicio,
    duracionMinutos,
    prioridad,
    motivo,
    asistenteId,
  }) {
    // ---- 1) Validaciones de input ----
    const prospecto_id = Number(prospectoId);
    const tarea_id = Number(tareaId);
    const usuario_id = Number(usuarioId);
    const duracion = Math.max(5, Number(duracionMinutos) || 0);
    if (!prospecto_id) {
      const e = new Error("prospecto_id es requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (!tarea_id) {
      const e = new Error("tarea_id es requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (!usuario_id) {
      const e = new Error("usuario_id es requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (!fecha) {
      const e = new Error("fecha es requerida (YYYY-MM-DD).");
      e.code = "BAD_REQUEST";
      throw e;
    }
    const horaIniStr = String(horaInicio || "").trim();
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(horaIniStr)) {
      const e = new Error("hora_inicio es requerida (HH:MM).");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (!duracion) {
      const e = new Error("duracion_minutos debe ser > 0.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const fechaLocal = parseLocalDate(fecha);
    if (!fechaLocal) {
      const e = new Error("fecha inválida.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    const fechaStr = fmtLocalDate(fechaLocal);

    // ---- 2) Validaciones de dominio ----
    const prospecto = await prisma.prospectos.findUnique({
      where: { id: prospecto_id },
      select: { id: true, estado: true, fecha_entrega: true },
    });
    if (!prospecto || !prospecto.estado) {
      const e = new Error("El prospecto no existe o no está activo.");
      e.code = "NOT_FOUND";
      throw e;
    }

    const tarea = await prisma.tarea.findUnique({
      where: { id: tarea_id },
      include: {
        tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
          select: { id: true, tipo: true, color: true },
        },
      },
    });
    if (!tarea) {
      const e = new Error("La tarea no existe.");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (!isReunionTarea(tarea)) {
      const e = new Error(
        "La tarea seleccionada no es de tipo REUNIÓN. Solo se pueden agendar reuniones con tareas de tipo REUNIÓN.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    const usuario = await prisma.usuarios.findUnique({
      where: { id: usuario_id },
      select: { id: true, estado: true, rol_id: true, personas: { select: { nombres: true, apellidos: true } } },
    });
    if (!usuario || !usuario.estado) {
      const e = new Error("El usuario asignado no existe o no está activo.");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (Number(usuario.rol_id) === ROL_ASISTENTE_PROD_ID) {
      const e = new Error(
        "La Asistente de Producción no puede asignarse reuniones a sí misma.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Prioridad: default MEDIA si no viene. Si es ALTA, marcamos bloqueada.
    const prioridadNorm = ["ALTA", "MEDIA", "BAJA"].includes(String(prioridad || "").toUpperCase())
      ? String(prioridad).toUpperCase()
      : "MEDIA";
    const bloqueada = prioridadNorm === "ALTA";

    // Deadline del prospecto, en formato YYYY-MM-DD (o null).
    const deadline = prospecto.fecha_entrega
      ? (prospecto.fecha_entrega instanceof Date
          ? fmtLocalDate(prospecto.fecha_entrega)
          : String(prospecto.fecha_entrega).slice(0, 10))
      : null;

    // ---- 3) Normalizar horario_usuario legacy ANTES de planificar ----
    await prisma.$transaction(async (tx) => {
      await this.ensureHorarioUsuarioForDay(usuario_id, fechaStr, tx);
    });

    // ---- 3.5) Validar fecha contra feriados y cumpleaños del usuario ----
    const fechaVal = await this.validateFechaParaUsuario(usuario_id, fechaStr);
    if (!fechaVal.ok) {
      const e = new Error(fechaVal.message);
      e.code = "BAD_REQUEST";
      throw e;
    }

    // ---- 3.6) Validar que el slot específico esté libre ----
    const slotVal = await this.validarSlotLibre(
      usuario_id,
      fechaStr,
      horaIniStr,
      duracion,
      null,
      { prioridad: prioridadNorm, deadline, prospectoId: prospecto_id },
    );
    if (!slotVal.ok) {
      const e = new Error(slotVal.message);
      e.code = "CONFLICT";
      e.details = {
        reason: "slot ocupado",
        suggestions: slotVal.suggestions || null,
      };
      throw e;
    }

    // ---- 4) Planificar con el scheduler ----
    const plan = await schedulerService.placeActivity(
      usuario_id,
      fechaStr,
      duracion,
      { prioridad: prioridadNorm, deadline, ignorarActividadId: null },
    );
    if (!plan.fits) {
      const overflow = await overflowService.suggest(
        usuario_id,
        fechaStr,
        duracion,
        { prioridad: prioridadNorm, deadline, prospectoId: prospecto_id },
      );
      const e = new Error(
        plan.reason === "sin bloques"
          ? `El usuario no tiene bloques de horario configurados para ese día.`
          : `No hay hueco en la jornada (${plan.reason || "sin capacidad"}).`,
      );
      e.code = "CONFLICT";
      e.details = {
        reason: plan.reason,
        overflowMin: plan.overflowMin,
        mejorSoltarMin: plan.mejorSoltarMin,
        suggestions: overflow,
      };
      throw e;
    }

    // ---- 5) Persistir: actividades + horario_usuario en una transacción ----
    const horaIniMin = hmsToMin(horaIniStr);
    const horaIniNorm = minToHHMM(horaIniMin ?? 0);
    const horaFinNorm = minToHHMM((horaIniMin ?? 0) + duracion);

    const result = await prisma.$transaction(async (tx) => {
      const nueva = await tx.actividades.create({
        data: {
          prospecto_id,
          usuario_id,
          tarea_id,
          estado: true,
          estado_progreso: "pendiente",
          prioridad: prioridadNorm,
          bloqueada,
          color: tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea?.color || null,
          tiempo_estimado_minutos: duracion,
          fecha_inicio: new Date(fechaStr),
          hora_inicio: hmsToLocalDate(horaIniNorm),
          usuario_register: asistenteId || null,
          motivo_reprograma: motivo ? String(motivo).slice(0, 255) : null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
      const hu = await tx.horario_usuario.create({
        data: {
          actividad_id: nueva.id,
          usuario_id,
          fecha: new Date(fechaStr),
          hora_inicio: hmsToLocalDate(horaIniNorm),
          hora_fin: hmsToLocalDate(horaFinNorm),
          estado: true,
          tipo: "reunion",
          categoria: "potencial_cliente",
          duracion_minutos: duracion,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
      return { actividad: nueva, horario: hu };
    });

    return {
      actividad: {
        id: result.actividad.id,
        prospecto_id,
        usuario_id,
        tarea_id,
        fecha_inicio: fechaStr,
        hora_inicio: horaIniNorm,
        hora_fin: horaFinNorm,
        duracion_minutos: duracion,
        prioridad: prioridadNorm,
        bloqueada,
        estado_progreso: "pendiente",
      },
      slot: {
        id: result.horario.id,
        fecha: fechaStr,
        hora_inicio: horaIniNorm,
        hora_fin: horaFinNorm,
      },
      plan: {
        reason: plan.reason,
        moves: plan.moves,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Reprogramar (mismo usuario, distinta fecha/hora/duración)
  // -----------------------------------------------------------------------
  async reprogramarReunion({
    actividadId,
    fechaDestino,
    horaInicio,
    duracionMinutos,
    motivo,
    asistenteId,
  }) {
    const id = Number(actividadId);
    if (!id) {
      const e = new Error("actividad_id requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const act = await prisma.actividades.findUnique({
      where: { id },
      include: {
        tarea: { select: { id: true, horas_estimadas: true } },
        prospectos: { select: { id: true, fecha_entrega: true } },
      },
    });
    if (!act) {
      const e = new Error("La actividad no existe.");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (!act.estado) {
      const e = new Error("La actividad está cancelada.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (String(act.estado_progreso || "").toLowerCase() === "en_progreso") {
      const e = new Error(
        "No se puede reprogramar una reunión que está en progreso.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    const minutos = Math.max(5, Number(duracionMinutos) || act.tiempo_estimado_minutos || 60);
    const fecha = fechaDestino
      ? (parseLocalDate(fechaDestino) ? fmtLocalDate(parseLocalDate(fechaDestino)) : null)
      : (act.fecha_inicio
          ? (act.fecha_inicio instanceof Date
              ? fmtLocalDate(act.fecha_inicio)
              : String(act.fecha_inicio).slice(0, 10))
          : null);
    if (!fecha) {
      const e = new Error("fecha_destino o fecha_inicio de la actividad es requerida.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    // Si el front mandó hora_inicio, esa manda; si no, mantenemos la que
    // ya tenía la actividad (si tenía) o las 09:00.
    let horaIniNorm = null;
    if (horaInicio) {
      const hm = hmsToMin(horaInicio);
      if (hm == null) {
        const e = new Error("hora_inicio inválida (HH:MM).");
        e.code = "BAD_REQUEST";
        throw e;
      }
      horaIniNorm = minToHHMM(hm);
    } else {
      const hm = hmsToMin(act.hora_inicio);
      horaIniNorm = hm != null ? minToHHMM(hm) : "09:00";
    }
    const horaFinNorm = minToHHMM((hmsToMin(horaIniNorm) ?? 540) + minutos);

    // Normalizar legacy antes de planificar.
    await prisma.$transaction(async (tx) => {
      await this.ensureHorarioUsuarioForDay(act.usuario_id, fecha, tx);
    });

    // Validar fecha contra feriados y cumpleaños del usuario asignado.
    const fechaVal = await this.validateFechaParaUsuario(act.usuario_id, fecha);
    if (!fechaVal.ok) {
      const e = new Error(fechaVal.message);
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Validar que el slot específico esté libre.
    const slotVal = await this.validarSlotLibre(
      act.usuario_id,
      fecha,
      horaIniNorm,
      minutos,
      id,
      {
        prioridad: act.prioridad || null,
        deadline: act.prospectos?.fecha_entrega
          ? (act.prospectos.fecha_entrega instanceof Date
              ? fmtLocalDate(act.prospectos.fecha_entrega)
              : String(act.prospectos.fecha_entrega).slice(0, 10))
          : null,
        prospectoId: act.prospecto_id,
      },
    );
    if (!slotVal.ok) {
      const e = new Error(slotVal.message);
      e.code = "CONFLICT";
      e.details = {
        reason: "slot ocupado",
        suggestions: slotVal.suggestions || null,
      };
      throw e;
    }

    const deadline = act.prospectos?.fecha_entrega
      ? (act.prospectos.fecha_entrega instanceof Date
          ? fmtLocalDate(act.prospectos.fecha_entrega)
          : String(act.prospectos.fecha_entrega).slice(0, 10))
      : null;
    const prioridad = act.prioridad || null;

    const plan = await schedulerService.placeActivity(
      act.usuario_id,
      fecha,
      minutos,
      {
        prioridad,
        deadline,
        ignorarActividadId: id,
      },
    );
    if (!plan.fits) {
      const overflow = await overflowService.suggest(
        act.usuario_id,
        fecha,
        minutos,
        { prioridad, deadline, prospectoId: act.prospecto_id },
      );
      const e = new Error(
        plan.reason === "sin bloques"
          ? `El usuario no tiene bloques de horario configurados para ese día.`
          : `No hay hueco en la jornada (${plan.reason || "sin capacidad"}).`,
      );
      e.code = "CONFLICT";
      e.details = {
        reason: plan.reason,
        overflowMin: plan.overflowMin,
        mejorSoltarMin: plan.mejorSoltarMin,
        suggestions: overflow,
      };
      throw e;
    }

    // Aplicar: actualizamos la actividad (fecha_inicio, hora_inicio,
    // tiempo_estimado_minutos, motivo_reprograma) y su horario_usuario
    // (hi/hf/fecha). Las movibles que el plan compactó las maneja
    // applyMoves. Si la actividad no tenía horario_usuario (legacy de
    // potenciales), lo creamos.
    const motivoTxt = motivo != null ? String(motivo).slice(0, 255) : "Reprogramación desde Asistente";

    const result = await prisma.$transaction(async (tx) => {
      // Localizar el horario_usuario de esta actividad (puede ser null).
      const hu = await tx.horario_usuario.findFirst({
        where: { actividad_id: id, usuario_id: act.usuario_id, estado: true },
        select: { id: true },
        orderBy: { id: "desc" },
      });

      const moves = [...(plan.moves || [])];
      if (hu) {
        moves.push({
          actividad_id: id,
          horario_id: hu.id,
          hi: horaIniNorm,
          hf: horaFinNorm,
          fecha,
        });
      } else {
        // Crear slot nuevo (legacy).
        await tx.horario_usuario.create({
          data: {
            actividad_id: id,
            usuario_id: act.usuario_id,
            fecha: new Date(fecha),
            hora_inicio: hmsToLocalDate(horaIniNorm),
            hora_fin: hmsToLocalDate(horaFinNorm),
            estado: true,
            tipo: "reunion",
            categoria: "potencial_cliente",
            duracion_minutos: minutos,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      }

      const applyRes = moves.length
        ? await schedulerService.applyMoves(moves, motivoTxt)
        : { applied: 0 };

      // Actualizar la actividad: nuevos fecha/hora + motivo.
      const upd = await tx.actividades.update({
        where: { id },
        data: {
          fecha_inicio: new Date(fecha),
          hora_inicio: hmsToLocalDate(horaIniNorm),
          tiempo_estimado_minutos: minutos,
          motivo_reprograma: motivoTxt,
          updated_at: new Date(),
        },
      });

      return { actividad: upd, applied: applyRes.applied || 0, plan };
    });

    return {
      actividad: {
        id: result.actividad.id,
        fecha_inicio: fecha,
        hora_inicio: plan.slot.hi,
        hora_fin: plan.slot.hf,
        duracion_minutos: minutos,
      },
      slot: {
        fecha,
        hora_inicio: plan.slot.hi,
        hora_fin: plan.slot.hf,
      },
      plan: {
        reason: plan.reason,
        moves: plan.moves,
        movesApplied: result.applied,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Reasignar (cambiar de usuario, opcionalmente también de fecha/hora)
  // -----------------------------------------------------------------------
  async reasignarReunion({
    actividadId,
    nuevoUsuarioId,
    fecha,
    horaInicio,
    duracionMinutos,
    motivo,
    asistenteId,
  }) {
    const id = Number(actividadId);
    const nuevo_uid = Number(nuevoUsuarioId);
    if (!id) {
      const e = new Error("actividad_id requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (!nuevo_uid) {
      const e = new Error("nuevoUsuarioId requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const act = await prisma.actividades.findUnique({
      where: { id },
      include: {
        prospectos: { select: { id: true, fecha_entrega: true } },
      },
    });
    if (!act) {
      const e = new Error("La actividad no existe.");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (!act.estado) {
      const e = new Error("La actividad está cancelada.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (String(act.estado_progreso || "").toLowerCase() === "en_progreso") {
      const e = new Error(
        "No se puede reasignar una reunión que está en progreso.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (Number(act.usuario_id) === nuevo_uid) {
      const e = new Error("El nuevo usuario es el mismo que el actual.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const usuarioNuevo = await prisma.usuarios.findUnique({
      where: { id: nuevo_uid },
      select: { id: true, estado: true, rol_id: true },
    });
    if (!usuarioNuevo || !usuarioNuevo.estado) {
      const e = new Error("El usuario destino no existe o no está activo.");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (Number(usuarioNuevo.rol_id) === ROL_ASISTENTE_PROD_ID) {
      const e = new Error(
        "La Asistente de Producción no puede asignarse reuniones a sí misma.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    const minutos = Math.max(5, Number(duracionMinutos) || act.tiempo_estimado_minutos || 60);
    const fechaYmd = fecha
      ? (parseLocalDate(fecha) ? fmtLocalDate(parseLocalDate(fecha)) : null)
      : (act.fecha_inicio
          ? (act.fecha_inicio instanceof Date
              ? fmtLocalDate(act.fecha_inicio)
              : String(act.fecha_inicio).slice(0, 10))
          : null);
    if (!fechaYmd) {
      const e = new Error("fecha o fecha_inicio requerida.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    let horaIniNorm = null;
    if (horaInicio) {
      const hm = hmsToMin(horaInicio);
      if (hm == null) {
        const e = new Error("hora_inicio inválida (HH:MM).");
        e.code = "BAD_REQUEST";
        throw e;
      }
      horaIniNorm = minToHHMM(hm);
    } else {
      const hm = hmsToMin(act.hora_inicio);
      horaIniNorm = hm != null ? minToHHMM(hm) : "09:00";
    }

    // Normalizar legacy en el calendario del NUEVO usuario.
    await prisma.$transaction(async (tx) => {
      await this.ensureHorarioUsuarioForDay(nuevo_uid, fechaYmd, tx);
    });

    // Validar fecha contra feriados y cumpleaños del NUEVO usuario.
    const fechaVal = await this.validateFechaParaUsuario(nuevo_uid, fechaYmd);
    if (!fechaVal.ok) {
      const e = new Error(fechaVal.message);
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Validar que el slot específico esté libre en el nuevo usuario.
    const slotVal = await this.validarSlotLibre(
      nuevo_uid,
      fechaYmd,
      horaIniNorm,
      minutos,
      id,
      {
        prioridad: act.prioridad || null,
        deadline: act.prospectos?.fecha_entrega
          ? (act.prospectos.fecha_entrega instanceof Date
              ? fmtLocalDate(act.prospectos.fecha_entrega)
              : String(act.prospectos.fecha_entrega).slice(0, 10))
          : null,
        prospectoId: act.prospecto_id,
      },
    );
    if (!slotVal.ok) {
      const e = new Error(slotVal.message);
      e.code = "CONFLICT";
      e.details = {
        reason: "slot ocupado",
        suggestions: slotVal.suggestions || null,
      };
      throw e;
    }

    const deadline = act.prospectos?.fecha_entrega
      ? (act.prospectos.fecha_entrega instanceof Date
          ? fmtLocalDate(act.prospectos.fecha_entrega)
          : String(act.prospectos.fecha_entrega).slice(0, 10))
      : null;
    const prioridad = act.prioridad || null;

    const plan = await schedulerService.placeActivity(
      nuevo_uid,
      fechaYmd,
      minutos,
      { prioridad, deadline, ignorarActividadId: null },
    );
    if (!plan.fits) {
      const overflow = await overflowService.suggest(
        nuevo_uid,
        fechaYmd,
        minutos,
        { prioridad, deadline, prospectoId: act.prospecto_id },
      );
      const e = new Error(
        plan.reason === "sin bloques"
          ? `El usuario destino no tiene bloques de horario configurados para ese día.`
          : `No hay hueco en la jornada del usuario destino (${plan.reason || "sin capacidad"}).`,
      );
      e.code = "CONFLICT";
      e.details = {
        reason: plan.reason,
        overflowMin: plan.overflowMin,
        mejorSoltarMin: plan.mejorSoltarMin,
        suggestions: overflow,
      };
      throw e;
    }

    const motivoTxt = motivo != null
      ? String(motivo).slice(0, 255)
      : `Reasignada de usuario #${act.usuario_id} a #${nuevo_uid}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1) Cerrar el horario_usuario viejo (estado=false) si existía.
      const huViejo = await tx.horario_usuario.findFirst({
        where: { actividad_id: id, estado: true },
        select: { id: true },
      });
      if (huViejo) {
        await tx.horario_usuario.update({
          where: { id: huViejo.id },
          data: { estado: false, updated_at: new Date() },
        });
      }

      // 2) Crear el nuevo slot en el calendario del usuario destino.
      const huNuevo = await tx.horario_usuario.create({
        data: {
          actividad_id: id,
          usuario_id: nuevo_uid,
          fecha: new Date(fechaYmd),
          hora_inicio: hmsToLocalDate(plan.slot.hi),
          hora_fin: hmsToLocalDate(plan.slot.hf),
          estado: true,
          tipo: "reunion",
          categoria: "potencial_cliente",
          duracion_minutos: minutos,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // 3) Actualizar la actividad: nuevo usuario, fecha, hora, motivo.
      const upd = await tx.actividades.update({
        where: { id },
        data: {
          usuario_id: nuevo_uid,
          fecha_inicio: new Date(fechaYmd),
          hora_inicio: hmsToLocalDate(horaIniNorm),
          tiempo_estimado_minutos: minutos,
          motivo_reprograma: motivoTxt,
          updated_at: new Date(),
        },
      });

      return { actividad: upd, horarioViejoId: huViejo?.id || null, horarioNuevo: huNuevo };
    });

    return {
      actividad: {
        id: result.actividad.id,
        usuario_id: nuevo_uid,
        fecha_inicio: fechaYmd,
        hora_inicio: plan.slot.hi,
        hora_fin: plan.slot.hf,
        duracion_minutos: minutos,
      },
      slot: {
        id: result.horarioNuevo.id,
        fecha: fechaYmd,
        hora_inicio: plan.slot.hi,
        hora_fin: plan.slot.hf,
      },
      plan: {
        reason: plan.reason,
        moves: plan.moves,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Programar por PRIMERA vez (reunión legacy sin slot)
  // -----------------------------------------------------------------------
  // Las reuniones creadas desde el flujo de potenciales viven en
  // `actividades` pero NO tienen fila en `horario_usuario`, por lo que
  // son invisibles al scheduler y al calendario. Este método las "oficializa":
  //   1. Valida que la actividad exista, sea REUNION y NO tenga slot activo.
  //   2. (Opcional) cambia el usuario asignado.
  //   3. Corre placeActivity en el día/duración solicitado.
  //   4. Crea horario_usuario + actualiza actividades.
  //
  // Diferencia con reprogramarReunion:
  //   - reprogramarReunion EXIGE que la actividad ya esté programada
  //     (mueve un slot existente).
  //   - programarPrimeraVez EXIGE que NO haya slot todavía (lo crea).
  //
  // body: {
  //   actividadId, usuarioId?, fecha (YYYY-MM-DD), horaInicio (HH:MM),
  //   duracionMinutos, motivo?, asistenteId
  // }
  async programarPrimeraVez({
    actividadId,
    usuarioId,
    fecha,
    horaInicio,
    duracionMinutos,
    motivo,
    asistenteId,
  }) {
    const id = Number(actividadId);
    if (!id) {
      const e = new Error("actividad_id requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const act = await prisma.actividades.findUnique({
      where: { id },
      include: {
        tarea: {
          include: {
            tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
              select: { id: true, tipo: true, color: true },
            },
          },
        },
        prospectos: { select: { id: true, fecha_entrega: true } },
        horario_usuario: {
          where: { estado: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!act) {
      const e = new Error("La actividad no existe.");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (!act.estado) {
      const e = new Error("La actividad está cancelada.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (!isReunionTarea(act.tarea)) {
      const e = new Error("La actividad no es de tipo REUNIÓN.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if ((act.horario_usuario || []).length > 0) {
      const e = new Error(
        "Esta reunión ya está programada. Use 'Reprogramar' desde el calendario.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Usuario destino: si el body trae uno, usamos ese; si no,
    // mantenemos el `usuario_id` ya seteado en la actividad.
    const uid = Number(usuarioId) || Number(act.usuario_id) || 0;
    if (!uid) {
      const e = new Error("usuario_id requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    const usuario = await prisma.usuarios.findUnique({
      where: { id: uid },
      select: { id: true, estado: true, rol_id: true },
    });
    if (!usuario || !usuario.estado) {
      const e = new Error("El usuario asignado no existe o no está activo.");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (Number(usuario.rol_id) === ROL_ASISTENTE_PROD_ID) {
      const e = new Error(
        "La Asistente de Producción no puede asignarse reuniones a sí misma.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Inputs de tiempo.
    const duracion = Math.max(
      5,
      Number(duracionMinutos) || act.tiempo_estimado_minutos || 60,
    );
    if (!fecha) {
      const e = new Error("fecha es requerida (YYYY-MM-DD).");
      e.code = "BAD_REQUEST";
      throw e;
    }
    const fechaLocal = parseLocalDate(fecha);
    if (!fechaLocal) {
      const e = new Error("fecha inválida.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    const fechaStr = fmtLocalDate(fechaLocal);

    const horaIniStr = String(horaInicio || "").trim();
    if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(horaIniStr)) {
      const e = new Error("hora_inicio es requerida (HH:MM).");
      e.code = "BAD_REQUEST";
      throw e;
    }
    const horaIniMin = hmsToMin(horaIniStr);
    const horaIniNorm = minToHHMM(horaIniMin ?? 0);
    const horaFinNorm = minToHHMM((horaIniMin ?? 0) + duracion);

    // Normalizar legacy ANTES de planificar (otras reuniones del usuario
    // ese día sin slot).
    await prisma.$transaction(async (tx) => {
      await this.ensureHorarioUsuarioForDay(uid, fechaStr, tx);
    });

    // Validar fecha contra feriados + cumpleaños del usuario destino.
    const fechaVal = await this.validateFechaParaUsuario(uid, fechaStr);
    if (!fechaVal.ok) {
      const e = new Error(fechaVal.message);
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Prioridad + bloqueada vienen de la actividad. Si era null, default MEDIA.
    // Se calculan AQUÍ (antes de validarSlotLibre) para que la sugerencia de
    // overflow en el 409 "slot ocupado" tenga el contexto de prioridad y
    // deadline de la actividad que se está intentando programar.
    const prioridad = ["ALTA", "MEDIA", "BAJA"].includes(
      String(act.prioridad || "").toUpperCase(),
    )
      ? String(act.prioridad).toUpperCase()
      : "MEDIA";
    const bloqueada = prioridad === "ALTA";

    const deadline = act.prospectos?.fecha_entrega
      ? act.prospectos.fecha_entrega instanceof Date
        ? fmtLocalDate(act.prospectos.fecha_entrega)
        : String(act.prospectos.fecha_entrega).slice(0, 10)
      : null;

    // Validar que el slot específico esté libre.
    const slotVal = await this.validarSlotLibre(
      uid,
      fechaStr,
      horaIniStr,
      duracion,
      id,
      { prioridad, deadline, prospectoId: act.prospecto_id },
    );
    if (!slotVal.ok) {
      const e = new Error(slotVal.message);
      e.code = "CONFLICT";
      e.details = {
        reason: "slot ocupado",
        suggestions: slotVal.suggestions || null,
      };
      throw e;
    }

    // Scheduler. splittable=true permite partir actividades que caigan en
    // medio del slot de la reunión (e.g. una actividad larga 9-12 con la
    // reunión 10-11 → parte en 9-10 + 11-12).
    //
    // horaInicio se pasa en MINUTOS desde medianoche para que el
    // scheduler coloque la reunión EXACTAMENTE a la hora que el usuario
    // eligió (en vez de buscar "cualquier hueco libre del día"). Si
    // hay una actividad no-reunión en ese rango, el scheduler la parte
    // o la mueve para hacer lugar.
    const plan = await schedulerService.placeActivity(uid, fechaStr, duracion, {
      prioridad,
      deadline,
      ignorarActividadId: id, // por si quedó algún slot fantasma
      splittable: true,
      horaInicio: horaIniMin,
    });
    if (!plan.fits) {
      const overflow = await overflowService.suggest(uid, fechaStr, duracion, {
        prioridad,
        deadline,
        prospectoId: act.prospecto_id,
      });
      const e = new Error(
        plan.reason === "sin bloques"
          ? `El usuario no tiene bloques de horario configurados para ese día.`
          : plan.reason === "deadline"
          ? `La nueva hora fin supera la fecha de entrega del prospecto.`
          : `No hay hueco en la jornada (${plan.reason || "sin capacidad"}).`,
      );
      e.code = "CONFLICT";
      e.details = {
        reason: plan.reason,
        overflowMin: plan.overflowMin,
        mejorSoltarMin: plan.mejorSoltarMin,
        blockedMoves: plan.blockedMoves || [],
        suggestions: overflow,
      };
      throw e;
    }

    const motivoTxt = motivo
      ? String(motivo).slice(0, 255)
      : "Programación inicial desde Asistente";

    // Persistencia: aplica moves de compactación y splits (particiones),
    // luego actualiza la actividad y crea el horario_usuario de la reunión.
    // Todo dentro de UNA transacción para que sea atómico.
    const result = await prisma.$transaction(async (tx) => {
      const moves = [...(plan.moves || [])];
      const splits = [...(plan.splits || [])];

      const movesRes = moves.length
        ? await schedulerService.applyMoves(moves, motivoTxt)
        : { applied: 0 };
      const splitsRes = splits.length
        ? await schedulerService.applySplits(splits, motivoTxt)
        : { applied: { splits: 0, overflow: 0, cascadeMoves: 0 } };

      const upd = await tx.actividades.update({
        where: { id },
        data: {
          usuario_id: uid,
          fecha_inicio: new Date(fechaStr),
          hora_inicio: hmsToLocalDate(horaIniNorm),
          tiempo_estimado_minutos: duracion,
          prioridad,
          bloqueada,
          color:
            act.tarea?.tipo_tarea_tarea_tipo_tareaTotipo_tarea?.color ||
            act.color ||
            null,
          motivo_reprograma: motivoTxt,
          usuario_register: act.usuario_register || asistenteId || null,
          updated_at: new Date(),
        },
      });

      const hu = await tx.horario_usuario.create({
        data: {
          actividad_id: id,
          usuario_id: uid,
          fecha: new Date(fechaStr),
          hora_inicio: hmsToLocalDate(horaIniNorm),
          hora_fin: hmsToLocalDate(horaFinNorm),
          estado: true,
          tipo: "reunion",
          categoria: "potencial_cliente",
          duracion_minutos: duracion,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      return {
        actividad: upd,
        horario: hu,
        applied: {
          moves: movesRes.applied || 0,
          splits: splitsRes.applied?.splits || 0,
          overflow: splitsRes.applied?.overflow || 0,
          cascadeMoves: splitsRes.applied?.cascadeMoves || 0,
        },
      };
    });

    return {
      actividad: {
        id: result.actividad.id,
        usuario_id: uid,
        fecha_inicio: fechaStr,
        hora_inicio: plan.slot.hi,
        hora_fin: plan.slot.hf,
        duracion_minutos: duracion,
        prioridad,
        bloqueada,
      },
      slot: {
        id: result.horario.id,
        fecha: fechaStr,
        hora_inicio: plan.slot.hi,
        hora_fin: plan.slot.hf,
      },
      plan: {
        reason: plan.reason,
        moves: plan.moves || [],
        splits: plan.splits || [],
        applied: {
          moves: result.applied.moves || 0,
          splits: result.applied.splits || 0,
          overflow: result.applied.overflow || 0,
          cascadeMoves: result.applied.cascadeMoves || 0,
        },
        blockedMoves: [
          ...(plan.blockedMoves || []),
          ...(plan.interBlocked || []),
        ],
      },
    };
  }

  // -----------------------------------------------------------------------
  // Eliminar (baja lógica en actividades + horario_usuario)
  // -----------------------------------------------------------------------
  async eliminarReunion({ actividadId }) {
    const id = Number(actividadId);
    if (!id) {
      const e = new Error("actividad_id requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    const act = await prisma.actividades.findUnique({
      where: { id },
      select: { id: true, estado: true, estado_progreso: true },
    });
    if (!act) {
      const e = new Error("La actividad no existe.");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (String(act.estado_progreso || "").toLowerCase() === "en_progreso") {
      const e = new Error(
        "No se puede eliminar una reunión que está en progreso.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    return await prisma.$transaction(async (tx) => {
      await tx.actividades.update({
        where: { id },
        data: { estado: false, updated_at: new Date() },
      });
      const huRes = await tx.horario_usuario.updateMany({
        where: { actividad_id: id, estado: true },
        data: { estado: false, updated_at: new Date() },
      });
      return { actividad_id: id, horario_usuario_cerrados: huRes.count || 0 };
    });
  }
}

export default new ReunionesAsistenteService();
