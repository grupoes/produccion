import nivelAcademicoService from "../services/nivel-academico.service.js";

class NivelAcademicoController {
  async getAll(_req, res) {
    try {
      const data = await nivelAcademicoService.getAll();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("NivelAcademicoController.getAll error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener los niveles académicos." });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const data = await nivelAcademicoService.getById(id);
      if (!data) {
        return res.status(404).json({ error: "Nivel académico no encontrado." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("NivelAcademicoController.getById error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener el nivel académico." });
    }
  }

  async create(req, res) {
    try {
      const { nombre, descripcion } = req.body;
      const nuevo = await nivelAcademicoService.create({ nombre, descripcion });
      return res.status(201).json({
        success: true,
        message: "Nivel académico creado correctamente.",
        data: nuevo,
      });
    } catch (error) {
      console.error("NivelAcademicoController.create error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const { nombre, descripcion } = req.body;
      const actualizado = await nivelAcademicoService.update(id, {
        nombre,
        descripcion,
      });
      if (!actualizado) {
        return res.status(404).json({ error: "Nivel académico no encontrado." });
      }
      return res.json({
        success: true,
        message: "Nivel académico actualizado correctamente.",
        data: actualizado,
      });
    } catch (error) {
      console.error("NivelAcademicoController.update error:", error);
      return res.status(500).json({
        error: "Error interno al actualizar el nivel académico.",
      });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      await nivelAcademicoService.remove(id);
      return res.json({
        success: true,
        message: "Nivel académico desactivado correctamente.",
      });
    } catch (error) {
      console.error("NivelAcademicoController.remove error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al eliminar el nivel académico." });
    }
  }
}

export default new NivelAcademicoController();
