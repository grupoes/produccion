import modulosService from "../services/modulos.service.js";

class ModulosController {
  async getAll(_req, res) {
    try {
      const data = await modulosService.getAll();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("ModulosController.getAll error:", error);
      return res.status(500).json({ error: "Error interno al obtener los módulos." });
    }
  }

  async getLookups(req, res) {
    try {
      // Para el <select> de "módulo padre", excluyendo el módulo en edición.
      const excludeId = req.query.excludeId
        ? Number(req.query.excludeId)
        : null;
      const padres = await modulosService.getPadres(excludeId);
      return res.json({ success: true, data: { padres } });
    } catch (error) {
      console.error("ModulosController.getLookups error:", error);
      return res.status(500).json({ error: "Error interno al obtener catálogos." });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const data = await modulosService.getById(id);
      if (!data) {
        return res.status(404).json({ error: "Módulo no encontrado." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("ModulosController.getById error:", error);
      return res.status(500).json({ error: "Error interno al obtener el módulo." });
    }
  }

  async create(req, res) {
    try {
      const { modulo, url, icono, idpadre, orden } = req.body;
      const nuevo = await modulosService.create({
        modulo,
        url,
        icono,
        idpadre,
        orden,
      });
      return res.status(201).json({
        success: true,
        message: "Módulo creado correctamente.",
        data: nuevo,
      });
    } catch (error) {
      console.error("ModulosController.create error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const { modulo, url, icono, idpadre, orden } = req.body;
      const actualizado = await modulosService.update(id, {
        modulo,
        url,
        icono,
        idpadre,
        orden,
      });
      if (!actualizado) {
        return res.status(404).json({ error: "Módulo no encontrado." });
      }
      return res.json({
        success: true,
        message: "Módulo actualizado correctamente.",
        data: actualizado,
      });
    } catch (error) {
      console.error("ModulosController.update error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      await modulosService.remove(id);
      return res.json({
        success: true,
        message: "Módulo desactivado correctamente.",
      });
    } catch (error) {
      console.error("ModulosController.remove error:", error);
      return res.status(500).json({ error: "Error interno al eliminar el módulo." });
    }
  }
}

export default new ModulosController();
