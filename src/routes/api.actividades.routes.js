import express from "express";
import actividadesController from "../controllers/actividades.controller.js";
import ActividadEstadoHistorialService from "../services/actividad-estado-historial.service.js";

const router = express.Router();

// POST /api/actividades/:id/start
//   → Setea fecha_inicio_real/hora_inicio_real/estado_progreso='en_progreso'.
//     Inserta fila en actividad_estado_historial.
router.post("/:id/start", actividadesController.start);

// POST /api/actividades/:id/end
//   → Setea fecha_termino_real/hora_termino_real/estado_progreso='completada'
//     y calcula tiempo_real_minutos.
router.post("/:id/end", actividadesController.end);

// GET /api/actividades/:id/historial
//   → Devuelve el historial completo de transiciones de estado de la
//     actividad (una fila por cada estadía en pendiente / en_progreso /
//     completada), ordenado del más antiguo al más reciente. Útil para
//     el modal de detalle del Kanban o vista de "auditoría".
router.get("/:id/historial", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "id requerido." });
    }
    const rows = await ActividadEstadoHistorialService.getHistorial(id);
    return res.json({ success: true, historial: rows });
  } catch (err) {
    console.error("GET /api/actividades/:id/historial error:", err);
    return res
      .status(500)
      .json({ error: "Error al obtener el historial.", detail: err.message });
  }
});

export default router;
