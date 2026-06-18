import prisma from "../config/db.js";
import schedulerService from "./scheduler.service.js";

// ============================================================================
// Overflow: cuando el scheduler dice que la actividad NO entra
// ----------------------------------------------------------------------------
// Devuelve un set de sugerencias para que el front (o el jefe) decida:
//   1) Reasignar a otro auxiliar del mismo rol que tenga hueco ese día.
//   2) Horas extras (sólo se sugiere; la creación del registro va por
//      un endpoint aparte en una iteración con aprobación).
//   3) Si la actividad viene de un prospecto con `fecha_entrega`, proponer
//      correr el deadline.
//
// Inputs:
//   usuarioId   int     auxiliar original
//   fecha       'YYYY-MM-DD' | Date
//   minutos     int     lo que necesita la actividad
//   opts:
//     prioridad     'ALTA'|'MEDIA'|'BAJA'|null
//     deadline      'YYYY-MM-DD'|null  (para correr el deadline)
//     prospectoId   int|null           (para ofrecer mover el deadline)
// ============================================================================

class OverflowService {
  // Normaliza el nombre de un rol: minúsculas + sin diacríticos.
  static norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  // Devuelve sugerencias para los 3 caminos. No toca la BD.
  async suggest(usuarioId, fecha, minutos, opts = {}) {
    const origUsuarioId = Number(usuarioId);
    if (!origUsuarioId || !fecha || !minutos) {
      return { ok: false, reason: "datos inválidos" };
    }

    // 1) Correr al mismo auxiliar a horas extras. No es "solución" pero
    //    sí es una sugerencia válida si no hay más nada.
    const horasExtras = this.#calcHorasExtras(minutos);

    // 2) Buscar otros auxiliares del mismo rol con hueco ese día.
    const otherAuxiliares = await this.#findOtherAuxiliaresWithSlot(
      origUsuarioId,
      fecha,
      minutos,
    );

    // 3) Mover el deadline: solo si la actividad viene de un prospecto.
    //    No recalculamos: avisamos que se puede correr hasta 7 días sin
    //    tocar la BD. El usuario/jefe lo decide.
    let moverDeadline = null;
    if (opts.prospectoId) {
      const p = await prisma.prospectos.findUnique({
        where: { id: Number(opts.prospectoId) },
        select: { id: true, fecha_entrega: true },
      });
      if (p?.fecha_entrega) {
        moverDeadline = {
          prospecto_id: p.id,
          fecha_actual: p.fecha_entrega,
          // Sugerencia arbitraria: 7 días después.
          fecha_sugerida: this.#addDays(p.fecha_entrega, 7),
        };
      }
    }

    return {
      ok: true,
      overflowMin: minutos,
      horasExtras,
      otherAuxiliares,
      moverDeadline,
    };
  }

  // ---- Privados -------------------------------------------------------

  #calcHorasExtras(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return {
      minutos,
      horas: Number((minutos / 60).toFixed(2)),
      texto:
        m === 0
          ? `${h} hora${h === 1 ? "" : "s"} extra${h === 1 ? "" : "s"}`
          : `${h} h ${m} min extra`,
    };
  }

  #addDays(date, days) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }

  // Busca usuarios activos (excluyendo al original) del mismo rol que
  // tengan un hueco >= `minutos` ese día.
  async #findOtherAuxiliaresWithSlot(usuarioId, fecha, minutos) {
    // 1) rol del usuario original
    const u = await prisma.usuarios.findUnique({
      where: { id: Number(usuarioId) },
      select: { rol_id: true, roles: { select: { nombre: true } } },
    });
    if (!u) return [];
    const rolId = u.rol_id;
    if (!rolId) return [];

    // 2) candidatos: mismo rol, activos, no super admin
    const candidatos = await prisma.usuarios.findMany({
      where: {
        rol_id: rolId,
        estado: true,
        id: { not: Number(usuarioId) },
      },
      select: {
        id: true,
        usuario: true,
        personas: { select: { nombres: true, apellidos: true } },
      },
    });

    // 3) Para cada candidato, corremos el scheduler y vemos si entra.
    //    Limitamos a los 5 mejores (los de hueco más temprano).
    const out = [];
    for (const c of candidatos) {
      const plan = await schedulerService.placeActivity(c.id, fecha, minutos);
      if (plan.fits) {
        const nombre = c.personas
          ? [c.personas.nombres, c.personas.apellidos]
              .filter(Boolean)
              .join(" ")
              .trim() || c.usuario
          : c.usuario;
        out.push({
          usuario_id: c.id,
          nombre,
          slot: plan.slot,
          moves: plan.moves, // si requiere reacomodar, lo informamos
          reason: plan.reason,
        });
      }
    }
    out.sort((a, b) => a.slot.ini - b.slot.ini);
    return out.slice(0, 5);
  }
}

export default new OverflowService();
