import calendarioAsistenteService from "../services/calendario-asistente.service.js";

class CalendarioAsistenteController {
  // GET /api/calendario-asistente/usuarios
  // Lista usuarios activos excluyendo `rol_id=1` (admin) por defecto.
  // Acepta `?exclude_rol_id=N` para excluir otro rol.
  async getUsuarios(req, res) {
    try {
      const excludeRolId =
        req.query.exclude_rol_id != null
          ? Number(req.query.exclude_rol_id)
          : 1;
      const data = await calendarioAsistenteService.getUsuariosExcluyendoRol(
        excludeRolId,
      );
      return res.json({ success: true, data });
    } catch (error) {
      console.error("CalendarioAsistente.getUsuarios error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener los usuarios." });
    }
  }

  // GET /api/calendario-asistente/horario-ultimo?usuario_id=N
  // Devuelve la fecha y hora del último bloque en `horario_usuario`
  // para el usuario indicado. Usado por el modal "Programar" para
  // pre-rellenar fecha+hora cuando el usuario ya tiene bloques
  // registrados.
  async getUltimoHorarioUsuario(req, res) {
    try {
      const usuarioId =
        req.query.usuario_id != null ? Number(req.query.usuario_id) : null;
      const data = await calendarioAsistenteService.getUltimoHorarioUsuario(
        usuarioId,
      );
      return res.json({ success: true, data });
    } catch (error) {
      console.error("CalendarioAsistente.getUltimoHorarioUsuario error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener el último horario." });
    }
  }

  // GET /api/calendario-asistente/usuario-ocupa-fecha?usuario_id=N&fecha=YYYY-MM-DD
  // Indica si el usuario tiene bloques en horario_usuario para esa fecha.
  async getUsuarioOcupaFecha(req, res) {
    try {
      const usuarioId =
        req.query.usuario_id != null ? Number(req.query.usuario_id) : null;
      const fecha = String(req.query.fecha || "").trim() || null;
      const data = await calendarioAsistenteService.getUsuarioOcupaFecha(
        usuarioId,
        fecha,
      );
      return res.json({ success: true, data });
    } catch (error) {
      console.error("CalendarioAsistente.getUsuarioOcupaFecha error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al verificar la fecha." });
    }
  }

  // GET /api/calendario-asistente/reuniones
  // Lista las ACTIVIDADES cuya tarea es de tipo REUNION.
  // Acepta:
  //   - `?usuario_id=N` para filtrar por usuario asignado.
  //   - `?only_sin_slot=true` → solo actividades SIN horario_usuario
  //     activo (las que aún deben programarse: van al sidebar).
  //   - `?only_con_slot=true` → solo actividades CON horario_usuario
  //     activo (las que se pintan en el calendario).
  async getReuniones(req, res) {
    try {
      const usuarioId =
        req.query.usuario_id != null ? Number(req.query.usuario_id) : null;
      const onlySinSlot =
        String(req.query.only_sin_slot || "").toLowerCase() === "true";
      const onlyConSlot =
        String(req.query.only_con_slot || "").toLowerCase() === "true";
      const data = await calendarioAsistenteService.getActividadesReunion({
        usuarioId,
        onlySinSlot,
        onlyConSlot,
      });
      return res.json({ success: true, data });
    } catch (error) {
      console.error("CalendarioAsistente.getReuniones error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener las reuniones." });
    }
  }

  // GET /api/calendario-asistente/horas-extras/resumen?usuario_id=N
  async getResumenHorasExtras(req, res) {
    try {
      const usuarioId =
        req.query.usuario_id != null ? Number(req.query.usuario_id) : null;
      const data = await calendarioAsistenteService.getResumenHorasExtras(usuarioId);
      return res.json({ success: true, data });
    } catch (error) {
      console.error("CalendarioAsistente.getResumenHorasExtras error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener resumen de horas extras." });
    }
  }

  // GET /api/calendario-asistente/horas-extras/canje-detail?horario_id=N
  async getCanjeDetail(req, res) {
    try {
      const horarioId = req.query.horario_id != null ? Number(req.query.horario_id) : null;
      const data = await calendarioAsistenteService.getCanjeDetail(horarioId);
      return res.json({ success: true, data });
    } catch (error) {
      if (error.code === "NOT_FOUND") return res.status(404).json({ error: error.message });
      if (error.code === "BAD_REQUEST") return res.status(400).json({ error: error.message });
      console.error("CalendarioAsistente.getCanjeDetail error:", error);
      return res.status(500).json({ error: "Error interno al obtener detalle del canje." });
    }
  }

  // POST /api/calendario-asistente/horas-extras/canjear
  // body: { ids: number[], fecha_destino: string, hora_inicio?: string }
  async canjearHorasExtras(req, res) {
    try {
      const { ids, fecha_destino, hora_inicio } = req.body || {};
      const data = await calendarioAsistenteService.canjearHorasExtras({
        ids,
        fechaDestino: fecha_destino,
        horaInicio: hora_inicio,
      });
      return res.json({ success: true, data });
    } catch (error) {
      if (error.code === "BAD_REQUEST" || error.code === "NOT_FOUND") {
        return res.status(400).json({ error: error.message });
      }
      console.error("CalendarioAsistente.canjearHorasExtras error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al canjear horas extras." });
    }
  }

  // POST /api/calendario-asistente/horas-extras/pagar
  // body: { ids: number[] }
  async pagarHorasExtras(req, res) {
    try {
      const { ids } = req.body || {};
      const data = await calendarioAsistenteService.pagarHorasExtras(ids);
      return res.json({ success: true, data });
    } catch (error) {
      if (error.code === "BAD_REQUEST" || error.code === "NOT_FOUND") {
        return res.status(400).json({ error: error.message });
      }
      console.error("CalendarioAsistente.pagarHorasExtras error:", error);
      return res
        .status(500)
        .json({ error: "Error interno al pagar horas extras." });
    }
  }
}

export default new CalendarioAsistenteController();
