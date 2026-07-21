import prisma from "../config/db.js";
import potencialesClientesService from "./potenciales-clientes.service.js";
import ActividadEstadoHistorialService from "./actividad-estado-historial.service.js";

const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"];

// Roles destinatarios de la notificación de nuevo cliente.
// Mismo criterio que potenciales-clientes.service.js pero el tipo cambia.
const ROLES_NOTIFICABLES = ["super admin", "administrador", "jefe de produccion"];
const ROL_AUX_PROD = "auxiliar de produccion";
const ROL_JEFA_VENTAS = "jefa de ventas";

const POTENCIAL_COLOR_PALETTE = [
  "#dc3545", "#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#0ea5e9",
  "#ef4444", "#f97316", "#06b6d4", "#84cc16", "#d946ef", "#14b8a6",
  "#eab308", "#6366f1", "#ec4899", "#22c55e", "#a855f7", "#f43f5e",
  "#0d9488", "#7c3aed", "#ca8a04", "#0284c7", "#dc2626", "#65a30d",
  "#c026d3", "#0891b2", "#d97706", "#4f46e5", "#be123c", "#059669",
];
const pickRandomColor = () =>
  POTENCIAL_COLOR_PALETTE[
    Math.floor(Math.random() * POTENCIAL_COLOR_PALETTE.length)
  ];

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const matchesAny = (name, list) => {
  const n = norm(name);
  return list.some((p) => n.includes(p));
};

// Convierte "YYYY-MM-DD" a Date local (evita off-by-one por TZ).
const ymdToLocalDate = (ymd) => {
  const fm = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!fm) return null;
  return new Date(Number(fm[1]), Number(fm[2]) - 1, Number(fm[3]));
};

class ClientesService {
  // ---------------- Validaciones -------------------------------------

