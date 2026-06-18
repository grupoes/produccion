import express from "express";
import turnosVentasController from "../controllers/turnos-ventas.controller.js";

const router = express.Router();

// GET  /api/turnos-ventas/matriz   → { auxiliares, dias, checks }
router.get("/matriz", turnosVentasController.getMatriz);

// POST /api/turnos-ventas/matriz   → body { changes: [{ usuario_id, dia_ids: [] }] }
router.post("/matriz", turnosVentasController.saveMatriz);

export default router;
