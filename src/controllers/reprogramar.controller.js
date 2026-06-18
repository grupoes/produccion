import schedulerService from "../services/scheduler.service.js";
import overflowService from "../services/overflow.service.js";
import prisma from "../config/db.js";

// ============================================================================
// Reprogramar / sugerir
// ----------------------------------------------------------------------------
// Endpoints pensados para que el front llame ANTES de agendar/reagendar:
//   - POST /api/horario/sugerir       → ¿entra? ¿qué se mueve? ¿overflow?
//   - POST /api/horario/reprogramar   → aplica los movimientos sugeridos
// ============================================================================

// Roles con permiso para reprogramar CUALQUIER actividad (no solo las
// propias). Coincidencia case + accent insensitive sobre roles.nombre.
const ROLES_REPROG_TOTAL = ["super admin", "jefe de produccion"];

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const userIsJefe = (rolNombre) => {
  const n = norm(rolNombre);
  return ROLES_REPROG_TOTAL.some((p) => n.includes(p));
};

class ReprogramarController {
  // POST /api/horario/sugerir
  // body: { usuario_id, fecha, minutos, prioridad?, deadline?, prospecto_id?,
  //         actividad_id? }   // actividad_id si es reprogramación
  async sugerir(req, res) {
    try {
      const b = req.body || {};
      const usuarioId = Number(b.usuario_id);
      const minutos = Number(b.minutos);
      if (!usuarioId || !b.fecha || !minutos) {
        return res
          .status(400)
          .json({ error: "usuario_id, fecha y minutos son requeridos." });
      }

      const plan = await schedulerService.placeActivity(
        usuarioId,
        b.fecha,
        minutos,
        {
          prioridad: b.prioridad || null,
          deadline: b.deadline || null,
          ignorarActividadId: b.actividad_id || null,
        },
      );

      if (plan.fits) {
        return res.json({ success: true, fits: true, plan });
      }

      // No entra → pedimos sugerencias.
      const overflow = await overflowService.suggest(
        usuarioId,
        b.fecha,
        minutos,
        {
          prioridad: b.prioridad || null,
          deadline: b.deadline || null,
          prospectoId: b.prospecto_id || null,
        },
      );

      return res.json({
        success: true,
        fits: false,
        reason: plan.reason,
        overflowMin: plan.overflowMin,
        mejorSoltarMin: plan.mejorSoltarMin,
        suggestions: overflow,
      });
    } catch (err) {
      console.error("ReprogramarController.sugerir error:", err);
      return res
        .status(500)
        .json({ error: "Error al sugerir horario.", detail: err.message });
    }
  }

