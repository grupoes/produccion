import prisma from "../config/db.js";
import ActividadEstadoHistorialService from "../services/actividad-estado-historial.service.js";

// ============================================================================
// Iniciar / Terminar actividad
// ----------------------------------------------------------------------------
//   POST /api/actividades/:id/start   → fecha_inicio_real = now()::date,
//                                        hora_inicio_real  = now()::time,
//                                        estado_progreso   = 'en_progreso'
//                                        + fila en actividad_estado_historial
//
//   POST /api/actividades/:id/end     → fecha_termino_real = now()::date,
//                                        hora_termino_real  = now()::time,
//                                        estado_progreso    = 'completada',
//                                        tiempo_real_minutos = (fin - ini) - pausa
//                                        + cierre en actividad_estado_historial
//
// Permisos: el dueño de la actividad o un jefe (super admin / jefe de
// producción) pueden iniciar/terminar.
// ============================================================================

const ROLES_TOTAL = ["super admin", "jefe de produccion"];
const ROL_VALORADOR = "valorador";
const ROL_VALORADOR_ID = 10;

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const userIsJefe = (rolNombre) => {
  const n = norm(rolNombre);
  return ROLES_TOTAL.some((p) => n.includes(p));
};

class ActividadesController {
  async start(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "id requerido." });
      const me = req.session?.user;
      if (!me) return res.status(401).json({ error: "No autenticado." });

      const act = await prisma.actividades.findUnique({ where: { id } });
      if (!act) return res.status(404).json({ error: "Actividad no encontrada." });

      const isDueno = Number(me.id) === Number(act.usuario_id);
      const isJefe = userIsJefe(me.rol?.nombre);
      if (!isDueno && !isJefe) {
        return res
          .status(403)
          .json({ error: "No tienes permiso para iniciar esta actividad." });
      }
      if (act.estado_progreso === "completada") {
        return res
          .status(400)
          .json({ error: "La actividad ya está completada." });
      }
      if (act.fecha_inicio_real) {
        return res
          .status(400)
          .json({ error: "La actividad ya fue iniciada." });
      }

      const now = new Date();

      // La fecha_inicio_real la guardamos como date local (no timestamptz)
      // porque es "el día en que arrancó", no un instante absoluto.
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const fechaStr = `${y}-${m}-${d}`;

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.actividades.update({
          where: { id },
          data: {
            fecha_inicio_real: new Date(fechaStr),
            hora_inicio_real: now,
            estado_progreso: "en_progreso",
            updated_at: now,
          },
        });
        // Cierra la fila "pendiente" (si está abierta) y abre la de
        // "en_progreso". Idempotente: si ya está en en_progreso, noop.
        await ActividadEstadoHistorialService.transicion(
          tx,
          id,
          "en_progreso",
          now,
        );
        return u;
      });

      return res.json({ success: true, actividad: updated });
    } catch (err) {
      console.error("ActividadesController.start error:", err);
      return res
        .status(500)
        .json({ error: "Error al iniciar la actividad.", detail: err.message });
    }
  }

  async end(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "id requerido." });
      const me = req.session?.user;
      if (!me) return res.status(401).json({ error: "No autenticado." });

      const act = await prisma.actividades.findUnique({ where: { id } });
      if (!act) return res.status(404).json({ error: "Actividad no encontrada." });

      const isDueno = Number(me.id) === Number(act.usuario_id);
      const isJefe = userIsJefe(me.rol?.nombre);
      if (!isDueno && !isJefe) {
        return res
          .status(403)
          .json({ error: "No tienes permiso para terminar esta actividad." });
      }
      if (act.estado_progreso === "completada") {
        return res
          .status(400)
          .json({ error: "La actividad ya está completada." });
      }
      if (!act.fecha_inicio_real || !act.hora_inicio_real) {
        return res
          .status(400)
          .json({ error: "La actividad aún no fue iniciada." });
      }

      const now = new Date();

      // FIX QUIRÚRGICO: NO usar `new Date(act.hora_inicio_real)` para
      // calcular la duración. `hora_inicio_real` es `Timetz` y Prisma
      // descarta el offset al leerlo: devuelve un Date con año 1970 y
      // la hora wall-clock como si fuera UTC. Al restarlo de `now` sale
      // un diff de ~56 años → `tiempo_real_minutos` gigantes
      // (~29 millones de min, "29675520 min" en la card).
      //
      // En vez de eso, leemos la fila "en_progreso" ABIERTA en
      // `actividad_estado_historial`. Su `fecha_inicio` es `Timestamptz`,
      // que Prisma lee correctamente con la zona absoluta.
      const enProgresoRow = await prisma.actividad_estado_historial.findFirst(
        {
          where: {
            actividad_id: id,
            estado_progreso: "en_progreso",
            fecha_fin: null,
          },
          orderBy: { id: "desc" },
          select: { fecha_inicio: true },
        },
      );
      if (!enProgresoRow?.fecha_inicio) {
        return res.status(400).json({
          error:
            "No se encontró el registro de inicio en el historial. Re-inicia la actividad para regenerarlo.",
        });
      }
      const ini = new Date(enProgresoRow.fecha_inicio);
      const pausa = Number(act.pausa_minutos || 0);
      const duracionSeg = Math.max(
        0,
        Math.floor((now.getTime() - ini.getTime()) / 1000) - pausa * 60,
      );
      const minutos = Math.max(0, Math.floor(duracionSeg / 60));

      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const fechaStr = `${y}-${m}-${d}`;

      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.actividades.update({
          where: { id },
          data: {
            fecha_termino_real: new Date(fechaStr),
            hora_termino_real: now,
            estado_progreso: "completada",
            tiempo_real_minutos: minutos,
            updated_at: now,
          },
        });
        // Cierra la fila abierta del estado previo (en_progreso o
        // pendiente) y abre la de "completada". Pasamos
        // `duracionSegOverride` con la duración que ya calculamos arriba
        // (que descuenta `pausa_minutos`) para que la fila cerrada del
        // historial refleje exactamente el tiempo real trabajado.
        await ActividadEstadoHistorialService.transicion(
          tx,
          id,
          "completada",
          now,
          { duracionSegOverride: duracionSeg },
        );
        // Contrato VALORADOR: si el asignado tiene rol VALORADOR, recién
        // ahora (al cerrar) se inserta el slot en `horario_usuario`. Para
        // el resto de roles, la fila ya existe desde la creación.
        const asig = await tx.usuarios.findUnique({
          where: { id: Number(act.usuario_id) },
          select: { rol_id: true, roles: { select: { nombre: true } } },
        });
        const isValorador =
          (asig && Number(asig.rol_id) === ROL_VALORADOR_ID) ||
          (asig && norm(asig.roles?.nombre).includes(ROL_VALORADOR));
        if (asig && isValorador) {
          // Upsert por (actividad_id, usuario_id): si ya existe la fila
          // (caso legacy o drag previo), la actualizamos con los datos
          // de cierre consistentes. Si no, la creamos.
          const fechaCierre = new Date(fechaStr);
          const horaInicio = act.hora_inicio_real || now;
          const existing = await tx.horario_usuario.findFirst({
            where: {
              actividad_id: id,
              usuario_id: Number(act.usuario_id),
            },
            select: { id: true },
          });
          if (existing) {
            await tx.horario_usuario.update({
              where: { id: existing.id },
              data: {
                fecha: fechaCierre,
                hora_inicio: horaInicio,
                hora_fin: now,
                estado: true,
                tipo: "actividad",
                duracion_minutos: minutos,
                updated_at: now,
              },
            });
          } else {
            await tx.horario_usuario.create({
              data: {
                actividad_id: id,
                usuario_id: Number(act.usuario_id),
                fecha: fechaCierre,
                hora_inicio: horaInicio,
                hora_fin: now,
                estado: true,
                tipo: "actividad",
                duracion_minutos: minutos,
                created_at: now,
                updated_at: now,
              },
            });
          }
        }
        return u;
      });

      return res.json({
        success: true,
        actividad: updated,
        duracion_minutos: minutos,
        duracion_segundos: duracionSeg,
      });
    } catch (err) {
      console.error("ActividadesController.end error:", err);
      return res
        .status(500)
        .json({ error: "Error al terminar la actividad.", detail: err.message });
    }
  }
}

export default new ActividadesController();
