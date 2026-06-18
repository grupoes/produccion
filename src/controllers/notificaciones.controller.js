import notificacionesService from "../services/notificaciones.service.js";

class NotificacionesController {
  async getRecientes(req, res) {
    try {
      const usuarioId = req.session?.user?.id;
      if (!usuarioId) return res.status(401).json({ error: "No autenticado." });
      const data = await notificacionesService.getRecientes(usuarioId, 10);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("NotificacionesController.getRecientes error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener las notificaciones." });
    }
  }

  async countNoLeidas(req, res) {
    try {
      const usuarioId = req.session?.user?.id;
      if (!usuarioId) return res.status(401).json({ error: "No autenticado." });
      const count = await notificacionesService.countNoLeidas(usuarioId);
      return res.json({ success: true, count });
    } catch (error) {
      console.error("NotificacionesController.countNoLeidas error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al contar notificaciones." });
    }
  }

  async marcarLeida(req, res) {
    try {
      const usuarioId = req.session?.user?.id;
      if (!usuarioId) return res.status(401).json({ error: "No autenticado." });
      const id = Number(req.params.id);
      const result = await notificacionesService.marcarLeida(id, usuarioId);
      if (!result) {
        return res.status(404).json({ error: "Notificación no encontrada." });
      }
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("NotificacionesController.marcarLeida error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al marcar como leída." });
    }
  }

  async marcarTodasLeidas(_req, res) {
    try {
      const usuarioId = _req.session?.user?.id;
      if (!usuarioId) return res.status(401).json({ error: "No autenticado." });
      const result = await notificacionesService.marcarTodasLeidas(usuarioId);
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("NotificacionesController.marcarTodasLeidas error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al marcar todas como leídas." });
    }
  }
}

export default new NotificacionesController();
