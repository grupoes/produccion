import express from "express";
import clientesProveedoresController from "../controllers/clientes-proveedores.controller.js";

const router = express.Router();

// POST /api/clientes-proveedores
//   body: { proveedor_id, titulo_prospecto, institucion_id?, carrera_id?,
//           nivel_academico_id?, fecha_entrega, prioridad?, link_drive?,
//           contenido?, contactos:[{nombres, apellidos, celular}],
//           tarea_id, fecha_asignacion, usuario_asignado_id, hora_inicio,
//           motivo?, color? }
//   → 201 si se registra y agenda; 409 con conflicts si la hora choca.
router.post("/", clientesProveedoresController.create);

export default router;
