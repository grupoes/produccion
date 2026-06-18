import express from "express";
import usuariosController from "../controllers/usuarios.controller.js";

const router = express.Router();

// GET  /api/usuarios         → Lista todos los usuarios activos
router.get("/", usuariosController.getAll);

// GET  /api/usuarios/lookups → Catálogos para el formulario (roles, tipo_documento, tipo_jornada)
router.get("/lookups", usuariosController.getLookups);

// GET  /api/usuarios/search-document?tipoDocumento_id=&numero_documento=
//      → Consulta externa (RENIEC/SUNAT) para autocompletar datos de persona
router.get("/search-document", usuariosController.searchByDocument);

// GET  /api/usuarios/:id     → Obtiene un usuario por ID
router.get("/:id", usuariosController.getById);

// POST /api/usuarios         → Crea un nuevo usuario + persona
router.post("/", usuariosController.create);

// PUT  /api/usuarios/:id     → Edita un usuario + su persona
router.put("/:id", usuariosController.update);

// DELETE /api/usuarios/:id   → Desactiva un usuario (baja lógica)
router.delete("/:id", usuariosController.remove);

export default router;
