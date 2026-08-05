import prisma from "../config/db.js";
import reunionesAsistenteService from "./reuniones-asistente.service.js";

// Helpers de formateo (idénticos al criterio que usa
// reuniones-asistente.service.js#fmtLocalDate / #minToHHMM). Acá los
// inlineamos para no acoplar este service al de Asistente.
//
// IMPORTANTE: `hora_inicio` es una columna `@db.Timetz(6)` que el código
// de `potenciales-clientes.service.js#toTime` escribe con `Date.UTC(...)`
// (el comentario ahí explica por qué). Para que el round-trip sea
// consistente, al leer un Date de Prisma tenemos que usar `getUTCHours` /
// `getUTCMinutes`, NO `getHours` (que devuelve la hora local del server
// y, en zonas con offset, descuadra el valor: p.ej. 12:00 → 07:00 en
// Perú). El front (potenciales-clientes/index.js#formatHoraIso) ya
// aplica la misma convención.
const hmsToMin = (s) => {
  if (s == null) return null;
  if (s instanceof Date && !Number.isNaN(s.getTime())) {
    return s.getUTCHours() * 60 + s.getUTCMinutes();
  }
  // Acepta "HH:MM[:SS]", "T HH:MM" dentro de un ISO, o "HH:MM:SS+ZZ".
  const str = String(s);
  const mIso = str.match(/T(\d{2}):(\d{2})/);
  if (mIso) return Number(mIso[1]) * 60 + Number(mIso[2]);
  const mHms = str.match(/^(\d{1,2}):(\d{2})/);
  return mHms ? Number(mHms[1]) * 60 + Number(mHms[2]) : null;
};
const minToHHMM = (min) => {
  if (min == null) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const fmtLocalDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    // Para columnas `date` Prisma devuelve un Date a medianoche UTC. Usamos
    // los componentes UTC para evitar off-by-one en zonas negativas.
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const parseLocalDate = (s) => {
  if (!s) return null;
  if (s instanceof Date) return Number.isNaN(s.getTime()) ? null : s;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

class CalendarioAsistenteService {
  // Verifica si un usuario tiene al menos un bloque en horario_usuario
  // en una fecha específica.
  async getUsuarioOcupaFecha(usuarioId, fechaStr) {
    if (!usuarioId || !fechaStr) return { ocupado: false };
    const uid = Number(usuarioId);
    const fechaDate = parseLocalDate(fechaStr);
    if (!fechaDate) return { ocupado: false };
    const count = await prisma.horario_usuario.count({
      where: { usuario_id: uid, fecha: fechaDate, estado: true },
    });
    return { ocupado: count > 0 };
  }


  // Devuelve la fecha y la HORA SUGERIDA de inicio para la próxima
  // actividad del usuario, basada en su ÚLTIMO bloque registrado
  // (ordenado por fecha desc y, como desempate, id desc).
  //
  // Sirve para pre-rellenar el modal "Programar" con la fecha del último
  // bloque del usuario y la hora en que debería empezar la nueva
  // actividad, de modo que se "enganche" al horario del usuario sin
  // caer en un hueco fuera de su jornada.
  //
  // La hora sugerida se calcula RESPETANDO los bloques de jornada del
  // usuario (`horario_jornada_detalle`). Casos típicos:
  //   - Jornada 08:00-13:00 + 15:00-19:00, última actividad termina a
  //     las 13:00 → sugerencia 15:00 (inicio del bloque de tarde).
  //   - Última actividad termina a las 11:00 (aún dentro del bloque de
  //     mañana) → sugerencia 11:00 (la nueva arranca justo después).
  //   - Última actividad termina a las 18:30 (dentro del bloque de
  //     tarde, sin más bloques después) → sugerencia 18:30 (la nueva
  //     arranca justo después; el front deberá llevarla al día
  //     siguiente si quiere mantenerse en jornada).
  //   - Sin jornada configurada para ese día → se devuelve la hora_fin
  //     literal (comportamiento histórico).
  //
  // Si el usuario nunca tuvo bloques, devuelve `exists:false` y el
  // front pone hoy como fecha con hora vacía.
  //
  // Shape de retorno (estable para el front):
  //   { exists: true,  fecha: "YYYY-MM-DD", hora_fin: "HH:MM" }
  //   { exists: false, fecha: null,        hora_fin: null }
  async getUltimoHorarioUsuario(usuarioId) {
    if (usuarioId == null) {
      return { exists: false, fecha: null, hora_fin: null };
    }
    const uid = Number(usuarioId);
    const last = await prisma.horario_usuario.findFirst({
      where: {
        usuario_id: uid,
        estado: true,
        OR: [
          { marca: null },
          { marca: { notIn: ["canje", "libre", "permiso"] } },
        ],
      },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      select: { fecha: true, hora_fin: true, hora_inicio: true },
    });
    if (!last) {
      return { exists: false, fecha: null, hora_fin: null };
    }
    const fechaStr = fmtLocalDate(last.fecha);
    const horaInicioMin = hmsToMin(last.hora_inicio);
    const horaFinMin = hmsToMin(last.hora_fin);

    return {
      exists: true,
      fecha: fechaStr,
      hora_inicio: minToHHMM(horaInicioMin),
      hora_fin: minToHHMM(horaFinMin),
    };
  }

  // ------------------------------------------------------------------------
  // #ajustarHoraFinAJornada: dada la hora de fin del último bloque del
  // usuario y el día de la semana, devuelve la hora "sugerida" para la
  // próxima actividad respetando la jornada laboral del usuario.
  //
  // Reglas:
  //   - Si horaFin cae DENTRO de un bloque de jornada (incluyendo el
  //     extremo final), buscar el SIGUIENTE bloque de jornada. Si existe,
  //     devolver el `ini` de ese bloque (típico: tras 13:00 → 15:00).
  //     Si NO existe (horaFin está en el último bloque del día),
  //     devolver horaFin sin cambios (la nueva actividad arranca justo
  //     después; ya no le queda jornada ese día).
  //   - Si horaFin cae ANTES del primer bloque de jornada, devolver el
  //     `ini` del primer bloque (caso raro: bloque遗留 de un día
  //     anterior o datos sucios).
  //   - Si horaFin cae DESPUÉS del último bloque de jornada, devolver
  //     horaFin (caso raro: el usuario programó fuera de jornada).
  //   - Si NO hay jornada configurada para ese día, devolver horaFin
  //     sin cambios (comportamiento histórico).
  // ------------------------------------------------------------------------
  async #ajustarHoraFinAJornada(usuarioId, fechaLocal, horaFinMin) {
    if (!fechaLocal || horaFinMin == null) return horaFinMin;
    // dia_semana en BD: 1=Lun..6=Sáb. getDay() JS: 0=Dom..6=Sáb.
    const getDay = fechaLocal.getDay();
    const diaSemanaBd = getDay === 0 ? null : getDay;
    if (!diaSemanaBd) return horaFinMin; // domingo sin jornada
    const rows = await prisma.horario_jornada_detalle.findMany({
      where: {
        usuario_id: Number(usuarioId),
        dia_semana: diaSemanaBd,
        estado: true,
        hora_inicio: { not: null },
        hora_fin: { not: null },
      },
      orderBy: { hora_inicio: "asc" },
      select: { hora_inicio: true, hora_fin: true },
    });
    const bloques = rows
      .map((r) => ({ ini: hmsToMin(r.hora_inicio), fin: hmsToMin(r.hora_fin) }))
      .filter((b) => b.ini != null && b.fin != null && b.fin > b.ini);
    if (bloques.length === 0) return horaFinMin;

    // ¿En qué bloque de jornada cae horaFin (inclusive en el extremo)?
    let idx = -1;
    for (let i = 0; i < bloques.length; i++) {
      const b = bloques[i];
      if (horaFinMin >= b.ini && horaFinMin <= b.fin) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      // Coincidió con un bloque de jornada. Si horaFin está pegado al
      // fin del bloque (horaFin === bloque.fin) Y existe un siguiente
      // bloque, devolver el inicio del siguiente (caso típico 13:00 →
      // 15:00). Si no, devolver horaFin (la nueva arranca justo después
      // del bloque actual, que es lo natural).
      const bloque = bloques[idx];
      if (horaFinMin >= bloque.fin && idx + 1 < bloques.length) {
        return bloques[idx + 1].ini;
      }
      return horaFinMin;
    }
    // horaFin está antes del primer bloque o después del último.
    if (horaFinMin < bloques[0].ini) return bloques[0].ini;
    return horaFinMin;
  }

  // Lista los usuarios activos excluyendo el `rol_id` indicado (típicamente
  // 1 = admin/root, para que el ASISTENTE no se asigne a sí mismo ni a
  // admins). Devuelve `id`, `usuario` y `nombre_completo` para llenar el
  // `<select>` del header.
  async getUsuariosExcluyendoRol(rolIdExcluir) {
    const where = { estado: true };
    if (rolIdExcluir != null) {
      where.rol_id = { not: Number(rolIdExcluir) };
    }
    const rows = await prisma.usuarios.findMany({
      where,
      orderBy: { id: "asc" },
      select: {
        id: true,
        usuario: true,
        rol_id: true,
        personas: {
          select: { nombres: true, apellidos: true },
        },
        roles: {
          select: { id: true, nombre: true },
        },
      },
    });
    return rows.map((u) => {
      const nom = u.personas?.nombres || "";
      const ape = u.personas?.apellidos || "";
      const nombreCompleto = `${nom} ${ape}`.trim() || u.usuario || `#${u.id}`;
      return {
        id: u.id,
        usuario: u.usuario,
        nombre_completo: nombreCompleto,
        rol: u.roles ? { id: u.roles.id, nombre: u.roles.nombre } : null,
      };
    });
  }

  // Lista TODAS las ACTIVIDADES activas (sin filtrar por tipo de tarea).
  // Antes filtraba por `tipo_tarea` REUNION, pero el calendario del
  // Asistente necesita pintar cualquier actividad del usuario
  // (reuniones, valorador, auxiliares, etc.), no solo las reuniones.
  //
  // Dos modos de salida según el flag:
  //
  //   * `onlySinSlot` → un objeto por ACTIVIDAD (las que aún no tienen
  //     horario_usuario activo). Se usa para el sidebar "pendientes de
  //     programar".
  //
  //   * `onlyConSlot` → un objeto por FILA de `horario_usuario` (una
  //     actividad distribuida en varios bloques según su jornada se
  //     serializa como N entradas, cada una con su propia fecha/hora/
  //     duración). Es lo que necesita el calendario para pintar el
  //     evento partido, no como un único bloque gigante. Cada entrada
  //     lleva `actividad_id` para que el front (eventClick, eventDrop,
  //     eventResize, modal de detalle) siga pudiendo abrir la
  //     actividad padre.
  //
  // Cada objeto expone: `id` (slot o actividad), `actividad_id` (id de
  // la actividad padre, presente en modo con-slot), `fecha_inicio`,
  // `hora_inicio`, `tiempo_estimado_minutos`, `usuario_id`, prospecto y
  // tarea (la misma forma en ambos modos para no romper `buildCalendarEvent`
  // ni el sidebar).
  //
  // Parámetros:
  //   - usuarioId: filtra por el usuario asignado. En modo con-slot se
  //     filtra sobre `horario_usuario.usuario_id`; en modo sin-slot
  //     sobre `actividades.usuario_id`.
  //   - onlySinSlot / onlyConSlot: ver arriba. Si se pasan ambos, gana
  //     `onlySinSlot`.
  //   - Si no se pasa ninguno, devuelve todas las actividades (compat
  //     con vistas viejas), una por actividad (no expandida).
  async getActividadesReunion({
    usuarioId,
    onlySinSlot,
    onlyConSlot,
  } = {}) {
    // Helpers locales para reducir boilerplate del shape común.
    // Recibe el array `prospecto_persona` (cada fila trae una `personas`
    // relacionada). Mapea cada fila al contacto plano, filtrando las
    // filas huérfanas (sin persona).
    const mapContactos = (rows) =>
      (Array.isArray(rows) ? rows : [])
        .map((pp) => {
          if (!pp || !pp.personas) return null;
          const per = pp.personas;
          return {
            id: per.id,
            nombres: per.nombres,
            apellidos: per.apellidos,
            celular: per.celular,
            nombre_completo:
              [per.nombres, per.apellidos].filter(Boolean).join(" ").trim() ||
              null,
          };
        })
        .filter(Boolean);

    const buildProspecto = (p) => {
      if (!p) return null;
      const contactos = mapContactos(p.prospecto_persona || []);
      return {
        id: p.id,
        titulo: p.titulo_prospecto,
        estado_cliente: p.estado_cliente || null,
        universidad: p.carreras?.institucion?.nombre || null,
        carrera: p.carreras?.nombre || null,
        nivel_academico: p.nivel_academico?.nombre || null,
        contactos,
        contacto_principal: contactos[0]?.nombre_completo || null,
      };
    };

    const buildTarea = (t) => {
      if (!t) return null;
      const tt = t.tipo_tarea_tarea_tipo_tareaTotipo_tarea;
      return {
        id: t.id,
        nombre: t.nombre,
        tipo_tarea: tt
          ? { id: tt.id, tipo: tt.tipo, color: tt.color }
          : null,
      };
    };

    // Construye el objeto "registrado por" para una actividad. La FK es
    // `actividades.usuario_register` (columna de auditoría: el usuario
    // de la sesión que hizo POST al crear el potencial o la actividad,
    // NO el asignado a la tarea — eso es `usuario_id`). Nullable en
    // actividades legacy.
    const buildUsuarioRegistro = (u) => {
      if (!u) return null;
      const nom = u.personas?.nombres || "";
      const ape = u.personas?.apellidos || "";
      const nombreCompleto =
        `${nom} ${ape}`.trim() || u.usuario || `#${u.id}`;
      return {
        id: u.id,
        usuario: u.usuario,
        nombre_completo: nombreCompleto,
      };
    };

    // ---------- MODO SIN SLOT (sidebar) -------------------------------
    // Una entrada por actividad. Filtra por presencia/ausencia de
    // horario_usuario.
    if (onlySinSlot) {
      const whereAct = {
        estado: true,
        horario_usuario: { none: { estado: true } },
        ...(usuarioId != null ? { usuario_id: Number(usuarioId) } : {}),
      };
      const actividades = await prisma.actividades.findMany({
        where: whereAct,
        orderBy: [{ fecha_inicio: "desc" }, { id: "desc" }],
        select: {
          id: true,
          estado_progreso: true,
          prioridad: true,
          estado: true,
          color: true,
          fecha_inicio: true,
          hora_inicio: true,
          tiempo_estimado_minutos: true,
          usuario_id: true,
          // Auditoría: id del usuario que REGISTRÓ la actividad. El
          // schema NO declara la relación `actividades.usuario_register
          // → usuarios` (la FK vive suelta en la DB), por eso no
          // podemos hacer un `select` anidado acá. En su lugar
          // hacemos una segunda query abajo para resolver los nombres.
          usuario_register: true,
          prospectos: {
            select: {
              id: true,
              titulo_prospecto: true,
              estado_cliente: true,
              carreras: {
                select: {
                  id: true,
                  nombre: true,
                  institucion: { select: { id: true, nombre: true } },
                },
              },
              nivel_academico: { select: { id: true, nombre: true } },
              prospecto_persona: {
                select: {
                  personas: {
                    select: {
                      id: true,
                      nombres: true,
                      apellidos: true,
                      celular: true,
                    },
                  },
                },
              },
            },
          },
          tarea: {
            select: {
              id: true,
              nombre: true,
              tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
                select: { id: true, tipo: true, color: true },
              },
            },
          },
        },
        take: 200,
      });

      // Lookup batch: traer los usuarios de registro en una sola query
      // para no hacer N+1.
      const registerIds = Array.from(
        new Set(
          actividades
            .map((a) => a.usuario_register)
            .filter((v) => v != null),
        ),
      );
      const usuariosRegistro = registerIds.length
        ? await prisma.usuarios.findMany({
            where: { id: { in: registerIds } },
            select: {
              id: true,
              usuario: true,
              personas: { select: { nombres: true, apellidos: true } },
            },
          })
        : [];
      const usuariosRegistroById = new Map(
        usuariosRegistro.map((u) => [u.id, u]),
      );

      return actividades.map((a) => ({
        id: a.id,
        estado_progreso: a.estado_progreso,
        prioridad: a.prioridad,
        estado: a.estado,
        color: a.color || null,
        usuario_id: a.usuario_id,
        tiene_slot: false,
        fecha_inicio: fmtLocalDate(a.fecha_inicio),
        hora_inicio: minToHHMM(hmsToMin(a.hora_inicio)),
        tiempo_estimado_minutos: a.tiempo_estimado_minutos,
        prospecto: buildProspecto(a.prospectos),
        tarea: buildTarea(a.tarea),
        registrado_por: buildUsuarioRegistro(
          a.usuario_register != null
            ? usuariosRegistroById.get(a.usuario_register)
            : null,
        ),
      }));
    }

    // ---------- MODO CON SLOT (calendario) ----------------------------
    // UNA entrada por fila de horario_usuario. Esto permite pintar el
    // calendario partido según la jornada del usuario (si la actividad
    // ocupa 20h y se distribuye Vie 8-13 + Lun 8-13 + Mar 8-10, devuelve
    // 3 entradas con sus fechas/horas/duraciones propias).
    if (onlyConSlot) {
      const whereHu = {
        estado: true,
        OR: [
          // Slots normales con actividad padre
          { actividad_id: { not: null } },
          // Slots de marca libre / canje / permiso / reasignado (sin actividad)
          { marca: { in: ['libre', 'canje', 'permiso', 'reasignado'] } },
        ],
        ...(usuarioId != null ? { usuario_id: Number(usuarioId) } : {}),
      };

      const slots = await prisma.horario_usuario.findMany({
        where: whereHu,
        orderBy: [{ fecha: "asc" }, { id: "asc" }],
        select: {
          id: true,
          actividad_id: true,
          fecha: true,
          hora_inicio: true,
          hora_fin: true,
          duracion_minutos: true,
          marca: true,
          usuario_id: true,
          actividades: {
            select: {
              id: true,
              estado_progreso: true,
              prioridad: true,
              estado: true,
              color: true,
              tiempo_estimado_minutos: true,
              usuario_id: true,
              prospectos: {
                select: {
                  id: true,
                  titulo_prospecto: true,
                  estado_cliente: true,
                  carreras: {
                    select: {
                      id: true,
                      nombre: true,
                      institucion: { select: { id: true, nombre: true } },
                    },
                  },
                  nivel_academico: { select: { id: true, nombre: true } },
                  prospecto_persona: {
                    select: {
                      personas: {
                        select: {
                          id: true,
                          nombres: true,
                          apellidos: true,
                          celular: true,
                        },
                      },
                    },
                  },
                },
              },
              tarea: {
                select: {
                  id: true,
                  nombre: true,
                  tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
                    select: { id: true, tipo: true, color: true },
                  },
                },
              },
            },
          },
        },
        take: 600,
      });
      return slots
        .filter((s) => s.actividades || (s.marca && ['libre', 'canje', 'permiso', 'reasignado'].includes(s.marca)))
        .map((s) => {
          const a = s.actividades;
          const esReasignado = !a && s.marca === 'reasignado';
          const esSlotMarca = !a && s.marca && ['libre', 'canje', 'permiso'].includes(s.marca);
          return {
            id: `hu-${s.id}`,
            actividad_id: a?.id || (esSlotMarca || esReasignado ? 0 : null),
            horario_usuario_id: s.id,
            estado_progreso: a?.estado_progreso || (esSlotMarca || esReasignado ? 'completada' : null),
            prioridad: a?.prioridad || null,
            estado: a?.estado ?? true,
            color: a?.color || null,
            usuario_id: s.usuario_id || a?.usuario_id,
            tiene_slot: true,
            fecha_inicio: fmtLocalDate(s.fecha),
            hora_inicio: minToHHMM(hmsToMin(s.hora_inicio)),
            hora_fin: minToHHMM(hmsToMin(s.hora_fin)),
            marca: s.marca || null,
            hu_tipo: esReasignado ? 'reasignado' : null,
            tiempo_estimado_minutos:
              s.duracion_minutos != null
                ? Number(s.duracion_minutos)
                : Number(a?.tiempo_estimado_minutos) || null,
            actividad_total_minutos: a?.tiempo_estimado_minutos || null,
            prospecto: a ? buildProspecto(a.prospectos) : null,
            tarea: a ? buildTarea(a.tarea) : null,
          };
        });
    }

    // ---------- MODO LEGACY (sin flags) -------------------------------
    // Una entrada por actividad, sin filtro de slot. Mantenido para
    // vistas viejas que llamaban al endpoint sin flags.
    const actividades = await prisma.actividades.findMany({
      where: { estado: true },
      orderBy: [{ fecha_inicio: "desc" }, { id: "desc" }],
      select: {
        id: true,
        estado_progreso: true,
        prioridad: true,
        estado: true,
        color: true,
        fecha_inicio: true,
        hora_inicio: true,
        tiempo_estimado_minutos: true,
        usuario_id: true,
        prospectos: {
          select: {
            id: true,
            titulo_prospecto: true,
            estado_cliente: true,
            carreras: {
              select: {
                id: true,
                nombre: true,
                institucion: { select: { id: true, nombre: true } },
              },
            },
            nivel_academico: { select: { id: true, nombre: true } },
            prospecto_persona: {
              select: {
                personas: {
                  select: {
                    id: true,
                    nombres: true,
                    apellidos: true,
                    celular: true,
                  },
                },
              },
            },
          },
        },
        tarea: {
          select: {
            id: true,
            nombre: true,
            tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
              select: { id: true, tipo: true, color: true },
            },
          },
        },
        horario_usuario: {
          where: { estado: true },
          select: { id: true },
          take: 1,
        },
      },
      take: 200,
    });
    return actividades.map((a) => ({
      id: a.id,
      estado_progreso: a.estado_progreso,
      prioridad: a.prioridad,
      estado: a.estado,
      color: a.color || null,
      usuario_id: a.usuario_id,
      tiene_slot: (a.horario_usuario || []).length > 0,
      fecha_inicio: fmtLocalDate(a.fecha_inicio),
      hora_inicio: minToHHMM(hmsToMin(a.hora_inicio)),
      tiempo_estimado_minutos: a.tiempo_estimado_minutos,
      prospecto: buildProspecto(a.prospectos),
      tarea: buildTarea(a.tarea),
    }));
  }
  // GET /api/calendario-asistente/horas-extras/resumen?usuario_id=N
  // Devuelve conteo y total de minutos de horas extra/libre de la semana
  // actual (lunes a domingo) para el usuario indicado.
  async getResumenHorasExtras(usuarioId) {
    const uid = Number(usuarioId);
    if (!uid) return { rows: [], resumen: { extra: { count: 0, minutos: 0 }, libre: { count: 0, minutos: 0 } } };

    const hoy = new Date();
    const dia = hoy.getDay();
    const diffLun = dia === 0 ? -6 : 1 - dia;
    const lun = new Date(hoy);
    lun.setDate(hoy.getDate() + diffLun);
    const dom = new Date(lun);
    dom.setDate(lun.getDate() + 6);

    const raw = await prisma.$queryRawUnsafe(
      `SELECT he.id, TO_CHAR(he.fecha, 'YYYY-MM-DD') AS fecha, he.minutos, he.tipo,
              TO_CHAR(hu.hora_inicio::time, 'HH24:MI') AS hora_inicio,
              TO_CHAR(hu.hora_fin::time, 'HH24:MI') AS hora_fin,
              a.id AS actividad_id, t.nombre AS actividad_nombre, p.titulo_prospecto
       FROM horas_extras he
       LEFT JOIN horario_usuario hu ON hu.id = he.horario_id
       LEFT JOIN actividades a ON a.id = he.actividad_id
       LEFT JOIN tarea t ON t.id = a.tarea_id
       LEFT JOIN prospectos p ON p.id = a.prospecto_id
       WHERE he.usuario_id = $1
         AND he.fecha >= $2::date
         AND he.fecha <= $3::date
         AND he.estado = 'pendiente'
       ORDER BY he.fecha ASC, he.id ASC`,
      uid, lun, dom,
    );

    const rows = Array.isArray(raw) ? raw : [];

    const extra = { count: 0, minutos: 0 };
    const libre = { count: 0, minutos: 0 };
    for (const r of rows) {
      const t = r.tipo === "libre" ? libre : extra;
      t.count += 1;
      t.minutos += Number(r.minutos) || 0;
    }

    const mapped = rows.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      minutos: r.minutos,
      tipo: r.tipo,
      hora_inicio: r.hora_inicio || "—",
      hora_fin: r.hora_fin || "—",
      actividad: r.actividad_nombre || "—",
      prospecto: r.titulo_prospecto || "—",
    }));

    return { rows: mapped, resumen: { extra, libre } };
  }

  // POST /api/calendario-asistente/horas-extras/canjear
  // Canjea horas extra pendientes por un bloque libre en fecha_destino.
  async canjearHorasExtras({ ids, fechaDestino, horaInicio: horaInicioStr }) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      const e = new Error("Selecciona al menos una hora extra.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (!fechaDestino) {
      const e = new Error("Debes indicar una fecha de destino.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const extras = await prisma.horas_extras.findMany({
      where: {
        id: { in: ids.map(Number) },
        tipo: "extra",
        estado: "pendiente",
      },
      select: {
        id: true,
        minutos: true,
        usuario_id: true,
        horario_id: true,
      },
    });

    if (extras.length === 0) {
      const e = new Error("No se encontraron horas extras pendientes con los ids proporcionados.");
      e.code = "NOT_FOUND";
      throw e;
    }

    // Extraer uid antes del transaction para usarlo en las validaciones previas
    const uid = Number(extras[0].usuario_id);
    if (!uid) {
      const e = new Error("Usuario no identificado.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Bug 2 fix: validar feriados y cumpleaños antes de crear el bloque
    const fechaVal = await reunionesAsistenteService.validateFechaParaUsuario(uid, fechaDestino);
    if (!fechaVal.ok) {
      const e = new Error(fechaVal.message);
      e.code = "BAD_REQUEST";
      throw e;
    }

    const fechaDest = new Date(fechaDestino + "T00:00:00");

    // Hora de inicio proporcionada por el usuario o default 09:00
    let horaInicio;
    if (horaInicioStr) {
      const [h, m] = String(horaInicioStr).split(":").map(Number);
      horaInicio = new Date(Date.UTC(1970, 0, 1, h || 9, m || 0));
    } else {
      horaInicio = new Date(Date.UTC(1970, 0, 1, 9, 0));
    }

    // Bug 3 fix: verificar disponibilidad del slot antes de insertar
    const totalMinutos = extras.reduce((acc, e) => acc + (Number(e.minutos) || 0), 0);
    const hi = horaInicio.getUTCHours();
    const mi = horaInicio.getUTCMinutes() + totalMinutos;
    const horaFin = new Date(Date.UTC(1970, 0, 1, hi + Math.floor(mi / 60), mi % 60));

    const overlap = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS cnt
         FROM horario_usuario
        WHERE usuario_id = $1
          AND fecha = $2::date
          AND estado = true
          AND hora_inicio < $3
          AND hora_fin   > $4`,
      uid,
      fechaDestino,
      horaFin,
      horaInicio,
    );
    if (Number(overlap?.[0]?.cnt) > 0) {
      const e = new Error("El horario seleccionado se superpone con una actividad o reunión ya programada en esa fecha.");
      e.code = "CONFLICT";
      throw e;
    }

    // Bug 1 fix: rebalance FUERA del transaction para que vea el estado confirmado
    const result = await prisma.$transaction(async (tx) => {
      // Crear UN bloque canjeado en la fecha destino
      const nuevoBloque = await tx.horario_usuario.create({
        data: {
          usuario_id: uid,
          fecha: fechaDest,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          duracion_minutos: totalMinutos,
          marca: "canje",
          estado: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // Marcar extras originales como canjeados y vincular al bloque
      for (const extra of extras) {
        try {
          await tx.horas_extras.update({
            where: { id: extra.id },
            data: {
              estado: "canjeado",
              canje_horario_id: nuevoBloque.id,
              updated_at: new Date(),
            },
          });
        } catch (_) {
          // Si canje_horario_id aún no existe en BD, actualizar sin ella
          await tx.horas_extras.update({
            where: { id: extra.id },
            data: { estado: "canjeado", updated_at: new Date() },
          });
        }
      }

      // Marcar los bloques originales (deshabilitados) como "canje" para auditoría
      const bloquesOriginales = [...new Set(extras.map(e => e.horario_id).filter(Boolean))];
      for (const bid of bloquesOriginales) {
        await tx.horario_usuario.update({
          where: { id: bid },
          data: { marca: "canje", updated_at: new Date() },
        });
      }

      return { canjeados: extras.length, bloque_creado: nuevoBloque.id };
    });

    // Rebalancear DESPUÉS del transaction para que vea el bloque canje ya confirmado
    try {
      await reunionesAsistenteService.rebalanceUsuario(uid, fechaDestino, {
        motivo: "Rebalance post-canje de horas extra",
        fillFreeSlots: false,
      });
    } catch (_) {
      // Non-critical
    }

    return result;
  }

  // GET /api/calendario-asistente/horas-extras/canje-detail?horario_id=N
  // Devuelve el bloque canjeado + las horas extra que lo originaron.
  async getCanjeDetail(horarioId) {
    const hid = Number(horarioId);
    if (!hid) {
      const e = new Error("horario_id requerido.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const bloque = await prisma.horario_usuario.findUnique({
      where: { id: hid },
      select: {
        id: true,
        fecha: true,
        hora_inicio: true,
        hora_fin: true,
        duracion_minutos: true,
        marca: true,
      },
    });

    if (!bloque) {
      const e = new Error("Bloque no encontrado.");
      e.code = "NOT_FOUND";
      throw e;
    }

    // Buscar horas extra vinculadas por canje_horario_id (si la columna existe)
    let extras = [];
    try {
      const extrasRaw = await prisma.horas_extras.findMany({
        where: { canje_horario_id: hid },
        orderBy: { id: "asc" },
        select: {
          id: true,
          fecha: true,
          minutos: true,
          tipo: true,
          estado: true,
          actividades: {
            select: {
              id: true,
              prospectos: {
                select: { titulo_prospecto: true },
              },
              tarea: {
                select: { nombre: true },
              },
            },
          },
        },
      });
      extras = (extrasRaw || []).map((he) => ({
        id: he.id,
        fecha: he.fecha instanceof Date
          ? `${he.fecha.getUTCFullYear()}-${String(he.fecha.getUTCMonth() + 1).padStart(2, "0")}-${String(he.fecha.getUTCDate()).padStart(2, "0")}`
          : String(he.fecha).slice(0, 10),
        minutos: he.minutos,
        tipo: he.tipo,
        estado: he.estado,
        actividad: he.actividades?.tarea?.nombre || "—",
        prospecto: he.actividades?.prospectos?.titulo_prospecto || "—",
      }));
    } catch (_) {
      // Columna canje_horario_id aún no existe en BD (falta migración)
      extras = [];
    }

    return {
      bloque: {
        id: bloque.id,
        fecha: bloque.fecha instanceof Date
          ? fmtLocalDate(bloque.fecha)
          : String(bloque.fecha).slice(0, 10),
        hora_inicio: minToHHMM(hmsToMin(bloque.hora_inicio)),
        hora_fin: minToHHMM(hmsToMin(bloque.hora_fin)),
        duracion_minutos: bloque.duracion_minutos,
        marca: bloque.marca,
      },
      extras,
    };
  }

  // POST /api/calendario-asistente/horas-extras/pagar
  // Marca horas extra como pagadas.
  async pagarHorasExtras(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      const e = new Error("Selecciona al menos una hora extra.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const result = await prisma.horas_extras.updateMany({
      where: {
        id: { in: ids.map(Number) },
        tipo: "extra",
        estado: "pendiente",
      },
      data: { estado: "pagado", updated_at: new Date() },
    });

    if (result.count === 0) {
      const e = new Error("No se encontraron horas extras pendientes con los ids proporcionados.");
      e.code = "NOT_FOUND";
      throw e;
    }

    return { pagados: result.count };
  }
}

export default new CalendarioAsistenteService();
