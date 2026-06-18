import express from "express";
import kanbanController from "../controllers/kanban.controller.js";

const router = express.Router();

// GET    /api/kanban/mias           → Actividades del usuario logueado, agrupadas en columnas
//   Query params: includeCompleted=0|1 (default 1), from=YYYY-MM-DD, to=YYYY-MM-DD
router.get("/mias", kanbanController.mias);

// PATCH  /api/kanban/mover/:id      → Mueve una actividad de columna
//   Body: { estado_progreso: "pendiente" | "en_progreso" | "completada" }
router.patch("/mover/:id", kanbanController.mover);

export default router;
