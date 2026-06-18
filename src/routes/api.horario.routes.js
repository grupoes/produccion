import express from "express";
import horarioController from "../controllers/horario.controller.js";
import reprogramarController from "../controllers/reprogramar.controller.js";

const router = express.Router();

// GET /api/horario?usuario_id=&desde=&hasta=
//   → Eventos del usuario (FullCalendar) desde `horario_usuario` +
//     join con `actividades` y `prospectos`.
router.get("/", horarioController.getEventos);

// POST /api/horario/sugerir
//   body: { usuario_id, fecha, minutos, prioridad?, deadline?, prospecto_id?,
//           actividad_id? }
//   → Devuelve plan de scheduling + moves. Si no entra, devuelve
//     suggestions del overflow service.
router.post("/sugerir", reprogramarController.sugerir);

// POST /api/horario/reprogramar
//   body: { actividad_id, fecha_destino?, motivo? }
//   → Aplica los movimientos del plan. Si no entra, 409 con suggestions.
router.post("/reprogramar", reprogramarController.reprogramar);

export default router;
