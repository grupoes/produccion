import carrerasService from "../services/carreras.service.js";

class CarrerasController {
  async getAll(req, res) {
    try {
      const institucionId = req.query.institucion_id
        ? Number(req.query.institucion_id)
        : null;
      const soloActivas = req.query.solo_activas === "1";
      const data = await carrerasService.getAll({
        institucionId,
        soloActivas,
      });
      return res.json({ success: true, data });
    } catch (error) {
      console.error("CarrerasController.getAll error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener las carreras." });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const data = await carrerasService.getById(id);
      if (!data) {
        return res.status(404).json({ error: "Carrera no encontrada." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("CarrerasController.getById error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener la carrera." });
    }
  }

  async create(req, res) {
    try {
      const { nombre, institucion_id, estado } = req.body;
      const nueva = await carrerasService.create({
        nombre,
        institucion_id,
        estado,
      });
      return res.status(201).json({
        success: true,
        message: "Carrera creada correctamente.",
        data: nueva,
      });
    } catch (error) {
      console.error("CarrerasController.create error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const { nombre, institucion_id, estado } = req.body;
      const actualizada = await carrerasService.update(id, {
        nombre,
        institucion_id,
        estado,
      });
      if (!actualizada) {
        return res.status(404).json({ error: "Carrera no encontrada." });
      }
      return res.json({
        success: true,
        message: "Carrera actualizada correctamente.",
        data: actualizada,
      });
    } catch (error) {
      console.error("CarrerasController.update error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      await carrerasService.remove(id);
      return res.json({
        success: true,
        message: "Carrera desactivada correctamente.",
      });
    } catch (error) {
      console.error("CarrerasController.remove error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al eliminar la carrera." });
    }
  }
}

export default new CarrerasController();
