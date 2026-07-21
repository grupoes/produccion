import express from "express";
import permisosUsuarioController from "../controllers/permisos-usuario.controller.js";

const router = express.Router();

// Listar permisos
//   GET /api/calendario-asistente/permisos?usuario_id=&fecha_desde=&fecha_hasta=
router.get("/", permisosUsuarioController.listar);

// Vista previa de actividades afectadas
//   GET /api/calendario-asistente/permisos/preview?usuario_id=&fecha=&hora_inicio=&hora_fin=
router.get("/preview", permisosUsuarioController.preview);

// Crear permiso (con reprogramación automática)
//   POST /api/calendario-asistente/permisos
//   body: { usuario_id, fecha, hora_inicio, hora_fin, motivo }
router.post("/", permisosUsuarioController.crear);

// Eliminar permiso (baja lógica)
//   DELETE /api/calendario-asistente/permisos/:id
router.delete("/:id", permisosUsuarioController.eliminar);

// Ausencias - preview actividades en rango
//   GET /api/calendario-asistente/permisos/ausencias/preview?usuario_id=&fecha_desde=&fecha_hasta=
router.get("/ausencias/preview", permisosUsuarioController.previewAusencia);

// Ausencias - ejecutar acciones sobre actividades en rango
//   POST /api/calendario-asistente/permisos/ausencias/ejecutar
//   body: { usuario_id, fecha_desde, fecha_hasta, motivo, acciones }
router.post("/ausencias/ejecutar", permisosUsuarioController.ejecutarAusencia);

export default router;
