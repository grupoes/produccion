import express from "express";
import cors from "cors";
import expressLayouts from "express-ejs-layouts";
import path from "path";
import { fileURLToPath } from "url";
import { sessionMiddleware } from "./config/session.js";

import indexRoutes from "./routes/index.routes.js";
import authRoutes from "./routes/auth.routes.js";
import modulesRoutes from "./routes/modules.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import debugRoutes from "./routes/debug.routes.js";
import usuariosRoutes from "./routes/usuarios.routes.js";
import apiUsuariosRoutes from "./routes/api.usuarios.routes.js";
import permisosRoutes from "./routes/permisos.routes.js";
import apiPermisosRoutes from "./routes/api.permisos.routes.js";
import tareasRoutes from "./routes/tareas.routes.js";
import apiTareasRoutes from "./routes/api.tareas.routes.js";
import universidadRoutes from "./routes/universidad.routes.js";
import apiUniversidadRoutes from "./routes/api.universidad.routes.js";
import carrerasRoutes from "./routes/carreras.routes.js";
import apiCarrerasRoutes from "./routes/api.carreras.routes.js";
import origenRoutes from "./routes/origen.routes.js";
import apiOrigenRoutes from "./routes/api.origen.routes.js";
import nivelAcademicoRoutes from "./routes/nivel-academico.routes.js";
import apiNivelAcademicoRoutes from "./routes/api.nivel-academico.routes.js";
import feriadosRoutes from "./routes/feriados.routes.js";
import apiFeriadosRoutes from "./routes/api.feriados.routes.js";
import modulosRoutes from "./routes/modulos.routes.js";
import apiModulosRoutes from "./routes/api.modulos.routes.js";
import potencialesClientesRoutes from "./routes/potenciales-clientes.routes.js";
import apiPotencialesClientesRoutes from "./routes/api.potenciales-clientes.routes.js";
import reunionesRoutes from "./routes/reuniones.routes.js";
import clientesRoutes from "./routes/clientes.routes.js";
import registrarClientesProveedoresRoutes from "./routes/registrar-clientes-proveedores.routes.js";
import apiClientesProveedoresRoutes from "./routes/api.clientes-proveedores.routes.js";
import proveedoresRoutes from "./routes/proveedores.routes.js";
import apiProveedoresRoutes from "./routes/api.proveedores.routes.js";
import configuracionAccionesRoutes from "./routes/configuracion-acciones.routes.js";
import apiConfiguracionAccionesRoutes from "./routes/api.configuracion-acciones.routes.js";
import turnosVentasRoutes from "./routes/turnos-ventas.routes.js";
import apiTurnosVentasRoutes from "./routes/api.turnos-ventas.routes.js";
import apiNotificacionesRoutes from "./routes/api.notificaciones.routes.js";
import apiHorarioRoutes from "./routes/api.horario.routes.js";
import apiActividadesRoutes from "./routes/api.actividades.routes.js";
import apiKanbanRoutes from "./routes/api.kanban.routes.js";
import apiCalendarioAsistenteRoutes from "./routes/api.calendario-asistente.routes.js";
import apiReunionesAsistenteRoutes from "./routes/api.reuniones-asistente.routes.js";
import apiImportacionRoutes from "./routes/api.importacion.routes.js";
import apiClientesRoutes from "./routes/api.clientes.routes.js";

import { requireAuth } from "./middlewares/auth.middleware.js";
import modulesService from "./services/modules.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Configuración de Vistas (EJS y Layouts)
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout"); // Esto buscará views/layout.ejs por defecto

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(sessionMiddleware);

// Guardar el usuario autenticado en res.locals para que layout y vistas puedan usarlo
app.use((req, res, next) => {
  res.locals.authUser = req.session?.user || null;
  next();
});

// Cargar módulos permitidos para el usuario en res.locals.modules
app.use(async (req, res, next) => {
  try {
    if (req.session?.user?.rol?.id) {
      res.locals.modules = await modulesService.getModulesByRole(
        req.session.user.rol.id,
      );
    } else {
      res.locals.modules = [];
    }
  } catch (err) {
    console.error("Error cargando módulos:", err);
    res.locals.modules = [];
  }

  next();
});

// Ruta principal para login
app.get("/", (req, res) => {
  res.render("login/login", { layout: false });
});

// Archivos estáticos (aquí irá el CSS, JS, imágenes de tu plantilla)
app.use(express.static(path.join(__dirname, "../public")));

// Rutas API (Retornan JSON)
app.use("/api/auth", authRoutes);
app.use("/api/modules", modulesRoutes);
app.use("/api/debug", debugRoutes);
app.use("/api/usuarios", requireAuth, apiUsuariosRoutes);
app.use("/api/permisos", requireAuth, apiPermisosRoutes);
app.use("/api/tareas", requireAuth, apiTareasRoutes);
app.use("/api/universidad", requireAuth, apiUniversidadRoutes);
app.use("/api/carreras", requireAuth, apiCarrerasRoutes);
app.use("/api/origen", requireAuth, apiOrigenRoutes);
app.use("/api/nivel-academico", requireAuth, apiNivelAcademicoRoutes);
app.use("/api/feriados", requireAuth, apiFeriadosRoutes);
app.use("/api/modulos", requireAuth, apiModulosRoutes);
app.use("/api/potenciales-clientes", requireAuth, apiPotencialesClientesRoutes);
app.use("/api/clientes-proveedores", requireAuth, apiClientesProveedoresRoutes);
app.use("/api/proveedores", requireAuth, apiProveedoresRoutes);
app.use("/api/configuracion-acciones", requireAuth, apiConfiguracionAccionesRoutes);
app.use("/api/turnos-ventas", requireAuth, apiTurnosVentasRoutes);
app.use("/api/notificaciones", requireAuth, apiNotificacionesRoutes);
app.use("/api/horario", requireAuth, apiHorarioRoutes);
app.use("/api/actividades", requireAuth, apiActividadesRoutes);
app.use("/api/kanban", requireAuth, apiKanbanRoutes);
app.use("/api/calendario-asistente", requireAuth, apiCalendarioAsistenteRoutes);
app.use("/api/calendario-asistente", requireAuth, apiReunionesAsistenteRoutes);
app.use("/api/importacion", requireAuth, apiImportacionRoutes);
app.use("/api/clientes", requireAuth, apiClientesRoutes);
app.use("/api", indexRoutes);

// Rutas Admin (Retornan Vistas HTML) protegidas
app.use("/admin", requireAuth, adminRoutes);
app.use("/usuarios", requireAuth, usuariosRoutes);
app.use("/permisos", requireAuth, permisosRoutes);
app.use("/tareas", requireAuth, tareasRoutes);
app.use("/universidad", requireAuth, universidadRoutes);
app.use("/carreras", requireAuth, carrerasRoutes);
app.use("/origen-contacto", requireAuth, origenRoutes);
app.use("/nivel-academico", requireAuth, nivelAcademicoRoutes);
app.use("/feriados", requireAuth, feriadosRoutes);
app.use("/modulos", requireAuth, modulosRoutes);
app.use("/potenciales-clientes", requireAuth, potencialesClientesRoutes);
app.use("/reuniones", requireAuth, reunionesRoutes);
app.use("/clientes", requireAuth, clientesRoutes);
app.use("/registrar-clientes-proveedores", requireAuth, registrarClientesProveedoresRoutes);
app.use("/proveedores", requireAuth, proveedoresRoutes);
app.use("/configuracion-acciones", requireAuth, configuracionAccionesRoutes);
app.use("/turnos-ventas", requireAuth, turnosVentasRoutes);

export default app;
