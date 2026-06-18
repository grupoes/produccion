import configuracionAccionesService from "../services/configuracion-acciones.service.js";

class ConfiguracionAccionesController {
  // ---------- Catálogo de acciones ----------
  async getAcciones(_req, res) {
    try {
      const data = await configuracionAccionesService.getAcciones();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("ConfiguracionAccionesController.getAcciones error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener las acciones." });
    }
  }

  async getAccionById(req, res) {
    try {
      const data = await configuracionAccionesService.getAccionById(
        req.params.id,
      );
      if (!data) {
        return res.status(404).json({ error: "Acción no encontrada." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("ConfiguracionAccionesController.getAccionById error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener la acción." });
    }
  }

  async createAccion(req, res) {
    try {
      const nueva = await configuracionAccionesService.createAccion(req.body);
      return res.status(201).json({
        success: true,
        message: "Acción creada correctamente.",
        data: nueva,
      });
    } catch (error) {
      console.error("ConfiguracionAccionesController.createAccion error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async updateAccion(req, res) {
    try {
      const id = Number(req.params.id);
      const actualizada = await configuracionAccionesService.updateAccion(
        id,
        req.body,
      );
      if (!actualizada) {
        return res.status(404).json({ error: "Acción no encontrada." });
      }
      return res.json({
        success: true,
        message: "Acción actualizada correctamente.",
        data: actualizada,
      });
    } catch (error) {
      console.error("ConfiguracionAccionesController.updateAccion error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al actualizar la acción." });
    }
  }

  async removeAccion(req, res) {
    try {
      const id = Number(req.params.id);
      await configuracionAccionesService.removeAccion(id);
      return res.json({
        success: true,
        message: "Acción desactivada correctamente.",
      });
    } catch (error) {
      console.error("ConfiguracionAccionesController.removeAccion error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al desactivar la acción." });
    }
  }

  // ---------- Matriz ----------
  async getMatriz(_req, res) {
    try {
      const data = await configuracionAccionesService.getMatriz();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("ConfiguracionAccionesController.getMatriz error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener la matriz." });
    }
  }

  async saveMatriz(req, res) {
    try {
      const { changes } = req.body;
      const result = await configuracionAccionesService.saveMatriz(changes);
      return res.json({
        success: true,
        message: "Asignaciones actualizadas correctamente.",
        data: result,
      });
    } catch (error) {
      console.error("ConfiguracionAccionesController.saveMatriz error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }
}

export default new ConfiguracionAccionesController();
