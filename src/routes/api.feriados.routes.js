import express from "express";
import feriadosController from "../controllers/feriados.controller.js";

const router = express.Router();

// POST /api/feriados/generar → body { anio } → inserta/omite/reactiva feriados del año
router.post("/generar", feriadosController.generar);

// GET    /api/feriados       → Lista de feriados activos
router.get("/", feriadosController.getAll);

// GET    /api/feriados/:id   → Feriado por id
router.get("/:id", feriadosController.getById);

// POST   /api/feriados       → Crea feriado
router.post("/", feriadosController.create);

// PUT    /api/feriados/:id   → Edita feriado
router.put("/:id", feriadosController.update);

// DELETE /api/feriados/:id   → Baja lógica
router.delete("/:id", feriadosController.remove);

export default router;
