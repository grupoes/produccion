import horarioService from "../services/horario.service.js";

class HorarioController {
  async getEventos(req, res) {
    try {
      // Si el query trae `usuario_id`, lo usamos (útil para admin/supervisor
      // que mira el calendario de otro). Si no, usamos el usuario logueado.
      const usuarioId =
        req.query.usuario_id != null
          ? Number(req.query.usuario_id)
          : req.session?.user?.id;
      if (!usuarioId) {
        return res.status(400).json({ error: "usuario_id requerido." });
      }
      const data = await horarioService.getEventosPorUsuario(
        usuarioId,
        req.query.desde,
        req.query.hasta,
      );
      return res.json({ success: true, data });
    } catch (error) {
      console.error("HorarioController.getEventos error:", error);
      // En dev exponemos el mensaje real para detectar bugs rápido
      // (referencias a columnas inexistentes, etc.). En prod conviene
      // enmascararlo, pero por ahora es lo más útil.
      return res
        .status(500)
        .json({ error: "Error al obtener el horario.", detail: error.message });
    }
  }
}

export default new HorarioController();
