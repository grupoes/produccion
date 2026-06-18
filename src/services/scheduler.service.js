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
         TO_CHAR(hu.hora_inicio::time, 'HH24:MI:SS') AS hi,
         TO_CHAR(hu.hora_fin::time,    'HH24:MI:SS') AS hf,
         hu.duracion_minutos,
         a.prioridad,
         a.bloqueada,
         a.estado_progreso,
         a.prospecto_id,
         TO_CHAR(p.fecha_entrega, 'YYYY-MM-DD') AS deadline
       FROM horario_usuario hu
       LEFT JOIN actividades a ON a.id = hu.actividad_id
       LEFT JOIN prospectos p  ON p.id = a.prospecto_id
       WHERE hu.usuario_id = $1
         AND hu.estado = true
         AND hu.fecha = $2::date
       ORDER BY hu.hora_inicio ASC`,
      uid,
      fechaStr,
    );

    const eventos = (evRows || [])
      .map((r) => ({
        horario_id: Number(r.horario_id),
        actividad_id: r.actividad_id ? Number(r.actividad_id) : null,
        ini: toMin(r.hi),
        fin: toMin(r.hf),
        minutos: r.duracion_minutos ? Number(r.duracion_minutos) : null,
        prioridad: r.prioridad || null,
        bloqueada: r.bloqueada === true || r.bloqueada === "true",
        estado_progreso: r.estado_progreso || null,
        prospecto_id: r.prospecto_id ? Number(r.prospecto_id) : null,
        deadline: r.deadline || null,
      }))
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
  //            ignorarActividadId: int|null }   // para reprogramar: no
  //                                            // contarse a sí mismo
  //
  // Devuelve:
  //   {
  //     fits: true,
  //     slot: {ini, fin, hi:'HH:MM', hf:'HH:MM'},
  //     moves: [],                              // no hubo que mover nada
  //     reason: 'entra directo'|'moviendo <n> actividades'
  //   }
  // ó
  //   {
  //     fits: false,
  //     overflowMin,                            // lo que sobra
  //     reason: 'choca con ALTA'|'jornada completa'|'sin bloques',
  //     mejorSoltarMin,                         // lo máximo que entró aún
  //                                            // moviendo todo lo movible
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

    // 1) Intento directo: ¿hay un hueco que entre la actividad?
    const slotsDirectos = this.computeFreeSlots(ctxIgnorando);
    const directo = slotsDirectos.find((s) => s.fin - s.ini >= minutos);
    if (directo) {
      return {
        fits: true,
        slot: this.#shapeSlot(directo.ini, minutos),
        moves: [],
        reason: "entra directo",
      };
    }

    // 2) No entra directo. ¿Por qué? Veamos:
    //    a) Choca con ALTA → no entra aunque movamos MEDIA/BAJA
    //    b) Hay suficiente si movemos MEDIA/BAJA → compactar
    //    c) No hay suficiente ni compactando → overflow

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

    // Espacio libre actual menos lo que ocupa lo movible: si lo moviera
    // todo "perfecto" (sin huecos entre eventos), me quedaría con
    // (totalDisponible - ocupadoPorALTA - tiempo del nuevo) de hueco.
    // Si ese número es >= 0, es posible compactar.
    const libreMaximo = totalDisponible - ocupadoPorALTA - minutos;
    if (libreMaximo < 0) {
      // No entra ni aunque movamos todo lo movible.
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

    // 3) Compactar: reordenar las movibles para liberar un bloque al ppio.
    //    Heurística greedy: ordenarlas por deadline (las más urgentes
    //    primero), ir poniéndolas una tras otra desde el inicio del primer
    //    bloque, dejando la nueva actividad al final.
    //    Si la nueva es ALTA, la nueva va al ppio; las movibles se apilan
    //    después.
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
    if (plan.fits) {
      return {
        fits: true,
        slot: plan.slot,
        moves: plan.moves,
        reason: `moviendo ${plan.moves.length} actividad(es)`,
      };
    }

    return {
      fits: false,
      reason: "jornada completa",
      overflowMin: plan.overflowMin,
      mejorSoltarMin: plan.mejorSoltarMin,
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
