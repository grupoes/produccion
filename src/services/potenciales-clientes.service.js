import prisma from "../config/db.js";
import ActividadEstadoHistorialService from "./actividad-estado-historial.service.js";

const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"];

// Roles que reciben la notificación de nuevo potencial cliente.
// Coincidencia sobre `roles.nombre` case-insensitive + sin acentos.
const ROLES_NOTIFICABLES = ["super admin", "administrador", "jefe de produccion"];
const ROL_AUX_PROD = "auxiliar de produccion";
const ROL_JEFA_VENTAS = "jefa de ventas";
const ROL_VALORADOR = "valorador";
// id hard-coded del rol VALORADOR (match con el branch del dashboard
// Kanban en admin.routes.js). Se usa para el contrato especial de
// horario: el VALORADOR NO recibe el slot en `horario_usuario` al
// crearse la actividad, sino recién cuando la marca como completada.
const ROL_VALORADOR_ID = 10;
// ASISTENTE DE PRODUCCIÓN: rol dedicado a las reuniones de potenciales
// clientes. Cuando el potencial se crea con una tarea de tipo REUNIONES,
// se fuerza la asignación a este rol y la fecha al día actual.
const ROL_ASISTENTE_PROD = "asistente de produccion";
const ROL_ASISTENTE_PROD_ID = 11;
  // Etiqueta de `tipo_tarea.tipo` que dispara la regla de reunión.
  // Match case + accent insensitive, contiene "REUNION" (cubre
  // "REUNION", "REUNIONES", "Reunión", etc.).
  const TIPO_REUNION = "REUNION";
  // id hard-coded como red de seguridad por si en la BD la fila de
  // tipo_tarea quedó con un nombre distinto al esperado.
  const TIPO_REUNION_ID = 2;

// Modo de auto-asignación para nuevos potenciales clientes.
// "valorador"     → primer usuario activo con rol VALORADOR (default).
// "auxiliar_dia"  → primer usuario asignado al día (tabla asignacion_dias)
//                   con rol AUXILIAR DE PRODUCCIÓN (modo histórico).
// Override por env: POTENCIAL_AUTO_ASSIGN_MODE=auxiliar_dia
const POTENCIAL_AUTO_ASSIGN_MODE =
  (process.env.POTENCIAL_AUTO_ASSIGN_MODE || "valorador").toLowerCase();

// Paleta de colores para asignar aleatoriamente a la actividad del
// potencial cliente al crearse (no se pide al usuario en el modal).
// Misma paleta que mostraba el color-picker antes para mantener
// consistencia visual en el calendario.
const POTENCIAL_COLOR_PALETTE = [
  "#dc3545", // rojo
  "#f59e0b", // naranja
  "#3b82f6", // azul
  "#10b981", // verde
  "#8b5cf6", // violeta
  "#0ea5e9", // celeste
];
const pickRandomColor = () =>
  POTENCIAL_COLOR_PALETTE[
    Math.floor(Math.random() * POTENCIAL_COLOR_PALETTE.length)
  ];

// Comparador de cumpleaños: ¿la fecha de nacimiento cae el mismo
// día+mes que la fecha local indicada?
//
// `fechaNacimiento` viene de Prisma (`@db.Date`) y se materializa como
// un Date en UTC midnight; en zonas al oeste de UTC, usar `getDate()`
// directamente produce off-by-one. Por eso usamos `getUTC*` para la BD
// y `get*` para la fecha local.
const isBirthdayOn = (fechaNacimiento, fechaLocal) => {
  if (!fechaNacimiento) return false;
  const fn =
    fechaNacimiento instanceof Date
      ? fechaNacimiento
      : new Date(fechaNacimiento);
  if (Number.isNaN(fn.getTime())) return false;
  return (
    fn.getUTCDate() === fechaLocal.getDate() &&
    fn.getUTCMonth() === fechaLocal.getMonth()
  );
};

// Compara dos Date como día local (ignora hora y timezone).
const isSameLocalDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// Devuelve "YYYY-MM-DD" de un Date local.
const getYmdLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Convierte una columna Timetz (Date o string) a "minutos desde medianoche"
// LOCALES. Si la columna viene como UTC midnight + offset, el .getHours()
// puede devolver otra cosa — confiamos en el mismo criterio que el resto
// del repo (mismo helper usan otros services como usuarios.service).
const toMin = (d) => {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.getHours() * 60 + x.getMinutes();
};

