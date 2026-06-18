import express from "express";
import nivelAcademicoController from "../controllers/nivel-academico.controller.js";

const router = express.Router();

// GET    /api/nivel-academico          → Lista de niveles académicos activos
router.get("/", nivelAcademicoController.getAll);

// GET    /api/nivel-academico/:id      → Nivel académico por id
router.get("/:id", nivelAcademicoController.getById);

// POST   /api/nivel-academico          → Crea nivel académico
router.post("/", nivelAcademicoController.create);

// PUT    /api/nivel-academico/:id      → Edita nivel académico
router.put("/:id", nivelAcademicoController.update);

// DELETE /api/nivel-academico/:id      → Baja lógica
router.delete("/:id", nivelAcademicoController.remove);

export default router;
