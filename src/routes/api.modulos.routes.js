import express from "express";
import modulosController from "../controllers/modulos.controller.js";

const router = express.Router();

// GET /api/modulos/lookups?excludeId=X → Módulos padre (idpadre=null) para selects
router.get("/lookups", modulosController.getLookups);

// GET    /api/modulos       → Lista de módulos activos
router.get("/", modulosController.getAll);

// GET    /api/modulos/:id   → Módulo por id
router.get("/:id", modulosController.getById);

// POST   /api/modulos       → Crea módulo
router.post("/", modulosController.create);

// PUT    /api/modulos/:id   → Edita módulo
router.put("/:id", modulosController.update);

// DELETE /api/modulos/:id   → Baja lógica
router.delete("/:id", modulosController.remove);

export default router;
