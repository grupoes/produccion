import trabajosEntregaService from "../services/trabajos-entrega.service.js";

class TrabajosEntregaController {
  async listarEstaSemana(req, res) {
    try {
      const data = await trabajosEntregaService.listarTrabajosSemana({ semanaOffset: 0 });
      return res.json({ success: true, data });
    } catch (error) {
      console.error("[trabajos-entrega] esta-semana error:", error);
      return res.status(500).json({ error: "Error interno al obtener trabajos de esta semana." });
    }
  }

  async listarProximaSemana(req, res) {
    try {
      const data = await trabajosEntregaService.listarTrabajosSemana({ semanaOffset: 1 });
      return res.json({ success: true, data });
    } catch (error) {
      console.error("[trabajos-entrega] proxima-semana error:", error);
      return res.status(500).json({ error: "Error interno al obtener trabajos de la próxima semana." });
    }
  }
}

export default new TrabajosEntregaController();