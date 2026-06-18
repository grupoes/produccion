import express from "express";
import permisosController from "../controllers/permisos.controller.js";

const router = express.Router();

// GET    /api/permisos/roles           → Lista de roles activos
router.get("/roles", permisosController.getRoles);

// GET    /api/permisos/roles/:id       → Rol por id (para edición)
router.get("/roles/:id", permisosController.getRolById);

// POST   /api/permisos/roles           → Crea un nuevo rol
router.post("/roles", permisosController.createRol);

// PUT    /api/permisos/roles/:id       → Actualiza un rol
router.put("/roles/:id", permisosController.updateRol);

// DELETE /api/permisos/roles/:id       → Baja lógica del rol
router.delete("/roles/:id", permisosController.removeRol);

// GET    /api/permisos/modulos         → Módulos (con sus acciones) agrupados por padre
router.get("/modulos", permisosController.getModulosConAcciones);

// GET    /api/permisos/rol/:rolId      → Permisos de un rol + checks "moduloId-accionId"
router.get("/rol/:rolId", permisosController.getPermisosPorRol);

// POST   /api/permisos/rol/:rolId      → Reemplaza todos los permisos del rol
router.post("/rol/:rolId", permisosController.savePermisosPorRol);

export default router;