  #validateCliente(c) {
    if (!c || typeof c !== "object") return "Faltan datos del cliente.";
    if (!c.titulo_prospecto || !String(c.titulo_prospecto).trim()) {
      return "El título del cliente es obligatorio.";
    }
    if (!c.contactos || !Array.isArray(c.contactos) || c.contactos.length === 0) {
      return "Agrega al menos un contacto.";
    }
    for (const [i, ct] of c.contactos.entries()) {
      if (!ct.celular || !String(ct.celular).trim()) {
        return `El contacto #${i + 1} requiere número de celular.`;
      }
    }
    if (c.prioridad && !PRIORIDADES.includes(c.prioridad)) {
      return "Prioridad inválida.";
    }
    return null;
  }

  #validateActividad(a) {
    if (!a || typeof a !== "object") return "Actividad inválida.";
    if (!a.tarea_id) return "Falta tarea_id en la actividad.";
    if (!a.usuario_asignado_id)
      return "Falta usuario_asignado_id en la actividad.";
    if (!a.fecha_asignacion) return "Falta fecha_asignacion en la actividad.";
    if (!a.hora_inicio || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(a.hora_inicio))) {
      return "Falta hora_inicio (HH:MM) en la actividad.";
    }
    if (
      a.duracion_minutos != null &&
      a.duracion_minutos !== "" &&
      (!Number.isFinite(Number(a.duracion_minutos)) ||
        Number(a.duracion_minutos) <= 0)
    ) {
      return "duracion_minutos inválido en una actividad (debe ser > 0).";
    }
    if (a.prioridad && !PRIORIDADES.includes(a.prioridad)) {
      return "Prioridad inválida en una actividad.";
    }
    return null;
  }

  // ---------------- Notificaciones -----------------------------------

  async #resolveNotifRecipients(tx, usuarioId, assignedUserIds) {
    const creatorId = usuarioId ? Number(usuarioId) : null;
    const exclude = (uid) => creatorId && Number(uid) === creatorId;
    const out = new Set();

    // Roles administrativos
    const rolesAdminIds = await tx.roles.findMany({
      where: {
        estado: true,
        OR: ROLES_NOTIFICABLES.map((n) => ({
          nombre: { contains: n.split(" ")[0], mode: "insensitive" },
        })),
      },
      select: { id: true },
    });
    const adminIds = rolesAdminIds.map((r) => r.id);
    if (adminIds.length) {
      const us = await tx.usuarios.findMany({
        where: {
          rol_id: { in: adminIds },
          estado: true,
          ...(creatorId ? { id: { not: creatorId } } : {}),
        },
        select: { id: true },
      });
      for (const u of us) out.add(Number(u.id));
    }

    // AUXILIAR DE PRODUCCIÓN asignados al día de hoy
    const rolAux = await tx.roles.findFirst({
      where: {
        estado: true,
        nombre: { contains: "auxiliar", mode: "insensitive" },
      },
      select: { id: true },
    });
    if (rolAux) {
      const DAY_ID_BY_GETDAY = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
      const diaId = DAY_ID_BY_GETDAY[new Date().getDay()] || null;
      if (diaId) {
        const auxAsignados = await tx.$queryRawUnsafe(
          `SELECT u.id
             FROM usuarios u
             JOIN asignacion_dias ad ON ad.usuario_id = u.id
             JOIN dias d ON d.id = ad.dia_id
            WHERE u.estado = true
              AND u.rol_id = $1
              AND d.id = $2
              ${creatorId ? `AND u.id <> ${Number(creatorId)}` : ""}`,
          rolAux.id,
          diaId,
        );
        for (const r of auxAsignados) out.add(Number(r.id));
      }
    }

    // JEFA DE VENTAS
    const rolJefa = await tx.roles.findFirst({
      where: {
        estado: true,
        nombre: { contains: "jefa", mode: "insensitive" },
      },
      select: { id: true },
    });
    if (rolJefa) {
      const us = await tx.usuarios.findMany({
        where: {
          rol_id: rolJefa.id,
          estado: true,
          ...(creatorId ? { id: { not: creatorId } } : {}),
        },
        select: { id: true },
      });
      for (const u of us) out.add(Number(u.id));
    }

    // Usuarios explícitamente asignados en las actividades
    for (const uid of assignedUserIds || []) {
      if (!exclude(uid)) out.add(Number(uid));
    }

    return Array.from(out);
  }

  // ---------------- Create (registro directo de cliente) -------------

  // body esperado:
  // {
  //   cliente: { titulo_prospecto, fecha_contacto?, origen_id?,
  //              institucion_id?, carrera_id?, nivel_academico_id?,
  //              link_drive?, contenido?, fecha_entrega?, prioridad?,
  //              contactos: [{ nombres, apellidos, celular, email?, tipo_documento_id?, numero_documento? }] },
  //   actividades: [{ tarea_id, usuario_asignado_id, fecha_asignacion,
  //                   hora_inicio, prioridad? }]
  // }
  async create(payload, usuarioId = null) {
    if (!payload || typeof payload !== "object") {
      const e = new Error("Payload inválido.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const errC = this.#validateCliente(payload.cliente);
    if (errC) {
      const e = new Error(errC);
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (!Array.isArray(payload.actividades) || payload.actividades.length === 0) {
      const e = new Error("Agrega al menos una actividad.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    for (const [i, a] of payload.actividades.entries()) {
      const errA = this.#validateActividad(a);
      if (errA) {
        const e = new Error(`Actividad #${i + 1}: ${errA}`);
        e.code = "BAD_REQUEST";
        throw e;
      }
    }

    const cliente = payload.cliente;

    // Pre-resolución de tareas (para reutilizar minutos_estimados).
    const tareasCache = new Map();
    const getTareaMinutos = async (tx, tareaId) => {
      if (tareasCache.has(tareaId)) return tareasCache.get(tareaId);
      const t = await tx.tarea.findUnique({
        where: { id: Number(tareaId) },
        select: { id: true, horas_estimadas: true },
      });
      const minutos =
        t && t.horas_estimadas ? Number(t.horas_estimadas) : 60;
      tareasCache.set(tareaId, minutos);
      return minutos;
    };

    // Pre-resolución de "es reunión" por tarea
    const reunionCache = new Map();
    const isReunion = async (tx, tareaId) => {
      if (reunionCache.has(tareaId)) return reunionCache.get(tareaId);
      const r = await potencialesClientesService.isReunionTarea(tx, tareaId);
      reunionCache.set(tareaId, r);
      return r;
    };

    return await prisma.$transaction(async (tx) => {
      // 1) Contactos (personas)
      const personaIds = [];
      for (const c of cliente.contactos) {
        const persona = await potencialesClientesService.upsertPersona(tx, c);
        personaIds.push(persona.id);
      }

      // 2) Prospecto creado directamente como "cliente"
      const prospecto = await tx.prospectos.create({
        data: {
          titulo_prospecto: String(cliente.titulo_prospecto).trim(),
          ...(cliente.carrera_id
            ? { carreras: { connect: { id: Number(cliente.carrera_id) } } }
            : {}),
          ...(cliente.nivel_academico_id
            ? {
                nivel_academico: {
                  connect: { id: Number(cliente.nivel_academico_id) },
                },
              }
            : {}),
          ...(cliente.origen_id
            ? { origen: { connect: { id: Number(cliente.origen_id) } } }
            : {}),
          fecha_contacto: cliente.fecha_contacto
            ? new Date(cliente.fecha_contacto)
            : new Date(),
          fecha_entrega: cliente.fecha_entrega
            ? new Date(cliente.fecha_entrega)
            : null,
          prioridad: cliente.prioridad || null,
          contenido: cliente.contenido || null,
          link_drive: cliente.link_drive
            ? String(cliente.link_drive).trim()
            : null,
          estado_cliente: "cliente",
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

      // 4) drive_links (historial) si hay link
      if (cliente.link_drive && String(cliente.link_drive).trim()) {
        await tx.drive_links.create({
          data: {
            prospecto_id: prospecto.id,
            link_drive: String(cliente.link_drive).trim(),
            created_at: new Date(),
          },
        });
      }

      // 5) Actividades
      const actividadesCreadas = [];
      const assignedUserIds = new Set();

      for (const [idx, a] of payload.actividades.entries()) {
        const usuarioAsig = Number(a.usuario_asignado_id);
        const fechaAsig = ymdToLocalDate(a.fecha_asignacion);
        const horaIniDate = potencialesClientesService.hmsToDate(a.hora_inicio);
        const reunionTipo = await isReunion(tx, a.tarea_id);
        const minutosTarea = await getTareaMinutos(tx, a.tarea_id);
        // El front puede sobreescribir la duración estimada de la tarea
        // (input editable "HH:MM" en la fila de la actividad).
        const overrideMin =
          a.duracion_minutos != null && a.duracion_minutos !== ""
            ? Math.max(1, Math.floor(Number(a.duracion_minutos)) || 0)
            : null;
        const minutos = overrideMin || minutosTarea;

        if (!fechaAsig || !horaIniDate) {
          const e = new Error(
            `Actividad #${idx + 1}: fecha u hora inválida.`,
          );
          e.code = "BAD_REQUEST";
          throw e;
        }

        const horaFinDate = new Date(horaIniDate.getTime() + minutos * 60_000);

        // Validaciones: feriado, cumpleaños y jornada.
        // - Feriado/cumpleaños: SIEMPRE se validan (incluso para reuniones),
        //   porque son bloqueos del calendario a nivel de DÍA.
        // - Bloque de jornada: se valida con skipBloqueChecks para
        //   reuniones (el scheduler las reasigna a un hueco real) y sin
        //   skip para actividades normales (el front elige hora manualmente).
        //   Si el prospecto tiene fecha_entrega, se suman los bloques
        //   disponibles desde fechaAsig hasta fecha_entrega para soportar
        //   actividades que se parten entre varios días.
        try {
          await potencialesClientesService.validarDiaAsignacion(
            usuarioAsig,
            fechaAsig,
            minutos,
            {
              skipBloqueChecks: !!reunionTipo,
              fechaLimite: prospecto.fecha_entrega || null,
            },
          );
        } catch (validationErr) {
          const e = new Error(
            `Actividad #${idx + 1}: ${validationErr.message}`,
          );
          e.code = validationErr.code || "BAD_REQUEST";
          throw e;
        }

        const actividad = await tx.actividades.create({
          data: {
            prospecto_id: prospecto.id,
            tarea_id: Number(a.tarea_id),
            usuario_id: usuarioAsig,
            usuario_register: usuarioId ? Number(usuarioId) : null,
            prioridad: a.prioridad || cliente.prioridad || null,
            estado_progreso: "pendiente",
            estado: true,
            fecha_inicio: fechaAsig,
            hora_inicio: horaIniDate,
            tiempo_estimado_minutos: minutos,
            color: pickRandomColor(),
            created_at: new Date(),
            updated_at: new Date(),
          },
        });

        await ActividadEstadoHistorialService.transicion(
          tx,
          actividad.id,
          "pendiente",
          new Date(),
          { creadaEn: actividad.created_at },
        );

        // horario_usuario SOLO si NO es reunión y NO es valorador.
        if (!reunionTipo) {
          await potencialesClientesService.createHorarioUsuarioSiNoEsValorador(
            tx,
            {
              usuarioId: usuarioAsig,
              actividadId: actividad.id,
              fecha: fechaAsig,
              horaInicio: horaIniDate,
              horaFin: horaFinDate,
              duracionMinutos: minutos,
              tipo: "actividad",
              categoria: "cliente",
              fechaLimite: prospecto.fecha_entrega || null,
            },
          );
        }

        actividadesCreadas.push({
          id: actividad.id,
          tarea_id: Number(a.tarea_id),
          usuario_id: usuarioAsig,
        });
        assignedUserIds.add(usuarioAsig);
      }

      // 6) Historial de estados del cliente
      await tx.historial_estados_prospecto.create({
        data: {
          prospecto_id: prospecto.id,
          estado: "cliente",
          usuario_id: usuarioId ? Number(usuarioId) : null,
          comentario: "Cliente registrado.",
          fecha_inicio: new Date(),
          fecha_fin: null,
        },
      });

      // 7) Notificaciones a admin / auxiliar / jefa + usuarios asignados
      const recipientIds = await this.#resolveNotifRecipients(
        tx,
        usuarioId,
        Array.from(assignedUserIds),
      );

      const insertedNotifs = [];
      if (recipientIds.length > 0) {
        const tituloNotif = "Nuevo cliente registrado";
        const contactoTxt = (cliente.contactos || [])
          .map((c) =>
            [c?.nombres, c?.apellidos].filter(Boolean).join(" ").trim(),
          )
          .filter(Boolean)
          .join(", ");
        const baseMensaje = cliente.titulo_prospecto
          ? `${cliente.titulo_prospecto}${contactoTxt ? ` — ${contactoTxt}` : ""}`
          : contactoTxt || "Sin título";
        const mensaje = baseMensaje.slice(0, 255);
        const prioridadNum =
          cliente.prioridad === "ALTA"
            ? 1
            : cliente.prioridad === "MEDIA"
              ? 2
              : cliente.prioridad === "BAJA"
                ? 3
                : null;

        for (const uid of recipientIds) {
          const notif = await tx.notificaciones.create({
            data: {
              usuario_id: uid,
              remitente_id: usuarioId ? Number(usuarioId) : null,
              titulo: tituloNotif,
              mensaje,
              tipo: "cliente",
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
        id: prospecto.id,
        actividades: actividadesCreadas,
        notifications: insertedNotifs,
      };
    });
  }
}

export default new ClientesService();