// FIX QUIRÚRGICO Timetz: parsea un string "HH:MM[:SS]" (o Date) y devuelve
// minutos desde medianoche SIN pasar por Date. Es la versión segura para
// columnas Timetz leídas desde raw SQL con `to_char(...,'HH24:MI:SS')`,
// porque a) el resultado es wall-clock (no se desfasa por TZ del server)
// y b) no tropieza con el bug de Prisma que devuelve Date en UTC. Usar
// SIEMPRE que se lea Timetz desde una query cruda.
const toMinFromHms = (s) => {
  if (s == null) return null;
  if (s instanceof Date) {
    // Por si llega un Date (Prisma sin raw SQL). Acá sí dependemos de
    // getHours() — pero es un fallback de último recurso.
    return s.getHours() * 60 + s.getMinutes();
  }
  const m = String(s).match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

// Convierte minutos desde medianoche a "HH:MM:SS".
const minutosToHms = (m) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(h)}:${p(mm)}:00`;
};

// Normaliza un string: minúsculas + sin diacríticos.
// Útil para matchear "AUXILIAR DE PRODUCCIÓN" contra "auxiliar de produccion".
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const matchesAny = (name, list) => {
  const n = norm(name);
  return list.some((p) => n.includes(p));
};

// Mapea getDay() (0=Dom, 1=Lun..6=Sáb) al id de la tabla `dias`
// (1=Lunes .. 6=Sábado). Domingo no existe en `dias`.
const DAY_ID_BY_GETDAY = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
const getTodayDiaId = () => DAY_ID_BY_GETDAY[new Date().getDay()] || null;

// Convierte "HH:MM[:SS]" a un Date UTC 1970-01-01THH:MM:SS para columnas
// `@db.Timetz`. Usamos `Date.UTC` (no el constructor local) para que el
// driver de Postgres escriba la hora tal como la recibimos del front,
// sin que el huso horario del server la desplace. Si el valor ya es
// Date, se devuelve tal cual.
const toTime = (s) => {
  if (s == null || s === "") return null;
  if (s instanceof Date) return s;
  const m = String(s).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(
    Date.UTC(1970, 0, 1, Number(m[1]), Number(m[2]), Number(m[3] || 0)),
  );
};

class PotencialesClientesService {
  // ---------------- Catálogos ----------------------------------------

  // Devuelve true si la tarea indicada es de tipo "REUNION/REUNIONES"
  // según `tipo_tarea.tipo` o `tipo_tarea.id`. Match case + accent
  // insensitive, por nombre (contains) o por id hard-coded.
  async #isReunionTarea(tx, tareaId) {
    if (!tareaId) return false;
    const t = await tx.tarea.findUnique({
      where: { id: Number(tareaId) },
      select: {
        tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
          select: { id: true, tipo: true, estado: true },
        },
      },
    });
    if (!t || !t.tipo_tarea_tarea_tipo_tareaTotipo_tarea) return false;
    const tt = t.tipo_tarea_tarea_tipo_tareaTotipo_tarea;
    if (tt.estado === false) return false;
    if (Number(tt.id) === TIPO_REUNION_ID) return true;
    return norm(tt.tipo).includes(norm(TIPO_REUNION));
  }

  async getLookups() {
    const [
      tareas,
      niveles,
      instituciones,
      proveedores,
      origenes,
      tiposDocumento,
    ] = await Promise.all([
      prisma.tarea.findMany({
        where: { estado: true },
        select: {
          id: true,
          nombre: true,
          horas_estimadas: true,
          tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
            select: { id: true, tipo: true },
          },
        },
        orderBy: { nombre: "asc" },
      }),
      prisma.nivel_academico.findMany({
        where: { estado: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
      prisma.institucion.findMany({
        where: { estado: true },
        select: {
          id: true,
          nombre: true,
          abreviatura: true,
          carreras: {
            where: { estado: true },
            select: { id: true, nombre: true },
            orderBy: { nombre: "asc" },
          },
        },
        orderBy: { nombre: "asc" },
      }),
      prisma.proveedor.findMany({
        where: { estado: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
      prisma.origen.findMany({
        where: { estado: true },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
      prisma.tipo_documento.findMany({
        where: { estado: true },
        select: { id: true, nombre: true, abreviatura: true },
        orderBy: { nombre: "asc" },
      }),
    ]);

    return {
      tareas,
      niveles,
      instituciones,
      proveedores,
      origenes,
      tipos_documento: tiposDocumento,
    };
  }

  async getCarrerasByInstitucion(institucionId) {
    return prisma.carreras.findMany({
      where: {
        institucion_id: institucionId ? Number(institucionId) : undefined,
        estado: true,
      },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  }

  // Devuelve los usuarios activos (excepto SUPER ADMIN) para alimentar
  // el select de "Asignado a", junto con los usuarios asignados a la
  // fecha indicada (vía `asignacion_dias`).
  //
  // Adicionalmente expone `default_assignee` para que el front sepa qué
  // usuario preseleccionar según el modo activo (`POTENCIAL_AUTO_ASSIGN_MODE`).
  // También marca con `es_cumpleanios_hoy` a quienes cumplen años en la
  // fecha indicada, para que el front muestre el icono 🎂 y excluya a
  // esos usuarios del default.
  async getUsuariosAsignablesPorFecha(fecha) {
    // 1) id del rol SUPER ADMIN (case + accent insensitive).
    const roles = await prisma.roles.findMany({
      where: { estado: true },
      select: { id: true, nombre: true },
    });
    const rolSuperId = roles.find((r) =>
      matchesAny(r.nombre, ["super admin"]),
    )?.id;
    const whereUsuarios = {
      estado: true,
      ...(rolSuperId ? { rol_id: { not: rolSuperId } } : {}),
    };

    // Parseamos la fecha como local para compararla con el cumpleaños.
    const m = fecha ? String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
    const fechaLocalRef = m
      ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      : new Date();

    const usuarios = await prisma.usuarios.findMany({
      where: whereUsuarios,
      orderBy: { id: "asc" },
      select: {
        id: true,
        usuario: true,
        personas: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            fecha_nacimiento: true,
          },
        },
        roles: { select: { id: true, nombre: true } },
      },
    });

    const usuariosFmt = usuarios.map((u) => {
      const nombre = u.personas
        ? [u.personas.nombres, u.personas.apellidos]
            .filter(Boolean)
            .join(" ")
            .trim() || u.usuario
        : u.usuario;
      return {
        id: u.id,
        usuario: u.usuario,
        nombre,
        rol: u.roles ? { id: u.roles.id, nombre: u.roles.nombre } : null,
        es_cumpleanios_hoy: isBirthdayOn(
          u.personas?.fecha_nacimiento,
          fechaLocalRef,
        ),
      };
    });

    // 2) Usuarios asignados a la fecha indicada (en `asignacion_dias`).
    //    Mapeo JS getDay() → id de `dias` (1=Lun..6=Sáb).
    const asignados = [];
    if (fecha) {
      const diaId = DAY_ID_BY_GETDAY[fechaLocalRef.getDay()] || null;
      if (diaId) {
        // Tabla sin PK → SQL crudo.
        const rows = await prisma.$queryRawUnsafe(
          `SELECT u.id
           FROM usuarios u
           INNER JOIN asignacion_dias ad ON ad.usuario_id = u.id
           WHERE u.estado = true
             AND ad.dia_id = $1`,
          diaId,
        );
        const ids = new Set(rows.map((r) => Number(r.id)));
        // Sólo devolvemos los que siguen activos y no son super admin.
        for (const u of usuariosFmt) {
          if (ids.has(u.id)) {
            asignados.push({
              id: u.id,
              nombre: u.nombre,
              es_cumpleanios_hoy: u.es_cumpleanios_hoy,
            });
          }
        }
      }
    }

    // 3) Default assignee según el modo configurado.
    //    El front lo usa para preseleccionar en el <select>.
    const defaultAssignee = this.#pickDefaultAssignee(
      usuariosFmt,
      asignados,
      POTENCIAL_AUTO_ASSIGN_MODE,
    );

    return {
      usuarios: usuariosFmt,
      asignados_del_dia: asignados,
      default_assignee: defaultAssignee,
      mode: POTENCIAL_AUTO_ASSIGN_MODE,
    };
  }

  // Decide qué usuario preseleccionar según el modo activo.
  // Reglas:
  //   - Si el modo es "valorador", intenta el primer usuario con rol
  //     VALORADOR que NO esté de cumpleaños hoy.
  //   - Si todos los VALORADORes cumplen años, cae a cualquier usuario
  //     activo (no super admin) que tampoco esté de cumpleaños.
  //   - Si nadie calza, retorna null.
  //   - El motivo reportado sirve al front para que muestre el hint.
  //
  // Para "auxiliar_dia" se respeta la misma regla de omitir cumpleañeros.
  // Retorna { id, nombre, motivo } o null.
  #pickDefaultAssignee(usuariosFmt, asignadosDelDia, mode) {
    const sinCumple = (u) => u && !u.es_cumpleanios_hoy;
    const cumpleanerosNombres = usuariosFmt
      .filter((u) => u.es_cumpleanios_hoy)
      .map((u) => u.nombre);

    if (mode === "auxiliar_dia") {
      const a = asignadosDelDia.find(sinCumple);
      if (a) {
        return {
          id: a.id,
          nombre: a.nombre,
          motivo: "auxiliar del día",
        };
      }
      return null;
    }

    // Default y modo "valorador".
    const v = usuariosFmt.find(
      (u) => u.rol && matchesAny(u.rol.nombre, [ROL_VALORADOR]) && sinCumple(u),
    );
    if (v) {
      // Si el primero de la lista (por id) era cumpleañero, lo decimos
      // en el motivo para que el front muestre el por qué del cambio.
      const primerValorador = usuariosFmt.find(
        (u) => u.rol && matchesAny(u.rol.nombre, [ROL_VALORADOR]),
      );
      const motivo =
        primerValorador && primerValorador.es_cumpleanios_hoy
          ? `VALORADOR alterno (cumple años: ${primerValorador.nombre})`
          : "VALORADOR";
      return { id: v.id, nombre: v.nombre, motivo };
    }

    // Sin VALORADOR disponible → cualquier usuario activo no-super-admin
    // que NO esté de cumpleaños.
    const fallback = usuariosFmt.find(sinCumple);
    if (fallback) {
      return {
        id: fallback.id,
        nombre: fallback.nombre,
        motivo: `usuario activo (sin VALORADOR libre; cumple: ${cumpleanerosNombres.join(", ") || "ninguno"})`,
      };
    }
    return null;
  }

  // ---------------- Reuniones -----------------------------------------

  // Lista todas las reuniones = actividades cuya tarea es de tipo
  // REUNIÓN (id=2 o nombre contiene "REUNION"). Cada fila trae los
  // datos del prospecto y del usuario que lo registró.
  async getReuniones() {
    // Mismo criterio de tipo que `applyReunionRule` en el front y que
    // `#isReunionTarea` en este mismo service: id=2 o nombre contiene
    // "REUNION" (case + accent insensitive).
    const reuniones = await prisma.actividades.findMany({
      where: {
        estado: true,
        tarea: {
          estado: true,
          tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
            estado: true,
            OR: [
              { id: TIPO_REUNION_ID },
              {
                tipo: { contains: "reunion", mode: "insensitive" },
              },
            ],
          },
        },
      },
      orderBy: [{ fecha_inicio: "desc" }, { hora_inicio: "desc" }],
      include: {
        tarea: {
          select: {
            id: true,
            nombre: true,
            tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
              select: { id: true, tipo: true },
            },
          },
        },
        prospectos: {
          include: {
            nivel_academico: { select: { id: true, nombre: true } },
            carreras: {
              select: {
                id: true,
                nombre: true,
                institucion: { select: { id: true, nombre: true } },
              },
            },
            prospecto_persona: {
              orderBy: { id: "asc" },
              take: 1,
              include: {
                personas: {
                  select: {
                    id: true,
                    nombres: true,
                    apellidos: true,
                    celular: true,
                    email: true,
                  },
                },
              },
            },
            // Tomamos el PRIMER movimiento del historial con estado
            // "registrado" → es el usuario que dio de alta al prospecto
            // (la "asistente administrativa" que pidió el usuario).
            historial_estados_prospecto: {
              where: { estado: "registrado" },
              orderBy: { id: "asc" },
              take: 1,
              include: {
                usuarios: {
                  select: {
                    id: true,
                    usuario: true,
                    personas: {
                      select: { nombres: true, apellidos: true },
                    },
                    roles: { select: { id: true, nombre: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    return (reuniones || []).map((a) => {
      const p = a.prospectos || {};
      const contacto = (p.prospecto_persona || [])[0]?.personas || null;
      const reg = (p.historial_estados_prospecto || [])[0] || null;
      const regUsuario = reg?.usuarios || null;
      const regPersona = regUsuario?.personas || null;
      const asistenteNombre = regPersona
        ? [regPersona.nombres, regPersona.apellidos]
            .filter(Boolean)
            .join(" ")
            .trim() || regUsuario?.usuario || `usuario #${regUsuario?.id || "?"}`
        : regUsuario?.usuario || null;

      return {
        id: a.id,
        fecha: a.fecha_inicio,
        hora: a.hora_inicio, // Date Timetz; el front lo formatea a HH:MM
        detalle: a.tarea?.nombre || null,
        tipo_tarea: a.tarea?.tipo_tarea_tarea_tipo_tareaTotipo_tarea?.tipo || null,
        // Prospecto / cliente
        prospecto_id: p.id || null,
        nombre_cliente: contacto
          ? [contacto.nombres, contacto.apellidos]
              .filter(Boolean)
              .join(" ")
              .trim() || "—"
          : "—",
        celular: contacto?.celular || null,
        email: contacto?.email || null,
        nivel_academico: p.nivel_academico?.nombre || null,
        carrera: p.carreras?.nombre || null,
        universidad: p.carreras?.institucion?.nombre || null,
        link_drive: p.link_drive || null,
        tipo_cliente: p.estado_cliente || null,
        // Asistente administrativa (quien registró el prospecto)
        asistente_administrativa: asistenteNombre,
        asistente_rol: regUsuario?.roles?.nombre || null,
        prioridad: a.prioridad || null,
        estado_progreso: a.estado_progreso || null,
      };
    });
  }

  // ---------------- Listado ------------------------------------------

  // Acepta filtros:
  //   - estado_cliente: 'potencial cliente' | 'cliente' (default: ambos)
  //   - incluirInactivos: boolean (default: false)
  async getAll(filters = {}) {
    const { estado_cliente, incluirInactivos = false } = filters;
    const where = {};
    if (!incluirInactivos) where.estado = true;
    if (estado_cliente) where.estado_cliente = estado_cliente;

    const prospectos = await prisma.prospectos.findMany({
      where,
      orderBy: { id: "desc" },
      include: {
        carreras: {
          select: {
            id: true,
            nombre: true,
            institucion: { select: { id: true, nombre: true } },
          },
        },
        nivel_academico: { select: { id: true, nombre: true } },
        proveedor: { select: { id: true, nombre: true } },
        origen: { select: { id: true, nombre: true } },
        prospecto_persona: {
          include: {
            personas: {
              select: {
                id: true,
                nombres: true,
                apellidos: true,
                celular: true,
                tipoDocumento_id: true,
                numero_documento: true,
              },
            },
          },
        },
        actividades: {
          where: { estado: true },
          orderBy: { id: "asc" },
          take: 1,
          include: {
            tarea: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    return prospectos.map((p) => this.#shapeProspecto(p));
  }

  // ---------------- Detalle ------------------------------------------

  async getById(id) {
    const p = await prisma.prospectos.findUnique({
      where: { id: Number(id) },
      include: {
        carreras: {
          select: {
            id: true,
            nombre: true,
            institucion: { select: { id: true, nombre: true } },
          },
        },
        nivel_academico: { select: { id: true, nombre: true } },
        proveedor: { select: { id: true, nombre: true } },
        origen: { select: { id: true, nombre: true } },
        prospecto_persona: {
          include: {
            personas: {
              select: {
                id: true,
                nombres: true,
                apellidos: true,
                celular: true,
                tipoDocumento_id: true,
                numero_documento: true,
              },
            },
          },
        },
        actividades: {
          orderBy: { id: "asc" },
          include: { tarea: { select: { id: true, nombre: true } } },
        },
        drive_links: {
          orderBy: { id: "desc" },
          select: { id: true, link_drive: true, created_at: true },
        },
        historial_estados_prospecto: {
          orderBy: { id: "asc" },
          include: {
            usuarios: {
              select: {
                id: true,
                usuario: true,
                personas: {
                  select: { id: true, nombres: true, apellidos: true },
                },
              },
            },
          },
        },
      },
    });
    if (!p) return null;

    // El schema de `actividades` no declara la relación a `usuarios`
    // (sólo hay un `usuario_id` "suelto"), así que Prisma no puede hacer
    // `include` desde actividades hacia usuarios. Hacemos un query aparte
    // para los usuarios asignados a las actividades de este prospecto y
    // armamos un mapa { id: { id, usuario, nombre } } que pasamos al
    // shaper para que pueda pintarlos en la lista de actividades.
    const usuarioIds = Array.from(
      new Set(
        (p.actividades || [])
          .map((a) => (a.usuario_id != null ? Number(a.usuario_id) : null))
          .filter((x) => x != null),
      ),
    );
    let usuariosById = {};
    if (usuarioIds.length > 0) {
      const us = await prisma.usuarios.findMany({
        where: { id: { in: usuarioIds } },
        select: {
          id: true,
          usuario: true,
          personas: { select: { nombres: true, apellidos: true } },
        },
      });
      for (const u of us) {
        const per = u.personas;
        const nombre = per
          ? [per.nombres, per.apellidos].filter(Boolean).join(" ").trim()
          : null;
        usuariosById[Number(u.id)] = {
          id: Number(u.id),
          usuario: u.usuario,
          nombre: nombre || u.usuario || null,
        };
      }
    }

    return this.#shapeProspecto(p, { full: true, usuariosById });
  }

  // ---------------- Historial del prospecto ----------------------------
  //
  // Devuelve la lista de movimientos del prospecto
  // (`historial_estados_prospecto`) con los datos del usuario que
  // disparó cada movimiento. Se usa desde el modal de detalle del
  // Kanban para que el usuario vea el timeline de:
  //   * Creación del prospecto
  //   * Actividad agregada
  //   * Actividad reasignada
  //   * Convertido a cliente
  //   * etc.
  //
  // Si el prospecto no existe, devuelve null. Si existe pero no tiene
  // historial, devuelve un array vacío.
  async getHistorial(prospectoId) {
    const idNum = Number(prospectoId);
    if (!idNum) {
      const e = new Error("id de prospecto inválido.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    const p = await prisma.prospectos.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!p) return null;

    const rows = await prisma.historial_estados_prospecto.findMany({
      where: { prospecto_id: idNum },
      orderBy: [{ id: "asc" }],
      include: {
        usuarios: {
          select: {
            id: true,
            usuario: true,
            personas: { select: { nombres: true, apellidos: true } },
          },
        },
      },
    });

    return rows.map((r) => {
      const u = r.usuarios;
      const persona = u?.personas;
      const nombre = persona
        ? [persona.nombres, persona.apellidos].filter(Boolean).join(" ").trim()
        : null;
      return {
        id: r.id,
        prospecto_id: r.prospecto_id,
        estado: r.estado || null,
        comentario: r.comentario || null,
        fecha_inicio: r.fecha_inicio, // Timestamptz → ISO UTC
        fecha_fin: r.fecha_fin,
        usuario: u
          ? {
              id: Number(u.id),
              usuario: u.usuario,
              nombre: nombre || u.usuario || null,
            }
          : null,
        // Flag de UI: marca los eventos de re-agenda para que el
        // frontend les dé un tratamiento visual diferenciado (icono +
        // color). El helper es robusto a evoluciones del string en
        // español (acentos, mayúsculas, espacios).
        es_reasignada:
          typeof r.comentario === "string" &&
          r.comentario
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .includes("actividad reasignada"),
        es_agregada:
          typeof r.comentario === "string" &&
          r.comentario
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .includes("actividad agregada"),
      };
    });
  }

  // ---------------- Crear --------------------------------------------

  async create(payload, usuarioId = null) {
    const err = this.#validateCreate(payload);
    if (err) {
      const e = new Error(err);
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Validación adicional: el usuario asignado, si viene, debe existir,
    // estar activo y no ser SUPER ADMIN.
    if (payload.usuario_asignado_id) {
      const asig = await prisma.usuarios.findUnique({
        where: { id: Number(payload.usuario_asignado_id) },
        select: { id: true, estado: true, roles: { select: { id: true, nombre: true } } },
      });
      if (!asig) {
        const e = new Error("El usuario asignado no existe.");
        e.code = "BAD_REQUEST";
        throw e;
      }
      if (!asig.estado) {
        const e = new Error("El usuario asignado está inactivo.");
        e.code = "BAD_REQUEST";
        throw e;
      }
      if (asig.roles && matchesAny(asig.roles.nombre, ["super admin"])) {
        const e = new Error("No se puede asignar a un SUPER ADMIN.");
        e.code = "BAD_REQUEST";
        throw e;
      }
    }

    const {
      titulo_prospecto,
      institucion_id,
      carrera_id,
      nivel_academico_id,
      fecha_entrega,
      prioridad,
      origen_id,
      contenido,
      link_drive,
      tarea_id,
      // tipo_cliente / proveedor_id ya NO se piden aquí: los potenciales
      // son siempre PROPIO. Los clientes de proveedor se registran en
      // /registrar-clientes-proveedores.
      contactos, // [{ nombres, apellidos, celular }]
      fecha_asignacion, // "YYYY-MM-DD" — día en que se agenda la actividad
      usuario_asignado_id, // id del usuario responsable (auxiliar u otro)
      hora_reunion, // "HH:MM" — solo aplica cuando la tarea es tipo REUNION
    } = payload;

    return await prisma.$transaction(async (tx) => {
      // 1) Personas (creamos una por contacto; si ya existe por celular
      //    y matchea nombre+apellido, la reutilizamos).
      const personaIds = [];
      for (const c of contactos) {
        const persona = await this.#upsertPersona(tx, c);
        personaIds.push(persona.id);
      }

      // 2) Prospecto
      //    Prisma 7 no acepta los escalares de FK cuando hay relación
      //    definida; usamos `connect` con la relación.
      const prospecto = await tx.prospectos.create({
        data: {
          titulo_prospecto: titulo_prospecto
            ? String(titulo_prospecto).trim()
            : null,
          ...(carrera_id
            ? { carreras: { connect: { id: Number(carrera_id) } } }
            : {}),
          ...(nivel_academico_id
            ? {
                nivel_academico: {
                  connect: { id: Number(nivel_academico_id) },
                },
              }
            : {}),
          ...(origen_id
            ? { origen: { connect: { id: Number(origen_id) } } }
            : {}),
          fecha_entrega: fecha_entrega ? new Date(fecha_entrega) : null,
          prioridad: prioridad || null,
          contenido: contenido || null,
          link_drive: link_drive ? String(link_drive).trim() : null,
          estado_cliente: "potencial cliente",
          // los potenciales son siempre PROPIO (sin proveedor)
          fecha_contacto: new Date(),
          estado: true,
        },
      });

      // 3) prospecto_persona
      await tx.prospecto_persona.createMany({
        data: personaIds.map((pid) => ({
          prospecto_id: prospecto.id,
          persona_id: pid,
        })),
      });

      // 4) drive_links (historial) — solo si viene un link
      if (link_drive && String(link_drive).trim()) {
        await tx.drive_links.create({
          data: {
            prospecto_id: prospecto.id,
            link_drive: String(link_drive).trim(),
            created_at: new Date(),
          },
        });
      }

      // 5) Actividad con la tarea asignada.
      //    Si vienen `fecha_asignacion` y `usuario_asignado_id`, los
      //    propagamos a la actividad (es lo que la pinta luego en el
      //    calendario del auxiliar).
      //
      //    Regla de REUNIÓN: si la tarea seleccionada es de tipo
      //    REUNIONES, IGNORAMOS el `usuario_asignado_id` del form y
      //    forzamos al primer usuario activo con rol
      //    ASISTENTE DE PRODUCCIÓN (id = ROL_ASISTENTE_PROD_ID).
      //    La fecha y la hora son elegidas por el usuario en el modal
      //    (con sugerencia de hoy). Si no hay asistente activo, el
      //    create falla con BAD_REQUEST.
      const isReunion = await this.#isReunionTarea(tx, tarea_id);
      let fechaAsig = fecha_asignacion ? new Date(fecha_asignacion) : null;
      let usuarioAsig = usuario_asignado_id
        ? Number(usuario_asignado_id)
        : null;
      let overrideReason = null;

      if (isReunion) {
        // Fecha: respetamos la que venga del form. Si no viene,
        // usamos hoy en horario local (YYYY-MM-DD).
        if (!fechaAsig || Number.isNaN(fechaAsig.getTime())) {
          const todayYmd = getYmdLocal(new Date());
          const [yy, mm, dd] = todayYmd.split("-").map(Number);
          fechaAsig = new Date(yy, mm - 1, dd);
        }

        const asistente = await tx.usuarios.findFirst({
          where: { estado: true, rol_id: ROL_ASISTENTE_PROD_ID },
          orderBy: { id: "asc" },
          select: {
            id: true,
            personas: { select: { nombres: true, apellidos: true } },
          },
        });
        if (!asistente) {
          const e = new Error(
            "No hay un ASISTENTE DE PRODUCCIÓN activo para agendar la reunión. Contacta al administrador.",
          );
          e.code = "BAD_REQUEST";
          throw e;
        }
        usuarioAsig = asistente.id;
        const nombreAsistente = asistente.personas
          ? [asistente.personas.nombres, asistente.personas.apellidos]
              .filter(Boolean)
              .join(" ")
              .trim() || `usuario #${asistente.id}`
          : `usuario #${asistente.id}`;
        overrideReason = `Reunión → asignada a ${nombreAsistente} (ASISTENTE DE PRODUCCIÓN).`;
      }

      // Duración estimada. OJO: `tarea.horas_estimadas` se guarda en
      // MINUTOS (el nombre del campo quedó histórico, pero la unidad
      // real es minutos). Si la tarea no tiene valor, default 60 min.
      const tHorasRaw = await tx.tarea.findUnique({
        where: { id: Number(tarea_id) },
        select: { horas_estimadas: true },
      });
      const minutosEstimados =
        tHorasRaw && tHorasRaw.horas_estimadas
          ? Number(tHorasRaw.horas_estimadas)
          : 60;

      // Si vamos a agendar la actividad en el calendario del usuario,
      // validamos contra: (1) feriados, (2) cumpleaños del usuario,
      // (3) tipo de jornada (full time o part time) y (4) horario
      // registrado + huecos libres del día.
      //
      // Excepción: cuando la tarea es de tipo REUNIÓN no se pinta
      // nada en el calendario de la ASISTENTE DE PRODUCCIÓN, así que
      // tampoco se ejecutan estas validaciones (la reunión puede
      // existir aunque el asistente esté de cumpleaños, no tenga
      // jornada FT/PT o no tenga huecos libres hoy). Eso sí: la
      // reunión SÍ requiere una `hora_reunion` (HH:MM) que el usuario
      // elige en el modal y se guarda en `actividades.hora_inicio`.
      let horaInicio = null;
      let horaFin = null;

      if (isReunion) {
        const hr = String(hora_reunion || "").trim();
        if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(hr)) {
          const e = new Error(
            "Para una tarea de tipo REUNIÓN debes indicar la hora de la reunión (HH:MM).",
          );
          e.code = "BAD_REQUEST";
          throw e;
        }
        horaInicio = hr;
      }

      if (usuarioAsig && fechaAsig && !isReunion) {
        // Parseo la fecha como local (mismo fix de off-by-one que ya
        // usamos en `getUsuariosAsignablesPorFecha`). Si la regla de
        // reunión sobreescribió la fecha, usamos la YMD resuelta, NO
        // el `fecha_asignacion` original del payload.
        const fechaAsigYmd = isReunion
          ? getYmdLocal(fechaAsig)
          : fecha_asignacion;
        const fm = String(fechaAsigYmd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        const fechaLocal = fm
          ? new Date(Number(fm[1]), Number(fm[2]) - 1, Number(fm[3]))
          : new Date(fechaAsigYmd);

        // (1) Feriados: si la fecha cae en `feriados` activo, rechazamos.
        const feriado = await tx.feriados.findFirst({
          where: {
            fecha: fechaLocal,
            estado: true,
          },
          select: { id: true, nombre: true },
        });
        if (feriado) {
          const e = new Error(
            `La fecha seleccionada es feriado${feriado.nombre ? `: ${feriado.nombre}` : "."}`,
          );
          e.code = "BAD_REQUEST";
          throw e;
        }

        // (2) Cumpleaños: comparamos día + mes con la fecha_nacimiento
        //     del usuario (no el año, para que aplique todos los años).
        const usuarioFull = await tx.usuarios.findUnique({
          where: { id: usuarioAsig },
          select: {
            id: true,
            roles: { select: { id: true, nombre: true } },
            tipo_jornada: { select: { id: true, nombre_jornada: true } },
            personas: {
              select: {
                nombres: true,
                apellidos: true,
                fecha_nacimiento: true,
              },
            },
          },
        });
        const cumpleanero = usuarioFull
          ? isBirthdayOn(
              usuarioFull.personas?.fecha_nacimiento,
              fechaLocal,
            )
          : false;
        if (cumpleanero) {
          const nombreCompleto = usuarioFull?.personas
            ? [usuarioFull.personas.nombres, usuarioFull.personas.apellidos]
                .filter(Boolean)
                .join(" ")
                .trim() || "El usuario"
            : "El usuario";
          const e = new Error(
            `${nombreCompleto} está de cumpleaños. No se puede asignar este día. Elige a otro usuario.`,
          );
          e.code = "BAD_REQUEST";
          throw e;
        }

        // (3) Tipo de jornada: el usuario debe tener una jornada
        //     "full time" o "part time" (case + accent insensitive).
        const nombreJornada = usuarioFull?.tipo_jornada?.nombre_jornada;
        if (!nombreJornada || !matchesAny(nombreJornada, ["full time", "part time"])) {
          const e = new Error(
            "El usuario debe tener un tipo de jornada válido (full time o part time).",
          );
          e.code = "BAD_REQUEST";
          throw e;
        }

        // (4) Horario registrado + huecos libres: respetando
        //     `horario_jornada_detalle`, encontramos el primer bloque
        //     libre con capacidad para `minutosEstimados`. Si la fecha
        //     es hoy y la hora actual supera el inicio del bloque, se
        //     parte desde la hora actual.
        const slot = await this.#findFreeSlotInSchedule(
          tx,
          usuarioAsig,
          fechaLocal,
          minutosEstimados,
        );
        horaInicio = minutosToHms(slot.ini);
        horaFin = minutosToHms(slot.fin);
      }

      const actividad = await tx.actividades.create({
        data: {
          prospecto_id: prospecto.id,
          tarea_id: Number(tarea_id),
          usuario_id: usuarioAsig,
          // Auditoría: id del usuario de la sesión que REGISTRÓ esta
          // actividad. Nullable si la petición no trae sesión.
          usuario_register: usuarioId ? Number(usuarioId) : null,
          prioridad: prioridad || null,
          estado_progreso: "pendiente",
          estado: true,
          fecha_inicio: fechaAsig,
          hora_inicio: toTime(horaInicio),
          tiempo_estimado_minutos: minutosEstimados,
          // El color se asigna aleatoriamente desde una paleta fija.
          // Ya no se acepta desde el form (se removió del modal).
          color: pickRandomColor(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // 5a) Inicializar historial de estados con la fila "pendiente"
      //     desde la creación de la actividad. Se cierra recién cuando
      //     pase a "en_progreso" o "completada".
      await ActividadEstadoHistorialService.transicion(
        tx,
        actividad.id,
        "pendiente",
        new Date(),
        { creadaEn: actividad.created_at },
      );

      // 5b) Insertamos en `horario_usuario` para que aparezca en el
      //     calendario del auxiliar. Solo si hay usuario + fecha.
      //
      //     Excepción REUNIÓN: cuando la tarea es de tipo REUNIÓN no
      //     se pinta bloque en el calendario del ASISTENTE DE
      //     PRODUCCIÓN (la reunión se registra solo en `actividades`
      //     con fecha=hoy, sin ocupar su agenda).
      //
      //     Excepción VALORADOR: los usuarios con rol VALORADOR NO
      //     reciben el slot en su calendario al crear la actividad —
      //     se les pinta recién cuando la marcan como completada
      //     (ver #insertHorarioUsuarioValoradorAlCompletar).
      if (usuarioAsig && fechaAsig && !isReunion) {
        await this.#createHorarioUsuarioSiNoEsValorador(tx, {
          usuarioId: usuarioAsig,
          actividadId: actividad.id,
          fecha: fechaAsig,
          horaInicio: toTime(horaInicio),
          horaFin: toTime(horaFin),
          duracionMinutos: minutosEstimados,
          tipo: "actividad",
          categoria: "potencial_cliente",
        });
      }

      // 6) Historial de estados — estado inicial del prospecto
      await tx.historial_estados_prospecto.create({
        data: {
          prospecto_id: prospecto.id,
          estado: "registrado",
          usuario_id: usuarioId ? Number(usuarioId) : null,
          comentario: "Registro inicial del potencial cliente.",
          fecha_inicio: new Date(),
          fecha_fin: null,
        },
      });

      // 7) Notificaciones a:
      //    - Roles administrativos tradicionales (super admin, administrador, jefe de producción)
      //    - AUXILIAR DE PRODUCCIÓN asignado al día de hoy (tabla asignacion_dias)
      //    - JEFA DE VENTAS (siempre)
      //    - Usuario explícitamente asignado en el formulario (si no estaba ya)
      const recipientIds = await this.#resolveNotifRecipients(
        tx,
        usuarioId,
        usuarioAsig,
      );

      let insertedNotifs = [];
      if (recipientIds.length > 0) {
        const tituloNotif = "Nuevo potencial cliente registrado";
        const contactoTxt = (contactos || [])
          .map((c) =>
            [c?.nombres, c?.apellidos].filter(Boolean).join(" ").trim(),
          )
          .filter(Boolean)
          .join(", ");
        const baseMensaje = titulo_prospecto
          ? `${titulo_prospecto}${contactoTxt ? ` — ${contactoTxt}` : ""}`
          : contactoTxt || "Sin título";
        const mensaje = baseMensaje.slice(0, 255);

        // 1 = alta, 2 = media, 3 = baja (sigue el orden del prospecto)
        const prioridadNum =
          prioridad === "ALTA"
            ? 1
            : prioridad === "MEDIA"
              ? 2
              : prioridad === "BAJA"
                ? 3
                : null;

        // create en loop (no createMany) para poder devolver los IDs
        // al controller y que este emita el evento por socket.
        for (const uid of recipientIds) {
          const notif = await tx.notificaciones.create({
            data: {
              usuario_id: uid,
              remitente_id: usuarioId ? Number(usuarioId) : null,
              titulo: tituloNotif,
              mensaje,
              tipo: "potencial_cliente",
              prioridad: prioridadNum,
              es_leida: false,
              created_at: new Date(),
              updated_at: new Date(),
            },
          });
          insertedNotifs.push(notif);
        }
      }

      return { id: prospecto.id, notifications: insertedNotifs };
    });
  }

  // ---------------- Agregar actividad a un prospecto existente --------

  // Reutiliza la misma lógica de scheduling que `create` (regla de
  // REUNIÓN, ASISTENTE DE PRODUCCIÓN, slot libre, horario_usuario) pero
  // sin volver a crear el prospecto ni sus contactos. Inserta una fila
  // en `actividades` (y en `horario_usuario` si NO es reunión) y
  // registra el movimiento en `historial_estados_prospecto`.
  async addActividad(prospectoId, payload, usuarioId = null) {
    const idNum = Number(prospectoId);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      const e = new Error("ID de prospecto inválido.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const err = this.#validateAddActividad(payload);
    if (err) {
      const e = new Error(err);
      e.code = "BAD_REQUEST";
      throw e;
    }

    const {
      tarea_id,
      fecha_asignacion,
      usuario_asignado_id,
      hora_reunion,
      prioridad,
    } = payload;

    return await prisma.$transaction(async (tx) => {
      // 1) Verificar que el prospecto existe
      const prospecto = await tx.prospectos.findUnique({
        where: { id: idNum },
        select: {
          id: true,
          titulo_prospecto: true,
          prospecto_persona: {
            select: {
              personas: { select: { nombres: true, apellidos: true } },
            },
          },
        },
      });
      if (!prospecto) {
        const e = new Error("Potencial cliente no encontrado.");
        e.code = "NOT_FOUND";
        throw e;
      }

      // 2) Validar usuario asignado: existe, activo, no SUPER ADMIN
      if (usuario_asignado_id) {
        const asig = await tx.usuarios.findUnique({
          where: { id: Number(usuario_asignado_id) },
          select: {
            id: true,
            estado: true,
            roles: { select: { id: true, nombre: true } },
          },
        });
        if (!asig) {
          const e = new Error("El usuario asignado no existe.");
          e.code = "BAD_REQUEST";
          throw e;
        }
        if (!asig.estado) {
          const e = new Error("El usuario asignado está inactivo.");
          e.code = "BAD_REQUEST";
          throw e;
        }
        if (asig.roles && matchesAny(asig.roles.nombre, ["super admin"])) {
          const e = new Error("No se puede asignar a un SUPER ADMIN.");
          e.code = "BAD_REQUEST";
          throw e;
        }
      }

      // 3) Regla REUNIÓN: si la tarea es de tipo reunión, se fuerza la
      //    asignación al ASISTENTE DE PRODUCCIÓN activo, sin pintar
      //    bloque en su calendario (no se inserta horario_usuario).
      const isReunion = await this.#isReunionTarea(tx, tarea_id);
      let fechaAsig = fecha_asignacion ? new Date(fecha_asignacion) : null;
      let usuarioAsig = usuario_asignado_id
        ? Number(usuario_asignado_id)
        : null;

      if (isReunion) {
        if (!fechaAsig || Number.isNaN(fechaAsig.getTime())) {
          const todayYmd = getYmdLocal(new Date());
          const [yy, mm, dd] = todayYmd.split("-").map(Number);
          fechaAsig = new Date(yy, mm - 1, dd);
        }
        const asistente = await tx.usuarios.findFirst({
          where: { estado: true, rol_id: ROL_ASISTENTE_PROD_ID },
          orderBy: { id: "asc" },
          select: {
            id: true,
            personas: { select: { nombres: true, apellidos: true } },
          },
        });
        if (!asistente) {
          const e = new Error(
            "No hay un ASISTENTE DE PRODUCCIÓN activo para agendar la reunión. Contacta al administrador.",
          );
          e.code = "BAD_REQUEST";
          throw e;
        }
        usuarioAsig = asistente.id;
      }

      // 4) Duración estimada de la tarea (mismo criterio que en create)
      const tHorasRaw = await tx.tarea.findUnique({
        where: { id: Number(tarea_id) },
        select: { horas_estimadas: true },
      });
      const minutosEstimados =
        tHorasRaw && tHorasRaw.horas_estimadas
          ? Number(tHorasRaw.horas_estimadas)
          : 60;

      // 5) Calcular hora_inicio / hora_fin
      let horaInicio = null;
      let horaFin = null;

      if (isReunion) {
        const hr = String(hora_reunion || "").trim();
        if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(hr)) {
          const e = new Error(
            "Para una tarea de tipo REUNIÓN debes indicar la hora de la reunión (HH:MM).",
          );
          e.code = "BAD_REQUEST";
          throw e;
        }
        horaInicio = hr;
      }

      if (usuarioAsig && fechaAsig && !isReunion) {
        const fechaAsigYmd = isReunion
          ? getYmdLocal(fechaAsig)
          : fecha_asignacion;
        const fm = String(fechaAsigYmd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        const fechaLocal = fm
          ? new Date(Number(fm[1]), Number(fm[2]) - 1, Number(fm[3]))
          : new Date(fechaAsigYmd);

        // (1) Feriados
        const feriado = await tx.feriados.findFirst({
          where: { fecha: fechaLocal, estado: true },
          select: { id: true, nombre: true },
        });
        if (feriado) {
          const e = new Error(
            `La fecha seleccionada es feriado${feriado.nombre ? `: ${feriado.nombre}` : "."}`,
          );
          e.code = "BAD_REQUEST";
          throw e;
        }

        // (2) Cumpleaños
        const usuarioFull = await tx.usuarios.findUnique({
          where: { id: usuarioAsig },
          select: {
            id: true,
            roles: { select: { id: true, nombre: true } },
            tipo_jornada: { select: { id: true, nombre_jornada: true } },
            personas: {
              select: {
                nombres: true,
                apellidos: true,
                fecha_nacimiento: true,
              },
            },
          },
        });
        const cumpleanero = usuarioFull
          ? isBirthdayOn(usuarioFull.personas?.fecha_nacimiento, fechaLocal)
          : false;
        if (cumpleanero) {
          const nombreCompleto = usuarioFull?.personas
            ? [
                usuarioFull.personas.nombres,
                usuarioFull.personas.apellidos,
              ]
                .filter(Boolean)
                .join(" ")
                .trim() || "El usuario"
            : "El usuario";
          const e = new Error(
            `${nombreCompleto} está de cumpleaños. No se puede asignar este día. Elige a otro usuario.`,
          );
          e.code = "BAD_REQUEST";
          throw e;
        }

        // (3) Tipo de jornada
        const nombreJornada = usuarioFull?.tipo_jornada?.nombre_jornada;
        if (
          !nombreJornada ||
          !matchesAny(nombreJornada, ["full time", "part time"])
        ) {
          const e = new Error(
            "El usuario debe tener un tipo de jornada válido (full time o part time).",
          );
          e.code = "BAD_REQUEST";
          throw e;
        }

        // (4) Hueco libre
        const slot = await this.#findFreeSlotInSchedule(
          tx,
          usuarioAsig,
          fechaLocal,
          minutosEstimados,
        );
        horaInicio = minutosToHms(slot.ini);
        horaFin = minutosToHms(slot.fin);
      }

      // 6) Insertar la actividad
      const actividad = await tx.actividades.create({
        data: {
          prospecto_id: prospecto.id,
          tarea_id: Number(tarea_id),
          usuario_id: usuarioAsig,
          // Auditoría: id del usuario de la sesión que REGISTRÓ esta
          // actividad. Nullable si la petición no trae sesión.
          usuario_register: usuarioId ? Number(usuarioId) : null,
          prioridad: prioridad || null,
          estado_progreso: "pendiente",
          estado: true,
          fecha_inicio: fechaAsig,
          hora_inicio: toTime(horaInicio),
          tiempo_estimado_minutos: minutosEstimados,
          color: pickRandomColor(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // 6b) Inicializar historial: fila "pendiente" desde la creación.
      await ActividadEstadoHistorialService.transicion(
        tx,
        actividad.id,
        "pendiente",
        new Date(),
        { creadaEn: actividad.created_at },
      );

      // 7) Horario en el calendario (solo si NO es reunión).
      //    Excepción VALORADOR: el slot se inserta recién cuando
      //    completa la actividad (ver #createHorarioUsuarioSiNoEsValorador).
      if (usuarioAsig && fechaAsig && !isReunion) {
        await this.#createHorarioUsuarioSiNoEsValorador(tx, {
          usuarioId: usuarioAsig,
          actividadId: actividad.id,
          fecha: fechaAsig,
          horaInicio: toTime(horaInicio),
          horaFin: toTime(horaFin),
          duracionMinutos: minutosEstimados,
          tipo: "actividad",
          categoria: "potencial_cliente",
        });
      }

      // 8) Historial — movimiento de "actualizado" con detalle
      const tituloTarea = await tx.tarea.findUnique({
        where: { id: Number(tarea_id) },
        select: { nombre: true },
      });
      const comentarioHistorial = `Actividad agregada: ${tituloTarea?.nombre || `tarea #${tarea_id}`}${
        fechaAsig ? ` (${getYmdLocal(fechaAsig)})` : ""
      }.`;
      await tx.historial_estados_prospecto.create({
        data: {
          prospecto_id: prospecto.id,
          estado: "actualizado",
          usuario_id: usuarioId ? Number(usuarioId) : null,
          comentario: comentarioHistorial,
          fecha_inicio: new Date(),
          fecha_fin: null,
        },
      });

      // 9) Notificaciones a los mismos destinatarios que en create
      const recipientIds = await this.#resolveNotifRecipients(
        tx,
        usuarioId,
        usuarioAsig,
      );

      let insertedNotifs = [];
      if (recipientIds.length > 0) {
        const tituloNotif = "Nueva actividad agregada";
        const contactoTxt = (prospecto.prospecto_persona || [])
          .map((pp) =>
            [pp?.personas?.nombres, pp?.personas?.apellidos]
              .filter(Boolean)
              .join(" ")
              .trim(),
          )
          .filter(Boolean)
          .join(", ");
        const baseMensaje = prospecto.titulo_prospecto
          ? `${prospecto.titulo_prospecto}${contactoTxt ? ` — ${contactoTxt}` : ""}`
          : contactoTxt || "Sin título";
        const mensaje = `${comentarioHistorial} ${baseMensaje}`.slice(0, 255);

        const prioridadNum =
          prioridad === "ALTA"
            ? 1
            : prioridad === "MEDIA"
              ? 2
              : prioridad === "BAJA"
                ? 3
                : null;

        for (const uid of recipientIds) {
          const notif = await tx.notificaciones.create({
            data: {
              usuario_id: uid,
              remitente_id: usuarioId ? Number(usuarioId) : null,
              titulo: tituloNotif,
              mensaje,
              tipo: "potencial_cliente",
              prioridad: prioridadNum,
              es_leida: false,
              created_at: new Date(),
              updated_at: new Date(),
            },
          });
          insertedNotifs.push(notif);
        }
      }

      return { id: prospecto.id, actividadId: actividad.id, notifications: insertedNotifs };
    });
  }

  // ---------------- Editar -------------------------------------------

  async update(id, payload, usuarioId = null) {
    const idNum = Number(id);
    const existing = await prisma.prospectos.findUnique({
      where: { id: idNum },
      select: { id: true, link_drive: true },
    });
    if (!existing) return null;

    // En el nuevo flujo de edición, el frontend sólo envía los campos
    // del prospecto + contactos (sin tarea_id, fecha_asignacion ni
    // usuario_asignado_id: la actividad principal se gestiona vía
    // "Agregar actividad" y no se modifica desde acá). Por eso usamos
    // una validación específica para update, en vez de `#validateCreate`.
    const err = this.#validateUpdate(payload);
    if (err) {
      const e = new Error(err);
      e.code = "BAD_REQUEST";
      throw e;
    }

    const {
      titulo_prospecto,
      institucion_id,
      carrera_id,
      nivel_academico_id,
      fecha_entrega,
      prioridad,
      origen_id,
      contenido,
      link_drive,
      tipo_cliente,
      proveedor_id,
      contactos,
    } = payload;

    const linkDriveTrim = link_drive ? String(link_drive).trim() : null;
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      // 1) Prospecto
      //    Prisma 7 no acepta los escalares de FK cuando hay relación
      //    definida; usamos `connect` con la relación.
      await tx.prospectos.update({
        where: { id: idNum },
        data: {
          titulo_prospecto: titulo_prospecto
            ? String(titulo_prospecto).trim()
            : null,
          ...(carrera_id
            ? { carreras: { connect: { id: Number(carrera_id) } } }
            : { carreras: { disconnect: true } }),
          ...(nivel_academico_id
            ? {
                nivel_academico: {
                  connect: { id: Number(nivel_academico_id) },
                },
              }
            : { nivel_academico: { disconnect: true } }),
          ...(origen_id
            ? { origen: { connect: { id: Number(origen_id) } } }
            : { origen: { disconnect: true } }),
          fecha_entrega: fecha_entrega ? new Date(fecha_entrega) : null,
          prioridad: prioridad || null,
          contenido: contenido || null,
          link_drive: linkDriveTrim,
          ...(tipo_cliente === "PROVEEDOR" && proveedor_id
            ? { proveedor: { connect: { id: Number(proveedor_id) } } }
            : tipo_cliente === "PROVEEDOR"
              ? {}
              : { proveedor: { disconnect: true } }),
          updated_at: now,
        },
      });

      // 2) Reemplazar contactos — sólo si el payload los trae.
      //    (El front siempre los manda en el flujo actual, pero
      //    dejamos la guarda por si en el futuro se quisiera hacer un
      //    update "parcial" sin tocar contactos.)
      if (Array.isArray(contactos)) {
        await tx.prospecto_persona.deleteMany({
          where: { prospecto_id: idNum },
        });

        const personaIds = [];
        for (const c of contactos) {
          const persona = await this.#upsertPersona(tx, c);
          personaIds.push(persona.id);
        }
        if (personaIds.length) {
          await tx.prospecto_persona.createMany({
            data: personaIds.map((pid) => ({
              prospecto_id: idNum,
              persona_id: pid,
            })),
          });
        }
      }

      // 3) drive_links
      if (
        linkDriveTrim &&
        linkDriveTrim !== (existing.link_drive || null)
      ) {
        await tx.drive_links.create({
          data: {
            prospecto_id: idNum,
            link_drive: linkDriveTrim,
            created_at: now,
          },
        });
      }

      // 4) Actividad principal: ya NO se modifica desde acá. Se
      //    gestiona vía el endpoint "Agregar actividad"
      //    (POST /:id/actividades). Si quisieras cambiar la tarea o
      //    prioridad de la actividad principal, hazlo desde el módulo
      //    de actividades (futuro).

      // 5) Historial de estados — cerrar el estado activo y abrir uno nuevo
      const activo = await tx.historial_estados_prospecto.findFirst({
        where: { prospecto_id: idNum, fecha_fin: null },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      if (activo) {
        await tx.historial_estados_prospecto.update({
          where: { id: activo.id },
          data: { fecha_fin: now },
        });
      }
      await tx.historial_estados_prospecto.create({
        data: {
          prospecto_id: idNum,
          estado: "actualizado",
          usuario_id: usuarioId ? Number(usuarioId) : null,
          comentario: "Edición del potencial cliente.",
          fecha_inicio: now,
          fecha_fin: null,
        },
      });

      return { id: idNum };
    });
  }

  // ---------------- Scheduling (helpers) ---------------------------

  // Encuentra el primer hueco libre de `minutosEstimados` dentro del
  // horario del usuario (`horario_jornada_detalle`) para la fecha dada.
  //
  // Reglas:
  //   1) Se itera cada bloque del horario del día en orden.
  //   2) Si la fecha es HOY, el cursor de búsqueda arranca en
  //      max(inicioBloque, ahora) para no asignar en el pasado.
  //   3) Se restan los huecos ocupados por entradas existentes en
  //      `horario_usuario` (cualquier `categoria`/`tipo`, sólo estado=true).
  //   4) El primer rango libre >= minutosEstimados es el resultado.
  //
  // Lanza Error con code="BAD_REQUEST" si:
  //   - El día no es laborable (domingo, etc).
  //   - El usuario no tiene bloques de horario ese día.
  //   - No hay ningún hueco lo suficientemente grande en todo el día.
  async #findFreeSlotInSchedule(tx, usuarioAsig, fechaLocal, minutosEstimados) {
    const diaId = DAY_ID_BY_GETDAY[fechaLocal.getDay()] || null;
    if (!diaId) {
      const e = new Error(
        "La fecha seleccionada no es un día laborable.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    // FIX QUIRÚRGICO Timetz: usamos raw SQL + to_char(hora_::time, 'HH24:MI:SS')
    // para leer las columnas Timetz como string wall-clock "HH:MM:SS".
    // Prisma descarta el offset de Timetz y devuelve Date en UTC, lo que
    // en un server con TZ != UTC (ej. Colombia GMT-5) hace que getHours()
    // devuelva horas desfasadas y la validación de hueco libre falle.
    //
    // OJO: Postgres no tiene un overload de to_char(timetz, text) — hay
    // que castear primero a time (sin zona) con `::time`. El cast
    // devuelve la hora wall-clock tal como está guardada, sin aplicar
    // conversión de zona.
    const bloquesRows = await tx.$queryRawUnsafe(
      `SELECT to_char(hora_inicio::time, 'HH24:MI:SS') AS hi,
              to_char(hora_fin::time,    'HH24:MI:SS') AS hf
         FROM horario_jornada_detalle
        WHERE usuario_id = $1
          AND dia_semana = $2
          AND estado = true
          AND hora_inicio IS NOT NULL
          AND hora_fin IS NOT NULL
        ORDER BY hora_inicio ASC`,
      usuarioAsig,
      diaId,
    );
    if (bloquesRows.length === 0) {
      const e = new Error(
        "El usuario no tiene horario registrado para el día seleccionado.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    const bloquesMin = bloquesRows
      .map((b) => ({ ini: toMinFromHms(b.hi), fin: toMinFromHms(b.hf) }))
      .filter((b) => b.ini != null && b.fin != null);

    // Actividades ya agendadas ese día. Usamos SQL crudo para evitar
    // líos con `@db.Date` + TZ al comparar `fecha = $1::date` y, ahora
    // también, para leer Timetz correctamente con to_char.
    const ymd = getYmdLocal(fechaLocal);
    const rowsOcupados = await tx.$queryRawUnsafe(
      `SELECT to_char(hora_inicio::time, 'HH24:MI:SS') AS hi,
              to_char(hora_fin::time,    'HH24:MI:SS') AS hf
         FROM horario_usuario
        WHERE usuario_id = $1
          AND fecha = $2::date
          AND estado = true
          AND hora_inicio IS NOT NULL
          AND hora_fin IS NOT NULL`,
      usuarioAsig,
      ymd,
    );
    const ocupados = (Array.isArray(rowsOcupados) ? rowsOcupados : [])
      .map((r) => ({ ini: toMinFromHms(r.hi), fin: toMinFromHms(r.hf) }))
      .filter((a) => a.ini != null && a.fin != null)
      .sort((a, b) => a.ini - b.ini);

    // Si la fecha es HOY, no programamos en el pasado: el cursor arranca
    // en max(inicioBloque, ahora). Para fechas futuras usamos el inicio
    // del bloque tal cual.
    const now = new Date();
    const isToday = isSameLocalDay(fechaLocal, now);
    const nowMin = isToday
      ? now.getHours() * 60 + now.getMinutes()
      : 0;

    for (const block of bloquesMin) {
      let cursor = isToday ? Math.max(block.ini, nowMin) : block.ini;
      if (cursor >= block.fin) continue; // bloque ya pasó

      for (const a of ocupados) {
        if (a.fin <= cursor) continue; // actividad ya terminó
        if (a.ini >= block.fin) break; // actividad cae fuera del bloque
        if (a.ini >= cursor) {
          // Hueco entre [cursor, a.ini)
          if (a.ini - cursor >= minutosEstimados) {
            return { ini: cursor, fin: cursor + minutosEstimados };
          }
          cursor = a.fin;
        } else {
          // a.ini < cursor: la actividad ocupa desde antes del cursor;
          // saltamos al final de la actividad.
          cursor = Math.max(cursor, a.fin);
        }
        if (cursor >= block.fin) break;
      }

      // Hueco al final del bloque (después de todas las actividades).
      if (cursor < block.fin && block.fin - cursor >= minutosEstimados) {
        return { ini: cursor, fin: cursor + minutosEstimados };
      }
    }

    // Mensaje útil para el front: muestra los bloques del día (en HH:MM)
    // y cuánto dura la tarea. Le permite al usuario entender si tiene que
    // cambiar de usuario, de día o reducir la duración de la tarea.
    const bloquesStr = bloquesMin
      .map((b) => `${minutosToHms(b.ini).slice(0, 5)}-${minutosToHms(b.fin).slice(0, 5)}`)
      .join(", ");
    const e = new Error(
      `El usuario no tiene un bloque de horario lo suficientemente largo (${minutosEstimados} min) para el día seleccionado. Bloques disponibles: ${bloquesStr || "(sin bloques)"}.`,
    );
    e.code = "BAD_REQUEST";
    throw e;
  }

  // ---------------- Notificaciones (helpers) -----------------------

  // Devuelve el id de un rol buscando por nombre (case + accent insensitive).
  // Retorna null si no encuentra ninguno.
  async #findRoleIdByName(tx, list) {
    const all = await tx.roles.findMany({
      where: { estado: true },
      select: { id: true, nombre: true },
    });
    const found = all.find((r) => matchesAny(r.nombre, [list]));
    return found ? found.id : null;
  }

  // Devuelve los ids de roles que matchean cualquiera de los nombres.
  async #findRoleIdsByNames(tx, list) {
    const all = await tx.roles.findMany({
      where: { estado: true },
      select: { id: true, nombre: true },
    });
    return all.filter((r) => matchesAny(r.nombre, list)).map((r) => r.id);
  }

  // Devuelve true si el usuario tiene rol VALORADOR (id = ROL_VALORADOR_ID
  // o nombre matchea ROL_VALORADOR). Usado para decidir si se inserta
  // o no en `horario_usuario` (los VALORADORES no se agendan al crear;
  // se les pinta el slot recién cuando cierran la actividad).
  async #isUserValorador(tx, usuarioId) {
    if (!usuarioId) return false;
    const u = await tx.usuarios.findUnique({
      where: { id: Number(usuarioId) },
      select: { rol_id: true, roles: { select: { nombre: true } } },
    });
    if (!u) return false;
    if (Number(u.rol_id) === ROL_VALORADOR_ID) return true;
    return matchesAny(u.roles?.nombre, [ROL_VALORADOR]);
  }

  // Retorna el id de la primera tarea activa como fallback. Usada cuando
  // se necesita crear una actividad sin tarea explícita en la conversión.
  async #getFallbackTareaId(tx) {
    const ft = await tx.tarea.findFirst({
      where: { estado: true },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    return ft ? ft.id : null;
  }

  // Inserta (o actualiza) un registro en `horario_usuario` SOLO si el
  // usuario NO es VALORADOR. Para todos los demás roles mantiene el
  // comportamiento histórico: el slot se pinta al crear la actividad.
  // Si el usuario es VALORADOR, retorna null sin insertar (su slot se
  // pintará cuando complete la actividad, ver #insertHorarioUsuarioValoradorAlCompletar).
  //
  // params: { usuarioId, actividadId, fecha, horaInicio, horaFin,
  //           duracionMinutos, tipo, categoria }
  async #createHorarioUsuarioSiNoEsValorador(tx, p) {
    if (!p?.usuarioId) return null;
    const isValorador = await this.#isUserValorador(tx, p.usuarioId);
    if (isValorador) return null; // VALORADOR: el slot se inserta al cerrar
    return await tx.horario_usuario.create({
      data: {
        actividad_id: p.actividadId,
        usuario_id: Number(p.usuarioId),
        fecha: p.fecha,
        hora_inicio: p.horaInicio,
        hora_fin: p.horaFin,
        estado: true,
        tipo: p.tipo || "actividad",
        categoria: p.categoria || "potencial_cliente",
        duracion_minutos: p.duracionMinutos ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  // Inserta (o actualiza) un registro en `horario_usuario` SOLO si el
  // usuario ES VALORADOR. Se llama al completar la actividad, usando
  // las fechas reales de inicio/fin (fecha_inicio_real/hora_inicio_real
  // y fecha_termino_real/hora_termino_real). Si la actividad nunca
  // fue iniciada, hora_inicio = hora_termino_real y duracion = 0.
  //
  // params: { usuarioId, actividadId, fechaInicioReal, horaInicioReal,
  //           fechaTerminoReal, horaTerminoReal, duracionRealMinutos,
  //           tipo, categoria }
  async #insertHorarioUsuarioValoradorAlCompletar(tx, p) {
    if (!p?.usuarioId) return null;
    const isValorador = await this.#isUserValorador(tx, p.usuarioId);
    if (!isValorador) return null; // No VALORADOR: ya se insertó al crear
    // Si la actividad nunca fue iniciada, hora_inicio_real es null;
    // caemos al cierre para no romper el rango (duración 0).
    const fecha = p.fechaTerminoReal || p.fechaInicioReal || new Date();
    const horaFin = p.horaTerminoReal || new Date();
    const horaInicio = p.horaInicioReal || horaFin;
    const duracion =
      p.duracionRealMinutos != null ? Number(p.duracionRealMinutos) : 0;
    // Upsert por (actividad_id, usuario_id) — si la fila no existe
    // la creamos; si ya existe (caso de drag previo a este fix) la
    // pisamos con los datos de cierre consistentes.
    const existing = await tx.horario_usuario.findFirst({
      where: {
        actividad_id: p.actividadId,
        usuario_id: Number(p.usuarioId),
      },
      select: { id: true },
    });
    if (existing) {
      return await tx.horario_usuario.update({
        where: { id: existing.id },
        data: {
          fecha,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          estado: true,
          tipo: p.tipo || "actividad",
          categoria: p.categoria || "potencial_cliente",
          duracion_minutos: duracion,
          updated_at: new Date(),
        },
      });
    }
    return await tx.horario_usuario.create({
      data: {
        actividad_id: p.actividadId,
        usuario_id: Number(p.usuarioId),
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        estado: true,
        tipo: p.tipo || "actividad",
        categoria: p.categoria || "potencial_cliente",
        duracion_minutos: duracion,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  // Devuelve los ids de usuarios activos con rol AUXILIAR DE PRODUCCIÓN
  // que estén asignados al día de hoy en la tabla `asignacion_dias`.
  // Si hoy es domingo (no existe en `dias`) devuelve [].
  async #getAuxiliaresProduccionAsignadosHoy(tx, rolId) {
    if (!rolId) return [];
    const diaId = getTodayDiaId();
    if (!diaId) return [];

    // La tabla no tiene PK (Prisma la marca con @@ignore), así que usamos
    // SQL crudo. Filtramos por usuarios activos con ese rol.
    const rows = await tx.$queryRawUnsafe(
      `SELECT u.id
       FROM usuarios u
       INNER JOIN asignacion_dias ad ON ad.usuario_id = u.id
       WHERE u.estado = true
         AND u.rol_id = $1
         AND ad.dia_id = $2`,
      rolId,
      diaId,
    );
    return rows.map((r) => Number(r.id));
  }

  // Resuelve la lista final de destinatarios de la notificación, sin duplicados
  // y excluyendo al usuario creador (si viene).
  // Si se pasa `assignedUserId`, también se incluye (para que el responsable
  // explícito del potencial cliente siempre reciba el aviso).
  async #resolveNotifRecipients(tx, usuarioId, assignedUserId = null) {
    const creatorId = usuarioId ? Number(usuarioId) : null;
    const exclude = (uid) => creatorId && Number(uid) === creatorId;

    // 1) Roles administrativos tradicionales
    const rolesAdminIds = await this.#findRoleIdsByNames(tx, ROLES_NOTIFICABLES);
    const adminIds = [];
    if (rolesAdminIds.length) {
      const us = await tx.usuarios.findMany({
        where: {
          rol_id: { in: rolesAdminIds },
          estado: true,
          ...(creatorId ? { id: { not: creatorId } } : {}),
        },
        select: { id: true },
      });
      for (const u of us) adminIds.push(Number(u.id));
    }

    // 2) AUXILIAR DE PRODUCCIÓN asignados al día de hoy
    const rolAuxId = await this.#findRoleIdByName(tx, ROL_AUX_PROD);
    const auxIds = (await this.#getAuxiliaresProduccionAsignadosHoy(tx, rolAuxId))
      .filter((id) => !exclude(id));

    // 3) JEFA DE VENTAS (siempre, todos los activos)
    const rolJefaId = await this.#findRoleIdByName(tx, ROL_JEFA_VENTAS);
    const jefaIds = [];
    if (rolJefaId) {
      const us = await tx.usuarios.findMany({
        where: {
          rol_id: rolJefaId,
          estado: true,
          ...(creatorId ? { id: { not: creatorId } } : {}),
        },
        select: { id: true },
      });
      for (const u of us) jefaIds.push(Number(u.id));
    }

    // 4) Usuario explícitamente asignado en el form (si no es el creador)
    const explicitIds = [];
    if (assignedUserId && !exclude(assignedUserId)) {
      explicitIds.push(Number(assignedUserId));
    }

    // Dedup preservando orden
    const seen = new Set();
    const out = [];
    for (const id of [...adminIds, ...auxIds, ...jefaIds, ...explicitIds]) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  // ---------------- Helpers internos --------------------------------

  #validateCreate(p) {
    if (!p) return "Payload vacío.";
    if (!Array.isArray(p.contactos) || p.contactos.length === 0) {
      return "Debes agregar al menos un contacto.";
    }
    for (const [i, c] of p.contactos.entries()) {
      if (!c.celular || !String(c.celular).trim()) {
        return `El contacto #${i + 1} requiere número de celular.`;
      }
    }
    if (!p.tarea_id) return "Debes seleccionar una tarea.";
    if (!p.prioridad) return "La prioridad es obligatoria.";
    if (!PRIORIDADES.includes(p.prioridad)) {
      return "Prioridad inválida.";
    }
    if (!p.origen_id) return "El origen del contacto es obligatorio.";
    // Si viene fecha_asignacion, debe parsear como fecha válida.
    if (p.fecha_asignacion) {
      const d = new Date(p.fecha_asignacion);
      if (Number.isNaN(d.getTime())) return "Fecha de asignación inválida.";
    }
    // Si viene usuario_asignado_id, debe ser numérico.
    if (
      p.usuario_asignado_id != null &&
      (!Number(p.usuario_asignado_id) || Number(p.usuario_asignado_id) <= 0)
    ) {
      return "Usuario asignado inválido.";
    }
    // Coherencia: si viene uno, debe venir el otro también.
    if (
      (p.fecha_asignacion && !p.usuario_asignado_id) ||
      (!p.fecha_asignacion && p.usuario_asignado_id)
    ) {
      return "Si asignas la actividad, debes indicar fecha y usuario.";
    }
    return null;
  }

  // Valida el payload del endpoint "agregar actividad" sobre un
  // Valida el payload del endpoint PUT /:id (editar un prospecto
  // existente). A diferencia de `#validateCreate`, NO exige `tarea_id`,
  // `fecha_asignacion` ni `usuario_asignado_id`, porque en el nuevo
  // flujo de edición la actividad principal se gestiona por
  // "Agregar actividad" y no se modifica desde acá. `contactos` sigue
  // siendo obligatorio (se reemplazan en bloque).
  #validateUpdate(p) {
    if (!p) return "Payload vacío.";
    if (!Array.isArray(p.contactos) || p.contactos.length === 0) {
      return "Debes agregar al menos un contacto.";
    }
    for (const [i, c] of p.contactos.entries()) {
      if (!c.celular || !String(c.celular).trim()) {
        return `El contacto #${i + 1} requiere número de celular.`;
      }
    }
    if (p.prioridad && !PRIORIDADES.includes(p.prioridad)) {
      return "Prioridad inválida.";
    }
    if (p.fecha_entrega) {
      const d = new Date(p.fecha_entrega);
      if (Number.isNaN(d.getTime())) return "Fecha de entrega inválida.";
    }
    return null;
  }

  // Valida el payload del endpoint "agregar actividad" sobre un
  // prospecto existente. Sólo se requiere: tarea_id y (fecha_asignacion
  // + usuario_asignado_id) como par. hora_reunion NO se valida acá: la
  // regla de REUNIÓN la aplica el método principal y rechaza la hora
  // vacía cuando la tarea es de tipo REUNIÓN.
  #validateAddActividad(p) {
    if (!p) return "Payload vacío.";
    if (!p.tarea_id) return "Debes seleccionar una tarea.";
    if (p.prioridad && !PRIORIDADES.includes(p.prioridad)) {
      return "Prioridad inválida.";
    }
    if (p.fecha_asignacion) {
      const d = new Date(p.fecha_asignacion);
      if (Number.isNaN(d.getTime())) return "Fecha de asignación inválida.";
    }
    if (
      p.usuario_asignado_id != null &&
      (!Number(p.usuario_asignado_id) || Number(p.usuario_asignado_id) <= 0)
    ) {
      return "Usuario asignado inválido.";
    }
    if (
      (p.fecha_asignacion && !p.usuario_asignado_id) ||
      (!p.fecha_asignacion && p.usuario_asignado_id)
    ) {
      return "Si asignas la actividad, debes indicar fecha y usuario.";
    }
    if (p.hora_reunion != null && p.hora_reunion !== "") {
      if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(p.hora_reunion).trim())) {
        return "Hora de reunión inválida (formato HH:MM).";
      }
    }
    return null;
  }

  async #upsertPersona(tx, c) {
    const nombres = c.nombres ? String(c.nombres).trim() : null;
    const apellidos = c.apellidos ? String(c.apellidos).trim() : null;
    const celular = String(c.celular).trim();
    // Documento (DNI/CE/RUC, etc.) — opcional pero se persiste si viene.
    const tipoDocumentoId =
      c.tipo_documento_id != null && c.tipo_documento_id !== ""
        ? Number(c.tipo_documento_id) || null
        : null;
    const numeroDocumento = c.numero_documento
      ? String(c.numero_documento).trim()
      : null;

    // ¿Ya existe por celular? Si sí y matchea nombres/apellidos, reusamos.
    const existente = await tx.personas.findFirst({
      where: { celular },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        tipoDocumento_id: true,
        numero_documento: true,
      },
    });
    if (existente) {
      return tx.personas.update({
        where: { id: existente.id },
        data: {
          nombres: nombres ?? existente.nombres,
          apellidos: apellidos ?? existente.apellidos,
          // Sólo sobrescribimos el documento si el front lo mandó; si no,
          // conservamos el que ya estaba.
          tipoDocumento_id:
            tipoDocumentoId != null
              ? tipoDocumentoId
              : existente.tipoDocumento_id,
          numero_documento:
            numeroDocumento != null
              ? numeroDocumento
              : existente.numero_documento,
        },
      });
    }
    return tx.personas.create({
      data: {
        nombres,
        apellidos,
        celular,
        tipoDocumento_id: tipoDocumentoId,
        numero_documento: numeroDocumento,
        estado: true,
      },
    });
  }

  // Da forma "limpia" al prospecto para enviarselo al frontend.
  #shapeProspecto(p, { full = false, usuariosById = {} } = {}) {
    const contactos = (p.prospecto_persona || [])
      .map((pp) => pp.personas)
      .filter(Boolean)
      .map((per) => ({
        id: per.id,
        nombres: per.nombres,
        apellidos: per.apellidos,
        celular: per.celular,
        tipo_documento_id: per.tipoDocumento_id ?? null,
        numero_documento: per.numero_documento ?? null,
      }));

    const actividad = (p.actividades && p.actividades[0]) || null;

    const base = {
      id: p.id,
      titulo_prospecto: p.titulo_prospecto,
      prioridad: p.prioridad,
      estado_cliente: p.estado_cliente,
      fecha_contacto: p.fecha_contacto,
      fecha_entrega: p.fecha_entrega,
      contenido: p.contenido,
      link_drive: p.link_drive,
      estado: p.estado,
      nivel_academico: p.nivel_academico
        ? { id: p.nivel_academico.id, nombre: p.nivel_academico.nombre }
        : null,
      carrera: p.carreras
        ? {
            id: p.carreras.id,
            nombre: p.carreras.nombre,
            institucion: p.carreras.institucion
              ? {
                  id: p.carreras.institucion.id,
                  nombre: p.carreras.institucion.nombre,
                }
              : null,
          }
        : null,
      proveedor: p.proveedor
        ? { id: p.proveedor.id, nombre: p.proveedor.nombre }
        : null,
      origen: p.origen
        ? { id: p.origen.id, nombre: p.origen.nombre }
        : null,
      contactos,
      actividad: actividad
        ? {
            id: actividad.id,
            estado_progreso: actividad.estado_progreso,
            prioridad: actividad.prioridad,
            tarea: actividad.tarea
              ? { id: actividad.tarea.id, nombre: actividad.tarea.nombre }
              : null,
          }
        : null,
    };

    if (full) {
      base.actividades = (p.actividades || []).map((a) => {
        const usr =
          a.usuario_id != null ? usuariosById[Number(a.usuario_id)] || null : null;
        return {
          id: a.id,
          estado_progreso: a.estado_progreso,
          prioridad: a.prioridad,
          fecha_inicio: a.fecha_inicio,
          hora_inicio: a.hora_inicio,
          tiempo_estimado_minutos: a.tiempo_estimado_minutos,
          tarea: a.tarea ? { id: a.tarea.id, nombre: a.tarea.nombre } : null,
          usuario_asignado: usr
            ? { id: usr.id, usuario: usr.usuario, nombre: usr.nombre }
            : null,
        };
      });
      base.drive_links = (p.drive_links || []).map((d) => ({
        id: d.id,
        link_drive: d.link_drive,
        created_at: d.created_at,
      }));
      base.historial = (p.historial_estados_prospecto || []).map((h) => {
        const usr = h.usuarios;
        const per = usr?.personas;
        const usuarioNombre = per
          ? [per.nombres, per.apellidos].filter(Boolean).join(" ")
          : usr?.usuario || null;
        return {
          id: h.id,
          estado: h.estado,
          comentario: h.comentario,
          fecha_inicio: h.fecha_inicio,
          fecha_fin: h.fecha_fin,
          activo: h.fecha_fin == null,
          usuario: usr
            ? { id: usr.id, usuario: usr.usuario, nombre: usuarioNombre }
            : null,
        };
      });
    }

    return base;
  }

  // ---------------- Convertir potencial → cliente -------------------

  // Convierte un prospecto (estado_cliente='potencial cliente') en cliente,
  // permitiéndole al usuario editar cualquier campo del prospecto (título,
  // universidad, carrera, nivel, prioridad, link_drive, contenido,
  // contactos, fecha_entrega) en el mismo paso.
  //
  // Opcionalmente, si vienen los campos de agendamiento (tarea_id,
  // fecha_asignacion, usuario_asignado_id, hora_inicio), también crea /
  // actualiza la actividad y su evento en `horario_usuario`.
  //
  // body = {
  //   // Campos opcionales de edición del prospecto (si vienen, se
  //   // actualizan; si no, se conservan los actuales):
  //   titulo_prospecto?:   string|null,
  //   institucion_id?:     int|null,
  //   carrera_id?:         int|null,
  //   nivel_academico_id?: int|null,
  //   prioridad?:          'ALTA'|'MEDIA'|'BAJA'|null,
  //   link_drive?:         string|null,
  //   contenido?:          string|null,
  //   contactos?:          [{nombres, apellidos, celular,
  //                          tipo_documento_id?, numero_documento?}],
  //                          // si viene, REEMPLAZA
  //   fecha_entrega?:      'YYYY-MM-DD'|null,
  //   // Asignación de la actividad (OPCIONALES — si vienen los 4 juntos, se agenda):
  //   tarea_id?:            int,
  //   fecha_asignacion?:    'YYYY-MM-DD',
  //   usuario_asignado_id?: int,
  //   hora_inicio?:         'HH:MM',
  //   motivo:               string|null,     // comentario para historial
  //   color?:               string|null,
  // }
  //
  // Comportamiento ante conflicto de horario:
  //   - Si la hora que pidió el usuario choca con una actividad bloqueada
  //     (ALTA) → rechaza con 409 + plan del scheduler.
  //   - Si entra directo o moviendo MEDIA/BAJA → ejecuta los moves y
  //     coloca la nueva en la hora pedida. Devuelve {success:true,...}.
  async convertirACliente(prospectoId, payload, usuarioId = null) {
    const idNum = Number(prospectoId);
    if (!idNum) {
      const e = new Error("Prospecto inválido.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const err = this.#validateConvertir(payload);
    if (err) {
      const e = new Error(err);
      e.code = "BAD_REQUEST";
      throw e;
    }

    const prospecto = await prisma.prospectos.findUnique({
      where: { id: idNum },
      select: {
        id: true,
        estado: true,
        estado_cliente: true,
        fecha_entrega: true,
        link_drive: true,
      },
    });
    if (!prospecto) {
      const e = new Error("Potencial cliente no encontrado.");
      e.code = "NOT_FOUND";
      throw e;
    }
    if (!prospecto.estado) {
      const e = new Error("El prospecto está inactivo.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (prospecto.estado_cliente === "cliente") {
      const e = new Error("El prospecto ya es cliente.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Determinar si el usuario quiere agendar la actividad (los 4 campos).
    // También separamos si al menos mandó tarea_id (para crear/actualizar
    // la actividad aunque no agende).
    const quiereAgendar =
      payload.tarea_id &&
      payload.fecha_asignacion &&
      payload.usuario_asignado_id &&
      payload.hora_inicio;
    const tieneTarea = !!payload.tarea_id;

    let tarea = null;
    let minutos = null;
    let fechaAsig = null;
    let horaIni = null;
    let horaFin = null;
    let usuarioAsig = null;

    // Siempre que venga tarea_id, resolver el objeto tarea (vale tanto
    // para el path de agendamiento como para el de sólo-asignación).
    if (tieneTarea) {
      tarea = await prisma.tarea.findUnique({
        where: { id: Number(payload.tarea_id) },
        select: { id: true, nombre: true, horas_estimadas: true },
      });
      if (!tarea) {
        const e = new Error("La tarea seleccionada no existe.");
        e.code = "BAD_REQUEST";
        throw e;
      }
    }

    if (quiereAgendar) {
      minutos = tarea.horas_estimadas ? Number(tarea.horas_estimadas) : 60;

      fechaAsig = new Date(payload.fecha_asignacion);
      horaIni = this.#hmsToDate(payload.hora_inicio);
      if (!horaIni) {
        const e = new Error("hora_inicio inválida (use HH:MM).");
        e.code = "BAD_REQUEST";
        throw e;
      }
      horaFin = new Date(horaIni.getTime() + minutos * 60_000);

      usuarioAsig = Number(payload.usuario_asignado_id);
      const me = await prisma.usuarios.findUnique({
        where: { id: usuarioAsig },
        select: { id: true, estado: true, roles: { select: { nombre: true } } },
      });
      if (!me || !me.estado) {
        const e = new Error("El usuario asignado no existe o está inactivo.");
        e.code = "BAD_REQUEST";
        throw e;
      }

      // Validaciones de calendario iguales a create():
      //   (1) feriado, (2) cumpleaños, (3) bloque lo suficientemente largo.
      await this.#validarDiaAsignacion(usuarioAsig, fechaAsig, minutos);

      // 1) Chequear conflicto en la hora EXACTA que pidió el usuario.
      //    Si entra, devolvemos fits:true. Si no, 409 con el plan.
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const fechaStr = fmt(fechaAsig);
      const conflictos = await this.#checkSlotConflict(
        usuarioAsig,
        fechaStr,
        horaIni,
        horaFin,
      );
      if (conflictos.length > 0) {
        const e = new Error(
          "La hora seleccionada choca con otra actividad del auxiliar.",
        );
        e.code = "SLOT_CONFLICT";
        e.conflicts = conflictos;
        e.suggestion = {
          fecha: fechaStr,
          hora_inicio: payload.hora_inicio,
          minutos,
        };
        throw e;
      }
    }

    // Normalizamos los campos opcionales de edición. Usamos `hasOwnProperty`
    // para distinguir "viene null/undefined" (preservar) de "viene string vacío"
    // (que se persiste como null).
    const wantsField = (k) => Object.prototype.hasOwnProperty.call(payload, k);
    const tituloTrim = wantsField("titulo_prospecto")
      ? payload.titulo_prospecto
        ? String(payload.titulo_prospecto).trim()
        : null
      : undefined;
    const institucionId = wantsField("institucion_id")
      ? payload.institucion_id
        ? Number(payload.institucion_id)
        : null
      : undefined;
    const carreraId = wantsField("carrera_id")
      ? payload.carrera_id
        ? Number(payload.carrera_id)
        : null
      : undefined;
    const nivelId = wantsField("nivel_academico_id")
      ? payload.nivel_academico_id
        ? Number(payload.nivel_academico_id)
        : null
      : undefined;
    const prioridad = wantsField("prioridad")
      ? payload.prioridad || null
      : undefined;
    const contenido = wantsField("contenido")
      ? payload.contenido || null
      : undefined;
    const linkDriveTrim = wantsField("link_drive")
      ? payload.link_drive
        ? String(payload.link_drive).trim()
        : null
      : undefined;
    const newFechaEntrega = wantsField("fecha_entrega")
      ? payload.fecha_entrega
        ? new Date(payload.fecha_entrega)
        : null
      : undefined;
    const colorFinal = wantsField("color")
      ? payload.color
        ? String(payload.color).trim()
        : null
      : undefined;
    const contactos = wantsField("contactos")
      ? Array.isArray(payload.contactos)
        ? payload.contactos
        : null
      : null;

    // Validaciones de campos opcionales (si vienen)
    if (
      prioridad !== undefined &&
      prioridad !== null &&
      !PRIORIDADES.includes(prioridad)
    ) {
      const e = new Error("Prioridad inválida.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (contactos) {
      if (contactos.length === 0) {
        const e = new Error("Debes agregar al menos un contacto.");
        e.code = "BAD_REQUEST";
        throw e;
      }
      for (const [i, c] of contactos.entries()) {
        if (!c.celular || !String(c.celular).trim()) {
          const e = new Error(
            `El contacto #${i + 1} requiere número de celular.`,
          );
          e.code = "BAD_REQUEST";
          throw e;
        }
      }
    }

    // 2) Ejecutar la conversión.
    return await prisma.$transaction(async (tx) => {
      // 2a) Prospecto → cliente (con actualización opcional de campos)
      //     Prisma 7 no acepta los escalares de FK cuando hay relación
      //     definida; usamos `connect` con la relación.
      const updateData = {
        estado_cliente: "cliente",
        updated_at: new Date(),
      };
      if (tituloTrim !== undefined) updateData.titulo_prospecto = tituloTrim;
      if (carreraId !== undefined) {
        if (carreraId) {
          updateData.carreras = { connect: { id: carreraId } };
        } else {
          updateData.carreras = { disconnect: true };
        }
      }
      if (nivelId !== undefined) {
        if (nivelId) {
          updateData.nivel_academico = { connect: { id: nivelId } };
        } else {
          updateData.nivel_academico = { disconnect: true };
        }
      }
      if (prioridad !== undefined) updateData.prioridad = prioridad;
      if (contenido !== undefined) updateData.contenido = contenido;
      if (linkDriveTrim !== undefined) updateData.link_drive = linkDriveTrim;
      if (newFechaEntrega !== undefined) {
        updateData.fecha_entrega = newFechaEntrega;
      } else if (!prospecto.fecha_entrega) {
        // Si no viene y no tenía, que no quede null raro: heredamos null.
        updateData.fecha_entrega = null;
      }

      await tx.prospectos.update({
        where: { id: idNum },
        data: updateData,
      });

      // 2b) Si vinieron contactos, reemplazamos.
      //     Estrategia: deleteMany + createMany (idéntica a `update`).
      if (contactos) {
        await tx.prospecto_persona.deleteMany({
          where: { prospecto_id: idNum },
        });
        const personaIds = [];
        for (const c of contactos) {
          const persona = await this.#upsertPersona(tx, c);
          personaIds.push(persona.id);
        }
        if (personaIds.length) {
          await tx.prospecto_persona.createMany({
            data: personaIds.map((pid) => ({
              prospecto_id: idNum,
              persona_id: pid,
            })),
          });
        }
      }

      // 2c) drive_links: si cambió el link, dejamos huella en el historial.
      if (
        linkDriveTrim !== undefined &&
        linkDriveTrim !== (prospecto.link_drive || null)
      ) {
        await tx.drive_links.create({
          data: {
            prospecto_id: idNum,
            link_drive: linkDriveTrim,
            created_at: new Date(),
          },
        });
      }

      // 2d) Cerrar el estado activo del historial y abrir 'cliente'.
      const activo = await tx.historial_estados_prospecto.findFirst({
        where: { prospecto_id: idNum, fecha_fin: null },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      if (activo) {
        await tx.historial_estados_prospecto.update({
          where: { id: activo.id },
          data: { fecha_fin: new Date() },
        });
      }
      const comentarioHist = payload.motivo
        ? `Convertido a cliente: ${payload.motivo}`
        : "Convertido a cliente.";
      await tx.historial_estados_prospecto.create({
        data: {
          prospecto_id: idNum,
          estado: "cliente",
          usuario_id: usuarioId ? Number(usuarioId) : null,
          comentario: comentarioHist,
          fecha_inicio: new Date(),
          fecha_fin: null,
        },
      });

      // 2e) Actividad: buscamos la existente FUERA del condicional de
      //     agendamiento para poder actualizarla incluso cuando el usuario
      //     no eligió agendar. Si no existe y el usuario no agenda,
      //     creamos una básica de respaldo.
      let actividadId = null;
      const actExistente = await tx.actividades.findFirst({
        where: { prospecto_id: idNum, estado: true },
        orderBy: { id: "asc" },
        select: { id: true, usuario_register: true },
      });

      if (quiereAgendar) {
        const actPrioridad =
          prioridad !== undefined && prioridad !== null
            ? prioridad
            : undefined;

        const actData = {
          tarea_id: tarea.id,
          usuario_id: usuarioAsig,
          estado_progreso: "pendiente",
          fecha_inicio: fechaAsig,
          hora_inicio: horaIni,
          tiempo_estimado_minutos: minutos,
          bloqueada: false,
          updated_at: new Date(),
          // NOTA: `usuario_register` está INTENCIONALMENTE fuera de
          // `actData` para que NO se pisotee en el path de UPDATE. El
          // campo es INMUTABLE: una vez seteado en la creación de la
          // actividad, refleja al usuario ORIGINAL que la registró.
          // Para auditoría de quién la editó/reagendó después, está
          // `historial_estados_prospecto` (que inserta filas con
          // comentario "Actividad agregada: ..." en `addActividad`).
        };
        if (actPrioridad !== undefined) actData.prioridad = actPrioridad;
        if (colorFinal !== undefined) actData.color = colorFinal;

        if (actExistente) {
          // UPDATE: preservamos el `usuario_register` original
          // (inmutable). Si la actividad ya tenía un registrador, no
          // lo tocamos. Si por algún motivo la actividad legacy no lo
          // tiene seteado y ESTA operación la crea, recién acá lo
          // sembramos — es la única vez que se puede setear fuera del
          // path de CREATE puro.
          await tx.actividades.update({
            where: { id: actExistente.id },
            data: {
              ...actData,
              // Setear SOLO si estaba null (defensa contra legacy).
              ...(actExistente.usuario_register == null && usuarioId
                ? { usuario_register: Number(usuarioId) }
                : {}),
            },
          });
          actividadId = actExistente.id;

          // Tracking de re-agenda: insertamos una fila en
          // `historial_estados_prospecto` con el comentario
          // "Actividad reasignada: ..." para dejar registro de QUIÉN
          // re-agendó y CUÁNDO. Mismo patrón que `addActividad`
          // (estado="actualizado") para que el historial del prospecto
          // sea consistente y consultable.
          //
          // NO tocamos `usuario_register` (es inmutable); el usuario que
          // re-asignó queda acá, en el historial del prospecto, con un
          // comentario que lo identifica como tal.
          const comentarioReasign = `Actividad reasignada: ${
            tarea?.nombre || `tarea #${tarea?.id}`
          }${fechaAsig ? ` (${getYmdLocal(fechaAsig)})` : ""}.`;
          await tx.historial_estados_prospecto.create({
            data: {
              prospecto_id: idNum,
              estado: "actualizado",
              usuario_id: usuarioId ? Number(usuarioId) : null,
              comentario: comentarioReasign,
              fecha_inicio: new Date(),
              fecha_fin: null,
            },
          });
        } else {
          const nueva = await tx.actividades.create({
            data: {
              ...actData,
              // CREATE: aquí sí se setea el registrador original.
              usuario_register: usuarioId ? Number(usuarioId) : null,
              prioridad: actPrioridad !== undefined ? actPrioridad : "MEDIA",
              prospecto_id: idNum,
              estado: true,
              created_at: new Date(),
            },
          });
          actividadId = nueva.id;
          // Inicializar historial: fila "pendiente" desde la creación.
          await ActividadEstadoHistorialService.transicion(
            tx,
            actividadId,
            "pendiente",
            new Date(),
            { creadaEn: nueva.created_at },
          );

          // Tracking de nueva actividad: insertamos una fila en
          // `historial_estados_prospecto` con el comentario
          // "Actividad agregada: ..." (mismo patrón que `addActividad`).
          // El `usuario_register` ya quedó seteado en la actividad
          // (inmutable), y este registro en el historial del prospecto
          // da una segunda vía de auditoría (con fecha y contexto).
          const comentarioAgre = `Actividad agregada: ${
            tarea?.nombre || `tarea #${tarea?.id}`
          }${fechaAsig ? ` (${getYmdLocal(fechaAsig)})` : ""}.`;
          await tx.historial_estados_prospecto.create({
            data: {
              prospecto_id: idNum,
              estado: "actualizado",
              usuario_id: usuarioId ? Number(usuarioId) : null,
              comentario: comentarioAgre,
              fecha_inicio: new Date(),
              fecha_fin: null,
            },
          });
        }

        // horario_usuario: upsert por (actividad_id, usuario).
        // Excepción VALORADOR: el slot NO se inserta al crear — se pinta
        // recién cuando la actividad se completa
        // (ver #insertHorarioUsuarioValoradorAlCompletar).
        const upd = await tx.$executeRawUnsafe(
          `UPDATE horario_usuario
              SET fecha          = $1::date,
                  hora_inicio    = $2::timetz,
                  hora_fin       = $3::timetz,
                  estado         = true,
                  tipo           = 'actividad',
                  categoria      = 'cliente',
                  duracion_minutos = $4,
                  updated_at     = now()
            WHERE actividad_id = $5
              AND usuario_id   = $6
              AND NOT EXISTS (
                SELECT 1 FROM usuarios u
                 WHERE u.id = $6 AND u.rol_id = ${ROL_VALORADOR_ID}
              )`,
          fechaAsig,
          horaIni,
          horaFin,
          minutos,
          actividadId,
          usuarioAsig,
        );
        if (!upd) {
          // Verificamos VALORADOR antes de crear (el NOT EXISTS protege
          // el UPDATE pero el create() de Prisma no aplica ese filtro).
          const isValorador = await this.#isUserValorador(tx, usuarioAsig);
          if (!isValorador) {
            await tx.horario_usuario.create({
              data: {
                actividad_id: actividadId,
                usuario_id: usuarioAsig,
                fecha: fechaAsig,
                hora_inicio: horaIni,
                hora_fin: horaFin,
                estado: true,
                tipo: "actividad",
                categoria: "cliente",
                duracion_minutos: minutos,
                created_at: new Date(),
                updated_at: new Date(),
              },
            });
          }
        }
      } else {
        // Sin agendamiento: si el usuario mandó tarea_id (sin horario)
        // la asignamos a la actividad; si no, sólo prioridad/color.
        if (actExistente) {
          const actUpd = { updated_at: new Date() };
          if (tieneTarea) actUpd.tarea_id = tarea.id;
          if (colorFinal !== undefined) actUpd.color = colorFinal;
          if (prioridad !== undefined && prioridad !== null) actUpd.prioridad = prioridad;
          await tx.actividades.update({
            where: { id: actExistente.id },
            data: actUpd,
          });
          actividadId = actExistente.id;
        } else {
          const tareaId = tieneTarea
            ? tarea.id
            : await this.#getFallbackTareaId(tx);
          if (tareaId) {
            const nueva = await tx.actividades.create({
              data: {
                prospecto_id: idNum,
                tarea_id: tareaId,
                estado: true,
                estado_progreso: "pendiente",
                prioridad:
                  prioridad !== undefined && prioridad !== null
                    ? prioridad
                    : "MEDIA",
                color: colorFinal || null,
                usuario_register: usuarioId ? Number(usuarioId) : null,
                created_at: new Date(),
                updated_at: new Date(),
              },
            });
            actividadId = nueva.id;
          }
        }
      }

      // 2f) Notificaciones a ASISTENTE DE PRODUCCIÓN (rol_id=11)
      let insertedNotifs = [];
      const asistenteUsers = await tx.usuarios.findMany({
        where: { estado: true, rol_id: ROL_ASISTENTE_PROD_ID },
        select: { id: true },
      });
      const notifRecipientIds = asistenteUsers
        .map((u) => Number(u.id))
        .filter(
          (id) => !usuarioId || Number(id) !== Number(usuarioId),
        );

      if (notifRecipientIds.length > 0) {
        const tituloNotif = "Prospecto convertido a cliente";
        const contactoTxt = (contactos || [])
          .map((c) =>
            [c?.nombres, c?.apellidos].filter(Boolean).join(" ").trim(),
          )
          .filter(Boolean)
          .join(", ");
        const baseMensaje = tituloTrim
          ? `${tituloTrim}${contactoTxt ? ` — ${contactoTxt}` : ""}`
          : contactoTxt || "Sin título";
        const mensaje = `Convertido a cliente: ${baseMensaje}`.slice(0, 255);
        const prioridadNum =
          prioridad === "ALTA"
            ? 1
            : prioridad === "MEDIA"
              ? 2
              : prioridad === "BAJA"
                ? 3
                : null;

        for (const uid of notifRecipientIds) {
          const notif = await tx.notificaciones.create({
            data: {
              usuario_id: uid,
              remitente_id: usuarioId ? Number(usuarioId) : null,
              titulo: tituloNotif,
              mensaje,
              tipo: "potencial_cliente",
              prioridad: prioridadNum,
              es_leida: false,
              created_at: new Date(),
              updated_at: new Date(),
            },
          });
          insertedNotifs.push(notif);
        }
      }

      return {
        id: idNum,
        actividad_id: actividadId,
        slot: quiereAgendar
          ? {
              hi: this.#dateToHHMM(horaIni),
              hf: this.#dateToHHMM(horaFin),
            }
          : null,
        notifications: insertedNotifs,
      };
    });
  }

  // ---------------- Helpers de convertir -----------------------------

  #validateConvertir(p) {
    if (!p) return "Payload vacío.";

    // ----- Datos obligatorios al convertir a cliente ------------------
    // Cuando un prospecto pasa a cliente, los datos del trabajo ya no
    // son opcionales: el cliente tiene que estar completo.
    // NOTA: `titulo_prospecto` NO es obligatorio en la conversión —
    //       un cliente puede no tener título de trabajo asignado.
    if (!p.institucion_id) {
      return "La universidad es obligatoria para convertir a cliente.";
    }
    if (!p.carrera_id) {
      return "La carrera es obligatoria para convertir a cliente.";
    }
    if (!p.nivel_academico_id) {
      return "El nivel académico es obligatorio para convertir a cliente.";
    }
    if (!p.prioridad) {
      return "La prioridad es obligatoria para convertir a cliente.";
    }
    if (!p.fecha_entrega) {
      return "La fecha de entrega es obligatoria para convertir a cliente.";
    }
    if (
      !Array.isArray(p.contactos) ||
      p.contactos.length === 0
    ) {
      return "Debes agregar al menos un contacto para convertir a cliente.";
    }
    for (const [i, c] of p.contactos.entries()) {
      if (!c || !c.celular || !String(c.celular).trim()) {
        return `El contacto #${i + 1} requiere número de celular.`;
      }
      if (!c.nombres || !String(c.nombres).trim()) {
        return `El contacto #${i + 1} requiere nombres.`;
      }
      if (!c.apellidos || !String(c.apellidos).trim()) {
        return `El contacto #${i + 1} requiere apellidos.`;
      }
    }

    // ----- Campos de agendamiento (opcionales) ------------------------
    // Si el usuario manda fecha, usuario u hora (campos de scheduling),
    // deben venir los 4 juntos. Sólo tarea_id está permitido solo.
    const schedulingFields = [
      p.fecha_asignacion,
      p.usuario_asignado_id,
      p.hora_inicio,
    ].filter((x) => x !== undefined && x !== null && x !== "");
    if (schedulingFields.length > 0 && schedulingFields.length < 3) {
      return "Si vas a agendar la actividad, debes indicar tarea, fecha, usuario y hora.";
    }
    if (schedulingFields.length > 0 && !p.tarea_id) {
      return "Si vas a agendar la actividad, debes indicar tarea, fecha, usuario y hora.";
    }
    if (p.hora_inicio) {
      const m = String(p.hora_inicio).match(/^(\d{1,2}):(\d{2})/);
      if (!m) return "hora_inicio inválida (use HH:MM).";
      const hh = Number(m[1]);
      const mm = Number(m[2]);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59)
        return "hora_inicio fuera de rango.";
    }
    if (p.fecha_asignacion) {
      const d = new Date(p.fecha_asignacion);
      if (Number.isNaN(d.getTime())) return "Fecha de asignación inválida.";
    }
    return null;
  }

  // FIX QUIRÚRGICO Timetz: parsea "HH:MM[:SS]" como Date UTC (no local),
  // y el par #dateToHHMM lee con getUTCHours. La columna @db.Timetz se
  // escribe y se lee con la convención UTC que ya usan
  // calendario-asistente.service.js y reuniones-asistente.service.js
  // (los readers usan getUTCHours, así que el writer tiene que guardar
  // con Date.UTC para que el round-trip sea coherente en cualquier
  // huso del servidor).
  #hmsToDate(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return new Date(
      Date.UTC(1970, 0, 1, Number(m[1]), Number(m[2]), Number(m[3] || 0)),
    );
  }

  #dateToHHMM(d) {
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  }

  // Valida que el día sea agendable: no feriado, no cumpleaños del
  // usuario, y que haya un bloque de jornada que entre la actividad.
  async #validarDiaAsignacion(usuarioId, fechaLocal, minutos) {
    // (1) Feriado
    const feriado = await prisma.feriados.findFirst({
      where: { fecha: fechaLocal, estado: true },
      select: { id: true, nombre: true },
    });
    if (feriado) {
      const e = new Error(
        `La fecha seleccionada es feriado${feriado.nombre ? `: ${feriado.nombre}` : "."}`,
      );
      e.code = "BAD_REQUEST";
      throw e;
    }
    // (2) Cumpleaños
    const usuarioFull = await prisma.usuarios.findUnique({
      where: { id: usuarioId },
      select: { personas: { select: { fecha_nacimiento: true } } },
    });
    const fnac = usuarioFull?.personas?.fecha_nacimiento;
    if (fnac) {
      const fnDate = fnac instanceof Date ? fnac : new Date(fnac);
      if (
        !Number.isNaN(fnDate.getTime()) &&
        fnDate.getDate() === fechaLocal.getDate() &&
        fnDate.getMonth() === fechaLocal.getMonth()
      ) {
        const e = new Error(
          "No se puede asignar tareas el día del cumpleaños del usuario.",
        );
        e.code = "BAD_REQUEST";
        throw e;
      }
    }
    // (3) Bloque de horario
    // FIX QUIRÚRGICO Timetz: raw SQL con to_char(hora_::time, 'HH24:MI:SS')
    // para leer las horas wall-clock y evitar el desfase de Prisma en
    // servers con TZ != UTC (ver #findFreeSlotInSchedule). OJO: hay que
    // castear a time (sin zona) — no existe to_char(timetz, text).
    const diaId = DAY_ID_BY_GETDAY[fechaLocal.getDay()] || null;
    if (diaId) {
      const bloques = await prisma.$queryRawUnsafe(
        `SELECT to_char(hora_inicio::time, 'HH24:MI:SS') AS hi,
                to_char(hora_fin::time,    'HH24:MI:SS') AS hf
           FROM horario_jornada_detalle
          WHERE usuario_id = $1
            AND dia_semana = $2
            AND estado = true
            AND hora_inicio IS NOT NULL
            AND hora_fin IS NOT NULL`,
        usuarioId,
        diaId,
      );
      let entraEnBloque = false;
      for (const b of bloques) {
        const ini = toMinFromHms(b.hi);
        const fin = toMinFromHms(b.hf);
        if (ini == null || fin == null) continue;
        if (fin - ini >= minutos) {
          entraEnBloque = true;
          break;
        }
      }
      if (bloques.length > 0 && !entraEnBloque) {
        const e = new Error(
          "El usuario no tiene un bloque de horario lo suficientemente largo para la tarea seleccionada.",
        );
        e.code = "BAD_REQUEST";
        throw e;
      }
      if (bloques.length === 0) {
        const e = new Error(
          "El usuario no tiene horario registrado para el día seleccionado.",
        );
        e.code = "BAD_REQUEST";
        throw e;
      }
    }
  }

  // Devuelve los eventos que se solapan con el slot dado. Si la lista
  // está vacía, el slot está libre. Cada item incluye actividad_id y
  // un campo `bloqueada` para que el front sepa si es movible o no.
  async #checkSlotConflict(usuarioId, fechaStr, horaIni, horaFin) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT hu.actividad_id,
              TO_CHAR(hu.hora_inicio::time, 'HH24:MI:SS') AS hi,
              TO_CHAR(hu.hora_fin::time,    'HH24:MI:SS') AS hf,
              a.prioridad,
              a.bloqueada
         FROM horario_usuario hu
         LEFT JOIN actividades a ON a.id = hu.actividad_id
        WHERE hu.usuario_id = $1
          AND hu.estado     = true
          AND hu.fecha      = $2::date
          AND hu.hora_inicio < $3::timetz
          AND hu.hora_fin    > $4::timetz`,
      usuarioId,
      fechaStr,
      horaFin,
      horaIni,
    );
    return (rows || []).map((r) => ({
      actividad_id: r.actividad_id ? Number(r.actividad_id) : null,
      hi: r.hi,
      hf: r.hf,
      prioridad: r.prioridad || null,
      bloqueada: r.bloqueada === true || r.bloqueada === "true",
    }));
  }
}

export default new PotencialesClientesService();
