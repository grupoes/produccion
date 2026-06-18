import express from "express";
import proveedoresController from "../controllers/proveedores.controller.js";

const router = express.Router();

// GET    /api/proveedores       → Lista de proveedores activos
router.get("/", proveedoresController.getAll);

// GET    /api/proveedores/:id   → Proveedor por id
router.get("/:id", proveedoresController.getById);

// POST   /api/proveedores       → Crea proveedor
router.post("/", proveedoresController.create);

// PUT    /api/proveedores/:id   → Edita proveedor
router.put("/:id", proveedoresController.update);

// DELETE /api/proveedores/:id   → Baja lógica
router.delete("/:id", proveedoresController.remove);

export default router;
