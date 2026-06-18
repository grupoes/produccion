import kanbanService from "../services/kanban.service.js";

class KanbanController {
  // GET /api/kanban/mias?includeCompleted=0|1&from=YYYY-MM-DD&to=YYYY-MM-DD
  async mias(req, res) {
    try {
      const me = req.session?.user;
      if (!me) return res.status(401).json({ error: "No autenticado." });
      const includeCompleted = req.query.includeCompleted !== "0";
      const from = req.query.from || null;
      const to = req.query.to || null;
      const data = await kanbanService.getKanbanByUsuario(me.id, {
        includeCompleted,
        from,
        to,
      });
      return res.json({ success: true, data });
    } catch (err) {
      console.error("KanbanController.mias error:", err);
      return res
        .status(500)
        .json({ error: "Error al obtener las actividades." });
    }
  }

  // PATCH /api/kanban/mover/:id  body: { estado_progreso }
  async mover(req, res) {
    try {
      const me = req.session?.user;
      if (!me) return res.status(401).json({ error: "No autenticado." });
      const id = Number(req.params.id);
      const { estado_progreso } = req.body;
      const data = await kanbanService.moverActividad(id, estado_progreso, me);
      return res.json({
        success: true,
        message: "Actividad movida correctamente.",
        data,
      });
    } catch (err) {
      console.error("KanbanController.mover error:", err);
      let status = 500;
      if (err.code === "BAD_REQUEST") status = 400;
      else if (err.code === "NOT_FOUND") status = 404;
      else if (err.code === "FORBIDDEN") status = 403;
      else if (err.code === "BLOCKED") status = 409;
      return res.status(status).json({ error: err.message });
    }
  }
}

export default new KanbanController();
