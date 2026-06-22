import express from "express";
import clientesController from "../controllers/clientes.controller.js";

const router = express.Router();

// POST /api/clientes
//   body: { cliente: { ... }, actividades: [ ... ] }
//   201 → { success, data: { id, actividades } }
//   409 → { error, conflicts: [...] } si una o más actividades chocan
//   403 → si el rol no es ASISTENTE DE PRODUCCIÓN
router.post("/", clientesController.create);

export default router;