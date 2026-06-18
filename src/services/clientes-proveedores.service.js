import prisma from "../config/db.js";

// ============================================================================
// Registrar clientes de proveedor
// ----------------------------------------------------------------------------
// Un "cliente de proveedor" es un cliente que ya nos llega cerrado por un
// proveedor externo (no es un potencial a los que vamos a buscar). Por eso
// entra al sistema DIRECTO como `estado_cliente='cliente'` con `proveedor_id`
// seteado desde el inicio, y se crea la actividad en estado pendiente (sin
// agendar en el calendario — eso se hace después en otro flujo).
//
// Inputs (body del POST):
//   {
//     proveedor_id:       int,
//     titulo_prospecto:   string,
//     institucion_id:     int|null,
//     carrera_id:         int|null,
//     nivel_academico_id: int|null,
//     fecha_entrega:      'YYYY-MM-DD',
//     prioridad:          'ALTA'|'MEDIA'|'BAJA'|null,
//     link_drive:         string|null,
//     contenido:          string|null,
//     contactos?:         [{nombres, apellidos, celular}],  // opcional
//     tarea_id:           int
//   }
// ============================================================================

const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"];

class ClientesProveedoresService {
  async create(payload, usuarioId = null) {
    const err = this.#validate(payload);
    if (err) {
      const e = new Error(err);
      e.code = "BAD_REQUEST";
      throw e;
    }

    const t = await prisma.tarea.findUnique({
      where: { id: Number(payload.tarea_id) },
      select: { id: true, horas_estimadas: true },
    });
    if (!t) {
      const e = new Error("La tarea seleccionada no existe.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    const minutos = payload.tiempo_estimado_minutos
      ? Number(payload.tiempo_estimado_minutos)
      : (t.horas_estimadas ? Number(t.horas_estimadas) : 60);

    const proveedor = await prisma.proveedor.findUnique({
      where: { id: Number(payload.proveedor_id) },
      select: { id: true, estado: true },
    });
    if (!proveedor || !proveedor.estado) {
      const e = new Error("El proveedor seleccionado no existe o está inactivo.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    return await prisma.$transaction(async (tx) => {
      // 1) Personas (opcional)
      const contactos = Array.isArray(payload.contactos) ? payload.contactos : [];
      const personaIds = [];
      for (const c of contactos) {
        const persona = await this.#upsertPersona(tx, c);
        personaIds.push(persona.id);
      }

      // 2) Prospecto con estado_cliente='cliente' + proveedor
      //    Prisma 7 no acepta los escalares de FK cuando hay relación
      //    definida; usamos `connect` con la relación.
      const prospecto = await tx.prospectos.create({
        data: {
          titulo_prospecto: payload.titulo_prospecto
            ? String(payload.titulo_prospecto).trim()
            : null,
          ...(payload.carrera_id
            ? { carreras: { connect: { id: Number(payload.carrera_id) } } }
            : {}),
          ...(payload.nivel_academico_id
            ? {
                nivel_academico: {
                  connect: { id: Number(payload.nivel_academico_id) },
                },
              }
            : {}),
          fecha_entrega: payload.fecha_entrega
            ? new Date(payload.fecha_entrega)
            : null,
          prioridad: payload.prioridad || null,
          contenido: payload.contenido || null,
          link_drive: payload.link_drive
            ? String(payload.link_drive).trim()
            : null,
          estado_cliente: "cliente",
          proveedor: { connect: { id: Number(payload.proveedor_id) } },
          fecha_contacto: new Date(),
          estado: true,
        },
      });

      // 3) prospecto_persona
      if (personaIds.length) {
        await tx.prospecto_persona.createMany({
          data: personaIds.map((pid) => ({
            prospecto_id: prospecto.id,
            persona_id: pid,
          })),
        });
      }

      // 4) drive_links (historial) — solo si viene un link
      if (payload.link_drive && String(payload.link_drive).trim()) {
        await tx.drive_links.create({
          data: {
            prospecto_id: prospecto.id,
            link_drive: String(payload.link_drive).trim(),
            created_at: new Date(),
          },
        });
      }

      // 5) Actividad — sin agendar (sin fecha, hora, usuario ni color).
      //    El agendamiento se hace en otro flujo.
      const actividad = await tx.actividades.create({
        data: {
          prospecto_id: prospecto.id,
          tarea_id: Number(payload.tarea_id),
          usuario_id: null,
          prioridad: payload.prioridad || null,
          estado_progreso: "pendiente",
          estado: true,
          fecha_inicio: null,
          hora_inicio: null,
          tiempo_estimado_minutos: minutos,
          color: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      // 6) Historial de estados — el cliente de proveedor arranca ya
      //    como 'cliente'.
      await tx.historial_estados_prospecto.create({
        data: {
          prospecto_id: prospecto.id,
          estado: "cliente",
          usuario_id: usuarioId ? Number(usuarioId) : null,
          comentario: "Cliente de proveedor registrado.",
          fecha_inicio: new Date(),
          fecha_fin: null,
        },
      });

      return {
        id: prospecto.id,
        actividad_id: actividad.id,
      };
    });
  }

  // ---------------- Helpers --------------------------------------------

  #validate(p) {
    if (!p) return "Payload vacío.";
    if (!p.proveedor_id) return "Debes seleccionar un proveedor.";
    if (!p.titulo_prospecto || !String(p.titulo_prospecto).trim()) {
      return "Debes ingresar un título.";
    }
    if (!p.fecha_entrega) return "Debes indicar la fecha de entrega.";
    if (p.prioridad && !PRIORIDADES.includes(p.prioridad)) {
      return "Prioridad inválida.";
    }
    if (p.contactos != null) {
      if (!Array.isArray(p.contactos)) {
        return "contactos debe ser una lista.";
      }
      for (const [i, c] of p.contactos.entries()) {
        if (!c.celular || !String(c.celular).trim()) {
          return `El contacto #${i + 1} requiere número de celular.`;
        }
      }
    }
    if (!p.tarea_id) return "Debes seleccionar una tarea.";
    return null;
  }

  async #upsertPersona(tx, c) {
    const nombres = c.nombres ? String(c.nombres).trim() : null;
    const apellidos = c.apellidos ? String(c.apellidos).trim() : null;
    const celular = String(c.celular).trim();
    const existente = await tx.personas.findFirst({
      where: { celular },
      select: { id: true, nombres: true, apellidos: true },
    });
    if (existente) {
      return tx.personas.update({
        where: { id: existente.id },
        data: {
          nombres: nombres ?? existente.nombres,
          apellidos: apellidos ?? existente.apellidos,
        },
      });
    }
    return tx.personas.create({
      data: { nombres, apellidos, celular, estado: true },
    });
  }
}

export default new ClientesProveedoresService();
