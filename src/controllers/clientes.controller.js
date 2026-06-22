import clientesService from "../services/clientes.service.js";

const ROL_ASISTENTE_PROD_ID = 11;

class ClientesController {
  async create(req, res) {
    try {
      // Solo ASISTENTE DE PRODUCCIÓN puede registrar clientes directo
      // desde el modal del calendario. Otros roles no tienen este
      // botón y, por defensa, la API también rechaza.
      const rolId = Number(req.session?.user?.rol?.id);
      if (rolId !== ROL_ASISTENTE_PROD_ID) {
        return res
          .status(403)
          .json({ error: "Solo ASISTENTE DE PRODUCCIÓN puede crear clientes." });
      }

      const usuarioId = req.session?.user?.id || null;
      const r = await clientesService.create(req.body, usuarioId);

      // Emitimos notificaciones por socket. Una por destinatario.
      const io = req.app?.locals?.io;
      if (io && Array.isArray(r.notifications)) {
        for (const n of r.notifications) {
          io.to(`user:${n.usuario_id}`).emit("nueva-notificacion", {
            id: n.id,
            titulo: n.titulo,
            mensaje: n.mensaje,
            tipo: n.tipo,
            prioridad: n.prioridad,
            es_leida: !!n.es_leida,
            created_at: n.created_at,
          });
        }
      }

      return res.status(201).json({
        success: true,
        message: "Cliente creado correctamente.",
        data: {
          id: r.id,
          actividades: r.actividades,
        },
      });
    } catch (error) {
      console.error("ClientesController.create error:", error);
      if (error.code === "SLOT_CONFLICT") {
        return res.status(409).json({
          error: error.message,
          conflicts: error.conflicts,
        });
      }
      if (error.code === "NOT_FOUND") {
        return res.status(404).json({ error: error.message });
      }
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }
}

export default new ClientesController();