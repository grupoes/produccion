import permisosService from "../services/permisos.service.js";

class PermisosController {
  async getRoles(_req, res) {
    try {
      const roles = await permisosService.getRoles();
      return res.json({ success: true, data: roles });
    } catch (error) {
      console.error("PermisosController.getRoles error:", error);
      return res.status(500).json({ error: "Error al obtener los roles." });
    }
  }

  async getRolById(req, res) {
    try {
      const data = await permisosService.getRolById(req.params.id);
      if (!data) return res.status(404).json({ error: "Rol no encontrado." });
      return res.json({ success: true, data });
    } catch (error) {
      console.error("PermisosController.getRolById error:", error);
      return res.status(500).json({ error: "Error al obtener el rol." });
    }
  }

  async createRol(req, res) {
    try {
      const data = await permisosService.createRol(req.body || {});
      return res.status(201).json({
        success: true,
        message: "Rol creado correctamente.",
        data,
      });
    } catch (error) {
      console.error("PermisosController.createRol error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res
        .status(status)
        .json({ error: error.message || "Error al crear el rol." });
    }
  }

  async updateRol(req, res) {
    try {
      const data = await permisosService.updateRol(
        req.params.id,
        req.body || {},
      );
      if (!data) return res.status(404).json({ error: "Rol no encontrado." });
      return res.json({
        success: true,
        message: "Rol actualizado correctamente.",
        data,
      });
    } catch (error) {
      console.error("PermisosController.updateRol error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res
        .status(status)
        .json({ error: error.message || "Error al actualizar el rol." });
    }
  }

  async removeRol(req, res) {
    try {
      const data = await permisosService.removeRol(req.params.id);
      if (!data) return res.status(404).json({ error: "Rol no encontrado." });
      return res.json({
        success: true,
        message: "Rol eliminado correctamente.",
        data,
      });
    } catch (error) {
      console.error("PermisosController.removeRol error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res
        .status(status)
        .json({ error: error.message || "Error al eliminar el rol." });
    }
  }

  async getModulosConAcciones(_req, res) {
    try {
      const data = await permisosService.getModulosConAcciones();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("PermisosController.getModulosConAcciones error:", error);
      return res.status(500).json({ error: "Error al obtener los módulos." });
    }
  }

  async getPermisosPorRol(req, res) {
    try {
      const rolId = Number(req.params.rolId);
      const data = await permisosService.getPermisosPorRol(rolId);
      if (!data) {
        return res.status(404).json({ error: "Rol no encontrado." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("PermisosController.getPermisosPorRol error:", error);
      return res.status(500).json({ error: "Error al obtener los permisos." });
    }
  }

  async savePermisosPorRol(req, res) {
    try {
      const rolId = Number(req.params.rolId);
      const { permisos } = req.body;
      if (!rolId) {
        return res.status(400).json({ error: "rolId inválido." });
      }
      const result = await permisosService.savePermisosPorRol(rolId, permisos);
      return res.json({
        success: true,
        message: "Permisos actualizados correctamente.",
        data: result,
      });
    } catch (error) {
      console.error("PermisosController.savePermisosPorRol error:", error);
      return res.status(500).json({ error: "Error al guardar los permisos." });
    }
  }
}

export default new PermisosController();
