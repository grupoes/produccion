import origenService from "../services/origen.service.js";

class OrigenController {
  async getAll(_req, res) {
    try {
      const data = await origenService.getAll();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("OrigenController.getAll error:", error);
      return res.status(500).json({ error: "Error interno al obtener los orígenes." });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const data = await origenService.getById(id);
      if (!data) {
        return res.status(404).json({ error: "Origen no encontrado." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("OrigenController.getById error:", error);
      return res.status(500).json({ error: "Error interno al obtener el origen." });
    }
  }

  async create(req, res) {
    try {
      const { nombre, descripcion } = req.body;
      const nuevo = await origenService.create({ nombre, descripcion });
      return res.status(201).json({
        success: true,
        message: "Origen creado correctamente.",
        data: nuevo,
      });
    } catch (error) {
      console.error("OrigenController.create error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const { nombre, descripcion } = req.body;
      const actualizado = await origenService.update(id, { nombre, descripcion });
      if (!actualizado) {
        return res.status(404).json({ error: "Origen no encontrado." });
      }
      return res.json({
        success: true,
        message: "Origen actualizado correctamente.",
        data: actualizado,
      });
    } catch (error) {
      console.error("OrigenController.update error:", error);
      return res.status(500).json({ error: "Error interno al actualizar el origen." });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      await origenService.remove(id);
      return res.json({
        success: true,
        message: "Origen desactivado correctamente.",
      });
    } catch (error) {
      console.error("OrigenController.remove error:", error);
      return res.status(500).json({ error: "Error interno al eliminar el origen." });
    }
  }
}

export default new OrigenController();
