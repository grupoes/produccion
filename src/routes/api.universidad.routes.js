import express from "express";
import universidadController from "../controllers/universidad.controller.js";

const router = express.Router();

// GET    /api/universidad       → Lista de instituciones activas
router.get("/", universidadController.getAll);

// GET    /api/universidad/:id   → Institución por id
router.get("/:id", universidadController.getById);

// POST   /api/universidad       → Crea institución
router.post("/", universidadController.create);

// PUT    /api/universidad/:id   → Edita institución
router.put("/:id", universidadController.update);

// DELETE /api/universidad/:id   → Baja lógica
router.delete("/:id", universidadController.remove);

export default router;
