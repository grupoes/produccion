import proveedoresService from "../services/proveedores.service.js";

class ProveedoresController {
  async getAll(_req, res) {
    try {
      const data = await proveedoresService.getAll();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("ProveedoresController.getAll error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener los proveedores." });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const data = await proveedoresService.getById(id);
      if (!data) {
        return res.status(404).json({ error: "Proveedor no encontrado." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("ProveedoresController.getById error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener el proveedor." });
    }
  }

  async create(req, res) {
    try {
      const { nombre } = req.body;
      const nuevo = await proveedoresService.create({ nombre });
      return res.status(201).json({
        success: true,
        message: "Proveedor creado correctamente.",
        data: nuevo,
      });
    } catch (error) {
      console.error("ProveedoresController.create error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const { nombre } = req.body;
      const actualizado = await proveedoresService.update(id, { nombre });
      if (!actualizado) {
        return res.status(404).json({ error: "Proveedor no encontrado." });
      }
      return res.json({
        success: true,
        message: "Proveedor actualizado correctamente.",
        data: actualizado,
      });
    } catch (error) {
      console.error("ProveedoresController.update error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al actualizar el proveedor." });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      await proveedoresService.remove(id);
      return res.json({
        success: true,
        message: "Proveedor desactivado correctamente.",
      });
    } catch (error) {
      console.error("ProveedoresController.remove error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al eliminar el proveedor." });
    }
  }
}

export default new ProveedoresController();
