import reunionesAsistenteService from "../services/reuniones-asistente.service.js";

// ============================================================================
// Reuniones Asistente — capa HTTP delgada sobre el service
// ----------------------------------------------------------------------------
// Permisos: solo Asistente de Producción (rol.id = 11). El check se hace
// en cada handler con ensureAsistenteProduccion(), que devuelve { ok, ... }
// o { ok:false, status, body }.
// ============================================================================

const ROL_ASISTENTE_PROD_ID = 11;

function ensureAsistenteProduccion(req) {
  const me = req.session?.user || null;
  if (!me) {
    return {
      ok: false,
      status: 401,
      body: { error: "No autenticado." },
    };
  }
  if (Number(me.rol?.id) !== ROL_ASISTENTE_PROD_ID) {
    return {
      ok: false,
      status: 403,
      body: {
        error:
          "Esta operación es exclusiva del Asistente de Producción.",
      },
    };
  }
  return { ok: true, asistenteId: Number(me.id) };
}

// Mapea errores del service a status HTTP. El service lanza `new Error(msg)`
// con `err.code` ∈ {BAD_REQUEST, NOT_FOUND, CONFLICT}. Cualquier otro cae a 500.
function sendServiceError(res, err, tag) {
  console.error(`[reuniones-asistente] ${tag} error:`, err);
  const code = err?.code;
  if (code === "BAD_REQUEST") {
    return res.status(400).json({ error: err.message });
  }
  if (code === "NOT_FOUND") {
    return res.status(404).json({ error: err.message });
  }
  if (code === "CONFLICT") {
    return res.status(409).json({
      error: err.message,
      ...(err.details || {}),
    });
  }
  if (code === "FORBIDDEN") {
    return res.status(403).json({ error: err.message });
  }
  return res
    .status(500)
    .json({ error: "Error interno.", detail: err.message });
}

class ReunionesAsistenteController {
  // GET /api/calendario-asistente/prospectos?q=&limit=
  async listarProspectos(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const data = await reunionesAsistenteService.listarProspectosParaReunion(
        {
          q: req.query.q,
          limit: req.query.limit,
        },
      );
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "listarProspectos");
    }
  }

  // GET /api/calendario-asistente/clientes-con-actividades?q=&limit=
  async listarClientesConActividades(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const data =
        await reunionesAsistenteService.listarClientesConActividades({
          q: req.query.q,
          limit: req.query.limit,
        });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "listarClientesConActividades");
    }
  }

  // GET /api/calendario-asistente/reuniones/:id
  async getDetalle(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const data = await reunionesAsistenteService.obtenerReunionDetalle(
        req.params.id,
      );
      if (!data) {
        return res.status(404).json({ error: "Reunión no encontrada." });
      }
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "getDetalle");
    }
  }

  // POST /api/calendario-asistente/reuniones
  async crear(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const b = req.body || {};
      const data = await reunionesAsistenteService.crearReunion({
        prospectoId: b.prospecto_id,
        tareaId: b.tarea_id,
        usuarioId: b.usuario_id,
        fecha: b.fecha,
        horaInicio: b.hora_inicio,
        duracionMinutos: b.duracion_minutos,
        prioridad: b.prioridad,
        motivo: b.motivo,
        asistenteId: guard.asistenteId,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "crear");
    }
  }

  // PATCH /api/calendario-asistente/reuniones/:id
  async reprogramar(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const b = req.body || {};
      const data = await reunionesAsistenteService.reprogramarReunion({
        actividadId: req.params.id,
        fechaDestino: b.fecha_destino || b.fecha,
        horaInicio: b.hora_inicio,
        duracionMinutos: b.duracion_minutos,
        motivo: b.motivo,
        asistenteId: guard.asistenteId,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "reprogramar");
    }
  }

  // PATCH /api/calendario-asistente/reuniones/:id/reasignar
  async reasignar(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const b = req.body || {};
      const data = await reunionesAsistenteService.reasignarReunion({
        actividadId: req.params.id,
        nuevoUsuarioId: b.nuevo_usuario_id,
        fecha: b.fecha,
        horaInicio: b.hora_inicio,
        duracionMinutos: b.duracion_minutos,
        motivo: b.motivo,
        asistenteId: guard.asistenteId,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "reasignar");
    }
  }

  // POST /api/calendario-asistente/reuniones/:id/programar
  // Programa por primera vez una reunión legacy (sin horario_usuario).
  async programar(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const b = req.body || {};
      const data = await reunionesAsistenteService.programarPrimeraVez({
        actividadId: req.params.id,
        usuarioId: b.usuario_id,
        fecha: b.fecha,
        horaInicio: b.hora_inicio,
        duracionMinutos: b.duracion_minutos,
        motivo: b.motivo,
        asistenteId: guard.asistenteId,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "programar");
    }
  }

  // PATCH /api/calendario-asistente/reuniones/:id/ajustar-duracion
  async ajustarDuracion(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const b = req.body || {};
      const data = await reunionesAsistenteService.ajustarDuracion({
        actividadId: req.params.id,
        nuevaDuracionMinutos: b.duracion_minutos,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "ajustarDuracion");
    }
  }

  // DELETE /api/calendario-asistente/reuniones/:id
  async eliminar(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const { motivo } = req.body || {};
      const data = await reunionesAsistenteService.eliminarReunion({
        actividadId: req.params.id,
        motivo,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "eliminar");
    }
  }

  // POST /api/calendario-asistente/reuniones/:id/bloque/:horarioId/guardar
  async guardarBloque(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const b = req.body || {};
      const data = await reunionesAsistenteService.guardarBloque({
        actividadId: req.params.id,
        horarioId: req.params.horarioId,
        tipo: b.tipo,
        asistenteId: guard.asistenteId,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "guardarBloque");
    }
  }

  // GET /api/calendario-asistente/prospectos/:id/actividades
  async getProspectoActividades(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const data =
        await reunionesAsistenteService.getActividadesByProspectoId(
          req.params.id,
        );
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "getProspectoActividades");
    }
  }
}

export default new ReunionesAsistenteController();