  // POST /api/horario/reprogramar
  // body: { actividad_id, fecha_destino?, motivo? }
  // Recalcula el plan para la actividad y aplica los movimientos. Si no
  // entra, devuelve 409 con las sugerencias para que el front decida.
  async reprogramar(req, res) {
    try {
      const b = req.body || {};
      const actividadId = Number(b.actividad_id);
      if (!actividadId) {
        return res.status(400).json({ error: "actividad_id requerido." });
      }

      const act = await prisma.actividades.findUnique({
        where: { id: actividadId },
        include: {
          tarea: { select: { horas_estimadas: true } },
          prospectos: { select: { fecha_entrega: true } },
        },
      });
      if (!act) {
        return res.status(404).json({ error: "Actividad no encontrada." });
      }

      // Permisos: auxiliar dueño o jefe.
      const me = req.session?.user;
      const isDueno = me && me.id === act.usuario_id;
      const isJefe = me && userIsJefe(me.rol?.nombre);
      if (!isDueno && !isJefe) {
        return res
          .status(403)
          .json({ error: "No tienes permiso para reprogramar esta actividad." });
      }

      const minutos = act.tiempo_estimado_minutos || 60;
      const fechaDestino =
        b.fecha_destino ||
        (act.fecha_inicio
          ? (act.fecha_inicio instanceof Date
              ? act.fecha_inicio.toISOString().slice(0, 10)
              : String(act.fecha_inicio).slice(0, 10))
          : null);
      if (!fechaDestino) {
        return res
          .status(400)
          .json({ error: "La actividad no tiene fecha y no se envió fecha_destino." });
      }

      // 1) Plan.
      const plan = await schedulerService.placeActivity(
        act.usuario_id,
        fechaDestino,
        minutos,
        {
          prioridad: act.prioridad || null,
          deadline: act.prospectos?.fecha_entrega
            ? (act.prospectos.fecha_entrega instanceof Date
                ? act.prospectos.fecha_entrega.toISOString().slice(0, 10)
                : String(act.prospectos.fecha_entrega).slice(0, 10))
            : null,
          ignorarActividadId: act.id,
        },
      );

      if (!plan.fits) {
        return res.status(409).json({
          success: false,
          fits: false,
          reason: plan.reason,
          overflowMin: plan.overflowMin,
          suggestions: await overflowService.suggest(
            act.usuario_id,
            fechaDestino,
            minutos,
            {
              prioridad: act.prioridad || null,
              deadline: act.prospectos?.fecha_entrega
                ? String(act.prospectos.fecha_entrega).slice(0, 10)
                : null,
              prospectoId: act.prospecto_id || null,
            },
          ),
        });
      }

      // 2) Aplicar: para la actividad que se está reprogramando,
      //    actualizamos su horario_usuario al slot del plan; los demás
      //    moves son los que el plan dice (movibles que se compactaron).
      const movesAplicar = [...plan.moves];
      // Localizar el horario_usuario de esta actividad en la fecha destino
      // (puede ser null si la actividad no estaba en el día).
      const hu = await prisma.horario_usuario.findFirst({
        where: {
          actividad_id: act.id,
          usuario_id: act.usuario_id,
        },
        select: { id: true },
      });
      if (hu) {
        movesAplicar.push({
          actividad_id: act.id,
          horario_id: hu.id,
          hi: plan.slot.hi,
          hf: plan.slot.hf,
          fecha: fechaDestino,
        });
      } else {
        // No existe horario_usuario: hay que crearlo.
        const nuevo = await prisma.horario_usuario.create({
          data: {
            actividad_id: act.id,
            usuario_id: act.usuario_id,
            fecha: new Date(fechaDestino),
            hora_inicio: this.#hmsToDate(plan.slot.hi),
            hora_fin: this.#hmsToDate(plan.slot.hf),
            estado: true,
            tipo: "actividad",
            categoria: "potencial_cliente",
            duracion_minutos: minutos,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
        return res.json({
          success: true,
          created: true,
          horario_id: nuevo.id,
          slot: plan.slot,
          movesApplied: 0,
        });
      }

      const result = await schedulerService.applyMoves(
        movesAplicar,
        b.motivo || "Reprogramación solicitada",
      );

      return res.json({
        success: true,
        slot: plan.slot,
        movesApplied: result.applied,
        moves: plan.moves,
      });
    } catch (err) {
      console.error("ReprogramarController.reprogramar error:", err);
      return res
        .status(500)
        .json({ error: "Error al reprogramar.", detail: err.message });
    }
  }

  // Parsea "HH:MM[:SS]" como Date UTC (no local) para escribir en una
  // columna @db.Timetz. Misma convención que
  // potenciales-clientes.service.js#toTime y que los readers de los
  // endpoints del calendario (que leen con getUTCHours). Usar el
  // constructor local rompía el round-trip en servidores con TZ != UTC
  // (ej. America/Lima UTC-5: "15:00" se guardaba como 20:00 UTC).
  #hmsToDate(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return new Date(
      Date.UTC(1970, 0, 1, Number(m[1]), Number(m[2]), Number(m[3] || 0)),
    );
  }
}

export default new ReprogramarController();
