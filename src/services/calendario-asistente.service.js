import prisma from "../config/db.js";

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

class CalendarioAsistenteService {
  // Devuelve la fecha y la `hora_fin` del ÚLTIMO bloque registrado en
  // `horario_usuario` para el usuario indicado (ordenado por fecha desc
  // y, como desempate, id desc — el último insertado si hay varios en
  // la misma fecha).
  //
  // Sirve para pre-rellenar el modal "Programar" con la fecha del último
  // bloque del usuario y la HORA FIN de ese bloque (la hora en que
  // terminó la última actividad), de modo que la nueva actividad se
  // "enganche" justo después: si nunca tuvo bloques (usuario nuevo o
  // sin programar nada), el front usa hoy como fecha y deja el campo
  // hora libre para que el usuario elija.
  //
  // Shape de retorno (estable para el front):
  //   { exists: true,  fecha: "YYYY-MM-DD", hora_fin: "HH:MM" }
  //   { exists: false, fecha: null,        hora_fin: null }
  async getUltimoHorarioUsuario(usuarioId) {
    if (usuarioId == null) {
      return { exists: false, fecha: null, hora_fin: null };
    }
    const last = await prisma.horario_usuario.findFirst({
      where: { usuario_id: Number(usuarioId), estado: true },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      select: { fecha: true, hora_fin: true },
    });
    if (!last) {
      return { exists: false, fecha: null, hora_fin: null };
    }
    return {
      exists: true,
      fecha: fmtLocalDate(last.fecha),
      hora_fin: minToHHMM(hmsToMin(last.hora_fin)),
    };
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
        // Filtramos slots huérfanos (sin actividad padre) directamente
        // por la FK; más barato y seguro que un filtro de relación.
        actividad_id: { not: null },
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
        .filter((s) => s.actividades) // descarta slots huérfanos
        .map((s) => {
          const a = s.actividades;
          return {
            // id del SLOT (no de la actividad) → FullCalendar maneja
            // cada bloque como evento independiente, permitiendo
            // moverlos uno por uno sin "pegar" los demás.
            id: `hu-${s.id}`,
            actividad_id: a.id,
            horario_usuario_id: s.id,
            estado_progreso: a.estado_progreso,
            prioridad: a.prioridad,
            estado: a.estado,
            color: a.color || null,
            usuario_id: s.usuario_id || a.usuario_id,
            tiene_slot: true,
            // Datos del BLOQUE (no de la actividad): cada bloque trae su
            // propia fecha/hora/duración. Por eso se ve partido en el
            // calendario respetando la jornada.
            fecha_inicio: fmtLocalDate(s.fecha),
            hora_inicio: minToHHMM(hmsToMin(s.hora_inicio)),
            hora_fin: minToHHMM(hmsToMin(s.hora_fin)),
            tiempo_estimado_minutos:
              s.duracion_minutos != null
                ? Number(s.duracion_minutos)
                : Number(a.tiempo_estimado_minutos) || null,
            // Total estimado de la actividad padre (útil para el modal
            // de detalle / tooltips).
            actividad_total_minutos: a.tiempo_estimado_minutos,
            prospecto: buildProspecto(a.prospectos),
            tarea: buildTarea(a.tarea),
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
}

export default new CalendarioAsistenteService();
