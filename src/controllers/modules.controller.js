import modulesService from "../services/modules.service.js";

class ModulesController {
  async getModules(req, res) {
    try {
      // Priorizar rol del query, sino intentar desde la sesión
      const rolIdQuery = req.query.rol_id
        ? parseInt(req.query.rol_id, 10)
        : null;
      const sessionRol = req.session?.user?.rol?.id || null;
      const rolId = rolIdQuery || sessionRol;

      if (!rolId)
        return res.status(400).json({ error: "rol_id no proporcionado." });

      const modules = await modulesService.getModulesByRole(rolId);
      return res.json({ success: true, data: modules });
    } catch (error) {
      console.error("ModulesController.getModules error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener módulos." });
    }
  }
}

export default new ModulesController();
