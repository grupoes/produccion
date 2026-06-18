import express from "express";
import notificacionesController from "../controllers/notificaciones.controller.js";

const router = express.Router();

// GET    /api/notificaciones/recientes    → Últimas 10 notificaciones
router.get("/recientes", notificacionesController.getRecientes);

// GET    /api/notificaciones/no-leidas    → { count }
router.get("/no-leidas", notificacionesController.countNoLeidas);

// PATCH  /api/notificaciones/leidas       → Marca todas como leídas
router.patch("/leidas", notificacionesController.marcarTodasLeidas);

// PATCH  /api/notificaciones/:id/leida    → Marca una como leída
router.patch("/:id/leida", notificacionesController.marcarLeida);

export default router;
