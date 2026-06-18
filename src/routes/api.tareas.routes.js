import express from "express";
import tareasController from "../controllers/tareas.controller.js";

const router = express.Router();

// GET  /api/tareas             → Lista de tareas activas con sus roles (primaria/complementaria)
router.get("/", tareasController.getAll);

// GET  /api/tareas/lookups     → Catálogos: roles y tipo_tarea
router.get("/lookups", tareasController.getLookups);

// GET  /api/tareas/:id         → Tarea por id + sus roles
router.get("/:id", tareasController.getById);

// POST /api/tareas             → Crea tarea + relaciones en tareas_roles
router.post("/", tareasController.create);

// PUT  /api/tareas/:id         → Edita tarea + reemplaza sus relaciones
router.put("/:id", tareasController.update);

// DELETE /api/tareas/:id       → Baja lógica de la tarea y sus relaciones
router.delete("/:id", tareasController.remove);

export default router;
