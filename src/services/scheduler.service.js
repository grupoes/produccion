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
          bloqueada: r.bloqueada === true || r.bloqueada === "true",
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
          applied: { moves: 0, splits: 0 },
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
              overflowBlocked.length > 0 ||
              (splitPlan.interBlocked && splitPlan.interBlocked.length > 0)
                ? [
                    ...blocked,
                    ...overflowBlocked.map((sp) => ({
                      actividad_id: sp.actividad_id,
                      motivo: sp.overflowFailedReason,
                      deadline: null,
                      propuesta: null,
                    })),
                    ...(splitPlan.interBlocked || []),
                  ]
                : undefined,
            reason: `partiendo ${overflowAccepted.length} actividad(es)`,
          };
        }
      }
      // Si splittable=false o splitPlan no fits, devolvemos fits:false.
      // (Ya validamos A1 inBlock + A2 sin ALTA, así que lo único que
      // puede fallar es que el split de los movibles no cierre.)
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
            overflowBlocked.length > 0 ||
            (splitPlan.interBlocked && splitPlan.interBlocked.length > 0)
              ? [
                  ...blocked,
                  ...overflowBlocked.map((sp) => ({
                    actividad_id: sp.actividad_id,
                    motivo: sp.overflowFailedReason,
                    deadline: null,
                    propuesta: null,
                  })),
                  ...(splitPlan.interBlocked || []),
                ]
              : undefined,
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
    const fechaStr = fmtLocalDate(fechaLocal);

    try {
      const feriado = await prisma.feriados.findFirst({
        where: { fecha: new Date(fechaStr), estado: true },
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
          const d = fnac instanceof Date ? fnac : new Date(fnac);
          if (
            !Number.isNaN(d.getTime()) &&
            d.getDate() === fechaLocal.getDate() &&
            d.getMonth() === fechaLocal.getMonth()
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
  }

  // ------------------------------------------------------------------------
  // #computeOverflow: reparte `minutosRestantes` en bloques a partir de
  // `fechaInicio` (string YYYY-MM-DD, el día SIGUIENTE al slot de la
  // reunión), siguiendo las jornadas del usuario. Se detiene cuando se
  // acabaron los minutos, cuando se llega al `deadline`, o cuando se
  // superaron `maxDias` (default 7) días.
  //
  // NUEVO: cascade multi-día. Si se pasa `actividadId`, antes de caer al
  // comportamiento default (llenar desde inicio), busca bloques de ESA
  // actividad en el día. Si encuentra, intenta absorber el overflow
  // corriendo el último bloque dentro de su bloque de jornada (mantiene
  // duración) y colocando el overflow en el espacio liberado. Si no
  // cabe correr, intenta expandir al final. Si tampoco, fallback a
  // llenar desde inicio.
  //
  // Restricciones aplicadas:
  //   - Feriados y cumpleaños del usuario (vía `validateFechaParaUsuario`
  //     si se pasa `reunionesService`, o vía un predicado `isDateValid`).
  //   - Deadline duro: si el último día de overflow cae después del
  //     deadline → se descarta y se devuelve `deadlineExceeded: true`.
  //   - No se agenda en días sin jornada configurada (se cuentan como
  //     `lostDays` y se sigue).
  //
  // Cada bloque devuelto es:
  //   { fecha: 'YYYY-MM-DD', hi: 'HH:MM', hf: 'HH:MM', len: minutos }
  //
  // Retorna:
  //   {
  //     overflow:     [{fecha, hi, hf, len}, ...],  // bloques NUEVOS a insertar
  //     cascadeMoves: [{horario_id, hi, hf, fecha, len}, ...],
  //                                               // UPDATEs a bloques
  //                                               // existentes (corridos
  //                                               // o expandidos para
  //                                               // hacer espacio)
  //     lostDays:     [{fecha, motivo: 'feriado'|'cumple'|'sin jornada'}],
  //     deadlineExceeded: bool,
  //     remainingMinutes: minutos que no cupieron,
  //   }
  // ------------------------------------------------------------------------

  // ------------------------------------------------------------------------
  // #loadActividadBlocks: carga TODOS los horario_usuario de una actividad
  // (a través de todos los días), ordenados por fecha + hora_inicio.
  // Devuelve [{horario_id, actividad_id, usuario_id, fechaStr, ini, fin, len}].
  // Usado por #computeOverflow para cascade PROPAGATIVO: si un bloque se
  // expande/corre y empuja al siguiente, también hay que reorganizarlo.
  // ------------------------------------------------------------------------
  async #loadActividadBlocks(actividadId) {
    const aid = Number(actividadId);
    if (!aid) return [];
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, actividad_id, usuario_id,
                TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha,
                TO_CHAR(hora_inicio::time, 'HH24:MI:SS') AS hi,
                TO_CHAR(hora_fin::time,    'HH24:MI:SS') AS hf,
                duracion_minutos
           FROM horario_usuario
          WHERE actividad_id = $1 AND estado = true
          ORDER BY fecha ASC, hora_inicio ASC`,
        aid,
      );
      return (rows || [])
        .map((r) => {
          const ini = toMin(r.hi);
          const fin = toMin(r.hf);
          return {
            horario_id: Number(r.id),
            actividad_id: Number(r.actividad_id),
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
          };
        })
        .filter((b) => b.ini != null && b.fin != null);
    } catch (_) {
      return [];
    }
  }

  // ------------------------------------------------------------------------
  // #loadUsuarioBlocksEnRango: carga TODOS los horario_usuario de un usuario
  // en un rango de fechas, con metadata de la actividad (bloqueada,
  // prioridad, deadline, estado_progreso) y del prospecto.
  //
  // Usado por #computeOverflow cuando cascadeInterActividad=true: además
  // de reorganizar la actividad partida, reorganiza bloques de OTRAS
  // actividades del usuario en el rango respetando ALTA/deadline/jornada.
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
            bloqueada: r.bloqueada === true || r.bloqueada === "true",
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

  async #computeOverflow({
    usuarioId,
    fechaInicio,
    minutosRestantes,
    deadline,
    actividadId = null,
    maxDias = 7,
    isDateValid,
    slotFin = null,
    cascadeInterActividad = false,
  }) {
    const overflow = [];
    const lostDays = [];
    const cascadeMoves = [];

    if (!usuarioId || !fechaInicio || minutosRestantes <= 0) {
      return {
        overflow,
        cascadeMoves,
        interBlocked: [],
        lostDays,
        deadlineExceeded: false,
        remainingMinutes: minutosRestantes || 0,
      };
    }

    let cursor = parseLocalDate(fechaInicio);
    if (!cursor) {
      return {
        overflow,
        cascadeMoves,
        interBlocked: [],
        lostDays,
        deadlineExceeded: false,
        remainingMinutes: minutosRestantes,
      };
    }

    let remaining = Math.floor(minutosRestantes);
    const deadlineDate = deadline ? parseLocalDate(deadline) : null;
    const slotFinMin = slotFin != null ? Math.floor(Number(slotFin)) : null;

    // interBlocked: actividades destino del cascade inter-actividad que
    // no se pudieron reorganizar (motivos: 'ALTA', 'deadline', 'fuera_jornada').
    const interBlocked = [];

    // Helper local: valida si una propuesta (fecha, hi, hf) excede el
    // deadline del bloque. Devuelve true si la nueva hf cae DESPUÉS del
    // final del día deadline.
    const propuestaExcedeDeadline = (b, propuesta) => {
      if (!b.deadline) return false;
      const evt = { deadline: b.deadline };
      const move = {
        fecha: propuesta.fecha || fechaStr,
        hi: minToHHMM(propuesta.hi),
        hf: minToHHMM(propuesta.hf),
      };
      return this.#moveExceedsDeadline(evt, move);
    };

    // Cargar TODOS los bloques de la actividad para propagación. Si
    // un bloque se expande/corre en este día y empuja al siguiente,
    // también hay que reorganizarlo; si no cabe en el bloque de jornada,
    // se mueve al día siguiente (cambiando `fechaStr`).
    let allBlocks = actividadId
      ? await this.#loadActividadBlocks(actividadId)
      : [];
    // Filtrar por fechaInicio. Si además nos pasan `slotFin` (caso
    // cascade mismo día desde #trySplit), permitimos el día del slot
    // pero SÓLO para bloques cuyo hora_inicio >= slotFin (los que están
    // después de la reunión y pueden absorber el gap).
    if (slotFinMin != null) {
      allBlocks = allBlocks.filter(
        (b) =>
          b.fechaStr > fechaInicio ||
          (b.fechaStr === fechaInicio && b.ini >= slotFinMin),
      );
    } else {
      allBlocks = allBlocks.filter((b) => b.fechaStr >= fechaInicio);
    }

    // Capturar copia ANTES de cualquier reorganización (fase A/B/C).
    // Se usa en #calcularExtensionActividad para comparar el último
    // bloque original con el último bloque del plan y decidir si
    // activamos push-forward sobre actividades SIGUIENTES.
    const bloquesOriginalesActividad = allBlocks.map((b) => ({ ...b }));

    for (let i = 0; i < maxDias && remaining > 0; i++) {
      const fechaStr = fmtLocalDate(cursor);

      // 1) Deadline check: si este día cae después del deadline, paramos.
      if (deadlineDate && cursor.getTime() > deadlineDate.getTime()) {
        return {
          overflow,
          cascadeMoves,
          interBlocked,
          lostDays,
          deadlineExceeded: true,
          remainingMinutes: remaining,
        };
      }

      // 2) Validez de fecha (feriado/cumple).
      let valid = { ok: true };
      if (typeof isDateValid === "function") {
        try {
          valid = await isDateValid(fechaStr);
        } catch (_) {
          valid = { ok: true };
        }
      }
      if (!valid.ok) {
        lostDays.push({ fecha: fechaStr, motivo: valid.motivo || "no_disponible" });
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      // 3) Cargar jornada del día.
      const ctx = await this.loadDayContext(usuarioId, fechaStr);
      if (!ctx || ctx.bloques.length === 0) {
        lostDays.push({ fecha: fechaStr, motivo: "sin_jornada" });
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 1);
        continue;
      }

      // -----------------------------------------------------------------
      // 3.5) CASCADE INTER-ACTIVIDAD (opcional)
      //
      // Si cascadeInterActividad=true, intentamos absorber `remaining`
      // reorganizando bloques de OTRAS actividades del usuario en el día
      // (no la actividad partida). Esto respeta:
      //   - ALTA (bloqueada): nunca se mueve.
      //   - Estado_progreso === 'completada': nunca se mueve.
      //   - esReunion: las reuniones no se mueven para hacer hueco.
      //   - deadline del prospecto: si la nueva hora supera el deadline,
      //     se descarta y se reporta en interBlocked con motivo 'deadline'.
      //   - Jornada del usuario: si la nueva hora no entra en el bloque
      //     de jornada, se descarta y se reporta con 'fuera_jornada'.
      //
      // Estrategia:
      //   PHASE A: usar huecos libres entre actividades (sin mover nada).
      //   PHASE B: reorganizar (correr/expandir) bloques de otras act.
      // -----------------------------------------------------------------
      if (cascadeInterActividad) {
        const interBlocksRaw = await this.#loadUsuarioBlocksEnRango(
          usuarioId,
          fechaStr,
          fechaStr,
        );
        const interBlocks = interBlocksRaw.filter(
          (b) =>
            !b.bloqueada &&
            (b.estado_progreso || "pendiente") !== "completada" &&
            !b.esReunion &&
            b.actividad_id !== actividadId,
        );

        // PHASE A — usar huecos libres del día (sin mover actividades).
        const huecosLibres = this.computeFreeSlots(ctx);
        for (const hueco of huecosLibres) {
          if (remaining <= 0) break;
          const libre = hueco.fin - hueco.ini;
          const len = Math.min(remaining, libre);
          if (len > 0) {
            overflow.push({
              fecha: fechaStr,
              hi: minToHHMM(hueco.ini),
              hf: minToHHMM(hueco.ini + len),
              len,
            });
            remaining -= len;
          }
        }

        // PHASE B — reorganizar bloques de otras actividades.
        if (remaining > 0 && interBlocks.length > 0) {
          const bloquesQueQuedan = [];
          for (const bloque of interBlocks) {
            if (remaining <= 0) break;
            const bloqueJornada = ctx.bloques.find(
              (b) => b.ini <= bloque.ini && bloque.fin <= b.fin,
            );
            if (!bloqueJornada) {
              bloquesQueQuedan.push(bloque);
              continue;
            }

            // Choque con bloque anterior ya procesado en este día.
            if (bloquesQueQuedan.length > 0) {
              const ant = bloquesQueQuedan[bloquesQueQuedan.length - 1];
              if (ant.fin > bloque.ini) {
                const nuevaIni = ant.fin;
                const nuevaHf = nuevaIni + bloque.len;
                const propuesta = {
                  hi: nuevaIni,
                  hf: nuevaHf,
                  fecha: fechaStr,
                };
                if (propuestaExcedeDeadline(bloque, propuesta)) {
                  interBlocked.push({
                    actividad_id: bloque.actividad_id,
                    motivo: "deadline",
                    deadline: bloque.deadline || null,
                    propuesta: {
                      hi: minToHHMM(nuevaIni),
                      hf: minToHHMM(nuevaHf),
                    },
                  });
                  continue;
                }
                if (nuevaHf > bloqueJornada.fin) {
                  // No cabe correr dentro de la jornada. Intentar día
                  // siguiente; si no, reportar 'fuera_jornada'.
                  const nextDate = new Date(cursor);
                  nextDate.setDate(nextDate.getDate() + 1);
                  const nextStr = fmtLocalDate(nextDate);
                  // Validar jornada del día siguiente antes de comprometer.
                  const ctxNext = await this.loadDayContext(
                    usuarioId,
                    nextStr,
                  );
                  if (
                    !ctxNext ||
                    ctxNext.bloques.length === 0 ||
                    propuestaExcedeDeadline(bloque, {
                      hi: bloque.ini,
                      hf: bloque.fin,
                      fecha: nextStr,
                    })
                  ) {
                    interBlocked.push({
                      actividad_id: bloque.actividad_id,
                      motivo: "fuera_jornada",
                      deadline: bloque.deadline || null,
                      propuesta: {
                        hi: minToHHMM(bloque.ini),
                        hf: minToHHMM(bloque.fin),
                      },
                    });
                    continue;
                  }
                  cascadeMoves.push({
                    horario_id: bloque.horario_id,
                    actividad_id: bloque.actividad_id,
                    hi: minToHHMM(bloque.ini),
                    hf: minToHHMM(bloque.fin),
                    fecha: nextStr,
                    len: bloque.len,
                    inter: true,
                  });
                  bloque.fechaStr = nextStr;
                  continue;
                }
                // Cabe correr.
                cascadeMoves.push({
                  horario_id: bloque.horario_id,
                  actividad_id: bloque.actividad_id,
                  hi: minToHHMM(nuevaIni),
                  hf: minToHHMM(nuevaHf),
                  fecha: fechaStr,
                  len: bloque.len,
                  inter: true,
                });
                bloque.ini = nuevaIni;
                bloque.fin = nuevaHf;
              }
            }

            // EXPANDIR al final del bloque de jornada con `remaining`.
            // Si el bloque está ANTES del slot (bloque.fin <= slotIni),
            // limitamos la expansión a slotIni para no invadir el horario
            // de la reunión. Para bloques después del slot, no aplica.
            let maxExpansionFin = bloqueJornada.fin;
            if (
              slotFinMin != null &&
              fechaStr === fechaInicio &&
              bloque.fin <= slotFinMin
            ) {
              // El bloque está antes del slot: puede expandirse hasta
              // el inicio del slot (slotIni) como máximo.
              maxExpansionFin = Math.min(maxExpansionFin, slotFinMin);
            }
            const espacioAlFinal = maxExpansionFin - bloque.fin;
            const expansion = Math.min(Math.max(0, espacioAlFinal), remaining);
            if (expansion > 0) {
              const nuevaHf = bloque.fin + expansion;
              const propuesta = {
                hi: bloque.ini,
                hf: nuevaHf,
                fecha: fechaStr,
              };
              if (propuestaExcedeDeadline(bloque, propuesta)) {
                interBlocked.push({
                  actividad_id: bloque.actividad_id,
                  motivo: "deadline",
                  deadline: bloque.deadline || null,
                  propuesta: {
                    hi: minToHHMM(bloque.ini),
                    hf: minToHHMM(nuevaHf),
                  },
                });
              } else {
                cascadeMoves.push({
                  horario_id: bloque.horario_id,
                  actividad_id: bloque.actividad_id,
                  hi: minToHHMM(bloque.ini),
                  hf: minToHHMM(nuevaHf),
                  fecha: fechaStr,
                  len: bloque.len + expansion,
                  inter: true,
                });
                bloque.fin += expansion;
                bloque.len += expansion;
                remaining -= expansion;
              }
            }

            bloquesQueQuedan.push(bloque);
          }
        }
      }

      // 4) CASCADE PROPAGATIVO: iterar bloques del día en orden
      //    cronológico. Para cada bloque (excepto el primero), si el
      //    bloque ANTERIOR lo empuja (choque), reorganizarlo. Luego
      //    expandir al máximo dentro de su bloque de jornada.
      //
      //    Si un bloque no cabe en su bloque de jornada después de
      //    reorganizar, se mueve al día siguiente (cambiando `fechaStr`
      //    en allBlocks; el bloque aparecerá cuando iteremos ese día).
      const bloquesHoy = allBlocks
        .filter((b) => b.fechaStr === fechaStr)
        .sort((a, b) => a.ini - b.ini);

      if (bloquesHoy.length === 0) {
        // Sin bloques de esta actividad en el día.
        //
        // Caso especial: si es EL DÍA DEL SLOT y no hay bloques
        // posteriores, NO creamos nada aquí. Crear al inicio del bloque
        // de jornada pondría el overflow ANTES del slot (lo cual es
        // absurdo: desplazaría el bloque hacia el pasado). Mejor pasar
        // al día siguiente.
        const esDiaDelSlot =
          slotFinMin != null && fechaStr === fechaInicio;
        if (esDiaDelSlot) {
          cursor = new Date(cursor);
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
        // Días futuros: crear bloque nuevo al inicio del primer bloque
        // de jornada (comportamiento legacy).
        const bloqueJornada = ctx.bloques[0];
        const libre = bloqueJornada.fin - bloqueJornada.ini;
        const len = Math.min(remaining, libre);
        if (len > 0) {
          overflow.push({
            fecha: fechaStr,
            hi: minToHHMM(bloqueJornada.ini),
            hf: minToHHMM(bloqueJornada.ini + len),
            len,
          });
          remaining -= len;
        } else {
          cursor = new Date(cursor);
          cursor.setDate(cursor.getDate() + 1);
          continue;
        }
      } else {
        // bloquesQueQuedanEnEsteDia: subconjunto de bloquesHoy que
        // NO se movieron al día siguiente durante esta iteración.
        const bloquesQueQuedanEnEsteDia = [];
        let absorbedAlgo = false;

        for (let j = 0; j < bloquesHoy.length && remaining > 0; j++) {
          const bloque = bloquesHoy[j];
          const bloqueJornada = ctx.bloques.find(
            (b) => b.ini <= bloque.ini && bloque.fin <= b.fin,
          );
          if (!bloqueJornada) {
            bloquesQueQuedanEnEsteDia.push(bloque);
            continue;
          }

          // Verificar choque con bloque anterior procesado.
          if (bloquesQueQuedanEnEsteDia.length > 0) {
            const bloqueAnterior =
              bloquesQueQuedanEnEsteDia[bloquesQueQuedanEnEsteDia.length - 1];
            if (bloqueAnterior.fin > bloque.ini) {
              const duracion = bloque.len;
              const nuevaIni = bloqueAnterior.fin;
              const nuevaHf = nuevaIni + duracion;

              if (nuevaHf <= bloqueJornada.fin) {
                // Cabe correr dentro del bloque de jornada.
                cascadeMoves.push({
                  horario_id: bloque.horario_id,
                  actividad_id: bloque.actividad_id,
                  hi: minToHHMM(nuevaIni),
                  hf: minToHHMM(nuevaHf),
                  fecha: fechaStr,
                  len: duracion,
                });
                bloque.ini = nuevaIni;
                bloque.fin = nuevaHf;
              } else {
                // No cabe. Mover al día siguiente (cascade move con
                // cambio de fecha). El bloque aparecerá en allBlocks
                // cuando iteremos el día siguiente.
                const nextDate = new Date(cursor);
                nextDate.setDate(nextDate.getDate() + 1);
                const nextFechaStr = fmtLocalDate(nextDate);
                cascadeMoves.push({
                  horario_id: bloque.horario_id,
                  actividad_id: bloque.actividad_id,
                  hi: minToHHMM(bloque.ini),
                  hf: minToHHMM(bloque.fin),
                  fecha: nextFechaStr,
                  len: bloque.len,
                });
                bloque.fechaStr = nextFechaStr;
                // No agregar a bloquesQueQuedanEnEsteDia.
                continue;
              }
            }
          }

          // EXPANDIR al máximo dentro del bloque de jornada.
          const espacioAlFinal = bloqueJornada.fin - bloque.fin;
          const expansion = Math.min(Math.max(0, espacioAlFinal), remaining);
          if (expansion > 0) {
            cascadeMoves.push({
              horario_id: bloque.horario_id,
              actividad_id: bloque.actividad_id,
              hi: minToHHMM(bloque.ini),
              hf: minToHHMM(bloque.fin + expansion),
              fecha: fechaStr,
              len: bloque.len + expansion,
            });
            bloque.fin += expansion;
            bloque.len += expansion;
            remaining -= expansion;
            absorbedAlgo = true;
          }

          bloquesQueQuedanEnEsteDia.push(bloque);
        }

        // Si quedó remaining, intentar crear bloque nuevo al final del
        // último bloque de la actividad en el día.
        if (remaining > 0 && bloquesQueQuedanEnEsteDia.length > 0) {
          const ultimoBloque =
            bloquesQueQuedanEnEsteDia[bloquesQueQuedanEnEsteDia.length - 1];
          const bloqueJornadaUltimo = ctx.bloques.find(
            (b) =>
              b.ini <= ultimoBloque.fin && ultimoBloque.fin <= b.fin,
          );
          if (bloqueJornadaUltimo) {
            const libre = bloqueJornadaUltimo.fin - ultimoBloque.fin;
            const len = Math.min(remaining, libre);
            if (len > 0) {
              overflow.push({
                fecha: fechaStr,
                hi: minToHHMM(ultimoBloque.fin),
                hf: minToHHMM(ultimoBloque.fin + len),
                len,
              });
              remaining -= len;
            }
          }
        }
        // Si NO quedó nada en este día y no se absorbió nada, seguir.
        if (
          remaining > 0 &&
          bloquesQueQuedanEnEsteDia.length === 0 &&
          !absorbedAlgo
        ) {
          // Todos los bloques se movieron al día siguiente; nada que
          // hacer aquí. El loop externo seguirá al día siguiente.
        }
      }

      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
    }

    // -----------------------------------------------------------------
    // PUSH-FORWARD CASCADE
    //
    // Si la actividad partida se extendió (último bloque del plan > último
    // bloque original) y se activó `cascadeInterActividad`, las
    // actividades SIGUIENTES en orden cronológico pueden haber quedado
    // superpuestas con la nueva posición. Las reorganizamos moviéndolas
    // al día siguiente que mantenga su `ini` original, respetando:
    //   - ALTA (bloqueada): no se mueve.
    //   - Estado_progreso === 'completada': no se mueve.
    //   - esReunion: no se mueve (las reuniones se gestionan aparte).
    //   - deadline del prospecto: si excede, se bloquea.
    //   - jornada: si no cabe en ningún día futuro (hasta 30), se bloquea.
    // -----------------------------------------------------------------
    if (cascadeInterActividad && actividadId) {
      const extensionMin = this.#calcularExtensionActividad(
        actividadId,
        bloquesOriginalesActividad,
        cascadeMoves,
        overflow,
      );
      if (extensionMin > 0) {
        // planFinMs = hora_fin absoluta del último bloque post-cascade.
        // Se calcula desde los cascadeMoves + overflow actuales (mismo
        // cómputo que #calcularExtensionActividad pero devolviendo ms en
        // lugar de minutos).
        const planCandidates = [];
        for (const cm of cascadeMoves) {
          if (Number(cm.actividad_id) !== Number(actividadId)) continue;
          const d = parseLocalDate(cm.fecha);
          const hf = toMin(cm.hf);
          if (d && hf != null) planCandidates.push(d.getTime() + hf * 60 * 1000);
        }
        for (const ov of overflow) {
          const d = parseLocalDate(ov.fecha);
          const hf = toMin(ov.hf);
          if (d && hf != null) planCandidates.push(d.getTime() + hf * 60 * 1000);
        }
        const planFinMs = planCandidates.length > 0 ? Math.max(...planCandidates) : 0;
        const pf = await this.#pushForwardSiguientes(
          usuarioId,
          actividadId,
          fechaInicio,
          planFinMs,
        );
        cascadeMoves.push(...pf.pushForwardMoves);
        interBlocked.push(...pf.interBlocked);
      }
    }

    return {
      overflow,
      cascadeMoves,
      interBlocked,
      lostDays,
      deadlineExceeded: false,
      remainingMinutes: remaining,
    };
  }

  // ------------------------------------------------------------------------
  // #calcularExtensionActividad: cuánto se extendió la actividad partida
  // (en minutos) después del cascade. Compara el último bloque ORIGINAL
  // (antes del cascade) con el último bloque del PLAN (cascadeMoves +
  // overflow).
  //
  // Devuelve minutos >= 0. Si no hay reorganización o la actividad se
  // acortó, devuelve 0.
  //
  // Parámetros:
  //   splitActividadId: id de la actividad partida (la que se está
  //                     reorganizando en #computeOverflow).
  //   bloquesOriginales: copia de allBlocks ANTES de cualquier mutación.
  //                      Cada item: {actividad_id, fechaStr, fin, ...}.
  //   cascadeMoves: array de movimientos del cascade mismo-actividad.
  //                 Cada item: {actividad_id, fecha, hi, hf, ...}.
  //   overflow: array de bloques NUEVOS a insertar.
  //             Cada item: {fecha, hi, hf, ...}.
  // ------------------------------------------------------------------------
  #calcularExtensionActividad(splitActividadId, bloquesOriginales, cascadeMoves, overflow) {
    const aid = Number(splitActividadId);
    if (!aid) return 0;

    const originales = (bloquesOriginales || []).filter(
      (b) => Number(b.actividad_id) === aid,
    );
    if (originales.length === 0) return 0;
    const sortedOrig = [...originales].sort((a, b) => {
      if (a.fechaStr !== b.fechaStr) return a.fechaStr < b.fechaStr ? -1 : 1;
      return (a.fin || 0) - (b.fin || 0);
    });
    const lastOrig = sortedOrig[sortedOrig.length - 1];
    const dOrig = parseLocalDate(lastOrig.fechaStr);
    if (!dOrig) return 0;
    const originalFinMs = dOrig.getTime() + (lastOrig.fin || 0) * 60 * 1000;

    const candidates = [];
    for (const cm of cascadeMoves || []) {
      if (Number(cm.actividad_id) === aid) {
        const d = parseLocalDate(cm.fecha);
        const hf = toMin(cm.hf);
        if (d && hf != null) candidates.push(d.getTime() + hf * 60 * 1000);
      }
    }
    for (const ov of overflow || []) {
      const d = parseLocalDate(ov.fecha);
      const hf = toMin(ov.hf);
      if (d && hf != null) candidates.push(d.getTime() + hf * 60 * 1000);
    }

    if (candidates.length === 0) return 0;
    const planFinMs = Math.max(...candidates);
    return Math.max(0, Math.floor((planFinMs - originalFinMs) / 60000));
  }

  // ------------------------------------------------------------------------
  // #pushForwardSiguientes: cuando la actividad partida se extendió (su
  // último bloque ahora termina más tarde), reorganiza las actividades
  // SIGUIENTES en orden cronológico para que no queden superpuestas.
  //
  // Estrategia:
  //   1. Cargar todos los bloques del usuario en el rango.
  //   2. Calcular la ventana de extensión [splitIniAbs, splitFinAbs]:
  //      desde donde A1 terminaba originalmente hasta donde termina
  //      después del cascade.
  //   3. Agrupar por actividad, filtrar splitActividadId. Excluir ALTA,
  //      reuniones y completadas.
  //   4. Ordenar actividades por iniAbs del primer bloque (cronológico).
  //   5. Para cada actividad B, validar si su primer bloque SOLAPA con
  //      la ventana de extensión. Si NO solapa (está antes o después
  //      de la ventana), B no entra en conflicto y no se toca.
  //   6. Si SOLAPA, mover SOLO el primer bloque de B al primer día
  //      con slot (mismo día primero). Política de slot:
  //        - Slot completo (misma duración) tiene prioridad.
  //        - Si no cabe, compresión al final del bloque de jornada.
  //        - El slot debe estar DESPUÉS de splitFinAbs (cronología).
  //        - Si el slot coincide con el bloque original, se ignora.
  //   7. Si B se movió correctamente, reportar en pushForwardMoves.
  //      Si no se pudo mover (sin jornada en 30 días), reportar en
  //      interBlocked con motivo 'fuera_jornada' o 'deadline'.
  //
  // NOTA: la propagación DENTRO de B (a sus bloques 2, 3...) NO se
  // aplica. Esos bloques ya están cronológicamente después del
  // primero y no entran en conflicto con A1.
  //
  // Devuelve:
  //   { pushForwardMoves: [{horario_id, actividad_id, hi, hf, fecha,
  //                          len, inter: true, pushForward: true}],
  //     interBlocked: [{actividad_id, motivo, deadline?, propuesta}] }
  // ------------------------------------------------------------------------
  async #pushForwardSiguientes(usuarioId, splitActividadId, ctxFechaStr, planFinMs = null) {
    const uid = Number(usuarioId);
    const aid = Number(splitActividadId);
    if (!uid || !aid) return { pushForwardMoves: [], interBlocked: [] };

    const startDate = parseLocalDate(ctxFechaStr);
    if (!startDate) return { pushForwardMoves: [], interBlocked: [] };

    // Cargar bloques desde ctxFechaStr hasta 30 días después.
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);
    const endDateStr = fmtLocalDate(endDate);

    const all = await this.#loadUsuarioBlocksEnRango(
      uid,
      ctxFechaStr,
      endDateStr,
    );

    // 1. Calcular splitFinAbs: hora_fin absoluta del último bloque de
    //    splitActividadId POST-cascade. Si recibimos planFinMs (del
    //    caller), lo usamos porque refleja los cascadeMoves/overflow
    //    ya decididos en este ciclo. Si no, fallback al último bloque
    //    en BD (que es el ORIGINAL, no el post-cascade).
    //
    //    También calculamos splitIniAbs: hora_fin absoluta del último
    //    bloque ORIGINAL de A1 (en BD, sin cascade). Esto delimita la
    //    ventana de extensión y permite detectar conflictos reales
    //    (B solapa con [splitIniAbs, splitFinAbs]) sin capturar
    //    actividades anteriores a A1.
    const splitBlocksAll = all
      .filter((b) => Number(b.actividad_id) === aid)
      .sort((a, b) => {
        if (a.fechaStr !== b.fechaStr) return a.fechaStr < b.fechaStr ? -1 : 1;
        return (a.fin || 0) - (b.fin || 0);
      });
    let splitIniAbs = 0;
    if (splitBlocksAll.length > 0) {
      const lastSplitOrig = splitBlocksAll[splitBlocksAll.length - 1];
      const dOrig = parseLocalDate(lastSplitOrig.fechaStr);
      splitIniAbs = dOrig
        ? dOrig.getTime() + (lastSplitOrig.fin || 0) * 60 * 1000
        : 0;
    }
    let splitFinAbs = 0;
    if (planFinMs && Number(planFinMs) > 0) {
      splitFinAbs = Number(planFinMs);
    } else if (splitBlocksAll.length > 0) {
      const lastSplit = splitBlocksAll[splitBlocksAll.length - 1];
      const dSplit = parseLocalDate(lastSplit.fechaStr);
      splitFinAbs = dSplit
        ? dSplit.getTime() + (lastSplit.fin || 0) * 60 * 1000
        : 0;
    }
    if (splitIniAbs === 0 || splitFinAbs === 0) {
      return { pushForwardMoves: [], interBlocked: [] };
    }

    // 2. Agrupar por actividad (excluyendo splitActividadId, ALTA, reuniones).
    const actividadesMap = new Map();
    for (const b of all) {
      const baid = Number(b.actividad_id);
      if (!baid || baid === aid) continue;
      if (b.bloqueada || b.esReunion) continue;
      if ((b.estado_progreso || "pendiente") === "completada") continue;
      if (!actividadesMap.has(baid)) {
        actividadesMap.set(baid, {
          actividad_id: baid,
          bloqueada: b.bloqueada,
          deadline: b.deadline || null,
          bloques: [],
        });
      }
      actividadesMap.get(baid).bloques.push({ ...b });
    }

    // 3. Ordenar actividades por iniAbs del primer bloque.
    const actividades = Array.from(actividadesMap.values()).map((a) => {
      const sorted = [...a.bloques].sort((x, y) => {
        if (x.fechaStr !== y.fechaStr) return x.fechaStr < y.fechaStr ? -1 : 1;
        return (x.ini || 0) - (y.ini || 0);
      });
      const first = sorted[0];
      const dFirst = parseLocalDate(first.fechaStr);
      const iniAbs = dFirst ? dFirst.getTime() + (first.ini || 0) * 60 * 1000 : 0;
      return { ...a, bloques: sorted, iniAbs };
    });
    actividades.sort((x, y) => x.iniAbs - y.iniAbs);

    const pushForwardMoves = [];
    const interBlocked = [];

    // Helper: convertir fecha+minutos a ms absolutos.
    const toAbsMs = (fechaStr, min) => {
      const d = parseLocalDate(fechaStr);
      return d ? d.getTime() + min * 60 * 1000 : 0;
    };

    // Helper: emitir move de push-forward para un bloque.
    const emitMove = (bloque, nuevaFecha, ini, hf, len) => {
      pushForwardMoves.push({
        horario_id: bloque.horario_id,
        actividad_id: bloque.actividad_id,
        hi: minToHHMM(ini),
        hf: minToHHMM(hf),
        fecha: nuevaFecha,
        len,
        inter: true,
        pushForward: true,
      });
    };

    // 4. Procesar cada actividad en orden cronológico.
    // Política: para cada actividad B, validar si su primer bloque
    // SOLAPA con la ventana de extensión de A1, es decir
    // [splitIniAbs, splitFinAbs]. Solo los bloques que solapan con
    // esa ventana están en conflicto. Las actividades que están
    // completamente ANTES de splitIniAbs (cronológicamente anteriores
    // a A1) o completamente DESPUÉS de splitFinAbs (cronológicamente
    // posteriores a A1 sin tocar la extensión) no entran en conflicto.
    //
    // Si B entra en conflicto, mover SOLO el primer bloque. Los
    // demás bloques de B se mantienen donde están.
    for (const act of actividades) {
      const bloque = act.bloques[0];
      if (!bloque) continue;
      const bloqueIniAbs = toAbsMs(bloque.fechaStr, bloque.ini);
      const bloqueFinAbs = toAbsMs(bloque.fechaStr, bloque.fin);

      // ¿B solapa con la ventana de extensión de A1?
      //   - bloqueFinAbs <= splitIniAbs: bloque termina ANTES de donde
      //     A1 empezaba su extensión. No hay solapamiento.
      //   - bloqueIniAbs >= splitFinAbs: bloque empieza DESPUÉS de donde
      //     A1 terminó. No hay solapamiento.
      // En ambos casos, B no entra en conflicto con A1.
      if (bloqueFinAbs <= splitIniAbs || bloqueIniAbs >= splitFinAbs) {
        // No hay solapamiento con la ventana de extensión. B está
        // cronológicamente antes o después de A1. No se toca.
        continue;
      }

      // Sí hay solapamiento. Buscar el primer día (mismo día primero)
      // que tenga un slot donde colocar el bloque. Política:
      //   - El slot debe estar DESPUÉS de donde A1 terminó
      //     (splitFinAbs) para mantener el orden cronológico.
      //   - Si el bloque que estamos moviendo está en el mismo día
      //     que A1 termina (dia=0), el slot debe empezar >= finA1.
      //   - Si está en otro día, basta con que el slot esté en la
      //     jornada y no choque con otros eventos.
      //   - Preferimos slot completo (misma duración). Si no cabe,
      //     aceptamos compresión al final del bloque de jornada.
      //   - Si el único slot encontrado coincide con el bloque
      //     original (mismo ini/fin/fecha), se ignora: el bloque
      //     ya está donde debe, solo necesitamos asegurar que no
      //     choque. Si choche, seguir buscando.
      {
        const iniOrig = bloque.ini;
        const hfOrig = bloque.fin;
        const fechaOrigStr = bloque.fechaStr;
        const len = bloque.len;

        let movido = false;
        const dBloqueOrig = parseLocalDate(fechaOrigStr);

        // Helper: determina si un slot es el mismo que el bloque
        // original (mismo ini, fin y fecha). En ese caso es un no-op.
        const esMismoBloqueOrig = (s) =>
          s != null &&
          s.fechaStr === fechaOrigStr &&
          s.ini === iniOrig &&
          s.fin === iniOrig + s.len;

        let slotElegido = null; // {ini, len, fechaStr}
        let slotCompletoElegido = null; // primer slot completo encontrado
        let slotComprimidoElegido = null; // primer slot comprimido encontrado
        const DBG = process.env.PUSH_FWD_DEBUG === "1";
        if (DBG) console.log(`[PF] act=${act.actividad_id} bloqueIni=${iniOrig} bloqueFin=${hfOrig} bloqueFecha=${fechaOrigStr} len=${len} splitFinAbs=${splitFinAbs} splitIniAbs=${splitIniAbs}`);

        for (let dia = 0; dia <= 30; dia++) {
          const baseDate = parseLocalDate(bloque.fechaStr);
          if (!baseDate) break;
          const propDate = new Date(baseDate);
          propDate.setDate(propDate.getDate() + dia);
          const propFechaStr = fmtLocalDate(propDate);

          // Para validar deadline usamos el slot completo original
          // (mismo hi/hf). Si ni siquiera el slot completo cumple
          // deadline, ningún otro candidato lo hará.
          const moveFull = {
            fecha: propFechaStr,
            hi: minToHHMM(iniOrig),
            hf: minToHHMM(hfOrig),
          };
          if (this.#moveExceedsDeadline({ deadline: act.deadline }, moveFull)) {
            // Deadline excedido: bloquear y no intentar más días.
            interBlocked.push({
              actividad_id: act.actividad_id,
              motivo: "deadline",
              deadline: act.deadline || null,
              propuesta: { hi: minToHHMM(iniOrig), hf: minToHHMM(hfOrig) },
            });
            slotElegido = null;
            break;
          }

          // Validar jornada destino.
          let ctxDest;
          try {
            ctxDest = await this.loadDayContext(uid, propFechaStr);
          } catch (_) {
            ctxDest = null;
          }
          if (!ctxDest || ctxDest.bloques.length === 0) continue;

          // Cronología mínima: el slot debe empezar DESPUÉS de donde
          // A1 terminó (splitFinAbs) para mantener el orden. Para
          // dias > 0 donde splitFinAbs ya pasó, basta con que esté
          // en la jornada (minIniAbs = 0).
          const dProp = parseLocalDate(propFechaStr);
          const minIniAbs =
            dProp && splitFinAbs > 0
              ? Math.floor((splitFinAbs - dProp.getTime()) / 60000)
              : 0;

          // Ocupantes: TODOS los eventos del día destino, excluyendo
          // TODOS los bloques de A2 (esta actividad). El bloque que
          // estamos moviendo es uno de ellos; si excluimos solo ése,
          // los demás bloques de A2 aparecen como "libres" y el
          // algoritmo elige un slot que en realidad está ocupado
          // por A2 mismo (otro bloque).
          const horariosA2 = new Set(
            (act.bloques || []).map((b) => Number(b.horario_id)),
          );
          const ocupantes = (ctxDest.eventos || []).filter(
            (e) => !horariosA2.has(Number(e.horario_id)),
          );

          let slotCompleto = null;
          let slotComprimido = null;
          for (const jornadaBloque of ctxDest.bloques) {
            // Si el bloque de jornada está antes de minIniAbs, skip.
            if (jornadaBloque.fin <= minIniAbs) continue;
            const dentro = ocupantes
              .filter((e) => e.ini >= jornadaBloque.ini && e.fin <= jornadaBloque.fin)
              .sort((x, y) => x.ini - y.ini);
            // cursor arranca en max(jornadaBloque.ini, minIniAbs) para
            // garantizar orden cronológico.
            let cursor = Math.max(jornadaBloque.ini, minIniAbs);
            for (const oc of dentro) {
              if (oc.ini - cursor >= len) {
                slotCompleto = {
                  ini: cursor,
                  len,
                  fechaStr: propFechaStr,
                  fin: cursor + len,
                };
                break;
              }
              cursor = Math.max(cursor, oc.fin);
            }
            if (slotCompleto != null) break;
            if (jornadaBloque.fin - cursor >= len) {
              slotCompleto = {
                ini: cursor,
                len,
                fechaStr: propFechaStr,
                fin: cursor + len,
              };
              break;
            }
            // Compresión al final del último ocupante (o del cursor).
            const ultimo = dentro.length > 0 ? dentro[dentro.length - 1] : null;
            const iniBase = Math.max(ultimo ? ultimo.fin : cursor, minIniAbs);
            const libre = jornadaBloque.fin - iniBase;
            if (libre >= 30) {
              const cand = {
                ini: iniBase,
                len: libre,
                fechaStr: propFechaStr,
                fin: iniBase + libre,
              };
              if (slotComprimido == null || cand.len > slotComprimido.len) {
                slotComprimido = cand;
              }
            }
          }

          if (DBG) {
            console.log(
              `[PF]   dia=${dia} fecha=${propFechaStr} completo=${slotCompleto ? `${slotCompleto.ini}-${slotCompleto.fin}` : "null"} comprimido=${slotComprimido ? `${slotComprimido.ini}-${slotComprimido.fin}(${slotComprimido.len}m)` : "null"} mismoBloque=${slotCompleto ? esMismoBloqueOrig(slotCompleto) : "n/a"}`,
            );
          }

          // Política de selección (cronológica):
          //   - Iteramos por día ascendente (dia=0 mismo día, dia=1+ futuro).
          //   - En cada día, buscamos primero slot COMPLETO (preserva
          //     duración). Si lo encontramos, lo usamos y paramos.
          //   - Si NO hay completo pero SÍ comprimido en el mismo día,
          //     LO USAMOS de inmediato y paramos. Mantiene orden
          //     secuencial aunque pierda duración.
          //   - Solo si el día actual no tiene NINGÚN slot válido,
          //     pasamos al día siguiente.
          //
          //   Razón: el usuario quiere que A2 arranque secuencialmente
          //   desde donde A1 termina (mismo día), aunque eso signifique
          //   comprimir el bloque. Mover A2 a un día futuro lejano
          //   rompe el orden cronológico.
          //
          //   Validación adicional: el slot NO debe superponerse con
          //   OTROS bloques de A2 en el día destino. Aunque los
          //   excluimos de `ocupantes`, igualmente podrían quedar
          //   huecos que NO son válidos porque ya hay otro bloque
          //   de A2 en ese rango. Ejemplo: A2 tiene 23/06 15-19, lo
          //   excluimos del filtro, queda libre 15-19; pero 15-19
          //   está ocupado por A2 mismo (otro bloque). El slot
          //   candidato 15-18 SE SUPERPONE con 15-19. Hay que
          //   verificar manualmente que el slot no toque otros
          //   bloques de A2.
          const chocaConOtroA2 = (s) => {
            if (!s) return false;
            for (const b of act.bloques || []) {
              if (Number(b.horario_id) === Number(bloque.horario_id)) continue;
              if (b.fechaStr !== s.fechaStr) continue;
              if (s.ini < b.fin && b.ini < s.fin) return true;
            }
            return false;
          };

          // Preferir slot completo en este día.
          if (
            slotCompleto != null &&
            !esMismoBloqueOrig(slotCompleto) &&
            !chocaConOtroA2(slotCompleto)
          ) {
            slotElegido = slotCompleto;
            break;
          }
          // Si no hay completo, usar comprimido EN ESTE DÍA
          // (mantener orden cronológico).
          if (
            slotComprimido != null &&
            !esMismoBloqueOrig(slotComprimido) &&
            !chocaConOtroA2(slotComprimido)
          ) {
            slotElegido = slotComprimido;
            break;
          }
        }

        // Si tras 30 días no encontramos slot válido, queda null.
        if (DBG) console.log(`[PF]   ELEGIDO ${slotElegido ? `${slotElegido.fechaStr} ${slotElegido.ini}-${slotElegido.fin}(${slotElegido.len}m)` : "null"}`);

        if (slotElegido != null) {
          // Aplicar el slot elegido.
          emitMove(bloque, slotElegido.fechaStr, slotElegido.ini, slotElegido.ini + slotElegido.len, slotElegido.len);
          bloque.fechaStr = slotElegido.fechaStr;
          bloque.ini = slotElegido.ini;
          bloque.fin = slotElegido.ini + slotElegido.len;
          bloque.len = slotElegido.len;
          movido = true;
        }

        if (!movido) {
          // No se pudo mover en ningún día (incluso comprimido en
          // mismo día o días futuros). Reportar como fuera_jornada.
          if (
            !interBlocked.some(
              (b) => b.actividad_id === act.actividad_id && b.motivo === "deadline",
            )
          ) {
            interBlocked.push({
              actividad_id: act.actividad_id,
              motivo: "fuera_jornada",
              deadline: act.deadline || null,
              propuesta: { hi: minToHHMM(iniOrig), hf: minToHHMM(hfOrig) },
            });
          }
        }
      }
    }

    return { pushForwardMoves, interBlocked };
  }

  // Intenta partir actividades que se solapan con un slot candidato.
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
  //     pasa, los splits cuyo "after" desborda la jornada del día
  //     generan un campo `overflow: [...]` con bloques en días futuros
  //     (computados por #computeOverflow). Si no se pasa, los splits
  //     que desbordan se truncan como antes (perdiendo esos minutos).
  async #trySplit(
    ctx,
    minutos,
    prioridad,
    slotIniForzado = null,
    overflowOpts = null,
  ) {
    const { bloques, eventos, fechaStr: ctxFechaStr } = ctx;
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
          splits.push({
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before: {
              hi: minToHHMM(e.ini),
              hf: minToHHMM(slotIni),
              len: beforeLen,
              fecha: ctxFechaStr,
            },
            after: null,
          });
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
          if (minutosPerdidos > 0) split.overflowPending = minutosPerdidos;
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
          splits.push({
            actividad_id: e.actividad_id,
            horario_id: e.horario_id,
            before: {
              hi: minToHHMM(e.ini),
              hf: minToHHMM(slotFin),
              len: slotFin - e.ini,
              fecha: ctxFechaStr,
            },
            after: null,
          });
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
          splits.push(split);
        }
        continue;
      }
    }

    // ------------------------------------------------------------------------
    // Fase 2: resolver los `overflowPending` y `cascadeTarget` con cascade.
    //
    // Dos tipos de "tiempo a reubicar":
    //   - overflowPending: el after del split NO cabe en la jornada del
    //     día. Cascade intentará absorberlo, pero si no entra, se
    //     marca el split como FALLIDO (overflowFailedReason).
    //   - cascadeTarget: el after SÍ cabe en el día, pero la actividad
    //     PIERDE tiempo porque la reunión ocupa el espacio intermedio.
    //     Cascade intenta absorberlo en bloques posteriores de la misma
    //     actividad (mismo día o días futuros). Si no entra, NO es
    //     fallo — simplemente se pierden minutos (cascadeLostMinutes).
    //
    // Cascade en DOS niveles:
    //   1) Mismo día: buscar bloques posteriores de la MISMA actividad
    //      (en este día, con hora_inicio >= slotFin) que se puedan correr
    //      o expandir para absorber los minutos. Si absorbe todo → fin.
    //      Si absorbe parcialmente → queda un residual para Fase 2.2.
    //   2) Días futuros: llamar a #computeOverflow con `actividadId` para
    //      que haga cascade en cada día futuro.
    //
    // Cada split termina con:
    //   - sp.overflow:        bloques NUEVOS a insertar.
    //   - sp.cascadeMoves:    UPDATEs a bloques existentes.
    //   - sp.overflowFailedReason + sp.overflowLostMinutes: si no cupo
    //                        (SOLO si era overflowPending).
    //   - sp.cascadeLostMinutes: si no cupo el gap (no es error).
    // ------------------------------------------------------------------------
    if (overflowOpts && Array.isArray(splits)) {
      const isDateValid = (f) =>
        this.#isFutureDateValid(overflowOpts.usuarioId, f);
      // Acumulador de blockedMoves del cascade inter-actividad. Se
      // devuelve en el resultado final para que el front los muestre.
      const interBlockedAcc = [];

      for (const sp of splits) {
        const isOverflow = sp.overflowPending && sp.overflowPending > 0;
        const isCascade = sp.cascadeTarget && sp.cascadeTarget > 0;
        if (!isOverflow && !isCascade) continue;
        if (!ctxFechaStr || !overflowOpts.usuarioId) {
          // No tenemos cómo calcular cascade → descartamos esos minutos.
          continue;
        }

        const remaining = sp.overflowPending || sp.cascadeTarget || 0;
        const actividadId = sp.actividad_id;

        // Una sola llamada a #computeOverflow cubre AMBOS casos: el
        // mismo día (bloques con ini >= slotFin) Y los días futuros.
        // El parámetro `slotFin` indica que el día del slot también
        // debe procesarse, filtrando los bloques que ya pasaron.
        // `cascadeInterActividad: true` activa la reorganización de
        // bloques de OTRAS actividades del usuario en el rango,
        // respetando ALTA, deadline y jornada.
        const ov = await this.#computeOverflow({
          usuarioId: overflowOpts.usuarioId,
          fechaInicio: ctxFechaStr,
          minutosRestantes: remaining,
          deadline: overflowOpts.deadline || null,
          actividadId,
          maxDias: 7,
          isDateValid,
          slotFin,
          cascadeInterActividad: true,
        });

        if (ov.overflow.length > 0) {
          sp.overflow = (sp.overflow || []).concat(ov.overflow);
        }
        if (ov.cascadeMoves.length > 0) {
          sp.cascadeMoves = (sp.cascadeMoves || []).concat(ov.cascadeMoves);
        }
        if (ov.interBlocked && ov.interBlocked.length > 0) {
          interBlockedAcc.push(...ov.interBlocked);
        }
        if (ov.deadlineExceeded) {
          if (isOverflow) {
            sp.overflowFailedReason = "deadline";
            sp.overflowLostMinutes = ov.remainingMinutes;
          } else {
            sp.cascadeLostMinutes = ov.remainingMinutes;
          }
        } else if (ov.remainingMinutes > 0) {
          if (isOverflow) {
            sp.overflowFailedReason = "no_cupo_en_7_dias";
            sp.overflowLostMinutes = ov.remainingMinutes;
          } else {
            sp.cascadeLostMinutes = ov.remainingMinutes;
          }
        }

        // Limpiamos los campos auxiliares.
        delete sp.overflowPending;
        delete sp.cascadeTarget;
      }

      // Si acumulamos interBlocked, devolverlo en el resultado para que
      // placeActivity lo concatene a blockedMoves del plan.
      if (interBlockedAcc.length > 0) {
        return {
          fits: true,
          slot: this.#shapeSlot(slotIni, minutos),
          splits,
          moves,
          interBlocked: interBlockedAcc,
        };
      }
    }

    return {
      fits: true,
      slot: this.#shapeSlot(slotIni, minutos),
      splits,
      moves,
    };
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
                  updated_at  = now()
            WHERE id = $4`,
          hiDate,
          hfDate,
          m.fecha,
          Number(m.horario_id),
        );
        if (m.actividad_id && motivo) {
          await tx.actividades.update({
            where: { id: Number(m.actividad_id) },
            data: { motivo_reprograma: motivo, updated_at: new Date() },
          });
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
