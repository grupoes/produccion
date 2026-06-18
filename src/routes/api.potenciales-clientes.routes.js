import express from "express";
import potencialesClientesController from "../controllers/potenciales-clientes.controller.js";

const router = express.Router();

// GET  /api/potenciales-clientes               → Listado
router.get("/", potencialesClientesController.getAll);

// GET  /api/potenciales-clientes/lookups       → Catálogos para el form
router.get("/lookups", potencialesClientesController.getLookups);

// GET  /api/potenciales-clientes/carreras      → Carreras filtradas por institucion_id (?institucion_id=)
router.get("/carreras", potencialesClientesController.getCarrerasByInstitucion);

// GET  /api/potenciales-clientes/usuarios-asignables?fecha=YYYY-MM-DD
//   → Usuarios activos (excl. SUPER ADMIN) + asignados a esa fecha
//     (vía tabla `asignacion_dias`). El front lo usa para el select
//     "Asignado a" del formulario.
router.get(
  "/usuarios-asignables",
  potencialesClientesController.getUsuariosAsignablesPorFecha,
);

// GET  /api/potenciales-clientes/reuniones
//   → Listado plano de reuniones (actividades tipo REUNION) con los
//     datos del prospecto y del usuario que registró.
router.get(
  "/reuniones",
  potencialesClientesController.getReuniones,
);

// GET  /api/potenciales-clientes/:id           → Detalle
router.get("/:id", potencialesClientesController.getById);

// POST /api/potenciales-clientes               → Crear
router.post("/", potencialesClientesController.create);

// PUT  /api/potenciales-clientes/:id           → Editar
router.put("/:id", potencialesClientesController.update);

// POST /api/potenciales-clientes/:id/convertir → Convertir potencial → cliente
//   body: { tarea_id, fecha_asignacion, usuario_asignado_id, hora_inicio,
//           fecha_entrega?, motivo? }
//   → 200 OK si se agenda; 409 con conflicts si la hora choca.
router.post("/:id/convertir", potencialesClientesController.convertir);

// POST /api/potenciales-clientes/:id/actividades → Agregar una actividad
//   a un prospecto existente. body: { tarea_id, fecha_asignacion,
//   usuario_asignado_id, hora_reunion? } — `hora_reunion` es obligatoria
//   sólo cuando la tarea es de tipo REUNIÓN.
router.post(
  "/:id/actividades",
  potencialesClientesController.addActividad,
);

// GET /api/potenciales-clientes/:id/historial → Movimientos del
//   prospecto (alta, cambios de estado, "Actividad agregada",
//   "Actividad reasignada", conversión a cliente, etc.) con los datos
//   del usuario que disparó cada movimiento. Se consume desde el
//   modal de detalle del Kanban.
router.get(
  "/:id/historial",
  potencialesClientesController.getHistorial,
);

export default router;
