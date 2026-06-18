import universidadService from "../services/universidad.service.js";

class UniversidadController {
  async getAll(_req, res) {
    try {
      const data = await universidadService.getAll();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("UniversidadController.getAll error:", error);
      return res.status(500).json({ error: "Error interno al obtener las instituciones." });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const data = await universidadService.getById(id);
      if (!data) {
        return res.status(404).json({ error: "Institución no encontrada." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("UniversidadController.getById error:", error);
      return res.status(500).json({ error: "Error interno al obtener la institución." });
    }
  }

  async create(req, res) {
    try {
      const { nombre, abreviatura, sector, tipo } = req.body;
      const nueva = await universidadService.create({
        nombre,
        abreviatura,
        sector,
        tipo,
      });
      return res.status(201).json({
        success: true,
        message: "Institución creada correctamente.",
        data: nueva,
      });
    } catch (error) {
      console.error("UniversidadController.create error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const { nombre, abreviatura, sector, tipo } = req.body;
      const actualizado = await universidadService.update(id, {
        nombre,
        abreviatura,
        sector,
        tipo,
      });
      if (!actualizado) {
        return res.status(404).json({ error: "Institución no encontrada." });
      }
      return res.json({
        success: true,
        message: "Institución actualizada correctamente.",
        data: actualizado,
      });
    } catch (error) {
      console.error("UniversidadController.update error:", error);
      return res.status(500).json({ error: "Error interno al actualizar la institución." });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      await universidadService.remove(id);
      return res.json({
        success: true,
        message: "Institución desactivada correctamente.",
      });
    } catch (error) {
      console.error("UniversidadController.remove error:", error);
      return res.status(500).json({ error: "Error interno al eliminar la institución." });
    }
  }
}

export default new UniversidadController();
