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

// Retorna [{ini, fin}] huecos libres dentro de bloques de jornada,
// excluyendo los eventos recibidos.
const computeFreeSlotsOnDay = (bloques, eventos) => {
  if (!bloques || bloques.length === 0) return [];
  const sorted = [...eventos].sort((a, b) => a.ini - b.ini);
  const out = [];
  for (const b of bloques) {
    let cursor = b.ini;
    for (const e of sorted) {
      const ei = e.iniAjustado ?? e.ini;
      const ef = e.finAjustado ?? e.fin;
      if (ef <= cursor || ei >= b.fin) continue;
      if (ei > cursor) out.push({ ini: cursor, fin: Math.min(ei, b.fin) });
      cursor = Math.max(cursor, ef);
      if (cursor >= b.fin) break;
    }
    if (cursor < b.fin) out.push({ ini: cursor, fin: b.fin });
  }
  return out.filter((h) => h.fin - h.ini >= 5);
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
    if (deadline && fechaStr > deadline) {
      const e = new Error(
        `No se puede programar: la fecha supera la fecha de entrega (${deadline}). Cambia de auxiliar.`,
      );
      e.code = "CONFLICT";
      throw e;
    }

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

    // ---- 5) Persistir: aplicar plan (moves/splits/chainCascades) y crear
    //          la nueva actividad en una sola operación atómica. ----
    const horaIniMin = hmsToMin(horaIniStr);
    const horaIniNorm = minToHHMM(horaIniMin ?? 0);
    const horaFinNorm = minToHHMM((horaIniMin ?? 0) + duracion);

    const motivoTxt = motivo
      ? String(motivo).slice(0, 255)
      : "Programación inicial de reunión";

    const moves = [...(plan.moves || [])];
    const splits = [...(plan.splits || [])];
    const disableBlocks = [...(plan.disableBlocks || [])];

    const movesRes = moves.length
      ? await schedulerService.applyMoves(moves, motivoTxt)
      : { applied: 0 };
    const splitsRes = splits.length
      ? await schedulerService.applySplits(splits, motivoTxt)
      : { applied: { splits: 0, overflow: 0, cascadeMoves: 0 } };

    const result = await prisma.$transaction(async (tx) => {
      // Deshabilitar bloques de otras actividades que quedaron después de
      // la reunión en el mismo día. completeActividades los re-ubicará.
      if (disableBlocks.length > 0) {
        for (const db of disableBlocks) {
          await tx.horario_usuario.update({
            where: { id: Number(db.horario_id) },
            data: { estado: false, updated_at: new Date() },
          });
        }
      }

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
          motivo_reprograma: motivoTxt,
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
      return {
        actividad: nueva,
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
        splits: plan.splits,
        applied: result.applied,
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
    if (deadline && fecha > deadline) {
      const e = new Error(
        `No se puede reprogramar: la fecha (${fecha}) supera la fecha de entrega (${deadline}). Cambia de auxiliar.`,
      );
      e.code = "CONFLICT";
      throw e;
    }
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
      const splits = [...(plan.splits || [])];
      const disableBlocks = [...(plan.disableBlocks || [])];
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
      const splitsRes = splits.length
        ? await schedulerService.applySplits(splits, motivoTxt)
        : { applied: { splits: 0, overflow: 0, cascadeMoves: 0 } };

      // Deshabilitar bloques de otras actividades que quedaron después de
      // la reunión en el mismo día. completeActividades los re-ubicará.
      if (disableBlocks.length > 0) {
        for (const db of disableBlocks) {
          await tx.horario_usuario.update({
            where: { id: Number(db.horario_id) },
            data: { estado: false, updated_at: new Date() },
          });
        }
      }

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

      return {
        actividad: upd,
        applied: {
          moves: applyRes.applied || 0,
          splits: splitsRes.applied?.splits || 0,
          overflow: splitsRes.applied?.overflow || 0,
          cascadeMoves: splitsRes.applied?.cascadeMoves || 0,
        },
        plan,
      };
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
        splits: plan.splits,
        applied: result.applied,
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
    if (deadline && fechaYmd > deadline) {
      const e = new Error(
        `No se puede reasignar: la fecha (${fechaYmd}) supera la fecha de entrega (${deadline}). Cambia de auxiliar.`,
      );
      e.code = "CONFLICT";
      throw e;
    }
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

    // Aplicar primero el plan del scheduler (moves, splits, chainCascades)
    // para abrir hueco en el calendario del usuario destino ANTES de
    // crear el nuevo slot. Si no entran, el error ya fue lanzado arriba.
    const moves = [...(plan.moves || [])];
    const splits = [...(plan.splits || [])];
    const disableBlocks = [...(plan.disableBlocks || [])];

    const movesRes = moves.length
      ? await schedulerService.applyMoves(moves, motivoTxt)
      : { applied: 0 };
    const splitsRes = splits.length
      ? await schedulerService.applySplits(splits, motivoTxt)
      : { applied: { splits: 0, overflow: 0, cascadeMoves: 0 } };

    const result = await prisma.$transaction(async (tx) => {
      // Deshabilitar bloques de otras actividades que quedaron después de
      // la reunión en el mismo día. completeActividades los re-ubicará.
      if (disableBlocks.length > 0) {
        for (const db of disableBlocks) {
          await tx.horario_usuario.update({
            where: { id: Number(db.horario_id) },
            data: { estado: false, updated_at: new Date() },
          });
        }
      }

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

      return {
        actividad: upd,
        horarioViejoId: huViejo?.id || null,
        horarioNuevo: huNuevo,
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
        splits: plan.splits,
        applied: result.applied,
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
    if (deadline && fechaStr > deadline) {
      const e = new Error(
        `No se puede programar: la fecha (${fechaStr}) supera la fecha de entrega (${deadline}). Cambia de auxiliar.`,
      );
      e.code = "CONFLICT";
      throw e;
    }

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
    const affectedGaps = plan.affectedGaps || [];

    const result = await prisma.$transaction(async (tx) => {
      const moves = [...(plan.moves || [])];
      const splits = [...(plan.splits || [])];
      const disableBlocks = [...(plan.disableBlocks || [])];

      const movesRes = moves.length
        ? await schedulerService.applyMoves(moves, motivoTxt)
        : { applied: 0 };
      const splitsRes = splits.length
        ? await schedulerService.applySplits(splits, motivoTxt)
        : { applied: { splits: 0, overflow: 0, cascadeMoves: 0 } };

      // Deshabilitar bloques de otras actividades que quedaron después de
      // la reunión en el mismo día. completeActividades los re-ubicará.
      if (disableBlocks.length > 0) {
        for (const db of disableBlocks) {
          await tx.horario_usuario.update({
            where: { id: Number(db.horario_id) },
            data: { estado: false, updated_at: new Date() },
          });
        }
      }

      const upd = await tx.actividades.update({
        where: { id },
        data: {
          usuario_id: uid,
          fecha_inicio: new Date(fechaStr),
          hora_inicio: hmsToLocalDate(horaIniNorm),
          tiempo_estimado_minutos: act.tiempo_estimado_minutos,
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

    // Tras crear el slot de la reunión, deshabilitar los bloques de otras
    // actividades que quedan después de la última posición de la actividad
    // afectada, para que completeActividades reprograme todo desde ahí.
    // Se hace FUERA de la transacción principal; si falla no aborta.
    const affectedActId =
      affectedGaps.length > 0
        ? affectedGaps[0].actividad_id
        : await this.#findActividadConMayorGap(uid, id, fechaStr);
    if (affectedActId) {
      await schedulerService.disableBlocksAfterPosition(
        uid,
        affectedActId,
        fechaStr,
      );
    }
    const rebalance = await this.rebalanceUsuario(uid, fechaStr, {
      ignorarActividadId: id,
      motivo: "Rebalance post-programación inicial",
      prioritizeActividadId: affectedActId,
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
      rebalance: rebalance
        ? {
            applied: (rebalance.applied || []).length,
            blocked: rebalance.blocked || [],
            skipped: rebalance.skipped || [],
            totalGapInicial: rebalance.totalGapInicial || 0,
            totalGapCubierto: rebalance.totalGapCubierto || 0,
          }
        : null,
    };
  }

  // -----------------------------------------------------------------------
  // #findActividadConMayorGap: busca la actividad (distinta de ignorarId)
  // con el mayor gap entre tiempo_estimado_minutos y lo programado.
  // Devuelve su ID o null si ninguna tiene gap.
  // -----------------------------------------------------------------------
  async #findActividadConMayorGap(usuarioId, ignorarId, fechaStr) {
    try {
      const uid = Number(usuarioId);
      const ignore = Number(ignorarId);
      if (!uid) return null;
      const acts = await prisma.actividades.findMany({
        where: {
          usuario_id: uid,
          estado: true,
          estado_progreso: { notIn: ["completada", "cancelada"] },
          id: ignore ? { not: ignore } : undefined,
          bloqueada: false,
          prioridad: { not: "ALTA" },
        },
        select: {
          id: true,
          tiempo_estimado_minutos: true,
          horario_usuario: {
            where: { estado: true },
            select: { duracion_minutos: true },
          },
          tarea: { select: { tipo_tarea: true } },
        },
      });
      let mejor = null;
      let mayorGap = 0;
      for (const a of acts) {
        const tipoTareaId = a.tarea?.tipo_tarea != null
          ? Number(a.tarea.tipo_tarea)
          : null;
        if (tipoTareaId === 2) continue; // saltar reuniones
        const est = Number(a.tiempo_estimado_minutos) || 0;
        if (est <= 0) continue;
        const totalProg = (a.horario_usuario || []).reduce(
          (acc, h) => acc + (Number(h.duracion_minutos) || 0),
          0,
        );
        const gap = est - totalProg;
        if (gap > mayorGap) {
          mayorGap = gap;
          mejor = Number(a.id);
        }
      }
      return mejor;
    } catch (_) {
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Re-balance: tras programar/mover una reunión, recorrer las actividades
  // del usuario destino y rellenar el gap entre lo programado y su
  // `tiempo_estimado_minutos`. Respetando ALTA y fecha_entrega.
  //
  // Se expone para que el controller pueda dispararlo tras crear o
  // reprogramar. NO aborta la operación principal si falla: loguea y
  // devuelve `null`.
  // -----------------------------------------------------------------------
  async rebalanceUsuario(usuarioId, fechaReferencia, opts = {}) {
    try {
      const uid = Number(usuarioId);
      const fechaStr = String(fechaReferencia || "").slice(0, 10);
      if (!uid || !fechaStr) return null;
      const ignorarId = opts.ignorarActividadId
        ? Number(opts.ignorarActividadId)
        : null;
      const prioritizeId = opts.prioritizeActividadId
        ? Number(opts.prioritizeActividadId)
        : null;
      return await schedulerService.completeActividades(uid, fechaStr, {
        ignorarActividadId: ignorarId,
        diasHorizonte: opts.diasHorizonte || 14,
        motivo: opts.motivo || "Rebalance post-inserción de reunión",
        prioritizeActividadId: prioritizeId,
        fillFreeSlots: opts.fillFreeSlots === true,
      });
    } catch (e) {
      console.error("[rebalanceUsuario] error:", e?.message || e);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Ajustar duración (mismo día, misma hora de inicio)
  // -----------------------------------------------------------------------
  // Cambia la duración de una reunión y desplaza las actividades NO-reunión
  // posteriores para acomodar el cambio. Las reuniones posteriores son
  // "anclas" fijas que no se mueven, pero el desplazamiento CONTINÚA más
  // allá de cada una de ellas.
  //
  // Si delta > 0 (aumenta): las actividades NO-reunión se corren más tarde.
  // Si delta < 0 (disminuye): las actividades NO-reunión se corren más temprano.
  // Si se encuentra una reunión en el camino → esa queda fija, pero las
  //   actividades NO-reunión que siguen después de ella sí se desplazan.
  //
  // body: { actividadId, nuevaDuracionMinutos }
  async ajustarDuracion({ actividadId, nuevaDuracionMinutos }) {
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
        prospectos: { select: { fecha_entrega: true } },
        horario_usuario: {
          where: { estado: true },
          orderBy: { id: "desc" },
          take: 1,
          select: { id: true, fecha: true, hora_inicio: true, hora_fin: true, duracion_minutos: true, categoria: true },
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
    if (String(act.estado_progreso || "").toLowerCase() === "en_progreso") {
      const e = new Error("No se puede ajustar la duración de una reunión en progreso.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const slot = act.horario_usuario?.[0] || null;
    const categoria = slot?.categoria || "potencial_cliente";
    if (!slot) {
      const e = new Error("La reunión no tiene un bloque de horario. Use 'Programar' primero.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const duracionActual = Math.max(1, Number(act.tiempo_estimado_minutos) || Number(slot.duracion_minutos) || 60);
    const nuevaDuracion = Math.max(5, Number(nuevaDuracionMinutos) || 0);
    if (nuevaDuracion < 5) {
      const e = new Error("La duración mínima es 5 minutos.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const delta = nuevaDuracion - duracionActual;
    if (delta === 0) {
      return { sinCambios: true, mensaje: "La duración no cambió." };
    }

    // Cargar contexto del día. Obtenemos la fecha como string directo de la
    // BD para evitar problemas de zona horaria al convertir Date de Prisma.
    const fechaRow = await prisma.$queryRawUnsafe(
      `SELECT TO_CHAR(hu.fecha, 'YYYY-MM-DD') AS fecha_str FROM horario_usuario hu WHERE hu.id = $1`,
      Number(slot.id),
    );
    const fecha = fechaRow?.[0]?.fecha_str;
    if (!fecha) {
      const e = new Error("No se pudo determinar la fecha del bloque de horario.");
      e.code = "NOT_FOUND";
      throw e;
    }
    const ctx = await schedulerService.loadDayContext(act.usuario_id, fecha);
    if (!ctx || ctx.bloques.length === 0) {
      const e = new Error("El usuario no tiene bloques de horario configurados para ese día.");
      e.code = "CONFLICT";
      throw e;
    }

    // Encontrar el evento actual por horario_id (debe coincidir con slot)
    const currentEvent = ctx.eventos.find((e) => e.horario_id === Number(slot.id));
    if (!currentEvent) {
      const e = new Error("No se encontró el bloque de la reunión en el calendario.");
      e.code = "NOT_FOUND";
      throw e;
    }

    const currentStart = currentEvent.ini;
    const newCurrentEnd = currentEvent.fin + delta;

    // Validar deadline — si el último bloque ya está después del
    // deadline, no se puede extender (solo reducir).
    const deadline = act.prospectos?.fecha_entrega;
    if (delta > 0 && deadline) {
      const dlStr = deadline instanceof Date
        ? `${deadline.getUTCFullYear()}-${String(deadline.getUTCMonth() + 1).padStart(2, "0")}-${String(deadline.getUTCDate()).padStart(2, "0")}`
        : String(deadline).slice(0, 10);
      if (fecha > dlStr) {
        const e = new Error(
          `No se puede programar: faltan ${delta} minutos. Cambia de auxiliar.`,
        );
        e.code = "CONFLICT";
        throw e;
      }
    }

    // Validar que la reunión no invada otra reunión barrera.
    const nextMeeting = ctx.eventos
      .filter((e) => e.actividad_id !== id && e.esReunion && e.ini >= currentEvent.fin)
      .sort((a, b) => a.ini - b.ini)[0] || null;
    if (nextMeeting && newCurrentEnd > nextMeeting.ini) {
      const e = new Error(
        `La nueva duración hace que la reunión invada la reunión fija #${nextMeeting.actividad_id} (${minToHHMM(nextMeeting.ini)}-${minToHHMM(nextMeeting.fin)}). ` +
        `No se puede extender más allá de la próxima reunión.`,
      );
      e.code = "CONFLICT";
      throw e;
    }

    // Eventos posteriores ordenados por inicio.
    // Cuando se REDUCE (delta<0) el fin nuevo queda antes del fin viejo, así
    // que tomamos el límite mínimo para capturar también los eventos que
    // quedaron entre newCurrentEnd y currentEvent.fin (el "hueco liberado").
    const eventsFrom = delta < 0 ? Math.min(newCurrentEnd, currentEvent.fin) : currentEvent.fin;
    const subsequentEvents = ctx.eventos
      .filter((e) => e.ini >= eventsFrom && e.actividad_id !== id)
      .sort((a, b) => a.ini - b.ini);

    // 6. Construir lista de ocupados (obstáculos fijos: la reunión actual + reuniones fijas)
    const ocupados = [];

    // Reunión actual con su nuevo fin
    ocupados.push({ ini: currentStart, fin: newCurrentEnd });

    // Todas las reuniones (son fijas, no se mueven)
    for (const evt of ctx.eventos) {
      if (evt.actividad_id !== id && evt.esReunion) {
        ocupados.push({ ini: evt.ini, fin: evt.fin });
      }
    }

    // --- Función auxiliar: mueve un bloque al primer hueco disponible >= minStart ---
    // Devuelve el fin del bloque ya colocado.
    // SÍ fragmenta: empaca secuencialmente en los espacios libres.
    const tryPlace = (minStart, durTotal, evt) => {
      let durRestante = durTotal;
      let primerIni = null;
      let primerFin = null;
      const overflows = [];
      let currentStart = minStart;

      const sortedOcup = [...ocupados].sort((a, b) => a.ini - b.ini);

      for (const block of ctx.bloques) {
        if (durRestante <= 0) break;
        if (block.fin <= currentStart) continue;

        let seg = Math.max(block.ini, currentStart);

        for (const occ of sortedOcup) {
          if (durRestante <= 0) break;
          if (occ.fin <= seg) continue;
          if (occ.ini >= block.fin) break;

          if (seg < occ.ini) {
            const espacioLibre = occ.ini - seg;
            if (espacioLibre >= 5) {
              const durPorPoner = Math.min(durRestante, espacioLibre);
              const nuevoIni = seg;
              const nuevoFin = seg + durPorPoner;
              if (primerIni === null) {
                primerIni = nuevoIni;
                primerFin = nuevoFin;
              } else {
                overflows.push({ hi: minToHHMM(nuevoIni), hf: minToHHMM(nuevoFin), len: durPorPoner, fecha, hfMin: nuevoFin });
              }
              ocupados.push({ ini: nuevoIni, fin: nuevoFin });
              durRestante -= durPorPoner;
              seg = nuevoFin;
            }
          }
          seg = Math.max(seg, occ.fin);
        }

        if (durRestante > 0 && seg < block.fin) {
          const espacioLibre = block.fin - seg;
          if (espacioLibre >= 5) {
            const durPorPoner = Math.min(durRestante, espacioLibre);
            const nuevoIni = seg;
            const nuevoFin = seg + durPorPoner;
            if (primerIni === null) {
              primerIni = nuevoIni;
              primerFin = nuevoFin;
            } else {
              overflows.push({ hi: minToHHMM(nuevoIni), hf: minToHHMM(nuevoFin), len: durPorPoner, fecha, hfMin: nuevoFin });
            }
            ocupados.push({ ini: nuevoIni, fin: nuevoFin });
            durRestante -= durPorPoner;
            currentStart = nuevoFin;
          }
        }
      }

      if (primerIni !== null) {
        moves.push({
          actividad_id: Number(evt.actividad_id),
          horario_id: Number(evt.horario_id),
          hi: minToHHMM(primerIni),
          hf: minToHHMM(primerFin),
          fecha,
          hiMin: primerIni,
          hfMin: primerFin,
          len: primerFin - primerIni,
          overflow: overflows
        });
      } else {
        // No se pudo poner ni el primer chunk
        blocksToDisable.push({ horario_id: Number(evt.horario_id), actividad_id: Number(evt.actividad_id), minutes: durTotal });
      }

      if (durRestante > 0) {
        pendingMinutes.push({ actividad_id: Number(evt.actividad_id), minutes: durRestante });
      }

      return primerFin !== null ? (overflows.length > 0 ? overflows[overflows.length - 1].hfMin : primerFin) : minStart;
    };

    const moves = [];
    const blocksToDisable = [];
    const pendingMinutes = [];

    // ---- Colocar actividades posteriores respetando reuniones como anclas ----
    // Solo aplicable si delta > 0. Si delta < 0, se maneja de forma global
    // borrando futuros y reempaquetando.
    if (delta > 0) {
      let cursor = newCurrentEnd;

      for (const evt of subsequentEvents) {
        if (evt.esReunion) {
          // Reunión fija: solo avanzar cursor si la invadimos
          if (cursor > evt.ini) {
            cursor = Math.max(cursor, evt.fin);
          }
          continue;
        }

        const dur = evt.fin - evt.ini;
        // Reubicar siempre para empacar secuencialmente sin dejar huecos
        const placed = tryPlace(cursor, dur, evt);
        if (placed > cursor) cursor = placed;
      }
    }


    // Validar que ningún movimiento invada una reunión fija (barreras).
    for (const m of moves) {
      const conflicto = ctx.eventos.find(
        (e) =>
          e.actividad_id !== id &&
          e.esReunion &&
          m.hiMin < e.fin &&
          m.hfMin > e.ini,
      );
      if (conflicto) {
        const e = new Error(
          `La actividad #${m.actividad_id} reubicada (${m.hi}-${m.hf}) invade la reunión fija #${conflicto.actividad_id} (${minToHHMM(conflicto.ini)}-${minToHHMM(conflicto.fin)}). ` +
          `No hay suficiente espacio incluso después de la barrera. Mové manualmente la reunión fija para hacer lugar.`,
        );
        e.code = "CONFLICT";
        throw e;
      }
    }

    // Validar que el nuevo fin de la actual no exceda su bloque de jornada.
    const jornadaValida = ctx.bloques.some((b) => currentStart >= b.ini && newCurrentEnd <= b.fin);
    if (!jornadaValida) {
      const e = new Error("La nueva duración excede el bloque de horario laboral del usuario.");
      e.code = "CONFLICT";
      throw e;
    }

    // Aplicar cambios en BD.
    const motivoTxt = `Ajuste de duración: ${duracionActual} → ${nuevaDuracion} min`;

    const movesForApply = moves.map((m) => ({
      actividad_id: m.actividad_id,
      horario_id: m.horario_id,
      hi: m.hi,
      hf: m.hf,
      fecha: m.fecha,
      len: m.len,
      overflow: m.overflow,
    }));

    const result = await prisma.$transaction(async (tx) => {
      // Actualizar el slot actual.
      const nuevaDuracionSlot = newCurrentEnd - currentStart;
      await tx.$executeRawUnsafe(
        `UPDATE horario_usuario
            SET hora_fin    = $1::timetz,
                duracion_minutos = $2,
                updated_at  = now()
          WHERE id = $3`,
        hmsToLocalDate(minToHHMM(newCurrentEnd)),
        nuevaDuracionSlot,
        Number(slot.id),
      );

      // Actualizar la actividad.
      await tx.actividades.update({
        where: { id },
        data: {
          tiempo_estimado_minutos: nuevaDuracion,
          motivo_reprograma: motivoTxt,
          updated_at: new Date(),
        },
      });

      // Aplicar movimientos de actividades posteriores.
      // NOTA: applyMoves abre su propia transacción, así que se llama FUERA de esta.
      // Aquí solo guardamos la referencia a los moves para aplicarlos después.

      // Deshabilitar bloques que quedaron fuera de la jornada laboral.
      if (blocksToDisable.length > 0) {
        const ids = blocksToDisable.map((b) => b.horario_id);
        await tx.horario_usuario.updateMany({
          where: { id: { in: ids } },
          data: { estado: false, updated_at: new Date() },
        });
      }

      return { disabled: blocksToDisable.length, blocksToDisable, pendingMinutes };
    });

    // uid se necesita para el merge y para el Paso 2
    const uid = act.usuario_id;

    // Aplicar movimientos FUERA de la transacción (evita transacciones anidadas)
    let movesApplied = 0;
    if (movesForApply.length > 0) {
      const applyRes = await schedulerService.applyMoves(movesForApply, motivoTxt);
      movesApplied = applyRes.applied || 0;
    }

    // Limpiar bloques adyacentes del mismo día que se hayan fragmentado por el empuje
    await schedulerService.mergeAdjacentBlocks(uid, fecha).catch(() => {});

    // Paso 2: expandir bloques existentes en días posteriores y
    // correr en cascada otras actividades para hacer lugar.
    // Se procesa por día (no por btd) para que las cascadas del mismo día
    // se acumulen correctamente.
    let warnings = [];
    let totalPending = 0;
    if (result.blocksToDisable?.length > 0 || result.pendingMinutes?.length > 0) {
      // Agrupar minutos pendientes por actividad_id
      // Incluye tanto bloques deshabilitados (blocksToDisable) como
      // minutos que no cupieron parcialmente (pendingMinutes).
      // IMPORTANTE: verificar contra tiempo real en BD para evitar pendientes fantasma.
      const pendingByAct = new Map();
      for (const btd of result.blocksToDisable) {
        const key = Number(btd.actividad_id);
        pendingByAct.set(key, (pendingByAct.get(key) || 0) + Number(btd.minutes));
      }
      for (const pm of result.pendingMinutes || []) {
        const key = Number(pm.actividad_id);
        pendingByAct.set(key, (pendingByAct.get(key) || 0) + Number(pm.minutes));
      }

      // Validar contra tiempo real en BD: si la actividad ya tiene programado
      // suficiente tiempo, no la agregar a pendientes.
      for (const [actId, pend] of pendingByAct) {
        if (pend <= 0) { pendingByAct.delete(actId); continue; }
        const actRow = await prisma.actividades.findUnique({
          where: { id: actId },
          select: { tiempo_estimado_minutos: true, horario_usuario: { where: { estado: true }, select: { duracion_minutos: true } } },
        });
        if (!actRow) { pendingByAct.delete(actId); continue; }
        const totalProg = (actRow.horario_usuario || []).reduce((s, h) => s + (Number(h.duracion_minutos) || 0), 0);
        const estimado = Number(actRow.tiempo_estimado_minutos) || 0;
        const realPending = Math.max(0, estimado - totalProg);
        if (realPending <= 0) {
          pendingByAct.delete(actId);
        } else {
          pendingByAct.set(actId, realPending);
        }
      }

      // Cargar deadlines de actividades pendientes
      const pendingActIds = [...pendingByAct.keys()];
      const pendingActRows = await prisma.actividades.findMany({
        where: { id: { in: pendingActIds } },
        select: {
          id: true,
          prospectos: { select: { fecha_entrega: true } },
          tarea: { select: { tipo_tarea_tarea_tipo_tareaTotipo_tarea: { select: { id: true } } } },
        },
      });
      const deadlines = new Map();
      const esReunionAct = new Set();
      for (const a of pendingActRows) {
        const dl = a.prospectos?.fecha_entrega;
        if (dl) {
          const d = dl instanceof Date
            ? `${dl.getUTCFullYear()}-${String(dl.getUTCMonth() + 1).padStart(2, "0")}-${String(dl.getUTCDate()).padStart(2, "0")}`
            : String(dl).slice(0, 10);
          deadlines.set(a.id, d);
        }
        if (a.tarea?.tipo_tarea_tarea_tipo_tareaTotipo_tarea?.id === 2) {
          esReunionAct.add(a.id);
        }
      }
      const cursorDate = new Date(parseLocalDate(fecha));
      let safetyDays = 0;
      totalPending = [...pendingByAct.values()].reduce((a, b) => a + b, 0);
      while (totalPending > 0 && safetyDays < 60) {
        safetyDays++;
        cursorDate.setDate(cursorDate.getDate() + 1);
        const dateStr = fmtLocalDate(cursorDate);
        // Verificar deadlines — si el día supera la fecha de entrega,
        // la actividad no puede expandirse más acá.
        for (const [actId, pend] of pendingByAct) {
          if (pend <= 0) continue;
          const dl = deadlines.get(actId);
          if (dl && dateStr > dl) {
            warnings.push({ actividad_id: actId, faltan: pend });
            pendingByAct.set(actId, 0);
          }
        }
        const dayCtx = await schedulerService.loadDayContext(uid, dateStr);
        if (!dayCtx || dayCtx.bloques.length === 0) continue;
        const eventos = dayCtx.eventos;
        // Mapa de desplazamientos acumulados por horario_id para este día
        const dayShifts = new Map();
        // Obtener actividades con pendiente que tengan bloque propio en este día
        const actConBloque = [];
        for (const [actId, pend] of pendingByAct) {
          if (pend <= 0) continue;
          // Deduplicar: agrupar bloques con mismo ini/fin (duplicados de
          // completeActividades) para expandir solo el último de cada grupo.
          const propiosUniq = new Map();
          for (const e of eventos) {
            if (e.actividad_id !== actId) continue;
            const key = `${e.ini}-${e.fin}`;
            if (!propiosUniq.has(key) || e.horario_id > propiosUniq.get(key).horario_id) {
              propiosUniq.set(key, e);
            }
          }
          const propios = [...propiosUniq.values()].sort((a, b) => a.ini - b.ini);
          if (propios.length === 0) continue;
          actConBloque.push({ actId, remaining: pend, ultimoPropio: propios[propios.length - 1] });
        }
        // Ordenar por posición del último bloque (ascendente)
        actConBloque.sort((a, b) => a.ultimoPropio.ini - b.ultimoPropio.ini);
        const dayMoves = [];
        for (const item of actConBloque) {
          if (item.remaining <= 0) continue;
          const ultimoPropio = item.ultimoPropio;
          // Ajustar por desplazamientos previos del mismo día
          const shift = dayShifts.get(ultimoPropio.horario_id) || 0;
          const bloqueIni = ultimoPropio.ini + shift;
          const bloqueFin = ultimoPropio.fin + shift;

          // Calcular cuánto espacio libre hay a partir del fin ajustado
          // respetando la barrera de reuniones y el fin de la jornada
          const jornadaBlock = dayCtx.bloques.find(
            (b) => b.ini <= bloqueIni && bloqueIni < b.fin,
          );
          if (!jornadaBlock) continue;

          // Próxima reunión DESPUÉS del fin ajustado del bloque (barrera)
          const nextReunionDespues = eventos
            .filter((e) => e.esReunion && e.ini >= bloqueFin)
            .sort((a, b) => a.ini - b.ini)[0];
          const barrier = nextReunionDespues ? nextReunionDespues.ini : jornadaBlock.fin;
          const maxExpand = Math.min(jornadaBlock.fin, barrier);
          const libre = maxExpand - bloqueFin;
          if (libre <= 0) continue;

          const expansion = Math.min(item.remaining, libre);
          const nuevoHf = bloqueFin + expansion;
          dayMoves.push({
            actividad_id: item.actId,
            horario_id: ultimoPropio.horario_id,
            hi: minToHHMM(bloqueIni),
            hf: minToHHMM(nuevoHf),
            fecha: dateStr,
          });
          dayShifts.set(ultimoPropio.horario_id, (dayShifts.get(ultimoPropio.horario_id) || 0) + expansion);
          item.remaining -= expansion;
          pendingByAct.set(item.actId, item.remaining);

          // Cascada: empujar secuencialmente los bloques NO-reunión que
          // estén después del nuevo fin, SIN dejar huecos.
          // Solo si la expansión invade algún bloque siguiente.
          let cursorCascada = nuevoHf;
          const siguientes = eventos
            .filter((e) => !e.esReunion && e.actividad_id !== item.actId &&
              (e.ini + (dayShifts.get(e.horario_id) || 0)) >= bloqueFin &&
              e.horario_id !== ultimoPropio.horario_id)
            .map((e) => {
              const s = dayShifts.get(e.horario_id) || 0;
              return { ...e, iniAj: e.ini + s, finAj: e.fin + s };
            })
            .sort((a, b) => a.iniAj - b.iniAj);

          for (const se of siguientes) {
            const dur = se.finAj - se.iniAj;
            if (cursorCascada <= se.iniAj) {
              // No hay invasión: avanzar cursor y continuar
              cursorCascada = se.finAj;
              continue;
            }
            // El cursor invade este bloque: moverlo
            const nuevoIni = cursorCascada;
            // Respetar reuniones fijas como barrera
            const reunionBarrera = eventos
              .filter((e) => e.esReunion && e.ini > nuevoIni)
              .sort((a, b) => a.ini - b.ini)[0];
            const seJornada = dayCtx.bloques.find(
              (b) => b.ini <= nuevoIni && nuevoIni < b.fin,
            );
            if (!seJornada) {
              // Cae fuera de la jornada → pendiente
              pendingByAct.set(se.actividad_id, (pendingByAct.get(se.actividad_id) || 0) + dur);
              continue;
            }
            const boundaryJornada = Math.min(seJornada.fin, reunionBarrera ? reunionBarrera.ini : seJornada.fin);
            const nuevoFin = Math.min(nuevoIni + dur, boundaryJornada);
            if (nuevoFin <= nuevoIni) {
              pendingByAct.set(se.actividad_id, (pendingByAct.get(se.actividad_id) || 0) + dur);
              continue;
            }
            const shiftSe = nuevoIni - se.iniAj;
            dayMoves.push({
              actividad_id: se.actividad_id,
              horario_id: se.horario_id,
              hi: minToHHMM(nuevoIni),
              hf: minToHHMM(nuevoFin),
              fecha: dateStr,
            });
            dayShifts.set(se.horario_id, (dayShifts.get(se.horario_id) || 0) + shiftSe);
            cursorCascada = nuevoFin;
            // Si quedó cortado → pendiente
            if (nuevoFin < nuevoIni + dur) {
              pendingByAct.set(se.actividad_id, (pendingByAct.get(se.actividad_id) || 0) + (nuevoIni + dur - nuevoFin));
            }
          }
        }

        // Segundo paso: actividades con pendiente que NO tenían bloque
        // propio en este día. Se les crea un bloque NUEVO en el primer
        // slot libre del día, manteniendo la secuencia cronológica.
        {
          // Construir eventos locales (existentes + dayMoves ajustados)
          const localEventos = eventos.map((e) => ({
            ...e,
            iniAjustado: e.ini + (dayShifts.get(e.horario_id) || 0),
            finAjustado: e.fin + (dayShifts.get(e.horario_id) || 0),
          }));
          for (const m of dayMoves) {
            const im = hmsToMin(m.hi);
            const fm = hmsToMin(m.hf);
            if (im == null || fm == null) continue;
            localEventos.push({
              actividad_id: m.actividad_id,
              horario_id: m.horario_id,
              ini: im,
              fin: fm,
              iniAjustado: im,
              finAjustado: fm,
              esReunion: false,
            });
          }
          // Cada actividad pendiente sin bloque en el día
          for (const [actId, pend] of pendingByAct) {
            if (pend <= 0) continue;
            const yaTiene = localEventos.some((e) => e.actividad_id === actId);
            if (yaTiene) continue;
            // Recalcular slots libres por cada actividad, porque las
            // inserciones previas modificaron localEventos.
            const freeSlots = computeFreeSlotsOnDay(dayCtx.bloques, localEventos);
            let porColocar = pend;
            for (const slot of freeSlots) {
              if (porColocar <= 0) break;
              const disp = slot.fin - slot.ini;
              if (disp < 5) continue;
              const dur = Math.min(porColocar, disp);
              const hiMin = slot.ini;
              const hfMin = slot.ini + dur;
              const tipoBloque = esReunionAct.has(actId) ? "reunion" : "actividad";
              // Insertar nuevo bloque
              const fechaDate = parseLocalDate(dateStr);
              try {
                const nb = await prisma.horario_usuario.create({
                  data: {
                    actividad_id: actId,
                    usuario_id: uid,
                    fecha: fechaDate,
                    hora_inicio: hmsToLocalDate(minToHHMM(hiMin)),
                    hora_fin: hmsToLocalDate(minToHHMM(hfMin)),
                    estado: true,
                    tipo: tipoBloque,
                    duracion_minutos: dur,
                    created_at: new Date(),
                    updated_at: new Date(),
                  },
                });
                localEventos.push({
                  actividad_id: actId,
                  horario_id: nb.id,
                  ini: hiMin,
                  fin: hfMin,
                  iniAjustado: hiMin,
                  finAjustado: hfMin,
                  esReunion: false,
                });
                porColocar -= dur;
                pendingByAct.set(actId, porColocar);
              } catch (_e) {
                // No romper por fallo de inserción
              }
            }
          }
        }
        if (dayMoves.length > 0) {
          // Aplicar movimientos del día inmediatamente para que el
          // siguiente día lea datos actualizados.
          try {
            await schedulerService.applyMoves(dayMoves, motivoTxt);
          } catch (_) { /* no debe romper */ }
          
          // Limpiar fragmentación en este día
          await schedulerService.mergeAdjacentBlocks(uid, dateStr).catch(() => {});
        }
        // Actualizar pendientes totales
        totalPending = [...pendingByAct.values()].reduce((a, b) => a + b, 0);
      }
      // Si aún quedan pendientes sin resolver dentro de los 60 días,
      // reportarlos como warnings.
      if (totalPending > 0) {
        for (const [actId, pend] of pendingByAct) {
          if (pend <= 0) continue;
          const yaAdvertido = warnings.some(w => w.actividad_id === actId);
          if (!yaAdvertido) {
            warnings.push({ actividad_id: actId, faltan: pend });
          }
        }
      }
    }

    // Rebalancear post-ajuste solo para reducción (delta<0).
    // Si reducimos la reunión, queda un hueco libre. Para empaquetar de
    // manera secuencial y jalar eventos de días futuros hacia hoy,
    // eliminamos los bloques posteriores y re-ejecutamos completeActividades.
    if (delta < 0) {
      await schedulerService.disableBlocksAfterPosition(uid, id, fecha, newCurrentEnd).catch(() => {});
      await schedulerService.completeActividades(uid, fecha, {
        ignorarActividadId: id,
        motivo: "Rebalance post-reducción de duración",
        fillFreeSlots: false,
      }).catch(() => {});
    }

    return {
      actividad_id: id,
      duracion_anterior: duracionActual,
      duracion_nueva: nuevaDuracion,
      delta,
      overflowMin: totalPending,
      actividades_movidas: result.movesApplied || 0,
      warnings: warnings && warnings.length > 0 ? warnings : undefined,
      nuevo_horario: {
        hora_inicio: minToHHMM(currentStart),
        hora_fin: minToHHMM(newCurrentEnd),
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
      select: {
        id: true,
        estado: true,
        estado_progreso: true,
        usuario_id: true,
        fecha_inicio: true,
      },
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

    const uid = Number(act.usuario_id);
    if (!uid) {
      const e = new Error("La actividad no tiene usuario asignado.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Tomar la fecha desde los bloques activos de la actividad (más confiable
    // que `fecha_inicio`, que podría ser null).
    const bloqueInfo = await prisma.$queryRawUnsafe(
      `SELECT TO_CHAR(MIN(hu.fecha), 'YYYY-MM-DD') AS fecha_min,
              TO_CHAR(MAX(hu.fecha), 'YYYY-MM-DD') AS fecha_max
       FROM horario_usuario hu
       WHERE hu.actividad_id = $1 AND hu.estado = true`,
      id,
    );
    const fechaStr = bloqueInfo?.[0]?.fecha_min
      ? String(bloqueInfo[0].fecha_min).slice(0, 10)
      : act.fecha_inicio
        ? (act.fecha_inicio instanceof Date
          ? fmtLocalDate(act.fecha_inicio)
          : String(act.fecha_inicio).slice(0, 10))
        : null;

    // Guardar los bloques que se van a cancelar (necesitamos sus posiciones
    // para el corte del rebalance).
    const blocksToCancel = await prisma.$queryRawUnsafe(
      `SELECT hu.id, hu.actividad_id,
              TO_CHAR(hu.fecha, 'YYYY-MM-DD') AS fecha,
              EXTRACT(EPOCH FROM hu.hora_inicio::time)/60 AS hi,
              EXTRACT(EPOCH FROM hu.hora_fin::time)/60 AS hf
       FROM horario_usuario hu
       WHERE hu.actividad_id = $1 AND hu.estado = true
       ORDER BY hu.fecha ASC, hu.hora_inicio ASC`,
      id,
    );

    const result = await prisma.$transaction(async (tx) => {
      await tx.actividades.update({
        where: { id },
        data: { estado: false, estado_progreso: "cancelada", updated_at: new Date() },
      });
      const huRes = await tx.horario_usuario.updateMany({
        where: { actividad_id: id, estado: true },
        data: { estado: false, updated_at: new Date() },
      });
      return { actividad_id: id, horario_usuario_cerrados: huRes.count || 0 };
    });

    // -------------------  FASE DE MERGE  ---------------------------
    // Tras cancelar, buscar los bloques adyacentes al hueco dejado por la
    // reunión. Si ambos lados pertenecen a la MISMA actividad (no reunión),
    // fusionarlos en un solo bloque contiguo que preserve el total de minutos.
    // ----------------------------------------------------------------
    let mergeOcurrio = false;
    let refFecha = fechaStr;

    if (uid && blocksToCancel && blocksToCancel.length > 0) {
      try {
        let corteFecha = null;
        let corteMin = null;

        for (const block of blocksToCancel) {
          const fecha = String(block.fecha).slice(0, 10);
          const hi = Number(block.hi);
          const hf = Number(block.hf);

          const antes = await prisma.$queryRawUnsafe(
            `SELECT hu.id, hu.actividad_id,
                    EXTRACT(EPOCH FROM hu.hora_inicio::time)/60 AS bi,
                    EXTRACT(EPOCH FROM hu.hora_fin::time)/60 AS bf,
                    a.bloqueada
             FROM horario_usuario hu
             JOIN actividades a ON a.id = hu.actividad_id AND a.bloqueada = false
             WHERE hu.usuario_id = $1
               AND hu.fecha = $2::date
               AND hu.estado = true
               AND EXTRACT(EPOCH FROM hu.hora_fin::time)/60 = $3
             ORDER BY hu.hora_inicio DESC
             LIMIT 1`,
            uid, fecha, hi,
          );

          const despues = await prisma.$queryRawUnsafe(
            `SELECT hu.id, hu.actividad_id,
                    EXTRACT(EPOCH FROM hu.hora_inicio::time)/60 AS bi,
                    EXTRACT(EPOCH FROM hu.hora_fin::time)/60 AS bf,
                    a.bloqueada
             FROM horario_usuario hu
             JOIN actividades a ON a.id = hu.actividad_id AND a.bloqueada = false
             WHERE hu.usuario_id = $1
               AND hu.fecha = $2::date
               AND hu.estado = true
               AND EXTRACT(EPOCH FROM hu.hora_inicio::time)/60 = $3
             ORDER BY hu.hora_inicio ASC
             LIMIT 1`,
            uid, fecha, hf,
          );

          const bAntes = antes?.[0];
          const bDespues = despues?.[0];

          if (
            bAntes && bDespues &&
            Number(bAntes.actividad_id) === Number(bDespues.actividad_id) &&
            !bAntes.bloqueada
          ) {
            const aidMerge = Number(bAntes.actividad_id);
            const antesBi = Number(bAntes.bi);
            const despuesBf = Number(bDespues.bf);
            const totalLen = despuesBf - antesBi;
            const fmtMin = (m) =>
              `${Math.floor(m / 60).toString().padStart(2, "0")}:${(m % 60).toString().padStart(2, "0")}:00`;

            await prisma.$transaction(async (tx) => {
              await tx.horario_usuario.update({
                where: { id: Number(bAntes.id) },
                data: { estado: false, updated_at: new Date() },
              });
              await tx.horario_usuario.update({
                where: { id: Number(bDespues.id) },
                data: { estado: false, updated_at: new Date() },
              });
              await tx.horario_usuario.create({
                data: {
                  actividad_id: aidMerge,
                  usuario_id: uid,
                  fecha: new Date(fecha),
                  hora_inicio: hmsToLocalDate(fmtMin(antesBi)),
                  hora_fin: hmsToLocalDate(fmtMin(despuesBf)),
                  estado: true,
                  duracion_minutos: totalLen,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              });
            });

            console.log(
              `[eliminarReunion] merge OK: act ${aidMerge}, ${fecha} ` +
              `${fmtMin(antesBi)}-${fmtMin(despuesBf)} (${totalLen} min, slot completo)`
            );
            mergeOcurrio = true;
            corteFecha = fecha;
            corteMin = despuesBf;
          } else {
            if (bAntes && bDespues) {
              console.log(
                `[eliminarReunion] merge SKIP: antes_act=${bAntes.actividad_id} ` +
                `despues_act=${bDespues.actividad_id} bloqueada=${bAntes.bloqueada}`
              );
            } else {
              console.log(
                `[eliminarReunion] merge SKIP: antes=${!!bAntes} despues=${!!bDespues}`
              );
            }
            const candF = fecha;
            const candM = hf;
            if (
              corteFecha === null ||
              candF > corteFecha ||
              (candF === corteFecha && candM > corteMin)
            ) {
              corteFecha = candF;
              corteMin = candM;
            }
          }
        }

        if (corteFecha != null && corteMin != null) {
          const affected = await prisma.$executeRawUnsafe(
            `UPDATE horario_usuario
               SET estado = false, updated_at = $4
             WHERE usuario_id = $1
               AND estado = true
               AND (fecha > $2::date
                    OR (fecha = $2::date
                        AND EXTRACT(EPOCH FROM hora_inicio::time)/60 >= $3))
               AND (tipo IS NULL OR tipo <> 'reunion')
               AND actividad_id NOT IN (
                 SELECT id FROM actividades WHERE bloqueada = true
               )`,
            uid, corteFecha, corteMin, new Date(),
          );
          console.log(
            `[eliminarReunion] deshabilitados ${affected ?? 0} bloques (corte=${corteFecha} ${corteMin}min)`,
          );
          refFecha = corteFecha;
        }
      } catch (e) {
        console.error("[eliminarReunion] merge/UPDATE error:", e?.message || e);
      }
    }

    // Rebalance siempre, incluso si la actividad no tenía bloques activos
    if (uid && refFecha) {
      try {
        console.log(
          `[eliminarReunion] rebalance desde ${refFecha} (merge=${mergeOcurrio})`
        );
        await this.rebalanceUsuario(uid, refFecha, {
          ignorarActividadId: id,
          motivo: "Re-balance post-cancelación" + (mergeOcurrio ? " (merge)" : ""),
          fillFreeSlots: false,
        });
      } catch (e) {
        console.error("[eliminarReunion] rebalance error:", e?.message || e);
      }
    }

    return result;
  }
}

export default new ReunionesAsistenteService();
