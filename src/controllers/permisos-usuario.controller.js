import permisosUsuarioService from "../services/permisos-usuario.service.js";

const ROL_ASISTENTE_PROD_ID = 11;

function ensureAsistenteProduccion(req) {
  const me = req.session?.user || null;
  if (!me) {
    return { ok: false, status: 401, body: { error: "No autenticado." } };
  }
  if (Number(me.rol?.id) !== ROL_ASISTENTE_PROD_ID) {
    return {
      ok: false,
      status: 403,
      body: { error: "Operación exclusiva del Asistente de Producción." },
    };
  }
  return { ok: true, asistenteId: Number(me.id) };
}

function sendServiceError(res, err, tag) {
  console.error(`[permisos-usuario] ${tag} error:`, err);
  const code = err?.code;
  if (code === "BAD_REQUEST") return res.status(400).json({ error: err.message });
  if (code === "NOT_FOUND") return res.status(404).json({ error: err.message });
  if (code === "CONFLICT") return res.status(409).json({ error: err.message, ...(err.details || {}) });
  return res.status(500).json({ error: "Error interno.", detail: err.message });
}

class PermisosUsuarioController {
  // GET /api/calendario-asistente/permisos
  async listar(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const data = await permisosUsuarioService.listar({
        usuario_id: req.query.usuario_id,
        fecha_desde: req.query.fecha_desde,
        fecha_hasta: req.query.fecha_hasta,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "listar");
    }
  }

  // GET /api/calendario-asistente/permisos/preview
  async preview(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const data = await permisosUsuarioService.preview({
        usuario_id: req.query.usuario_id,
        fecha: req.query.fecha,
        hora_inicio: req.query.hora_inicio,
        hora_fin: req.query.hora_fin,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "preview");
    }
  }

  // POST /api/calendario-asistente/permisos
  async crear(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const b = req.body || {};
      const data = await permisosUsuarioService.crear({
        usuario_id: b.usuario_id,
        fecha: b.fecha,
        hora_inicio: b.hora_inicio,
        hora_fin: b.hora_fin,
        motivo: b.motivo,
        asistente_id: guard.asistenteId,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "crear");
    }
  }

  // DELETE /api/calendario-asistente/permisos/:id
  async eliminar(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const data = await permisosUsuarioService.eliminar(req.params.id);
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "eliminar");
    }
  }

  // GET /api/calendario-asistente/permisos/ausencias/preview
  async previewAusencia(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const data = await permisosUsuarioService.previewAusencia({
        usuario_id: req.query.usuario_id,
        fecha_desde: req.query.fecha_desde,
        fecha_hasta: req.query.fecha_hasta,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "previewAusencia");
    }
  }

  // POST /api/calendario-asistente/permisos/ausencias/ejecutar
  async ejecutarAusencia(req, res) {
    const guard = ensureAsistenteProduccion(req);
    if (!guard.ok) return res.status(guard.status).json(guard.body);
    try {
      const b = req.body || {};
      const data = await permisosUsuarioService.ejecutarAusencia({
        usuario_id: b.usuario_id,
        fecha_desde: b.fecha_desde,
        fecha_hasta: b.fecha_hasta,
        motivo: b.motivo || "Ausencia",
        acciones: b.acciones,
        asistente_id: guard.asistenteId,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendServiceError(res, err, "ejecutarAusencia");
    }
  }
}

export default new PermisosUsuarioController();
