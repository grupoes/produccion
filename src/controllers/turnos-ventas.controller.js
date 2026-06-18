import turnosVentasService from "../services/turnos-ventas.service.js";

class TurnosVentasController {
  async getMatriz(_req, res) {
    try {
      const data = await turnosVentasService.getMatriz();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("TurnosVentasController.getMatriz error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener la matriz de turnos." });
    }
  }

  async saveMatriz(req, res) {
    try {
      const changes = Array.isArray(req.body?.changes)
        ? req.body.changes
        : Array.isArray(req.body)
          ? req.body
          : [];
      const data = await turnosVentasService.saveMatriz(changes);
      return res.json({
        success: true,
        message: "Asignaciones guardadas correctamente.",
        data,
      });
    } catch (error) {
      console.error("TurnosVentasController.saveMatriz error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }
}

export default new TurnosVentasController();
