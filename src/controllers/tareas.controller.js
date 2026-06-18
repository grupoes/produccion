import tareasService from "../services/tareas.service.js";

class TareasController {
  async getAll(_req, res) {
    try {
      const data = await tareasService.getAll();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("TareasController.getAll error:", error);
      return res.status(500).json({ error: "Error interno al obtener las tareas." });
    }
  }

  async getLookups(_req, res) {
    try {
      const [roles, tipoTarea] = await Promise.all([
        tareasService.getRoles(),
        tareasService.getTipoTarea(),
      ]);
      return res.json({ success: true, data: { roles, tipoTarea } });
    } catch (error) {
      console.error("TareasController.getLookups error:", error);
      return res.status(500).json({ error: "Error interno al obtener catálogos." });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const data = await tareasService.getById(id);
      if (!data) {
        return res.status(404).json({ error: "Tarea no encontrada." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("TareasController.getById error:", error);
      return res.status(500).json({ error: "Error interno al obtener la tarea." });
    }
  }

  async create(req, res) {
    try {
      const {
        nombre,
        horas_estimadas,
        tipo_tarea_id,
        aplica_en_ventas,
        aplica_en_proyecto,
        roles,
      } = req.body;

      if (!aplica_en_ventas && !aplica_en_proyecto) {
        return res.status(400).json({
          error: "Selecciona al menos un contexto: Venta o Proyecto.",
        });
      }

      const nueva = await tareasService.create({
        nombre,
        horas_estimadas,
        tipo_tarea_id,
        aplica_en_ventas,
        aplica_en_proyecto,
        roles,
      });
      return res.status(201).json({
        success: true,
        message: "Tarea creada correctamente.",
        data: nueva,
      });
    } catch (error) {
      console.error("TareasController.create error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const {
        nombre,
        horas_estimadas,
        tipo_tarea_id,
        aplica_en_ventas,
        aplica_en_proyecto,
        roles,
      } = req.body;

      if (
        aplica_en_ventas !== undefined &&
        aplica_en_proyecto !== undefined &&
        !aplica_en_ventas &&
        !aplica_en_proyecto
      ) {
        return res.status(400).json({
          error: "Selecciona al menos un contexto: Venta o Proyecto.",
        });
      }

      const actualizado = await tareasService.update(id, {
        nombre,
        horas_estimadas,
        tipo_tarea_id,
        aplica_en_ventas,
        aplica_en_proyecto,
        roles,
      });
      if (!actualizado) {
        return res.status(404).json({ error: "Tarea no encontrada." });
      }
      return res.json({
        success: true,
        message: "Tarea actualizada correctamente.",
        data: actualizado,
      });
    } catch (error) {
      console.error("TareasController.update error:", error);
      return res.status(500).json({ error: "Error interno al actualizar la tarea." });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      await tareasService.remove(id);
      return res.json({
        success: true,
        message: "Tarea desactivada correctamente.",
      });
    } catch (error) {
      console.error("TareasController.remove error:", error);
      return res.status(500).json({ error: "Error interno al eliminar la tarea." });
    }
  }
}

export default new TareasController();
