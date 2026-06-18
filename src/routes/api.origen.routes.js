import express from "express";
import origenController from "../controllers/origen.controller.js";

const router = express.Router();

// GET    /api/origen       → Lista de orígenes activos
router.get("/", origenController.getAll);

// GET    /api/origen/:id   → Origen por id
router.get("/:id", origenController.getById);

// POST   /api/origen       → Crea origen
router.post("/", origenController.create);

// PUT    /api/origen/:id   → Edita origen
router.put("/:id", origenController.update);

// DELETE /api/origen/:id   → Baja lógica
router.delete("/:id", origenController.remove);

export default router;
