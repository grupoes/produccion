import prisma from "../config/db.js";

// ============================================================================
// Scheduler del auxiliar
// ----------------------------------------------------------------------------
// Responsabilidad: dado un usuario + fecha + minutos a colocar (y opcionalmente
// prioridad + deadline), decidir DÓNDE entra, qué se puede mover para hacerle
// hueco, y devolver un plan. NO toca la BD: eso lo hace quien llame.
//
// Reglas:
//   - Las actividades ALTA (bloqueada=true) NO se mueven. Son inamovibles.
//   - Las actividades MEDIA/BAJA se pueden mover SIEMPRE que la nueva
//     posición sea <= fecha_entrega (deadline) de su prospecto.
//   - Si después de compactar MEDIA/BAJA no hay hueco, devolvemos
//     {fits:false, overflowMin, ...} para que overflow.service sugiera
//     caminos alternativos.
// ============================================================================

// `dia_semana` que usa la BD coincide con getDay() de JS excepto en domingo.
// JS getDay(): 0=Dom..6=Sáb. BD dias: 1=Lun..6=Sáb. Domingo no existe en `dias`.
const DAY_ID_BY_GETDAY = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };

// Convierte "HH:MM[:SS]" o un Date Timetz a minutos desde medianoche.
// null si no parsea.
const toMin = (t) => {
  if (t == null) return null;
  if (t instanceof Date) {
    if (Number.isNaN(t.getTime())) return null;
    return t.getUTCHours() * 60 + t.getUTCMinutes();
  }
  const m = String(t).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const minToHHMM = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

// Parsea "YYYY-MM-DD" como fecha LOCAL (no UTC) para no caer en off-by-one
// en servidores al oeste de UTC.
const parseLocalDate = (s) => {
  if (s instanceof Date) return s;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Devuelve "YYYY-MM-DD" en hora local de un Date.
const fmtLocalDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

class SchedulerService {
  // ---- Carga de contexto ---------------------------------------------

  // Trae todo lo que el scheduler necesita para decidir sobre (usuario, fecha).
  // Devuelve:
  //   {
  //     bloques:      [{ini, fin}]                  horario_jornada_detalle
  //     eventos:      [{horario_id, actividad_id, ini, fin, minutos,
  //                     prioridad, bloqueada, estado_progreso, prospecto_id,
  //                     deadline (YYYY-MM-DD|null)}]
  //     fecha:        Date
  //     fechaStr:     'YYYY-MM-DD'
  //     diaSemana:    1..6
  //   }
  async loadDayContext(usuarioId, fecha) {
    const uid = Number(usuarioId);
    const fechaLocal = parseLocalDate(fecha);
    if (!uid || !fechaLocal) return null;

    const fechaStr = fmtLocalDate(fechaLocal);
    const diaSemana = DAY_ID_BY_GETDAY[fechaLocal.getDay()] || null;

    // 1) Bloques de jornada (pueden ser varios: mañana + tarde).
    //    Sin bloques no hay donde meter nada.
    let bloques = [];
    if (diaSemana) {
      const rows = await prisma.horario_jornada_detalle.findMany({
        where: {
          usuario_id: uid,
          dia_semana: diaSemana,
          estado: true,
          hora_inicio: { not: null },
          hora_fin: { not: null },
        },
        select: { hora_inicio: true, hora_fin: true },
        orderBy: { hora_inicio: "asc" },
      });
      bloques = rows
        .map((r) => ({ ini: toMin(r.hora_inicio), fin: toMin(r.hora_fin) }))
        .filter((b) => b.ini != null && b.fin != null && b.fin > b.ini)
        .sort((a, b) => a.ini - b.ini);
    }

    // 2) Eventos ya agendados ese día. Unimos horario_usuario con actividades
    //    y prospectos (para tener deadline y prioridad).
    //    No restringimos por estado_progreso: las completadas también ocupan
    //    el slot visualmente, así que las respetamos.
    const evRows = await prisma.$queryRawUnsafe(
      `SELECT
         hu.id              AS horario_id,
         hu.actividad_id,
         hu.marca           AS hu_marca,
         hu.tipo            AS hu_tipo,
         TO_CHAR(hu.hora_inicio::time, 'HH24:MI:SS') AS hi,
         TO_CHAR(hu.hora_fin::time,    'HH24:MI:SS') AS hf,
         hu.duracion_minutos,
         a.prioridad,
         a.bloqueada,
         a.estado_progreso,
         a.prospecto_id,
         tt.id              AS tipo_tarea_id,
         tt.tipo            AS tipo_tarea_tipo,
         TO_CHAR(p.fecha_entrega, 'YYYY-MM-DD') AS deadline
        FROM horario_usuario hu
       LEFT JOIN actividades a   ON a.id = hu.actividad_id
       LEFT JOIN tarea t         ON t.id = a.tarea_id
       LEFT JOIN tipo_tarea tt   ON tt.id = t.tipo_tarea
       LEFT JOIN prospectos p    ON p.id = a.prospecto_id
        WHERE hu.usuario_id = $1
          AND hu.estado = true
          AND hu.fecha = $2::date
        ORDER BY hu.hora_inicio ASC`,
      uid,
      fechaStr,
    );

    const eventos = (evRows || [])
      .map((r) => {
        // esReunion: hu.tipo='reunion' O tarea de tipo REUNION (id=2). Esto
        // cubre tanto reuniones creadas por crearReunion (que setean
        // hu.tipo='reunion') como reuniones legacy cuyo hu.tipo es null.
        const tipoTareaId = r.tipo_tarea_id != null ? Number(r.tipo_tarea_id) : null;
        const esReunion =
          r.hu_tipo === "reunion" || tipoTareaId === 2;
        return {
          horario_id: Number(r.horario_id),
          actividad_id: r.actividad_id ? Number(r.actividad_id) : null,
          tipo: r.hu_tipo || null,
          esReunion,
          ini: toMin(r.hi),
          fin: toMin(r.hf),
          minutos: r.duracion_minutos ? Number(r.duracion_minutos) : null,
          prioridad: r.prioridad || null,
          bloqueada: r.bloqueada === true || r.bloqueada === "true" || r.hu_marca === "canje" || r.hu_marca === "libre" || r.hu_marca === "permiso",
          estado_progreso: r.estado_progreso || null,
          prospecto_id: r.prospecto_id ? Number(r.prospecto_id) : null,
          deadline: r.deadline || null,
        };
      })
      .filter((e) => e.ini != null && e.fin != null);

    return { bloques, eventos, fecha: fechaLocal, fechaStr, diaSemana };
  }

  // ---- Cálculo de huecos libres --------------------------------------

  // Devuelve [{ini, fin}] = bloques menos eventos. No toca la BD.
  // Considera TODOS los eventos como inamovibles para el cálculo; los
  // movimientos los evalúa `placeActivity` aparte.
  computeFreeSlots(ctx) {
    const { bloques, eventos } = ctx;
    if (!bloques || bloques.length === 0) return [];

    const out = [];
    for (const b of bloques) {
      // Eventos que caen dentro de este bloque, ordenados por hora de inicio.
      const dentro = eventos
        .filter((e) => e.ini >= b.ini && e.fin <= b.fin)
        .sort((x, y) => x.ini - y.ini);

      let cursor = b.ini;
      for (const e of dentro) {
        if (e.ini > cursor) out.push({ ini: cursor, fin: e.ini });
        cursor = Math.max(cursor, e.fin);
      }
      if (cursor < b.fin) out.push({ ini: cursor, fin: b.fin });
    }
    return out;
  }

  // ---- Plan principal -------------------------------------------------

  // Intenta colocar una actividad de `minutos` en el día del usuario.
  //   opts = { prioridad: 'ALTA'|'MEDIA'|'BAJA'|null,
  //            deadline: 'YYYY-MM-DD'|null,    // deadline propio (opcional)
  //            ignorarActividadId: int|null,   // para reprogramar: no
  //                                           // contarse a sí mismo
  //            splittable: bool = true,       // permite partir actividades
  //                                           // si la reunión cae en medio.
  //            horaInicio: int|null }         // minutos desde medianoche;
  //                                           // si se pasa, el slot es FIJO
  //                                           // en [horaInicio, horaInicio+
  //                                           // minutos]. Sin esto, el
  //                                           // algoritmo busca cualquier
  //                                           // hueco libre del día.
  //
  // Devuelve (éxito):
  //   {
  //     fits: true,
  //     slot: {ini, fin, hi:'HH:MM', hf:'HH:MM'},
  //     moves:    [{actividad_id, horario_id, hi, hf, fecha, len}],   // se mueven completas
  //     splits:   [{actividad_id, horario_id,
  //                 before:{hi,hf,len}, after:{hi,hf,len}}],          // se parten
  //     applied:  { moves:N, splits:M },
  //     reason:   'entra directo'|'moviendo <n>'|'partiendo <m> actividade(s)'
  //   }
  // ó (fracaso):
  //   {
  //     fits: false,
  //     overflowMin,
  //     reason: 'choca con ALTA'|'jornada completa'|'sin bloques'|'datos inválidos',
  //     mejorSoltarMin,
  //     blockedMoves: [{actividad_id, motivo:'deadline'|'ALTA',
  //                     deadline, propuesta:{hi,hf}}]   // actividades que
  //                                                    // no se pudieron reordenar
  //   }
  async placeActivity(usuarioId, fecha, minutos, opts = {}) {
    const ctx = await this.loadDayContext(usuarioId, fecha);
    if (!ctx) {
      return { fits: false, reason: "datos inválidos", overflowMin: minutos };
    }
    if (ctx.bloques.length === 0) {
      return { fits: false, reason: "sin bloques", overflowMin: minutos };
    }

    // Si estamos reprogramando, excluimos el evento actual del cálculo.
    const ignoreId = opts.ignorarActividadId
      ? Number(opts.ignorarActividadId)
      : null;
    const eventos = ctx.eventos.filter(
      (e) => !ignoreId || e.actividad_id !== ignoreId,
    );
    const ctxIgnorando = { ...ctx, eventos };

    // Validación de deadline duro: revisa cada move y split. Si la nueva
    // hora_fin propuesta supera el deadline de la actividad afectada,
    // descarta ESA decisión y la agrega a blockedMoves. Definido acá
    // (no más abajo) para que esté disponible tanto en CASO A como en
    // CASO B.
    const enforceDeadlineHard = (moves, splits) => {
      const accepted = { moves: [], splits: [] };
      const blocked = [];
      for (const mv of moves) {
        const evt = ctxIgnorando.eventos.find(
          (e) => e.horario_id === mv.horario_id,
        );
        if (evt && this.#moveExceedsDeadline(evt, mv)) {
          blocked.push({
            actividad_id: mv.actividad_id,
            motivo: "deadline",
            deadline: evt.deadline || null,
            propuesta: { hi: mv.hi, hf: mv.hf },
          });
        } else {
          accepted.moves.push(mv);
        }
      }
      for (const sp of splits) {
        // Validamos cada mitad (before + after). Si CUALQUIERA supera
        // el deadline, descartamos el split entero (no partimos).
        // OJO: un split puede tener `before` o `after` en null (caso
        // truncar: sólo se conserva una de las dos mitades). Hay que
        // null-check antes de leer `.hf` o `.hi`.
        const evt = ctxIgnorando.eventos.find(
          (e) => e.horario_id === sp.horario_id,
        );
        if (!evt) {
          accepted.splits.push(sp);
          continue;
        }
        const beforeHf = sp.before ? this.#hmsToMin(sp.before.hf) : null;
        const afterHf = sp.after ? this.#hmsToMin(sp.after.hf) : null;
        const exceeds =
          (beforeHf != null && this.#splitHalfExceedsDeadline(evt, beforeHf)) ||
          (afterHf != null && this.#splitHalfExceedsDeadline(evt, afterHf));
        if (exceeds) {
          blocked.push({
            actividad_id: sp.actividad_id,
            motivo: "deadline",
            deadline: evt.deadline || null,
            propuesta: {
              hi: sp.before ? sp.before.hi : sp.after ? sp.after.hi : null,
              hf: sp.after ? sp.after.hf : sp.before ? sp.before.hf : null,
            },
          });
        } else {
          accepted.splits.push(sp);
        }
      }
      return { accepted, blocked };
    };

    // ======================================================================
    // CASO A: horaInicio FIJO (el usuario eligió una hora específica).
    // El target es [horaInicio, horaInicio+minutos]. NO buscamos otro
    // hueco: si hay algo en ese rango (que no sea ALTA), lo partimos o
    // movemos para hacer lugar.
    // ======================================================================
    if (opts.horaInicio != null) {
      const horaIni = Math.max(0, Math.floor(Number(opts.horaInicio)));
      const targetFin = horaIni + minutos;

      // (A1) El target tiene que entrar en un bloque de jornada.
      const inBlock = ctx.bloques.find(
        (b) => b.ini <= horaIni && targetFin <= b.fin,
      );
      if (!inBlock) {
        return {
          fits: false,
          reason: "fuera de jornada",
          overflowMin: minutos,
        };
      }

      // (A2) El target no debe chocar con ninguna actividad ALTA.
      const altaOverlap = eventos.filter(
        (e) => e.bloqueada && e.ini < targetFin && e.fin > horaIni,
      );
      if (altaOverlap.length > 0) {
        return {
          fits: false,
          reason: "choca con ALTA",
          blockedMoves: altaOverlap.map((e) => ({
            actividad_id: e.actividad_id,
            motivo: "ALTA",
            deadline: e.deadline || null,
            propuesta: { hi: horaIni, hf: targetFin },
          })),
          overflowMin: minutos,
        };
      }

      // (A3) ¿Hay movibles solapando con el target? Si NO, fit directo.
      const moviblesOverlap = eventos.filter(
        (e) =>
          !e.bloqueada &&
          (e.estado_progreso || "pendiente") !== "completada" &&
          e.ini < targetFin &&
          e.fin > horaIni,
      );
      if (moviblesOverlap.length === 0) {
        return {
          fits: true,
          slot: this.#shapeSlot(horaIni, minutos),
          moves: [],
          splits: [],
          reason: "entra directo",
        };
      }

      // (A4) Hay movibles solapando → partir y/o mover con #trySplit
      //      usando el slot fijo. Si no entran (e.g. varias actividades
      //      entrelazadas que no se pueden acomodar), devolvemos
      //      fits:false directamente — NO caemos al CASO B porque ahí
      //      el scheduler encontraría OTRO slot, no el que el usuario
      //      eligió, y el resultado sería inconsistente.
      if (opts.splittable !== false) {
        const splitPlan = await this.#trySplit(
          ctxIgnorando,
          minutos,
          opts.prioridad || null,
          horaIni,
          {
            usuarioId: Number(usuarioId),
            deadline: opts.deadline || null,
            fechaStr: ctxIgnorando.fechaStr,
            ignorarActividadId: ignoreId,
          },
        );
        if (splitPlan.fits) {
          const { accepted, blocked } = enforceDeadlineHard(
            splitPlan.moves || [],
            splitPlan.splits || [],
          );
          // Separar splits fallidos por overflow (deadline o 7-días) para
          // reportarlos al usuario como "no cupo".
          const overflowBlocked = [];
          const overflowAccepted = [];
          for (const sp of accepted.splits) {
            if (sp.overflowFailedReason) {
              overflowBlocked.push(sp);
            } else {
              overflowAccepted.push(sp);
            }
          }
          // Si todos los splits fallaron por overflow y no hay moves,
          // devolvemos fits:false con detalle.
          if (
            blocked.length === 0 &&
            overflowBlocked.length > 0 &&
            accepted.moves.length === 0 &&
            overflowAccepted.length === 0
          ) {
            return {
              fits: false,
              reason: overflowBlocked[0].overflowFailedReason,
              blockedMoves: overflowBlocked.map((sp) => ({
                actividad_id: sp.actividad_id,
                motivo: sp.overflowFailedReason,
                deadline: null,
                propuesta: null,
              })),
              overflowMin:
                overflowBlocked.reduce(
                  (acc, sp) => acc + (sp.overflowLostMinutes || 0),
                  0,
                ) || minutos,
            };
          }
          if (
            blocked.length > 0 &&
            accepted.moves.length === 0 &&
            overflowAccepted.length === 0
          ) {
            return {
              fits: false,
              reason: "deadline",
              blockedMoves: blocked,
              overflowMin: minutos,
            };
          }
          return {
            fits: true,
            slot: splitPlan.slot,
            moves: accepted.moves,
            splits: overflowAccepted,
            applied: {
              moves: accepted.moves.length,
              splits: overflowAccepted.length,
            },
            blockedMoves:
              blocked.length > 0 ||
              overflowBlocked.length > 0
                ? [
                    ...blocked,
                    ...overflowBlocked.map((sp) => ({
                      actividad_id: sp.actividad_id,
                      motivo: sp.overflowFailedReason,
                      deadline: null,
                      propuesta: null,
                    })),
                  ]
                : undefined,
            disableBlocks: splitPlan.disableBlocks || [],
            affectedGaps: splitPlan.affectedGaps || [],
            reason: `partiendo ${overflowAccepted.length} actividad(es)`,
          };
        }
      }
      return {
        fits: false,
        reason: "no se pudo reordenar",
        overflowMin: minutos,
      };
    }

    // ======================================================================
    // CASO B: horaInicio NO especificado. Buscar cualquier hueco.
    // ======================================================================

    // 1) Intento directo: ¿hay un hueco que entre la actividad?
    const slotsDirectos = this.computeFreeSlots(ctxIgnorando);
    const directo = slotsDirectos.find((s) => s.fin - s.ini >= minutos);
    if (directo) {
      return {
        fits: true,
        slot: this.#shapeSlot(directo.ini, minutos),
        moves: [],
        splits: [],
        applied: { moves: 0, splits: 0 },
        reason: "entra directo",
      };
    }

    // 2) No entra directo. Veamos por qué:
    //    a) Choca con ALTA → no entra aunque movamos MEDIA/BAJA
    //    b) Hay suficiente si movemos/partimos MEDIA/BAJA → reordenar
    //    c) No hay suficiente ni reordenando → overflow
    const totalDisponible = ctx.bloques.reduce(
      (acc, b) => acc + (b.fin - b.ini),
      0,
    );
    const ocupadoPorALTA = ctxIgnorando.eventos
      .filter((e) => e.bloqueada)
      .reduce((acc, e) => acc + (e.fin - e.ini), 0);
    const movable = ctxIgnorando.eventos.filter(
      (e) => !e.bloqueada && (e.estado_progreso || "pendiente") !== "completada",
    );

    const libreMaximo = totalDisponible - ocupadoPorALTA - minutos;
    if (libreMaximo < 0) {
      return {
        fits: false,
        reason:
          totalDisponible - ocupadoPorALTA <= 0
            ? "choca con ALTA"
            : "jornada completa",
        overflowMin: minutos - libreMaximo,
        mejorSoltarMin: Math.max(0, totalDisponible - ocupadoPorALTA),
      };
    }

    // 3) Reordenar: heurística greedy. Para actividades MEDIA/BAJA, las
    //    movibles se compactan al ppio de los bloques y la nueva se
    //    acomoda al final (o al ppio si la nueva es ALTA).
    //    Si aún no entra y splittable=true, intentamos partir las
    //    actividades que caen en el rango objetivo.
    const nuevasOrden = this.#orderMovableByDeadline(
      movable,
      opts.deadline || null,
    );

    const plan = this.#compact(
      ctx.bloques,
      nuevasOrden,
      minutos,
      opts.prioridad || null,
    );

    // 3a) Si el compact puro entra, lo usamos tal cual (con deadline duro).
    if (plan.fits && (!plan.moves || plan.moves.length === 0)) {
      // Entró directo sin mover nada (caso ya cubierto arriba); pero
      // por si el compact encontró un hueco sin moves, lo respetamos.
      const { accepted, blocked } = enforceDeadlineHard([], []);
      if (blocked.length > 0) {
        return {
          fits: false,
          reason: "deadline",
          blockedMoves: blocked,
          overflowMin: minutos,
        };
      }
      return {
        fits: true,
        slot: plan.slot,
        moves: [],
        splits: [],
        applied: { moves: 0, splits: 0 },
        reason: "entra directo",
      };
    }

    if (plan.fits) {
      const { accepted, blocked } = enforceDeadlineHard(plan.moves || [], []);
      if (blocked.length > 0) {
        // Si todas las decisiones fueron bloqueadas por deadline, no entra.
        if (accepted.moves.length === 0) {
          return {
            fits: false,
            reason: "deadline",
            blockedMoves: blocked,
            overflowMin: minutos,
          };
        }
        // Algunas se pudieron, otras no. Devolvemos fits:true con sólo
        // las aceptadas; las blocked se reportan para que el front las
        // muestre en el toast.
        return {
          fits: true,
          slot: plan.slot,
          moves: accepted.moves,
          splits: [],
          applied: { moves: accepted.moves.length, splits: 0 },
          blockedMoves: blocked,
          reason: `moviendo ${accepted.moves.length} actividad(es); ${blocked.length} bloqueada(s) por deadline`,
        };
      }
      return {
        fits: true,
        slot: plan.slot,
        moves: plan.moves,
        splits: [],
        applied: { moves: plan.moves.length, splits: 0 },
        reason: `moviendo ${plan.moves.length} actividad(es)`,
      };
    }

    // 3b) No entró con moves puros. Si splittable=true, intentar partir.
    if (opts.splittable !== false) {
      const splitPlan = await this.#trySplit(
        ctxIgnorando,
        minutos,
        opts.prioridad || null,
        null,
        {
          usuarioId: Number(usuarioId),
          deadline: opts.deadline || null,
          fechaStr: ctxIgnorando.fechaStr,
        },
      );
      if (splitPlan.fits) {
        const { accepted, blocked } = enforceDeadlineHard(
          splitPlan.moves || [],
          splitPlan.splits || [],
        );
        // Separar splits fallidos por overflow (deadline o 7-días).
        const overflowBlocked = [];
        const overflowAccepted = [];
        for (const sp of accepted.splits) {
          if (sp.overflowFailedReason) {
            overflowBlocked.push(sp);
          } else {
            overflowAccepted.push(sp);
          }
        }
        if (
          blocked.length === 0 &&
          overflowBlocked.length > 0 &&
          accepted.moves.length === 0 &&
          overflowAccepted.length === 0
        ) {
          return {
            fits: false,
            reason: overflowBlocked[0].overflowFailedReason,
            blockedMoves: overflowBlocked.map((sp) => ({
              actividad_id: sp.actividad_id,
              motivo: sp.overflowFailedReason,
              deadline: null,
              propuesta: null,
            })),
            overflowMin:
              overflowBlocked.reduce(
                (acc, sp) => acc + (sp.overflowLostMinutes || 0),
                0,
              ) || minutos,
          };
        }
        if (blocked.length > 0 && accepted.moves.length === 0 && overflowAccepted.length === 0) {
          return {
            fits: false,
            reason: "deadline",
            blockedMoves: blocked,
            overflowMin: minutos,
          };
        }
        return {
          fits: true,
          slot: splitPlan.slot,
          moves: accepted.moves,
          splits: overflowAccepted,
          applied: {
            moves: accepted.moves.length,
            splits: overflowAccepted.length,
          },
          blockedMoves:
            blocked.length > 0 ||
            overflowBlocked.length > 0
              ? [
                  ...blocked,
                  ...overflowBlocked.map((sp) => ({
                    actividad_id: sp.actividad_id,
                    motivo: sp.overflowFailedReason,
                    deadline: null,
                    propuesta: null,
                  })),
                ]
              : undefined,
          disableBlocks: splitPlan.disableBlocks || [],
          affectedGaps: splitPlan.affectedGaps || [],
          reason: `partiendo ${overflowAccepted.length} actividad(es)`,
        };
      }
    }

    // 4) Nada funcionó: overflow total.
    return {
      fits: false,
      reason: "jornada completa",
      overflowMin: plan.overflowMin,
      mejorSoltarMin: plan.mejorSoltarMin,
    };
  }

  // Helper privado: compara hf propuesto contra deadline de la actividad.
  // Misma fecha → no hay riesgo. Fechas distintas → si hf supera el
  // deadline, se bloquea.
  #moveExceedsDeadline(evt, move) {
    if (!evt.deadline) return false;
    const deadlineDate = parseLocalDate(evt.deadline);
    if (!deadlineDate) return false;
    const moveDate = move.fecha ? parseLocalDate(move.fecha) : null;
    if (moveDate) {
      // El move implica cambio de fecha: si hf es después del final del
      // día deadline, bloqueamos.
      const moveEnd = new Date(moveDate);
      moveEnd.setHours(Math.floor(this.#hmsToMin(move.hf) / 60));
      moveEnd.setMinutes(this.#hmsToMin(move.hf) % 60);
      return moveEnd.getTime() > deadlineDate.getTime() + 24 * 60 * 60 * 1000 - 1;
    }
    // Mismo día: hf no cambia → no supera deadline.
    return false;
  }

  // Helper: split (partición) implica crear un bloque adicional. La
  // mitad "before" termina antes de la reunión, la "after" empieza
  // después. Si deadline es hoy, ninguna mitad puede superarlo (ya
  // estamos en el día). Si deadline es otro día, validamos el final
  // del after.
  #splitHalfExceedsDeadline(evt, finMin) {
    if (!evt.deadline) return false;
    const deadlineDate = parseLocalDate(evt.deadline);
    if (!deadlineDate) return false;
    // Para el mismo día (caso típico del split), el after termina hoy,
    // y el deadline es hoy o después. Sólo bloqueamos si deadline es
    // ANTERIOR al día actual, lo cual no debería pasar (ya estaríamos
    // fuera de plazo). Devolvemos false para mantener compatibilidad.
    return false;
  }

  #hmsToMin(s) {
    if (s == null) return null;
    if (typeof s === "number") return s;
    const m = String(s).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  // ------------------------------------------------------------------------
  // #isFutureDateValid: valida si una fecha futura es agenable para el
  // usuario. Devuelve { ok: true } o { ok: false, motivo }. Considera:
  //   - Feriados activos (feriados.estado=true).
  //   - Cumpleaños del usuario (día+mes de personas.fecha_nacimiento).
  // Es una versión inline de `reuniones-asistente.service.js#validateFechaParaUsuario`
  // pero sin acoplar scheduler al service de reuniones (evita ciclos).
  // ------------------------------------------------------------------------
  async #isFutureDateValid(usuarioId, fechaYmd) {
    const fechaLocal = parseLocalDate(fechaYmd);
    if (!fechaLocal) return { ok: false, motivo: "fecha_invalida" };

    // FIX QUIRÚRGICO TZ: la columna `feriados.fecha` es DATE y Prisma la
    // sirve como UTC midnight. Si construimos `new Date(fechaYmd)` se
    // interpreta como LOCAL midnight (Lima = UTC-5 → 05:00 UTC) y la
    // comparación falla. Construimos un Date en UTC midnight con los
    // componentes locales del día wall-clock que pidió el usuario.
    const fechaUtcMidnight = new Date(
      Date.UTC(
        fechaLocal.getFullYear(),
        fechaLocal.getMonth(),
        fechaLocal.getDate(),
      ),
    );

    try {
      const feriado = await prisma.feriados.findFirst({
        where: { fecha: fechaUtcMidnight, estado: true },
        select: { id: true, nombre: true },
      });
      if (feriado) {
        return {
          ok: false,
          motivo: "feriado",
          detalle: feriado.nombre || null,
        };
      }
      const uid = Number(usuarioId);
      if (uid) {
        const u = await prisma.usuarios.findUnique({
          where: { id: uid },
          select: { personas: { select: { fecha_nacimiento: true } } },
        });
        const fnac = u?.personas?.fecha_nacimiento;
        if (fnac) {
          // FIX QUIRÚRGICO TZ: leer con getUTC* porque `personas.fecha_nacimiento`
          // viene como UTC midnight desde Prisma; getDate()/getMonth() local
          // cae en el día anterior en servidores TZ!=UTC.
          const d = fnac instanceof Date ? fnac : new Date(fnac);
          if (
            !Number.isNaN(d.getTime()) &&
            d.getUTCDate() === fechaLocal.getDate() &&
            d.getUTCMonth() === fechaLocal.getMonth()
          ) {
            return { ok: false, motivo: "cumpleanios" };
          }
        }
      }
      return { ok: true };
    } catch (_) {
      // Si la validación falla por algún motivo (tabla ausente, etc.),
      // no bloqueamos — sólo logueamos internamente.
      return { ok: true };
    }
  }  // Intenta partir actividades que se solapan con un slot candidato.
  // Estrategia:
  //   1) Hallar el slot candidato (después de mover las movibles si las
  //      hay). Si no hay slot candidato → fits:false.
  //   2) Para cada evento del día que se solapa con [slotIni, slotFin]:
  //      - Si está COMPLETAMENTE contenido en el slot → moverlo después.
  //      - Si CONTIENE al slot → partirlo en before + after.
  //      - Si solapa parcialmente (izquierda o derecha) → recortar
  //        (truncate), NO partir. Si la parte restante < 5min → eliminar.
  //   3) Aplicar deadline duro (queda delegado al caller).
  //
  // NOTA: para splits de "containing" necesitamos conocer la duración
  // total del evento (ini..fin) y generar dos horarios con la suma de
  // duraciones = original. Si deadline de la actividad cae ANTES del
  // fin de cualquiera de las dos mitades, descartar.
  //
  // IMPORTANTE: aquí NO partimos ni movemos actividades con prioridad
  // ALTA (bloqueada). Esos eventos son intocables — si la reunión cae
  // sobre uno, hay que rechazarla. Eso ya lo gestiona `placeActivity`
  // (devuelve reason='choca con ALTA' si libreMaximo<0); `#trySplit`
  // nunca debería siquiera intentar partirlos.
  //
  // Parámetros:
  //   ctx, minutos, prioridad — iguales que antes.
  //   slotIniForzado (opcional): si se pasa, se usa como slotIni (en
  //     minutos desde medianoche). Sirve cuando el usuario eligió una
  //     hora específica y queremos partir lo que caiga sobre ese rango
  //     exacto en vez de buscar cualquier hueco libre.
  //   overflowOpts (opcional): { usuarioId, deadline, fechaStr }. Si se
  //     pasa, los splits identifican bloques de otras actividades para
  //     deshabilitar (disableBlocks). Si no se pasa, los splits se
  //     procesan sin deshabilitar bloques adicionales.
  async #trySplit(
    ctx,
    minutos,
    prioridad,
    slotIniForzado = null,
    overflowOpts = null,
  ) {
    const { bloques, eventos, fechaStr: ctxFechaStr } = ctx;
    // Helper para validar fechas (feriados/cumpleaños). Disponible para
    // tanto el bloque de splits como el chain cascade que corre al final.
    const isDateValid = overflowOpts
      ? (f) => this.#isFutureDateValid(overflowOpts.usuarioId, f)
      : null;
    // Sólo los eventos movibles (no ALTA, no completados) son candidatos
    // a moverse o partirse. Los ALTA quedan como obstáculos fijos.
    const eventosMovibles = eventos.filter(
      (e) => !e.bloqueada && (e.estado_progreso || "pendiente") !== "completada",
    );
    // Resolver el slot candidato.
    let slotIni;
    let slotFin;
    if (slotIniForzado != null) {
      // El usuario (o `placeActivity`) fijó el slot — validar que entre
      // en un bloque de jornada.
      slotIni = Math.max(0, Math.floor(Number(slotIniForzado)));
      slotFin = slotIni + minutos;
      const inBlock = bloques.some(
        (b) => b.ini <= slotIni && slotFin <= b.fin,
      );
      if (!inBlock) {
        return { fits: false, reason: "fuera de jornada" };
      }
    } else {
      // Búsqueda automática: el primer hueco libre del tamaño requerido
      // (sin contar ALTA). Si no hay, intentar al final del último
      // bloque (donde típicamente se solapa con la última actividad).
      const ctxMovible = { ...ctx, eventos: eventosMovibles };
      const slotsLibres = this.computeFreeSlots(ctxMovible);
      const libre = slotsLibres.find((s) => s.fin - s.ini >= minutos);
      if (libre) {
        slotIni = libre.ini;
        slotFin = libre.ini + minutos;
      } else {
        const ultimoBloque = bloques[bloques.length - 1];
        if (!ultimoBloque) {
          return { fits: false };
        }
        slotIni = Math.max(ultimoBloque.ini, ultimoBloque.fin - minutos);
        slotFin = slotIni + minutos;
        if (slotFin > ultimoBloque.fin) {
          return { fits: false, reason: "no se pudo ubicar el slot" };
        }
      }
    }

    // Helper: si el "after" propuesto cae fuera de la jornada del día,
    // calcular cuánto cabe en el mismo día y cuánto se va a overflow.
    // Devuelve { afterSameDay: {hi,hf,len}|null, overflowMin: int }.
    const ultimoBloque = bloques[bloques.length - 1];
    const bloqueFin = ultimoBloque ? ultimoBloque.fin : 24 * 60;

    const resolverAfterConOverflow = (afterCandidate) => {
      // afterCandidate = { hi:slotFin, hf:e.fin, len:afterLen } | null
      if (!afterCandidate) {
        return { afterSameDay: null, overflowMin: 0 };
      }
      const afterHfMin = this.#hmsToMin(afterCandidate.hf);
      if (afterHfMin <= bloqueFin) {
        // Cabe en el mismo día — no hay overflow.
        return { afterSameDay: afterCandidate, overflowMin: 0 };
      }
      // Cabe una parte en el día (hasta bloqueFin), el resto va a overflow.
      const cabeMismoDia = Math.max(0, bloqueFin - slotFin);
      const overflowMin = Math.max(0, afterCandidate.len - cabeMismoDia);
      const afterSameDay =
        cabeMismoDia > 0
          ? {
              hi: afterCandidate.hi,
              hf: minToHHMM(slotFin + cabeMismoDia),
              len: cabeMismoDia,
              fecha: ctxFechaStr,
            }
          : null;
      return { afterSameDay, overflowMin };
    };

    // Detectar solapamientos SÓLO con eventos movibles (no ALTA).
    const splits = [];
    const moves = [];
    for (const e of eventosMovibles) {
      // ¿Se solapa con [slotIni, slotFin]?
      if (e.fin <= slotIni || e.ini >= slotFin) continue;

      // Caso 1: FullyContained (evento dentro del slot) → mover después
      // del slot, conservando su duración original (e.fin - e.ini).
      if (e.ini >= slotIni && e.fin <= slotFin) {
        const len = e.fin - e.ini;
        moves.push({
          actividad_id: e.actividad_id,
          horario_id: e.horario_id,
          hi: minToHHMM(slotFin),
          hf: minToHHMM(slotFin + len),
          fecha: null,
          len,
        });
        continue;
      }

      // Caso 2: Containing (evento contiene al slot) → PARTIR (o truncar
      // si una mitad queda muy chica).
      //
      // Ejemplo típico (el del usuario): evento 15:00-19:00, slot
      // 18:00-19:00. `e.fin === slotFin` cae justo en el borde, así
      // que este caso ESTRICT no matchea — matchea el Caso 3. Pero si
      // `e.fin > slotFin` y `afterLen < 5min`, también hay que
      // truncar (conservar BEFORE), no saltar el evento.
      if (e.ini < slotIni && e.fin > slotFin) {
        const beforeLen = slotIni - e.ini;
        const afterLen = e.fin - slotFin;
        if (beforeLen < 5 && afterLen < 5) {
          // Evento casi coincide con el slot → eliminarlo, la reunión
          // lo reemplaza.
          splits.push({
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before: null,
            after: null,
            delete: true,
          });
        } else if (afterLen < 5) {
          // El AFTER queda chico → conservar sólo BEFORE (truncar al final).
          const split = {
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before: {
              hi: minToHHMM(e.ini),
              hf: minToHHMM(slotIni),
              len: beforeLen,
              fecha: ctxFechaStr,
            },
            after: null,
          };
          // Minutos perdidos = afterLen (la cola descartada). Deben
          // reabsorberse vía cascade, igual que en el Caso 3.
          if (afterLen > 0) split.cascadeTarget = afterLen;
          splits.push(split);
        } else if (beforeLen < 5) {
          // El BEFORE queda chico → conservar sólo AFTER (truncar al ppio).
          const afterCandidate = {
            hi: minToHHMM(slotFin),
            hf: minToHHMM(e.fin),
            len: afterLen,
            fecha: ctxFechaStr,
          };
          const { afterSameDay, overflowMin } =
            resolverAfterConOverflow(afterCandidate);
          const split = {
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before: null,
            after: afterSameDay,
          };
          if (overflowMin > 0) split.overflowPending = overflowMin;
          splits.push(split);
        } else {
          // Split clásico: before + after.
          const before = {
            hi: minToHHMM(e.ini),
            hf: minToHHMM(slotIni),
            len: beforeLen,
            fecha: ctxFechaStr,
          };
          const afterCandidate = {
            hi: minToHHMM(slotFin),
            hf: minToHHMM(e.fin),
            len: afterLen,
            fecha: ctxFechaStr,
          };
          const { afterSameDay, overflowMin } =
            resolverAfterConOverflow(afterCandidate);
          const split = {
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before,
            after: afterSameDay,
          };
          if (overflowMin > 0) split.overflowPending = overflowMin;

          // NUEVO: GAP dejado por la reunión. Cuando la reunión está
          // completamente DENTRO del evento (Caso 2), la actividad
          // pierde ese tiempo en el día del split (porque el espacio lo
          // ocupa la reunión). Cascade intenta absorberlo en bloques
          // POSTERIORES de la misma actividad (mismo día o días futuros).
          //
          // Ejemplo del usuario: bloque 15:00-19:00 (4h) partido por
          // reunión 16:00-17:00 (1h) → before=15:00-16:00 (1h) +
          // after=17:00-19:00 (2h). Suma=3h, original=4h, gap=1h.
          const gapMin = Math.max(
            0,
            e.fin - e.ini - beforeLen - afterLen,
          );
          if (gapMin > 0 && overflowMin === 0) {
            split.cascadeTarget = gapMin;
          } else if (gapMin > 0 && overflowMin > 0) {
            // El after ya desborda; sumar el gap al overflow total
            // para que cascade intente absorber ambos juntos.
            split.overflowPending = overflowMin + gapMin;
          }
          splits.push(split);
        }
        continue;
      }

      // Caso 3: OverlapLeft (evento empieza antes del slot y termina
      // DENTRO del slot, en [slotIni, slotFin]). El AFTER real del
      // evento es [slotFin, e.fin]; el resto se mantiene como BEFORE.
      //
      // Ejemplo del usuario: evento 15:00-19:00, slot 18:00-19:00.
      // `e.fin === slotFin`, así que `afterLen === 0`. ANTES este
      // branch eliminaba el evento entero; ahora conserva el BEFORE
      // (15:00-18:00) y descarta el AFTER (0 min).
      if (e.ini < slotIni && e.fin > slotIni && e.fin <= slotFin) {
        const beforeLen = slotIni - e.ini;
        if (beforeLen < 5) {
          // El BEFORE queda chico → conservar sólo AFTER (mover el
          // inicio del row a slotFin).
          splits.push({
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before: null,
            after: {
              hi: minToHHMM(slotFin),
              hf: minToHHMM(e.fin),
              len: e.fin - slotFin,
              fecha: ctxFechaStr,
            },
          });
        } else {
          // Conservar BEFORE (truncar hora_fin a slotIni).
          const minutosPerdidos = e.fin - e.ini - beforeLen;
          const split = {
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before: {
              hi: minToHHMM(e.ini),
              hf: minToHHMM(slotIni),
              len: beforeLen,
              fecha: ctxFechaStr,
            },
            after: null,
          };
          // `cascadeTarget` (no `overflowPending`) cuando los minutos
          // perdidos son por TRUNCAMIENTO de un evento cuyo AFTER cae
          // DENTRO o EN EL BORDE del slot. La actividad NO perdió
          // espacio en la jornada — sólo perdió minutos que deben
          // reabsorberse en bloques posteriores. El cascade intentará
          // absorberlos primero en el mismo día (bloques con ini >=
          // slotFin) y luego en días futuros.
          if (minutosPerdidos > 0) split.cascadeTarget = minutosPerdidos;
          splits.push(split);
        }
        continue;
      }

      // Caso 4: OverlapRight (evento empieza DENTRO del slot, en
      // [slotIni, slotFin], y termina después). El BEFORE real es
      // [e.ini, slotFin]; el resto se mantiene como AFTER.
      if (e.ini >= slotIni && e.ini < slotFin && e.fin > slotFin) {
        const afterLen = e.fin - slotFin;
        if (afterLen < 5) {
          // El AFTER queda chico → conservar sólo BEFORE (mover hora_fin
          // a slotFin).
          const split = {
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before: {
              hi: minToHHMM(e.ini),
              hf: minToHHMM(slotFin),
              len: slotFin - e.ini,
              fecha: ctxFechaStr,
            },
            after: null,
          };
          // Minutos perdidos = afterLen. Se recuperan vía completeActividades.
          if (afterLen > 0) split.cascadeTarget = afterLen;
          splits.push(split);
        } else {
          // Conservar AFTER (desplazar el row: hora_inicio = slotFin).
          const afterCandidate = {
            hi: minToHHMM(slotFin),
            hf: minToHHMM(e.fin),
            len: afterLen,
            fecha: ctxFechaStr,
          };
          const { afterSameDay, overflowMin } =
            resolverAfterConOverflow(afterCandidate);
          const split = {
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before: null,
            after: afterSameDay,
          };
          if (overflowMin > 0) split.overflowPending = overflowMin;
          // GAP dejado por la reunión: la actividad pierde minutos.
          // completeActividades los re-u bicará en huecos libres.
          const gapMin = Math.max(0, slotFin - e.ini);
          if (gapMin > 0 && overflowMin === 0) {
            split.cascadeTarget = gapMin;
          } else if (gapMin > 0 && overflowMin > 0) {
            split.overflowPending = overflowMin + gapMin;
          }
          splits.push(split);
        }
        continue;
      }
    }

    // ------------------------------------------------------------------------
    // Fase 2: recolectar el gap (cascadeTarget) que cada split le quita a
    // su actividad. Este gap representa los minutos que la actividad pierde
    // porque la reunión ocupa parte de su bloque. completeActividades debe
    // priorizar esta actividad para recuperar esos minutos.
    // ------------------------------------------------------------------------
    const affectedGaps = new Map();
    for (const sp of splits) {
      const gap = sp.cascadeTarget || 0;
      if (gap > 0) {
        const aid = Number(sp.actividad_id);
        affectedGaps.set(aid, (affectedGaps.get(aid) || 0) + gap);
      }
    }

    // ------------------------------------------------------------------------
    // Fase 3: en lugar del cascade (que movía bloques entre actividades
    // para absorber el gap), identificar bloques de OTRAS actividades en
    // el mismo día que quedan DESPUÉS del slot de la reunión. Si no son
    // ALTA, se deshabilitan para que completeActividades las re-ubique
    // en huecos libres (ver reuniones-asistente.service.js).
    // ------------------------------------------------------------------------
    if (overflowOpts && Array.isArray(splits)) {
      const disableBlocks = [];
      const processedActividades = new Set();
      for (const sp of splits) {
        for (const ev of eventos) {
          if (Number(ev.actividad_id) === Number(sp.actividad_id)) continue;
          if (processedActividades.has(Number(ev.actividad_id))) continue;
          if (ev.fin <= slotIni || ev.ini < slotFin) continue;
          if (ev.bloqueada) continue;
          // Verificar deadline: si el bloque ya está después del deadline,
          // no tiene sentido moverlo (no encontrará un mejor slot).
          if (ev.deadline) {
            const deadlineDate = parseLocalDate(ev.deadline);
            if (deadlineDate) {
              const evDate = ev.fecha ? parseLocalDate(ev.fecha) : parseLocalDate(ctxFechaStr);
              if (evDate && evDate.getTime() > deadlineDate.getTime()) {
                continue;
              }
            }
          }
          disableBlocks.push({
            horario_id: ev.horario_id,
            actividad_id: ev.actividad_id,
          });
          processedActividades.add(Number(ev.actividad_id));
        }
      }
      const gapsArr = Array.from(affectedGaps.entries()).map(
        ([actividad_id, gap]) => ({ actividad_id, gap }),
      );
      if (disableBlocks.length > 0) {
        return {
          fits: true,
          slot: this.#shapeSlot(slotIni, minutos),
          splits,
          moves,
          disableBlocks,
          affectedGaps: gapsArr,
        };
      }
    }

    const gapsArr = Array.from(affectedGaps.entries()).map(
      ([actividad_id, gap]) => ({ actividad_id, gap }),
    );
    return {
      fits: true,
      slot: this.#shapeSlot(slotIni, minutos),
      splits,
      moves,
      affectedGaps: gapsArr.length > 0 ? gapsArr : undefined,
    };
  }

  // (Removed #runChainCascade — the new approach uses disableBlocks
  // in #trySplit + completeActividades to re-schedule following blocks.)

  // ------------------------------------------------------------------------
  // #loadUsuarioBlocksEnRango: carga TODOS los horario_usuario de un usuario
  // en un rango de fechas, con metadata de la actividad (bloqueada,
  // prioridad, deadline, estado_progreso) y del prospecto.
  //
  // Devuelve [{horario_id, actividad_id, usuario_id, fechaStr, ini, fin, len,
  //   bloqueada, prioridad, estado_progreso, deadline, esReunion}].
  // ------------------------------------------------------------------------
  async #loadUsuarioBlocksEnRango(usuarioId, fechaDesde, fechaHasta) {
    const uid = Number(usuarioId);
    if (!uid || !fechaDesde || !fechaHasta) return [];
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT
           hu.id              AS horario_id,
           hu.actividad_id,
           hu.usuario_id,
           TO_CHAR(hu.fecha, 'YYYY-MM-DD')             AS fecha,
           TO_CHAR(hu.hora_inicio::time, 'HH24:MI:SS') AS hi,
           TO_CHAR(hu.hora_fin::time,    'HH24:MI:SS') AS hf,
           hu.duracion_minutos,
            hu.marca           AS hu_marca,
            hu.tipo            AS hu_tipo,
            a.prioridad,
            a.bloqueada,
           a.estado_progreso,
           a.prospecto_id,
           TO_CHAR(p.fecha_entrega, 'YYYY-MM-DD')      AS deadline
         FROM horario_usuario hu
         LEFT JOIN actividades a ON a.id = hu.actividad_id
         LEFT JOIN prospectos p  ON p.id = a.prospecto_id
          WHERE hu.usuario_id = $1
            AND hu.estado = true
            AND hu.fecha BETWEEN $2::date AND $3::date
          ORDER BY hu.fecha ASC, hu.hora_inicio ASC`,
        uid,
        fechaDesde,
        fechaHasta,
      );
      return (rows || [])
        .map((r) => {
          const ini = toMin(r.hi);
          const fin = toMin(r.hf);
          return {
            horario_id: Number(r.horario_id),
            actividad_id: r.actividad_id ? Number(r.actividad_id) : null,
            usuario_id: Number(r.usuario_id),
            fechaStr: String(r.fecha || "").slice(0, 10),
            ini,
            fin,
            len:
              r.duracion_minutos != null
                ? Number(r.duracion_minutos)
                : ini != null && fin != null
                ? fin - ini
                : 0,
          bloqueada: (r.bloqueada === true || r.bloqueada === "true") || (r.hu_marca === "canje" || r.hu_marca === "libre" || r.hu_marca === "permiso"),
            prioridad: r.prioridad || null,
            estado_progreso: r.estado_progreso || null,
            deadline: r.deadline || null,
            esReunion: r.hu_tipo === "reunion",
          };
        })
        .filter((b) => b.ini != null && b.fin != null);
    } catch (_) {
      return [];
    }
  }

  // ------------------------------------------------------------------------
  // completeActividades: tras insertar/mover una reunión (o cualquier otra
  // operación que pueda desbalancear el calendario), recorrer las actividades
  // activas del usuario y rellenar el gap entre lo PROGRAMADO y su
  // `tiempo_estimado_minutos`.
  //
  // Estrategia por día (en orden cronológico):
  //   1. Si la actividad tiene un bloque EXISTENTE ese día, EXPANDIR el
  //      último bloque hacia adelante hasta agotar el espacio libre dentro
  //      de su bloque de jornada (o hasta el próximo evento del día, lo
  //      que sea menor). Esto mantiene el calendario visualmente limpio:
  //      un bloque 08:00-12:00 + 60 min de gap → 08:00-13:00 (no dos
  //      filas separadas).
  //   2. Si la actividad NO tiene bloque ese día, crear bloques NUEVOS
  //      en los huecos libres del día.
  //   3. Si el bloque ya está al tope de su jornada (no se puede expandir)
  //      o no hay huecos libres, pasar al siguiente día.
  //
  // Reglas:
  //   - SÓLO agrega/expande, NUNCA mueve bloques existentes.
  //   - ALTA (bloqueada=true) se omite (no se completa, no se toca).
  //   - Si la actividad tiene prospecto con fecha_entrega, los bloques
  //     deben caer en días <= fecha_entrega. Si no entran, se reporta en
  //     `blocked` con motivo 'deadline'.
  //   - Si no hay prospecto / fecha_entrega, usa un horizonte de
  //     `diasHorizonte` (default 14) desde `fechaInicio`. Si no entran,
  //     se reporta con motivo 'no_cupo_en_horizonte'.
  //   - Se excluyen:
  //       * la actividad `ignorarActividadId` (la reunión recién creada).
  //       * reuniones (tarea tipo REUNION id=2).
  //       * actividades canceladas (estado=false) o completadas.
  //
  // Parámetros:
  //   usuarioId              int
  //   fechaInicio            'YYYY-MM-DD' desde donde empezar a buscar huecos
  //   opts:
  //     ignorarActividadId   int|null   actividad a excluir del recorrido
  //     diasHorizonte        int        default 14 (si no hay deadline)
  //     motivo               string|null  motivo_reprograma a dejar
  //
  // Devuelve:
  //   {
  //     applied: [{
  //       actividad_id, minutos_agregados,
  //       bloques_creados:    [{fecha, hi, hf, len}],   // INSERTs
  //       bloques_expandidos: [{fecha, hi, hf, len, horario_id}], // UPDATEs
  //     }],
  //     blocked: [{ actividad_id, motivo, gap_restante, deadline? }],
  //     skipped: [{ actividad_id, motivo }],   // ALTA o sin est o ya cubierta
  //     totalGapInicial: int,
  //     totalGapCubierto: int,
  //   }
  // ------------------------------------------------------------------------
  async completeActividades(usuarioId, fechaInicio, opts = {}) {
    const uid = Number(usuarioId);
    if (!uid || !fechaInicio) {
      return {
        applied: [],
        blocked: [],
        skipped: [],
        totalGapInicial: 0,
        totalGapCubierto: 0,
      };
    }
    const ignorarId = opts.ignorarActividadId
      ? Number(opts.ignorarActividadId)
      : null;
    const diasHorizonte = Number(opts.diasHorizonte) > 0
      ? Number(opts.diasHorizonte)
      : 14;
    const motivoTxt = opts.motivo
      ? String(opts.motivo).slice(0, 255)
      : null;
    const prioritizeActividadId = opts.prioritizeActividadId
      ? Number(opts.prioritizeActividadId)
      : null;

    // 1) Cargar TODAS las actividades activas del usuario (no canceladas,
    //    no completadas). Incluir el prospecto para conocer el deadline.
    const acts = await prisma.actividades.findMany({
      where: {
        usuario_id: uid,
        estado: true,
        estado_progreso: { notIn: ["completada", "cancelada"] },
      },
      select: {
        id: true,
        tiempo_estimado_minutos: true,
        prioridad: true,
        bloqueada: true,
        prospecto_id: true,
        prospectos: { select: { fecha_entrega: true } },
        tarea: {
          select: { tipo_tarea: true },
        },
        horario_usuario: {
          where: { estado: true },
          select: { duracion_minutos: true },
        },
      },
    });

    // 2) Para cada actividad, calcular gap y filtrar las que necesitan
    //    completarse. Saltar ALTA, reuniones, sin est, ya cubiertas, o la
    //    reunión recién creada.
    const candidatas = [];
    const skipped = [];
    let totalGapInicial = 0;
    for (const a of acts) {
      const aid = Number(a.id);
      if (ignorarId && aid === ignorarId) continue;
      // Reuniones: hu.tipo='reunion' o tarea tipo REUNION (id=2). El join
      // con tareas_usuarios no aplica acá; basta con chequear el tipo.
      const tipoTareaId = a.tarea?.tipo_tarea != null
        ? Number(a.tarea.tipo_tarea)
        : null;
      const esReunion = tipoTareaId === 2;
      if (esReunion) {
        skipped.push({ actividad_id: aid, motivo: "reunion" });
        continue;
      }
      const est = Number(a.tiempo_estimado_minutos) || 0;
      if (est <= 0) {
        skipped.push({ actividad_id: aid, motivo: "sin_est" });
        continue;
      }
      const totalProg = (a.horario_usuario || []).reduce(
        (acc, h) => acc + (Number(h.duracion_minutos) || 0),
        0,
      );
      let gap = est - totalProg;
      if (gap <= 0) {
        if (opts.fillFreeSlots) {
          gap = 99999;
        } else {
          skipped.push({ actividad_id: aid, motivo: "ya_cubierta" });
          continue;
        }
      }
      const bloqueada =
        a.bloqueada === true ||
        a.bloqueada === "true" ||
        String(a.prioridad || "").toUpperCase() === "ALTA";
      if (bloqueada) {
        skipped.push({ actividad_id: aid, motivo: "alta" });
        continue;
      }
      const deadline = a.prospectos?.fecha_entrega
        ? a.prospectos.fecha_entrega instanceof Date
          ? // Usar métodos UTC para evitar off-by-one en servidores al
            // oeste de UTC (Perú = UTC-5). Sin esto, una fecha_entrega
            // guardada como 2026-06-23T00:00:00Z se "atrasa" un día al
            // convertirse a local con getDate().
            `${a.prospectos.fecha_entrega.getUTCFullYear()}-${String(a.prospectos.fecha_entrega.getUTCMonth() + 1).padStart(2, "0")}-${String(a.prospectos.fecha_entrega.getUTCDate()).padStart(2, "0")}`
          : String(a.prospectos.fecha_entrega).slice(0, 10)
        : null;
      candidatas.push({
        actividad_id: aid,
        gap,
        deadline,
        tipo: a.tarea ? "actividad" : "actividad",
      });
      totalGapInicial += gap;
    }

    // Reordenar: si hay una actividad prioritaria, procesarla primero para
    // que tenga la primera oportunidad de ocupar los huecos libres.
    if (prioritizeActividadId && candidatas.length > 1) {
      const idx = candidatas.findIndex(
        (c) => c.actividad_id === prioritizeActividadId,
      );
      if (idx > 0) {
        const [prio] = candidatas.splice(idx, 1);
        candidatas.unshift(prio);
      }
    }

    if (candidatas.length === 0) {
      return {
        applied: [],
        blocked: [],
        skipped,
        totalGapInicial,
        totalGapCubierto: 0,
      };
    }

    // 3) Para cada candidata, buscar huecos libres día por día y agregar
    //    bloques hasta llenar el gap (o hasta el deadline/horizonte).
    const applied = [];
    const blocked = [];
    let totalGapCubierto = 0;

    // Calendario base (eventos ya agendados). Lo actualizamos en memoria a
    // medida que agregamos bloques, así dos actividades no pelean por el
    // mismo hueco.
    const startDate = parseLocalDate(fechaInicio);
    if (!startDate) {
      return {
        applied: [],
        blocked: candidatas.map((c) => ({
          actividad_id: c.actividad_id,
          motivo: "fecha_invalida",
          gap_restante: c.gap,
        })),
        skipped,
        totalGapInicial,
        totalGapCubierto: 0,
      };
    }

    // Para evitar recomputar loadDayContext N veces, pre-construimos el
    // calendario in-memory: lista de eventos por fecha (YYYY-MM-DD).
    // Al inicio lo poblamos con TODO lo agendado en el rango. Cuando
    // agregamos un bloque, lo insertamos también acá.
    const calendarioMem = new Map(); // fechaStr -> [evento]
    const addEventToMem = (fechaStr, ev) => {
      if (!calendarioMem.has(fechaStr)) calendarioMem.set(fechaStr, []);
      calendarioMem.get(fechaStr).push(ev);
    };

    // Determinar el rango total a barrer: el máximo entre los horizontes
    // individuales (startDate + diasHorizonte) y los deadlines de las
    // candidatas.
    let endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + diasHorizonte);
    for (const c of candidatas) {
      if (c.deadline) {
        const d = parseLocalDate(c.deadline);
        if (d && d.getTime() < endDate.getTime()) {
          // El deadline es anterior al horizonte → respetar deadline.
          endDate = d;
        }
      }
    }
    const endDateStr = fmtLocalDate(endDate);

    // Pre-cachear feriados del rango. Comparamos siempre en UTC-midnight
    // (la columna `feriados.fecha` es DATE, Prisma la sirve como
    // 00:00:00Z). Convertimos el cursor local a UTC-midnight usando sus
    // componentes wall-clock para evitar off-by-one por TZ.
    const feriadosSet = new Set();
    {
      const fRows = await prisma.feriados.findMany({
        where: { estado: true, fecha: { gte: startDate, lte: endDate } },
        select: { fecha: true },
      });
      for (const f of fRows) {
        const d = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
        feriadosSet.add(
          `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`,
        );
      }
    }
    const isFeriado = (cursor) => {
      // Convertir el cursor LOCAL a UTC-midnight con sus componentes
      // wall-clock. Así la comparación con los feriadosSet (UTC) es
      // directa, sin importar la TZ del servidor.
      const utcKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      return feriadosSet.has(utcKey);
    };

    // Precargar eventos existentes en el rango.
    const allBlocks = await this.#loadUsuarioBlocksEnRango(
      uid,
      fechaInicio,
      endDateStr,
    );
    for (const b of allBlocks) {
      addEventToMem(b.fechaStr, {
        horario_id: b.horario_id,
        actividad_id: b.actividad_id,
        ini: b.ini,
        fin: b.fin,
      });
    }

    // Pre-cachear bloques de jornada por día (loadDayContext es caro).
    const jornadaByFecha = new Map(); // fechaStr -> bloques [{ini,fin}]
    const getBloquesJornada = async (fechaStr) => {
      if (jornadaByFecha.has(fechaStr)) return jornadaByFecha.get(fechaStr);
      const ctx = await this.loadDayContext(uid, fechaStr);
      const bl = ctx ? ctx.bloques : [];
      jornadaByFecha.set(fechaStr, bl);
      return bl;
    };

    // Calcular huecos libres en memoria, dada una fecha y los eventos
    // actuales en calendarioMem.
    const computeFreeSlotsMem = (fechaStr, bloques) => {
      if (!bloques || bloques.length === 0) return [];
      const eventos = calendarioMem.get(fechaStr) || [];
      const sorted = [...eventos].sort((a, b) => a.ini - b.ini);
      const out = [];
      for (const b of bloques) {
        let cursor = b.ini;
        for (const e of sorted) {
          if (e.fin <= cursor || e.ini >= b.fin) continue;
          if (e.ini > cursor) {
            out.push({ ini: cursor, fin: Math.min(e.ini, b.fin) });
          }
          cursor = Math.max(cursor, e.fin);
          if (cursor >= b.fin) break;
        }
        if (cursor < b.fin) out.push({ ini: cursor, fin: b.fin });
      }
      return out.filter((h) => h.fin > h.ini);
    };

    // Iterar candidatas. Dentro de cada candidata, iterar días. Para cada
    // día, intentar primero EXPANDIR el último bloque existente de la
    // actividad (si tiene espacio después hasta el fin de jornada o el
    // próximo evento). Si no hay bloque del día, crear bloques NUEVOS
    // en los huecos libres.
    //
    // Esto es importante porque expandir mantiene el calendario limpio
    // visualmente: en vez de una fila 08:00-12:00 + otra 12:00-13:00,
    // queda una sola fila 08:00-13:00.
    for (const cand of candidatas) {
      let remaining = cand.gap;
      const deadlineDate = cand.deadline
        ? parseLocalDate(cand.deadline)
        : null;
      let cursor = new Date(startDate);
      const bloquesCreados = [];
      const bloquesExpandidos = [];

      // No avanzar más allá del deadline.
      const maxDate = deadlineDate || endDate;

      while (remaining > 0 && cursor.getTime() <= maxDate.getTime()) {
        const fechaStr = fmtLocalDate(cursor);

        // FIX: saltar feriados. El loop principal barria cualquier día
        // con bloques de jornada, sin importar si era feriado (San Pedro,
        // Fiestas Patrias, etc.). Ahora se respeta la tabla `feriados`
        // con estado=true.
        if (isFeriado(cursor)) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }

        const bloques = await getBloquesJornada(fechaStr);
        if (bloques.length === 0) {
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }

        const eventos = calendarioMem.get(fechaStr) || [];
        const bloquesPropios = eventos
          .filter((e) => Number(e.actividad_id) === cand.actividad_id)
          .sort((a, b) => a.ini - b.ini);
        const ultimoPropio =
          bloquesPropios.length > 0
            ? bloquesPropios[bloquesPropios.length - 1]
            : null;

        let consumidoEnEsteDia = 0;

        if (ultimoPropio) {
          // Hay un bloque propio en el día. Buscar el bloque de jornada
          // que lo contiene para conocer su `fin` (límite natural).
          const jornadaDelUltimo = bloques.find(
            (b) => b.ini <= ultimoPropio.ini && ultimoPropio.fin <= b.fin,
          );
          if (!jornadaDelUltimo) {
            // El bloque propio cae fuera de la jornada (estado raro).
            // Pasar al siguiente día.
            cursor.setDate(cursor.getDate() + 1);
            continue;
          }

          // Fin de expansión = el menor entre:
          //   - fin del bloque de jornada, y
          //   - ini del próximo evento en el día (de cualquier actividad,
          //     incluida la reunión recién creada).
          const eventosDespues = eventos
            .filter((e) => e.ini >= ultimoPropio.fin)
            .sort((a, b) => a.ini - b.ini);
          const iniProximo =
            eventosDespues.length > 0 ? eventosDespues[0].ini : Infinity;
          const finExpansion = Math.min(jornadaDelUltimo.fin, iniProximo);
          const espacioLibre = finExpansion - ultimoPropio.fin;

          if (espacioLibre > 0) {
            const expansion = Math.min(remaining, espacioLibre);
            const nuevoFin = ultimoPropio.fin + expansion;

            // Actualizar el evento en calendarioMem.
            ultimoPropio.fin = nuevoFin;

            bloquesExpandidos.push({
              horario_id: ultimoPropio.horario_id || null,
              fecha: fechaStr,
              hi: minToHHMM(ultimoPropio.ini),
              hf: minToHHMM(nuevoFin),
              len: expansion,
            });

            remaining -= expansion;
            consumidoEnEsteDia = expansion;
          }

          // Si aún queda gap, intentar colocarlo en OTROS bloques de
          // jornada del mismo día (e.g. el bloque de tarde si el de
          // mañana ya está lleno). `computeFreeSlotsMem` ya refleja
          // el bloque que acabamos de expandir en `calendarioMem`,
          // por lo que devolverá huecos en otros bloques de jornada.
          if (remaining > 0) {
            const huecos = computeFreeSlotsMem(fechaStr, bloques);
            for (const h of huecos) {
              if (remaining <= 0) break;
              const libre = h.fin - h.ini;
              if (libre <= 0) continue;
              const len = Math.min(remaining, libre);
              const ev = {
                actividad_id: cand.actividad_id,
                ini: h.ini,
                fin: h.ini + len,
              };
              addEventToMem(fechaStr, ev);
              bloquesCreados.push({
                fecha: fechaStr,
                hi: minToHHMM(h.ini),
                hf: minToHHMM(h.ini + len),
                len,
              });
              remaining -= len;
              consumidoEnEsteDia += len;
            }
          }
          // Si no hay espacio, simplemente pasamos al siguiente día (no
          // creamos bloques nuevos en este día: el bloque ya está al
          // tope de su jornada o pegado al próximo evento).
        } else {
          // No hay bloque del día para esta actividad. Buscar huecos
          // libres y crear bloques nuevos.
          const huecos = computeFreeSlotsMem(fechaStr, bloques);
          for (const h of huecos) {
            if (remaining <= 0) break;
            const libre = h.fin - h.ini;
            if (libre <= 0) continue;
            const len = Math.min(remaining, libre);
            const ev = {
              actividad_id: cand.actividad_id,
              ini: h.ini,
              fin: h.ini + len,
            };
            addEventToMem(fechaStr, ev);
            bloquesCreados.push({
              fecha: fechaStr,
              hi: minToHHMM(h.ini),
              hf: minToHHMM(h.ini + len),
              len,
            });
            remaining -= len;
            consumidoEnEsteDia += len;
          }
        }

        // Si no pudimos consumir nada en este día, saltamos. Si consumimos
        // algo pero quedó gap, probamos el siguiente día (puede haber un
        // hueco en otro bloque de jornada del mismo día que no probamos).
        if (consumidoEnEsteDia === 0) {
          cursor.setDate(cursor.getDate() + 1);
        } else if (remaining > 0) {
          // Consumimos pero queda gap. Si el bloque YA ESTÁ al tope
          // (último bloque propio sin espacio), saltar al siguiente día.
          // Si era bloque nuevo, también seguir al siguiente día para no
          // entrar en loop infinito en el mismo día.
          cursor.setDate(cursor.getDate() + 1);
        }
      }

      const totalCubierto = cand.gap - remaining;
      if (totalCubierto > 0) {
        applied.push({
          actividad_id: cand.actividad_id,
          minutos_agregados: totalCubierto,
          bloques_creados: bloquesCreados,
          bloques_expandidos: bloquesExpandidos,
        });
        totalGapCubierto += totalCubierto;
        if (motivoTxt) {
          await prisma.actividades.update({
            where: { id: cand.actividad_id },
            data: { motivo_reprograma: motivoTxt, updated_at: new Date() },
          }).catch(() => {});
        }
      }

      if (remaining > 0) {
        const motivo = deadlineDate
          ? "deadline"
          : "no_cupo_en_horizonte";
        blocked.push({
          actividad_id: cand.actividad_id,
          motivo,
          deadline: cand.deadline || null,
          gap_restante: remaining,
        });
      }
    }

    // 4) Persistir los bloques (UPDATE para expansiones, INSERT para
    //    nuevos). Todo dentro de UNA transacción para que sea atómico.
    if (applied.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const item of applied) {
          // Buscar metadatos del slot "modelo" para clonar tipo/categoría
          // en las inserciones nuevas.
          const sample = await tx.horario_usuario.findFirst({
            where: { actividad_id: item.actividad_id, estado: true },
            select: { tipo: true, categoria: true },
          });

          // a) Bloques nuevos.
          for (const b of item.bloques_creados) {
            await tx.horario_usuario.create({
              data: {
                actividad_id: item.actividad_id,
                usuario_id: uid,
                fecha: parseLocalDate(b.fecha),
                hora_inicio: this.#hmsToLocalDate(b.hi),
                hora_fin: this.#hmsToLocalDate(b.hf),
                estado: true,
                tipo: sample?.tipo || "actividad",
                categoria: sample?.categoria || null,
                duracion_minutos: b.len,
                created_at: new Date(),
                updated_at: new Date(),
              },
            });
          }

          // b) Bloques expandidos: UPDATE de la fila existente.
          //    Cambiamos hora_fin y duracion_minutos; hora_inicio no se
          //    toca. Si por alguna razón el horario_id no está disponible
          //    (no debería pasar), saltamos y logueamos.
          for (const b of item.bloques_expandidos) {
            if (!b.horario_id) continue;
            const hfDate = this.#hmsToLocalDate(b.hf);
            // La duración nueva = (hf - hi) en minutos = b.len (que ya es
            // la EXPANSIÓN, no la duración total del bloque). Para la BD
            // necesitamos la duración TOTAL del bloque, que es:
            //   (hf_total - hi_total). Pero el plan solo guarda la
            //   expansión, no el hi original. Por seguridad, lo calculamos
            //   aquí a partir de los timestamps actuales en BD.
            const row = await tx.horario_usuario.findUnique({
              where: { id: Number(b.horario_id) },
              select: {
                hora_inicio: true,
                fecha: true,
                duracion_minutos: true,
              },
            });
            if (!row) continue;
            const hiMin =
              row.hora_inicio instanceof Date
                ? row.hora_inicio.getUTCHours() * 60 +
                  row.hora_inicio.getUTCMinutes()
                : toMin(row.hora_inicio);
            const hfMin = toMin(b.hf);
            const duracionTotal = hfMin - hiMin;
            await tx.$executeRawUnsafe(
              `UPDATE horario_usuario
                  SET hora_fin = $1::timetz,
                      duracion_minutos = $2,
                      updated_at = now()
                WHERE id = $3`,
              hfDate,
              Number(duracionTotal),
              Number(b.horario_id),
            );
          }
        }
      });
    }

    return {
      applied,
      blocked,
      skipped,
      totalGapInicial,
      totalGapCubierto,
    };
  }

  // ------------------------------------------------------------------------
  // disableBlocksAfterPosition: deshabilita (estado=false) todos los bloques
  // de otras actividades que están ESTRICTAMENTE después de la última
  // posición (fecha + hora_fin) de la actividad indicada.
  //
  // Esto libera espacio en el calendario para que completeActividades
  // reprograme todo desde esa posición hacia adelante.
  //
  // Parámetros:
  //   usuarioId        int
  //   actividadId      int  ID de la actividad "ancla" (la afectada)
  //   desdeFecha       str  'YYYY-MM-DD' desde dónde buscar
  //
  // Devuelve: { disabledCount: int }
  // ------------------------------------------------------------------------
  async disableBlocksAfterPosition(
    usuarioId, actividadId, desdeFecha, cutMin,
  ) {
    const uid = Number(usuarioId);
    if (!uid || !desdeFecha) return { disabledCount: 0 };

    try {
      const desde = parseLocalDate(desdeFecha);
      if (!desde) return { disabledCount: 0 };
      const hasta = new Date(desde);
      hasta.setDate(hasta.getDate() + 30);
      const hastaStr = fmtLocalDate(hasta);

      const allBlocks = await this.#loadUsuarioBlocksEnRango(
        uid, desdeFecha, hastaStr,
      );
      if (allBlocks.length === 0) return { disabledCount: 0 };

      let corteFechaStr = desdeFecha;
      let corteMinutos = 0;

      const aid = Number(actividadId);
      if (aid && cutMin == null) {
        // Modo original: usar el último bloque de la actividad ancla.
        const propios = allBlocks
          .filter((b) => Number(b.actividad_id) === aid)
          .sort((a, b) => {
            if (a.fechaStr !== b.fechaStr)
              return a.fechaStr.localeCompare(b.fechaStr);
            return a.fin - b.fin;
          });
        if (propios.length === 0) return { disabledCount: 0 };
        const ultimoPropio = propios[propios.length - 1];
        corteFechaStr = ultimoPropio.fechaStr;
        corteMinutos = ultimoPropio.fin;
      } else if (cutMin != null) {
        // Modo directo: usar la posición explícita.
        corteMinutos = Number(cutMin);
      } else {
        return { disabledCount: 0 };
      }

      // Bloques de otras actividades después de la posición de corte.
      const toDisable = allBlocks.filter((b) => {
        if (aid && Number(b.actividad_id) === aid) return false;
        if (b.bloqueada || b.esReunion) return false;
        if (b.fechaStr > corteFechaStr) return true;
        if (
          b.fechaStr === corteFechaStr &&
          b.ini >= corteMinutos
        )
          return true;
        return false;
      });

      if (toDisable.length === 0) return { disabledCount: 0 };

      const ids = toDisable
        .map((b) => Number(b.horario_id))
        .filter((id) => id > 0);
      if (ids.length === 0) return { disabledCount: 0 };

      await prisma.$transaction(async (tx) => {
        for (const id of ids) {
          await tx.horario_usuario.update({
            where: { id },
            data: { estado: false, updated_at: new Date() },
          });
        }
      });

      return { disabledCount: ids.length };
    } catch (e) {
      console.error("[disableBlocksAfterPosition] error:", e?.message || e);
      return { disabledCount: 0 };
    }
  }

  // ---- Apply moves (lo que sí toca la BD) ---------------------------

  // Aplica una lista de movimientos propuestos por placeActivity.
  // Cada move = { actividad_id, horario_id, hi, hf, fecha, motivo? }
  // Usa una transacción para que sea atómico.
  async applyMoves(moves, motivo = null) {
    if (!Array.isArray(moves) || moves.length === 0) return { applied: 0 };

    return await prisma.$transaction(async (tx) => {
      let applied = 0;
      for (const m of moves) {
        const nuevaDur = Math.max(1, toMin(m.hf) - toMin(m.hi));
        if (nuevaDur <= 0) continue; // skip invalid moves (hf <= hi)
        // 1) Actualizamos horario_usuario (hi/hf/fecha).
        //    Como no tiene PK declarable en Prisma, usamos raw SQL.
        // 2) Si la movida fue por reprogramación, dejamos constancia en
        //    actividades.motivo_reprograma.
        const hiDate = this.#hmsToLocalDate(m.hi);
        const hfDate = this.#hmsToLocalDate(m.hf);
        await tx.$executeRawUnsafe(
          `UPDATE horario_usuario
              SET hora_inicio = $1::timetz,
                  hora_fin    = $2::timetz,
                  fecha       = $3::date,
                  duracion_minutos = $5,
                  updated_at  = now()
            WHERE id = $4`,
          hiDate,
          hfDate,
          m.fecha,
          Number(m.horario_id),
          nuevaDur,
        );
        if (m.actividad_id && motivo) {
          await tx.actividades.update({
            where: { id: Number(m.actividad_id) },
            data: { motivo_reprograma: motivo, updated_at: new Date() },
          });
        }
        
        // Insertar bloques de overflow generados por fragmentación (e.g. tryPlace)
        if (Array.isArray(m.overflow) && m.overflow.length > 0) {
          const sample = await tx.horario_usuario.findUnique({
            where: { id: Number(m.horario_id) },
            select: { usuario_id: true, tipo: true, categoria: true },
          });
          if (sample) {
            for (const o of m.overflow) {
              await tx.horario_usuario.create({
                data: {
                  actividad_id: Number(m.actividad_id),
                  usuario_id: sample.usuario_id,
                  fecha: parseLocalDate(o.fecha || m.fecha),
                  hora_inicio: this.#hmsToLocalDate(o.hi),
                  hora_fin: this.#hmsToLocalDate(o.hf),
                  estado: true,
                  tipo: sample.tipo || "actividad",
                  categoria: sample.categoria || null,
                  duracion_minutos: o.len || (toMin(o.hf) - toMin(o.hi)),
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              });
            }
          }
        }
        applied++;
      }
      return { applied };
    });
  }

  // Aplica una lista de SPLITS (particiones) propuestas por placeActivity.
  // Cada split tiene la forma:
  //   { actividad_id, horario_id,
  //     before: { hi, hf, len } | null,
  //     after:  { hi, hf, len } | null,
  //     overflow:    [{ fecha, hi, hf, len }, ...] | null,   // NUEVO
  //     cascadeMoves:[{ horario_id, hi, hf, fecha, len }, ...] | null,  // NUEVO
  //     delete: true }
  //
  // Tres formas:
  //   - delete: cerramos el slot original (estado=false).
  //   - sólo before (after=null): truncamos el slot original a "before".
  //   - sólo after (before=null): desplazamos el slot original a "after".
  //   - before + after: truncamos el slot original a "before" y creamos
  //     uno nuevo para "after". La suma de duraciones =
  //     duracion_minutos original (no se pierde ni se gana tiempo).
  //   - overflow: por cada entrada, creamos una fila NUEVA en
  //     horario_usuario con la fecha futura correspondiente. Se aplica
  //     cuando el after del split desborda la jornada del día.
  //   - cascadeMoves: por cada entrada, hacemos UPDATE de un bloque
  //     EXISTENTE (lo corremos o expandimos) para hacerle espacio al
  //     overflow. El bloque actualizado mantiene su actividad.
  //
  // Devuelve { applied: { splits, overflow, cascadeMoves } } con la
  // cantidad de operaciones de BD ejecutadas. Si una fila a actualizar
  // no existe, se cuenta como fallida pero no tira la transacción.
  async applySplits(splits, motivo = null) {
    if (!Array.isArray(splits) || splits.length === 0) {
      return { applied: { splits: 0, overflow: 0, cascadeMoves: 0 } };
    }

    return await prisma.$transaction(async (tx) => {
      let splitsApplied = 0;
      let overflowApplied = 0;
      let cascadeApplied = 0;
      for (const sp of splits) {
        const horarioId = Number(sp.horario_id);
        if (!horarioId) continue;

        if (sp.delete) {
          // Caso "sobrante muy chico" → cerrar el slot original.
          await tx.$executeRawUnsafe(
            `UPDATE horario_usuario
                SET estado = false, updated_at = now()
              WHERE id = $1`,
            horarioId,
          );
          if (sp.actividad_id && motivo) {
            await tx.actividades.update({
              where: { id: Number(sp.actividad_id) },
              data: { motivo_reprograma: motivo, updated_at: new Date() },
            });
          }
          splitsApplied++;
          continue;
        }

        // Truncar / desplazar la fila original (UPDATE). Si tenemos
        // `before`, horafin se reduce; si NO hay before pero sí `after`,
        // horainicio se corre al after. No cambiamos `fecha` (sigue
        // siendo el mismo día).
        if (sp.before) {
          const hfDate = this.#hmsToLocalDate(sp.before.hf);
          await tx.$executeRawUnsafe(
            `UPDATE horario_usuario
                SET hora_fin   = $1::timetz,
                    duracion_minutos = $2,
                    updated_at = now()
              WHERE id = $3`,
            hfDate,
            Number(sp.before.len),
            horarioId,
          );
          if (sp.actividad_id && motivo) {
            await tx.actividades.update({
              where: { id: Number(sp.actividad_id) },
              data: { motivo_reprograma: motivo, updated_at: new Date() },
            });
          }
        } else if (sp.after) {
          const hiDate = this.#hmsToLocalDate(sp.after.hi);
          const hfDate = this.#hmsToLocalDate(sp.after.hf);
          await tx.$executeRawUnsafe(
            `UPDATE horario_usuario
                SET hora_inicio = $1::timetz,
                    hora_fin    = $2::timetz,
                    duracion_minutos = $3,
                    updated_at  = now()
              WHERE id = $4`,
            hiDate,
            hfDate,
            Number(sp.after.len),
            horarioId,
          );
          if (sp.actividad_id && motivo) {
            await tx.actividades.update({
              where: { id: Number(sp.actividad_id) },
              data: { motivo_reprograma: motivo, updated_at: new Date() },
            });
          }
        }

        // Necesitamos los datos del slot original para clonar las filas
        // de overflow (o el after cuando hay before+after).
        const needsClone =
          (sp.before && sp.after) ||
          (Array.isArray(sp.overflow) && sp.overflow.length > 0);
        let original = null;
        if (needsClone) {
          original = await tx.horario_usuario.findUnique({
            where: { id: horarioId },
            select: {
              usuario_id: true,
              fecha: true,
              tipo: true,
              categoria: true,
            },
          });
        }

        // Crear la NUEVA fila si hay `after` además de `before` (partición
        // real: el bloque original se queda con before, el after es una
        // fila NUEVA en horario_usuario).
        if (sp.before && sp.after && original) {
          const hiDate = this.#hmsToLocalDate(sp.after.hi);
          const hfDate = this.#hmsToLocalDate(sp.after.hf);
          await tx.horario_usuario.create({
            data: {
              actividad_id: sp.actividad_id
                ? Number(sp.actividad_id)
                : null,
              usuario_id: Number(original.usuario_id),
              fecha: original.fecha,
              hora_inicio: hiDate,
              hora_fin: hfDate,
              estado: true,
              tipo: original.tipo || "reunion",
              categoria: original.categoria || "potencial_cliente",
              duracion_minutos: Number(sp.after.len),
              created_at: new Date(),
              updated_at: new Date(),
            },
          });
        }

        // Crear las filas de OVERFLOW (días futuros). Cada entrada tiene
        // fecha explícita y se inserta como nueva fila de horario_usuario
        // clonando los metadatos del slot original (usuario, actividad,
        // tipo, categoría). NO modifica el slot original — el original
        // queda como el "before" (o ya desplazado al "after" si es un
        // truncate puro).
        if (
          Array.isArray(sp.overflow) &&
          sp.overflow.length > 0 &&
          original
        ) {
          for (const ov of sp.overflow) {
            const hiDate = this.#hmsToLocalDate(ov.hi);
            const hfDate = this.#hmsToLocalDate(ov.hf);
            await tx.horario_usuario.create({
              data: {
                actividad_id: sp.actividad_id
                  ? Number(sp.actividad_id)
                  : null,
                usuario_id: Number(original.usuario_id),
                fecha: ov.fecha ? new Date(ov.fecha) : original.fecha,
                hora_inicio: hiDate,
                hora_fin: hfDate,
                estado: true,
                tipo: original.tipo || null,
                categoria: original.categoria || "potencial_cliente",
                duracion_minutos: Number(ov.len),
                created_at: new Date(),
                updated_at: new Date(),
              },
            });
            overflowApplied++;
          }
          if (motivo && sp.actividad_id) {
            await tx.actividades.update({
              where: { id: Number(sp.actividad_id) },
              data: { motivo_reprograma: motivo, updated_at: new Date() },
            });
          }
        }

        // Aplicar los CASCADE MOVES: cada uno es un UPDATE a un bloque
        // existente de la misma actividad (corrido o expandido para hacer
        // espacio al overflow). Se ejecuta DESPUÉS de crear el overflow
        // porque el cascade libera el espacio que el overflow va a ocupar.
        //
        // Si `cm.fecha` está presente y es distinta del día actual del
        // bloque, también se actualiza la fecha (caso push-forward: mover
        // el bloque a otro día). Sin esto, push-forward mueve sólo las
        // horas pero deja el bloque en su fecha original → superposición.
        if (Array.isArray(sp.cascadeMoves) && sp.cascadeMoves.length > 0) {
          for (const cm of sp.cascadeMoves) {
            if (cm.delete) {
              await tx.$executeRawUnsafe(
                `UPDATE horario_usuario SET estado = false, updated_at = now() WHERE id = $1`,
                Number(cm.horario_id),
              ).catch(() => {});
              continue;
            }
            const cmHi = this.#hmsToLocalDate(cm.hi);
            const cmHf = this.#hmsToLocalDate(cm.hf);
            if (cm.fecha) {
              const cmFecha = new Date(`${cm.fecha}T00:00:00`);
              await tx.$executeRawUnsafe(
                `UPDATE horario_usuario
                    SET hora_inicio = $1::timetz,
                        hora_fin    = $2::timetz,
                        fecha       = $3::date,
                        duracion_minutos = $4,
                        updated_at  = now()
                  WHERE id = $5`,
                cmHi,
                cmHf,
                cmFecha,
                Number(cm.len),
                Number(cm.horario_id),
              );
            } else {
              await tx.$executeRawUnsafe(
                `UPDATE horario_usuario
                    SET hora_inicio = $1::timetz,
                        hora_fin    = $2::timetz,
                        duracion_minutos = $3,
                        updated_at  = now()
                  WHERE id = $4`,
                cmHi,
                cmHf,
                Number(cm.len),
                Number(cm.horario_id),
              );
            }
            cascadeApplied++;
          }
        }

        splitsApplied++;
      }
      return {
        applied: {
          splits: splitsApplied,
          overflow: overflowApplied,
          cascadeMoves: cascadeApplied,
        },
      };
    });
  }

  // Aplica una lista de CHAIN CASCADES propuesta por placeActivity.
  // Cada chainCascade tiene la forma:
  //   {
  //     actividad_id,
  //     cascadeMoves: [{ horario_id, actividad_id, hi, hf, fecha, len,
  //                        inter? }],
  //     overflow:     [{ fecha, hi, hf, len }, ...],
  //   }
  //
  // Semántica:
  //   - cascadeMoves: UPDATE de bloques existentes (puede ser de la misma
  //     actividad que se expande, o de OTRA actividad que se "empuja" para
  //     hacerle espacio — flag `inter: true`).
  //   - overflow: INSERT de filas NUEVAS en horario_usuario para la
  //     actividad que se está completando.
  //
  // Esto llena los gaps residuales que deja el split cascade moviendo
  // actividades adyacentes (no contemplado por completeActividades porque
  // esa función sólo expande o crea bloques sin tocar lo existente).
  //
  // Devuelve { applied: { cascadeMoves, overflow } }.
  // (Removed applyChainCascades — no longer needed with the new disableBlocks approach.)

  // ---- Helpers privados ----------------------------------------------

  #shapeSlot(ini, minutos) {
    const fin = Math.min(ini + minutos, ini + minutos); // por claridad
    return {
      ini,
      fin: ini + minutos,
      hi: minToHHMM(ini),
      hf: minToHHMM(ini + minutos),
    };
  }

  // Ordena eventos movibles por deadline (los más urgentes primero).
  // Si no tienen deadline, van al final.
  #orderMovableByDeadline(movibles, deadlineNuevo) {
    const parseD = (s) => {
      if (!s) return null;
      const d = parseLocalDate(s);
      return d ? d.getTime() : null;
    };
    const dNuevo = parseD(deadlineNuevo);
    return [...movibles].sort((a, b) => {
      const da = parseD(a.deadline);
      const db = parseD(b.deadline);
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    });
  }

  // Intenta compactar las movibles en los bloques dejando hueco para
  // una nueva actividad de `minutos` con `prioridad` dada.
  // Devuelve { fits, slot?, moves:[], overflowMin?, mejorSoltarMin? }.
  //
  // Estrategia:
  //   - Si la nueva es ALTA: la nueva va al inicio del primer bloque, las
  //     movibles se apilan después en orden de deadline.
  //   - Si la nueva es MEDIA/BAJA: las movibles se apilan desde el inicio
  //     del primer bloque, la nueva se acomoda al final.
  #compact(bloques, moviblesOrdenados, minutos, prioridad) {
    const bloqueIni = bloques[0]?.ini ?? 0;
    const totalBloques = bloques.reduce(
      (acc, b) => acc + (b.fin - b.ini),
      0,
    );
    const totalMovible = moviblesOrdenados.reduce(
      (acc, e) => acc + (e.fin - e.ini),
      0,
    );

    // Helper: busca el bloque que contiene `cursor` o el siguiente desde ahí.
    const avanzarAlBloqueQueContenga = (cur) => {
      for (const b of bloques) {
        if (b.ini <= cur && cur < b.fin) return { bloque: b, ini: cur };
        if (b.ini > cur) return { bloque: b, ini: b.ini };
      }
      return null;
    };

    // Si ni en el mejor caso entra, devolvemos overflow.
    if (totalBloques < totalMovible + minutos) {
      return {
        fits: false,
        overflowMin: totalMovible + minutos - totalBloques,
        mejorSoltarMin: Math.max(0, totalBloques - totalMovible),
      };
    }

    // Si la nueva es ALTA, la colocamos al inicio; las movibles después.
    if (prioridad === "ALTA") {
      let cursor = bloqueIni + minutos;
      const slotIni = bloqueIni;
      const moves = [];

      for (const m of moviblesOrdenados) {
        const len = m.fin - m.ini;
        const pos = avanzarAlBloqueQueContenga(cursor);
        if (!pos) {
          return {
            fits: false,
            overflowMin: 1,
            mejorSoltarMin: totalBloques - totalMovible,
          };
        }
        if (cursor + len > pos.bloque.fin) {
          cursor = pos.bloque.fin;
          const next = avanzarAlBloqueQueContenga(cursor);
          if (!next) {
            return {
              fits: false,
              overflowMin: cursor + len - pos.bloque.fin,
              mejorSoltarMin: totalBloques - totalMovible,
            };
          }
          cursor = next.ini;
        }
        if (cursor !== m.ini || len !== m.fin - m.ini) {
          moves.push({
            actividad_id: m.actividad_id,
            horario_id: m.horario_id,
            hi: minToHHMM(cursor),
            hf: minToHHMM(cursor + len),
            fecha: null, // mismo día
            len,
          });
        }
        cursor += len;
      }
      return {
        fits: true,
        slot: {
          ini: slotIni,
          fin: slotIni + minutos,
          hi: minToHHMM(slotIni),
          hf: minToHHMM(slotIni + minutos),
        },
        moves,
      };
    }

    // MEDIA / BAJA: movibles al ppio, nueva al final.
    const moves = [];
    let cursor = bloqueIni;
    for (const m of moviblesOrdenados) {
      const len = m.fin - m.ini;
      const pos = avanzarAlBloqueQueContenga(cursor);
      if (!pos) {
        return {
          fits: false,
          overflowMin: 1,
          mejorSoltarMin: totalBloques - totalMovible,
        };
      }
      if (cursor + len > pos.bloque.fin) {
        cursor = pos.bloque.fin;
        const next = avanzarAlBloqueQueContenga(cursor);
        if (!next) {
          return {
            fits: false,
            overflowMin: cursor + len - pos.bloque.fin,
            mejorSoltarMin: totalBloques - totalMovible,
          };
        }
        cursor = next.ini;
      }
      if (cursor !== m.ini) {
        moves.push({
          actividad_id: m.actividad_id,
          horario_id: m.horario_id,
          hi: minToHHMM(cursor),
          hf: minToHHMM(cursor + len),
          fecha: null,
          len,
        });
      }
      cursor += len;
    }

    // Ahora intentamos colocar la nueva en lo que queda.
    const espacioRestante = totalBloques - (cursor - bloqueIni);
    if (espacioRestante < minutos) {
      return {
        fits: false,
        overflowMin: minutos - espacioRestante,
        mejorSoltarMin: totalBloques - totalMovible,
      };
    }

    // Buscar el primer bloque a partir de `cursor` donde entre la nueva.
    let slotIni2 = null;
    let slotFin2 = null;
    const pos = avanzarAlBloqueQueContenga(cursor);
    if (pos) {
      if (cursor + minutos <= pos.bloque.fin) {
        slotIni2 = cursor;
        slotFin2 = cursor + minutos;
      } else {
        const idx = bloques.indexOf(pos.bloque);
        const next = bloques[idx + 1];
        if (next && minutos <= next.fin - next.ini) {
          slotIni2 = next.ini;
          slotFin2 = next.ini + minutos;
        }
      }
    }
    if (slotIni2 == null) {
      return {
        fits: false,
        overflowMin: minutos,
        mejorSoltarMin: totalBloques - totalMovible,
      };
    }
    return {
      fits: true,
      slot: {
        ini: slotIni2,
        fin: slotFin2,
        hi: minToHHMM(slotIni2),
        hf: minToHHMM(slotFin2),
      },
      moves,
    };
  }

  // Limpia el horario para un usuario y fecha combinando bloques adyacentes de la
  // misma actividad que hayan sido fragmentados por reprogramaciones.
  async mergeAdjacentBlocks(uid, fechaDate) {
    if (!uid || !fechaDate) return;
    try {
      const startOfDay = new Date(fechaDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(fechaDate);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const bloques = await prisma.horario_usuario.findMany({
        where: {
          usuario_id: uid,
          fecha: { gte: startOfDay, lte: endOfDay },
          estado: true,
        },
        orderBy: { hora_inicio: 'asc' },
      });

      let currentMerged = null;
      for (const bloque of bloques) {
        if (!currentMerged) {
          currentMerged = bloque;
          continue;
        }

        // Si son de la misma actividad y están pegados (fin del actual == inicio del siguiente)
        if (currentMerged.actividad_id === bloque.actividad_id) {
          const finActual =
            currentMerged.hora_fin instanceof Date
              ? currentMerged.hora_fin.getUTCHours() * 60 + currentMerged.hora_fin.getUTCMinutes()
              : 0;
          const iniSiguiente =
            bloque.hora_inicio instanceof Date
              ? bloque.hora_inicio.getUTCHours() * 60 + bloque.hora_inicio.getUTCMinutes()
              : 0;

          if (finActual === iniSiguiente) {
            // Se solapan exactamente: extender currentMerged y borrar el siguiente
            const newDur = Number(currentMerged.duracion_minutos) + Number(bloque.duracion_minutos);
            
            await prisma.$transaction([
              prisma.$executeRawUnsafe(
                `UPDATE horario_usuario SET hora_fin = $1::timetz, duracion_minutos = $2, updated_at = now() WHERE id = $3`,
                bloque.hora_fin,
                newDur,
                currentMerged.id
              ),
              prisma.$executeRawUnsafe(
                `DELETE FROM horario_usuario WHERE id = $1`,
                bloque.id
              )
            ]);
            
            // Actualizar currentMerged en memoria para seguir encadenando
            currentMerged.hora_fin = bloque.hora_fin;
            currentMerged.duracion_minutos = newDur;
            continue;
          }
        }
        currentMerged = bloque;
      }
    } catch (e) {
      console.error("Error en mergeAdjacentBlocks:", e);
    }
  }

  // Convierte "HH:MM" o "HH:MM:SS" a un Date 1970-01-01T... UTC que
  // Prisma escribe en una columna @db.Timetz con la hora EXACTA del
  // input. Usamos Date.UTC (no el constructor local) para que el huso
  // horario del servidor no desplace la hora: si el server está en
  // America/Lima (UTC-5) y la hora de inicio es "15:00", el local
  // Date quedaría como 20:00 UTC y la columna se leería desfasada.
  // Los readers extraen con `getUTCHours`, así que writer=UTC es la
  // convención autoconsistente (mismo criterio que
  // potenciales-clientes.service.js#toTime).
  #hmsToLocalDate(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return null;
    return new Date(
      Date.UTC(1970, 0, 1, Number(m[1]), Number(m[2]), Number(m[3] || 0)),
    );
  }
}

export default new SchedulerService();
