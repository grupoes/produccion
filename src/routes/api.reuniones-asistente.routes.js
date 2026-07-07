import express from "express";
import reunionesAsistenteController from "../controllers/reuniones-asistente.controller.js";

const router = express.Router();

// Búsqueda de prospectos para el modal "Nueva reunión".
//   GET /api/calendario-asistente/prospectos?q=&limit=
router.get("/prospectos", reunionesAsistenteController.listarProspectos);

// Clientes con actividades (para el tab CLIENTES del modal Programar).
//   GET /api/calendario-asistente/clientes-con-actividades?q=&limit=
router.get("/clientes-con-actividades", reunionesAsistenteController.listarClientesConActividades);

// Detalle completo de una reunión (modal de detalle).
//   GET /api/calendario-asistente/reuniones/:id
router.get("/reuniones/:id", reunionesAsistenteController.getDetalle);

// Crear reunión sobre el calendario de un usuario (distinto de la Asistente).
//   POST /api/calendario-asistente/reuniones
//   body: { prospecto_id, tarea_id, usuario_id, fecha, hora_inicio,
//           duracion_minutos, prioridad?, motivo? }
router.post("/reuniones", reunionesAsistenteController.crear);

// Reprogramar (mismo usuario, distinto día/hora/duración).
//   PATCH /api/calendario-asistente/reuniones/:id
//   body: { fecha_destino?, hora_inicio?, duracion_minutos?, motivo? }
router.patch("/reuniones/:id", reunionesAsistenteController.reprogramar);

// Reasignar a otro usuario (y opcionalmente otro día/hora).
//   PATCH /api/calendario-asistente/reuniones/:id/reasignar
//   body: { nuevo_usuario_id, fecha?, hora_inicio?, duracion_minutos?, motivo? }
router.patch("/reuniones/:id/reasignar", reunionesAsistenteController.reasignar);

// Ajustar duración (solo cambia la duración, corre actividades posteriores).
//   PATCH /api/calendario-asistente/reuniones/:id/ajustar-duracion
//   body: { duracion_minutos }
router.patch("/reuniones/:id/ajustar-duracion", reunionesAsistenteController.ajustarDuracion);

// Programar por PRIMERA vez una reunión legacy (sin horario_usuario).
// La distingue del PATCH normal porque crea el slot en vez de moverlo.
//   POST /api/calendario-asistente/reuniones/:id/programar
//   body: { usuario_id?, fecha, hora_inicio, duracion_minutos, motivo? }
router.post("/reuniones/:id/programar", reunionesAsistenteController.programar);

// Eliminar (baja lógica en actividades + horario_usuario).
//   DELETE /api/calendario-asistente/reuniones/:id
router.delete("/reuniones/:id", reunionesAsistenteController.eliminar);

export default router;
