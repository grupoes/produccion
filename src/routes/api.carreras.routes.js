import express from "express";
import carrerasController from "../controllers/carreras.controller.js";

const router = express.Router();

// GET    /api/carreras                    → Lista (con ?institucion_id=&solo_activas=1)
router.get("/", carrerasController.getAll);

// GET    /api/carreras/:id                → Carrera por id
router.get("/:id", carrerasController.getById);

// POST   /api/carreras                    → Crea
router.post("/", carrerasController.create);

// PUT    /api/carreras/:id                → Edita
router.put("/:id", carrerasController.update);

// DELETE /api/carreras/:id                → Baja lógica
router.delete("/:id", carrerasController.remove);

export default router;
