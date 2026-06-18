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
}

export default new CalendarioAsistenteController();
