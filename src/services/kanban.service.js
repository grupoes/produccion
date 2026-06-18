import prisma from "../config/db.js";
import ActividadEstadoHistorialService from "./actividad-estado-historial.service.js";

const ROL_VALORADOR = "valorador";
const ROL_VALORADOR_ID = 10;

// ============================================================================
// Kanban service — vista personal de actividades para el VALORADOR (rol_id=10)
// ----------------------------------------------------------------------------
// getKanbanByUsuario(usuarioId, opts)
//   Devuelve las actividades asignadas al usuario, agrupadas en columnas según
//   `estado_progreso`, enriquecidas con los joins necesarios para renderizar
//   tarjetas (tarea, prospecto, tipo_tarea).
//
//   opts:
//     includeCompleted : bool (default true)  — incluir completada
//     from, to         : 'YYYY-MM-DD'          — filtro por rango (afecta
//                                                fecha_inicio, fecha_inicio_real
//                                                y fecha_termino_real)
//
// moverActividad(actividadId, estadoProgreso, usuario)
//   Cambia el `estado_progreso` de una actividad validando que el usuario sea
//   dueño o jefe, y que la actividad NO esté bloqueada. Registra fila en
//   `actividad_estado_historial` cuando entra a `en_progreso`.
// ============================================================================

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const ROLES_TOTAL = ["super admin", "jefe de produccion"];

const userIsJefe = (rolNombre) => {
  const n = norm(rolNombre);
  return ROLES_TOTAL.some((p) => n.includes(p));
};

// Estados canónicos que se muestran como columnas del Kanban.
const COL_KEYS = ["pendiente", "en_progreso", "completada"];

class KanbanService {
  // Trae las actividades de un usuario y las agrupa en columnas.
  async getKanbanByUsuario(usuarioId, opts = {}) {
    const { includeCompleted = true, from = null, to = null } = opts;
    const uid = Number(usuarioId);
    if (!uid) return { usuario: null, columnas: this.#emptyColumns() };

    // 1) Info del usuario (para el header del dashboard).
    const user = await prisma.usuarios.findUnique({
      where: { id: uid },
      include: { personas: true, roles: true },
    });
    const usuario = user
      ? {
          id: user.id,
          usuario: user.usuario,
          nombres: user.personas?.nombres || "",
          apellidos: user.personas?.apellidos || "",
          rol: user.roles?.nombre || "",
        }
      : null;

    // 2) Where clause base.
    //    El Kanban es una vista personal del usuario: mostramos TODAS sus
    //    actividades (incluidas completadas) para que pueda ver el historial
    //    reciente en la columna "Completada" sin perderlas al arrastrar
    //    tarjetas. El volumen está acotado por `usuario_id = uid`.
    const where = { usuario_id: uid };
    if (!includeCompleted) {
      where.estado_progreso = { not: "completada" };
    }
    if (from || to) {
      // Filtro por rango: intersectamos con lo anterior.
      const rangoAND = [];
      if (from) rangoAND.push({ fecha_inicio: { gte: new Date(from + "T00:00:00") } });
      if (to) rangoAND.push({ fecha_inicio: { lte: new Date(to + "T23:59:59") } });
      if (rangoAND.length) {
        // Combinamos: el where existente más el rango, dentro de un AND.
        where.AND = rangoAND;
      }
    }

    const rows = await prisma.actividades.findMany({
      where,
      orderBy: [{ fecha_inicio: "asc" }, { id: "asc" }],
      include: {
        tarea: {
          include: {
            tipo_tarea_tarea_tipo_tareaTotipo_tarea: true,
          },
        },
        prospectos: {
          select: {
            id: true,
            titulo_prospecto: true,
            // Primer contacto del prospecto (JOIN prospecto_persona → personas).
            prospecto_persona: {
              take: 1,
              orderBy: { id: "asc" },
              include: {
                personas: {
                  select: {
                    id: true,
                    nombres: true,
                    apellidos: true,
                    email: true,
                    celular: true,
                  },
                },
              },
            },
            // Última entrada del historial con "Actividad agregada" → usuario
            // que asignó la tarea. Filtramos en JS más abajo.
            historial_estados_prospecto: {
              where: { comentario: { startsWith: "Actividad agregada" } },
              orderBy: { fecha_inicio: "desc" },
              take: 1,
              include: {
                usuarios: {
                  select: {
                    id: true,
                    usuario: true,
                    personas: { select: { nombres: true, apellidos: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    // 3) Fetch de los campos de tiempo como ISO con offset preservado.
    //    Esto es independiente del fetch Prisma de arriba y solo se hace
    //    para los IDs de actividades que vamos a devolver.
    const timeMap = await this.#fetchTimeIso(rows.map((r) => r.id));

    // 3b) Fetch del "pendiente desde" — fecha_inicio de la fila abierta
    //     (fecha_fin IS NULL) en `actividad_estado_historial` con
    //     estado_progreso='pendiente'. Le dice al VALORADOR hace cuánto
    //     está esa actividad en su cola pendiente (no la fecha asignada,
    //     que puede ser futura).
    const pendienteMap = await this.#fetchPendienteDesde(
      rows.map((r) => r.id),
    );

    // 3b2) Fetch del "inicio en progreso" — fecha_inicio de la fila
    //      abierta (fecha_fin IS NULL) con estado_progreso='en_progreso'.
    //      Es la fuente de verdad para la card de la columna "En
    //      progreso" (cuándo se INICIÓ la actividad, no cuándo se
    //      asignó). Viene del Timestamptz correcto, no del Timetz con
    //      bug de offset.
    const inicioProgresoMap = await this.#fetchInicioEnProgreso(
      rows.map((r) => r.id),
    );

    // 3c) Fetch de "registrado por" — datos del usuario que REGISTRÓ la
    //     actividad (columna `actividades.usuario_register`).
    const registradoMap = await this.#fetchRegistradoPor(
      rows.map((r) => r.id),
    );

    // 4) Agrupar por estado_progreso.
    const buckets = { pendiente: [], en_progreso: [], completada: [] };
    for (const a of rows) {
      const key = COL_KEYS.includes(a.estado_progreso)
        ? a.estado_progreso
        : "pendiente";
      buckets[key].push(
        this.#shapeActividad(
          a,
          timeMap.get(a.id),
          pendienteMap.get(a.id),
          registradoMap.get(a.id),
          inicioProgresoMap.get(a.id),
        ),
      );
    }

    const columnas = COL_KEYS.map((k) => ({
      key: k,
      label: k === "en_progreso" ? "En progreso" : k.charAt(0).toUpperCase() + k.slice(1),
      items: buckets[k],
    }));

    return { usuario, columnas };
  }

  // Mueve una actividad a otra columna. Devuelve la actividad actualizada o
  // lanza error con `code` específico.
  async moverActividad(actividadId, estadoProgreso, usuario) {
    const idNum = Number(actividadId);
    const estado = String(estadoProgreso || "").toLowerCase();
    if (!COL_KEYS.includes(estado)) {
      const err = new Error("Estado de progreso inválido.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    const act = await prisma.actividades.findUnique({ where: { id: idNum } });
    if (!act) {
      const err = new Error("Actividad no encontrada.");
      err.code = "NOT_FOUND";
      throw err;
    }

    const isDueno = Number(usuario.id) === Number(act.usuario_id);
    const isJefe = userIsJefe(usuario.rol?.nombre);
    if (!isDueno && !isJefe) {
      const err = new Error("No tienes permiso para mover esta actividad.");
      err.code = "FORBIDDEN";
      throw err;
    }

    if (act.bloqueada) {
      const err = new Error(
        "La actividad está bloqueada/reprogramada y no se puede mover.",
      );
      err.code = "BLOCKED";
      throw err;
    }

    if (act.estado_progreso === estado) {
      // Sin transición real → recargamos el pendiente_desde, el
      // inicio_en_progreso y el registrado_por para que la respuesta
      // traiga los datos actualizados si el caller la usa.
      const pendienteMap = await this.#fetchPendienteDesde([idNum]);
      const inicioProgresoMap = await this.#fetchInicioEnProgreso([idNum]);
      const registradoMap = await this.#fetchRegistradoPor([idNum]);
      return this.#shapeActividad(
        act,
        null,
        pendienteMap.get(idNum),
        registradoMap.get(idNum),
        inicioProgresoMap.get(idNum),
      );
    }

    const now = new Date();
    // Si estamos cerrando la actividad (moviéndola a "completada") y aún
    // no tiene `fecha_termino_real` o `hora_termino_real`, los seteamos
    // ambos ahora para que la actividad tenga un timestamp de cierre
    // consistente. Esto cubre el caso del arrastre directo:
    // pendiente → completada sin pasar por start/end. Solo seteamos el
    // campo que falte, no pisamos datos válidos ya existentes.
    const dataUpdate = { estado_progreso: estado, updated_at: now };
    if (estado === "completada") {
      if (!act.fecha_termino_real) dataUpdate.fecha_termino_real = now;
      if (!act.hora_termino_real) dataUpdate.hora_termino_real = now;

      // Si la actividad venía en "en_progreso" y la arrastramos a
      // "completada", calculamos `tiempo_real_minutos` desde la fila
      // "en_progreso" ABIERTA en `actividad_estado_historial`
      // (Timestamptz correcto, NO Timetz). Esto evita el bug del diff
      // de 56 años que daba ~29.675.520 min en la card.
      //
      // Si la actividad venía en "pendiente" (arrastre directo sin
      // pasar por Iniciar), NO hay fila en_progreso y dejamos
      // `tiempo_real_minutos` sin tocar (la actividad nunca se
      // inició).
      if (act.estado_progreso === "en_progreso") {
        const enProgresoRow = await prisma.actividad_estado_historial.findFirst(
          {
            where: {
              actividad_id: idNum,
              estado_progreso: "en_progreso",
              fecha_fin: null,
            },
            orderBy: { id: "desc" },
            select: { fecha_inicio: true },
          },
        );
        if (enProgresoRow?.fecha_inicio) {
          const ini = new Date(enProgresoRow.fecha_inicio);
          const pausa = Number(act.pausa_minutos || 0);
          const duracionSeg = Math.max(
            0,
            Math.floor((now.getTime() - ini.getTime()) / 1000) - pausa * 60,
          );
          dataUpdate.tiempo_real_minutos = Math.max(
            0,
            Math.floor(duracionSeg / 60),
          );
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.actividades.update({
        where: { id: idNum },
        data: dataUpdate,
      });
      // Registrar la transición de estado en el historial. El helper se
      // ocupa de cerrar la fila abierta del estado anterior (si hay) y
      // abrir una nueva para `estado`. Antes este bloque solo insertaba
      // una fila cuando entraba a en_progreso; ahora se cubren los 3
      // estados (pendiente, en_progreso, completada) en cualquier
      // dirección del drag (incluye arrastre directo pendiente →
      // completada sin pasar por en_progreso).
      if (estado !== act.estado_progreso) {
        await ActividadEstadoHistorialService.transicion(
          tx,
          idNum,
          estado,
          now,
        );
      }
      // Contrato VALORADOR: al cerrar la actividad, recién aquí se
      // inserta el slot en `horario_usuario`. Para el resto de roles la
      // fila ya existe desde la creación.
      if (estado === "completada" && act.usuario_id) {
        const asig = await tx.usuarios.findUnique({
          where: { id: Number(act.usuario_id) },
          select: { rol_id: true, roles: { select: { nombre: true } } },
        });
        const isValorador =
          (asig && Number(asig.rol_id) === ROL_VALORADOR_ID) ||
          (asig &&
            String(asig.roles?.nombre || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[̀-ͯ]/g, "")
              .includes(ROL_VALORADOR));
        if (asig && isValorador) {
          // Upsert por (actividad_id, usuario_id).
          const fechaCierre = u.fecha_termino_real || now;
          const horaCierre = u.hora_termino_real || now;
          const horaInicio = act.hora_inicio_real || horaCierre;
          const duracion =
            u.tiempo_real_minutos != null ? Number(u.tiempo_real_minutos) : 0;
          const existing = await tx.horario_usuario.findFirst({
            where: {
              actividad_id: idNum,
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
                hora_fin: horaCierre,
                estado: true,
                tipo: "actividad",
                duracion_minutos: duracion,
                updated_at: now,
              },
            });
          } else {
            await tx.horario_usuario.create({
              data: {
                actividad_id: idNum,
                usuario_id: Number(act.usuario_id),
                fecha: fechaCierre,
                hora_inicio: horaInicio,
                hora_fin: horaCierre,
                estado: true,
                tipo: "actividad",
                duracion_minutos: duracion,
                created_at: now,
                updated_at: now,
              },
            });
          }
        }
      }
      return u;
    });

    // FIX: re-fetch de los campos de tiempo como ISO con offset preservado
    // para que la respuesta al cliente traiga `termino_real_iso` poblado
    // (sin esto, #shapeActividad recibe `tm=undefined` y los *_iso salen null).
    const timeMap = await this.#fetchTimeIso([updated.id]);
    const pendienteMap = await this.#fetchPendienteDesde([updated.id]);
    const inicioProgresoMap = await this.#fetchInicioEnProgreso([updated.id]);
    const registradoMap = await this.#fetchRegistradoPor([updated.id]);
    return this.#shapeActividad(
      updated,
      timeMap.get(updated.id),
      pendienteMap.get(updated.id),
      registradoMap.get(updated.id),
      inicioProgresoMap.get(updated.id),
    );
  }

  // ---- helpers ---------------------------------------------------------

  #emptyColumns() {
    return COL_KEYS.map((k) => ({
      key: k,
      label: k === "en_progreso" ? "En progreso" : k.charAt(0).toUpperCase() + k.slice(1),
      items: [],
    }));
  }

  // FIX QUIRÚRGICO Kanban: Prisma descarta el offset al leer columnas Timetz
  // y las devuelve como Date en hora UTC, lo que produce desfase de horas en
  // el display y en el calendario. Esta query cruda trae los campos de tiempo
  // ya formateados como strings ISO con el offset preservado
  // (ej: "2026-06-04T11:51:00-05"), que el frontend puede parsear con
  // new Date(iso) y formatear con toLocaleString en la zona del navegador.
  //
  // Devuelve solo `inicio` (programado) y `termino_real` (cierre real).
  // El `inicio_real` (cuándo se hizo click en "Iniciar") se obtiene por
  // separado de `actividad_estado_historial` (Timestamptz correcto) en
  // `#fetchInicioEnProgreso` y se inyecta al shape como
  // `inicio_en_progreso_iso` — esto unifica la fuente de verdad y evita
  // el bug del Timetz.
  async #fetchTimeIso(actividadIds) {
    if (!actividadIds.length) return new Map();
    const placeholders = actividadIds.map((_, i) => `$${i + 1}::int`).join(",");
    const sql = `
      SELECT
        id,
        CASE
          WHEN hora_inicio IS NULL THEN NULL
          ELSE to_char(fecha_inicio, 'YYYY-MM-DD') || 'T' || hora_inicio::text
        END AS inicio_str,
        CASE
          WHEN hora_termino_real IS NULL AND fecha_termino_real IS NULL THEN NULL
          ELSE
            to_char(COALESCE(fecha_termino_real, CURRENT_DATE), 'YYYY-MM-DD') || 'T' ||
            COALESCE(hora_termino_real::text, '00:00:00')
        END AS termino_real_str
      FROM actividades
      WHERE id IN (${placeholders})
    `;
    const rows = await prisma.$queryRawUnsafe(sql, ...actividadIds);
    const map = new Map();
    for (const r of rows) {
      map.set(r.id, {
        inicio: r.inicio_str,
        termino_real: r.termino_real_str,
      });
    }
    return map;
  }

  // Devuelve un Map<actividadId, Date> con la fecha_inicio de la fila
  // "pendiente" ABIERTA (fecha_fin IS NULL) en `actividad_estado_historial`.
  // Se usa para que la card de la columna Pendiente del Kanban muestre
  // hace cuánto está pendiente la actividad, NO la fecha asignada (que
  // puede ser futura). El Timestamptz se devuelve como Date UTC — el
  // frontend lo formatea en la zona del navegador.
  async #fetchPendienteDesde(actividadIds) {
    if (!actividadIds.length) return new Map();
    const rows = await prisma.actividad_estado_historial.findMany({
      where: {
        actividad_id: { in: actividadIds },
        estado_progreso: "pendiente",
        fecha_fin: null,
      },
      select: { actividad_id: true, fecha_inicio: true },
      orderBy: { id: "desc" },
    });
    const map = new Map();
    for (const r of rows) {
      // Si por alguna razón hubiera más de una fila abierta (no debería
      // pasar con el helper de transición), nos quedamos con la más
      // reciente (orderBy desc + check con !map.has).
      if (!map.has(r.actividad_id)) {
        map.set(r.actividad_id, r.fecha_inicio);
      }
    }
    return map;
  }

  // Devuelve un Map<actividadId, Date> con la fecha_inicio de la fila
  // "en_progreso" en `actividad_estado_historial`. Es la fuente de
  // verdad de CUÁNDO se INICIÓ la actividad (cuándo se hizo la
  // transición pendiente → en_progreso).
  //
  // Consideraciones:
  //   * No filtra por `fecha_fin IS NULL`: para actividades
  //     actualmente en "en_progreso" la fila está abierta (fecha_fin
  //     null); para actividades ya "completada" la fila está cerrada
  //     (fecha_fin = momento del cierre), pero `fecha_inicio` sigue
  //     siendo válido como "cuándo se inició". Esto permite que el
  //     modal de una actividad completada también muestre el inicio
  //     real correcto.
  //   * Para actividades que nunca se iniciaron (siguen en
  //     "pendiente") no hay fila en_progreso → no se llena el map.
  //   * Si por algún motivo una actividad tuviera más de una fila
  //     en_progreso en su vida (no debería pasar con el helper de
  //     transición, que cierra la anterior), nos quedamos con la
  //     PRIMERA (orderBy asc + check con !map.has).
  //
  // Por qué se prefiere a `actividades.hora_inicio_real` (Timetz):
  //   * `hora_inicio_real` es `Timetz`, Prisma descarta el offset al
  //     leerlo y lo devuelve como Date con año 1970 y la hora
  //     wall-clock como si fuera UTC. Esto produce un diff de ~56
  //     años si se resta de `now` y, peor, una hora de display
  //     incorrecta en la card (problema recurrente del fix
  //     quirúrgico de Timetz).
  //   * `actividad_estado_historial.fecha_inicio` es `Timestamptz`:
  //     Prisma lo lee correctamente con la zona absoluta.
  async #fetchInicioEnProgreso(actividadIds) {
    if (!actividadIds.length) return new Map();
    const rows = await prisma.actividad_estado_historial.findMany({
      where: {
        actividad_id: { in: actividadIds },
        estado_progreso: "en_progreso",
      },
      select: { actividad_id: true, fecha_inicio: true },
      orderBy: { id: "asc" },
    });
    const map = new Map();
    for (const r of rows) {
      // Nos quedamos con la PRIMERA fila en_progreso de la actividad
      // (la más antigua, que es el inicio original). Si no hay map
      // entry, la guardamos.
      if (!map.has(r.actividad_id)) {
        map.set(r.actividad_id, r.fecha_inicio);
      }
    }
    return map;
  }

  // Devuelve un Map<actividadId, {id, usuario, nombre}> con los datos
  // del usuario que REGISTRÓ cada actividad (columna
  // `actividades.usuario_register`).
  //
  // Se diferencia de `asignado_por`:
  //   * asignado_por   → usuario que ASIGNÓ la tarea (vive en
  //                      `historial_estados_prospecto` del prospecto, con
  //                      comentario "Actividad agregada"). Es histórico
  //                      del PROSPECTO.
  //   * registrado_por → usuario que HIZO POST de la actividad
  //                      (`usuario_register` en `actividades`). Es un
  //                      campo directo de la ACTIVIDAD, presente desde
  //                      la creación y/o al re-agendar.
  //
  // Se hace con raw SQL para evitar 2 round-trips: uno a `usuarios` y
  // otro a `personas`. El LEFT JOIN cubre el caso (raro) de que el
  // usuario no tenga persona asociada.
  async #fetchRegistradoPor(actividadIds) {
    if (!actividadIds.length) return new Map();
    const placeholders = actividadIds.map((_, i) => `$${i + 1}::int`).join(",");
    const sql = `
      SELECT
        a.id              AS actividad_id,
        u.id              AS usuario_id,
        u.usuario         AS usuario_username,
        p.nombres         AS persona_nombres,
        p.apellidos       AS persona_apellidos
      FROM actividades a
      LEFT JOIN usuarios u ON u.id = a.usuario_register
      LEFT JOIN personas p ON p.id = u.persona_id
      WHERE a.id IN (${placeholders})
    `;
    const rows = await prisma.$queryRawUnsafe(sql, ...actividadIds);
    const map = new Map();
    for (const r of rows) {
      // Si usuario_register es NULL, el LEFT JOIN trae nulls → no
      // guardamos nada en el map (el shape devolverá null).
      if (r.usuario_id == null) continue;
      const nombre = [r.persona_nombres, r.persona_apellidos]
        .filter(Boolean)
        .join(" ");
      map.set(r.actividad_id, {
        id: Number(r.usuario_id),
        usuario: r.usuario_username || null,
        nombre: nombre || r.usuario_username || null,
      });
    }
    return map;
  }

  #shapeActividad(
    a,
    tm = null,
    pendienteDesde = null,
    registradoPor = null,
    inicioEnProgreso = null,
  ) {
    const t = a.tarea;
    const tt = t?.tipo_tarea_tarea_tipo_tareaTotipo_tarea;
    const p = a.prospectos;
    // Primer contacto (JOIN prospecto_persona → personas).
    const primerContacto = p?.prospecto_persona?.[0]?.personas;
    const contacto = primerContacto
      ? {
          id: primerContacto.id,
          nombre: [primerContacto.nombres, primerContacto.apellidos]
            .filter(Boolean)
            .join(" "),
          email: primerContacto.email || null,
          celular: primerContacto.celular || null,
        }
      : null;
    // Última fila de historial "Actividad agregada" → usuario que asignó.
    const h = p?.historial_estados_prospecto?.[0];
    const asignadoPor = h?.usuarios
      ? {
          id: h.usuarios.id,
          usuario: h.usuarios.usuario,
          nombre: [
            h.usuarios.personas?.nombres,
            h.usuarios.personas?.apellidos,
          ]
            .filter(Boolean)
            .join(" "),
        }
      : null;
    return {
      id: a.id,
      tarea_id: a.tarea_id,
      tarea_nombre: t?.nombre || "(sin tarea)",
      tipo_tarea: tt?.tipo || "",
      prospecto_id: a.prospecto_id,
      prospecto_titulo: p?.titulo_prospecto || null,
      contacto,
      asignado_por: asignadoPor,
      // Usuario que REGISTRÓ la actividad (columna usuario_register en
      // `actividades`). Es distinto de asignado_por: asignado_por vive
      // en el historial del PROSPECTO; registrado_por vive en la propia
      // ACTIVIDAD. Puede ser null para actividades legacy.
      registrado_por: registradoPor || null,
      prioridad: a.prioridad || null,
      color: a.color || null,
      estado_progreso: a.estado_progreso || "pendiente",
      bloqueada: !!a.bloqueada,
      motivo_reprograma: a.motivo_reprograma || null,
      // Campos viejos (se mantienen para no romper consumidores externos,
      // pero el Kanban debe usar los *_iso de abajo).
      fecha_inicio: this.#ymd(a.fecha_inicio),
      hora_inicio: this.#hm(a.hora_inicio),
      fecha_inicio_real: this.#ymd(a.fecha_inicio_real),
      hora_inicio_real: this.#hm(a.hora_inicio_real),
      fecha_termino_real: this.#ymd(a.fecha_termino_real),
      hora_termino_real: this.#hm(a.hora_termino_real),
      // FIX QUIRÚRGICO: ISO con offset preservado (vía raw SQL).
      // El frontend los parsea con new Date(iso) y formatea con
      // toLocaleString en la zona del navegador del usuario.
      //
      // `inicio_iso`            → fecha/hora PROGRAMADA (asignada).
      // `inicio_en_progreso_iso`→ fecha/hora REAL de inicio (= cuándo
      //                          se hizo click en "Iniciar"). Viene de
      //                          `actividad_estado_historial`
      //                          (Timestamptz CORRECTO, no Timetz).
      //                          Reemplaza al viejo `inicio_real_iso`
      //                          que venía de `hora_inicio_real`
      //                          (Timetz con bug de offset).
      // `termino_real_iso`      → fecha/hora REAL de cierre.
      inicio_iso: tm?.inicio || null,
      inicio_en_progreso_iso: inicioEnProgreso
        ? new Date(inicioEnProgreso).toISOString()
        : null,
      termino_real_iso: tm?.termino_real || null,
      // Fecha en que la actividad entró a estado "pendiente" (de la fila
      // abierta en `actividad_estado_historial`). Sirve para que la card
      // de la columna Pendiente muestre hace cuánto está pendiente, no
      // la fecha en que fue asignada (que puede ser futura). El
      // Timestamptz se devuelve como ISO UTC; el frontend lo formatea
      // en la zona del navegador.
      pendiente_desde_iso: pendienteDesde
        ? new Date(pendienteDesde).toISOString()
        : null,
      tiempo_estimado_minutos: a.tiempo_estimado_minutos ?? null,
      tiempo_real_minutos: a.tiempo_real_minutos ?? null,
      pausa_minutos: a.pausa_minutos ?? 0,
    };
  }

  #ymd(d) {
    if (!d) return null;
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return null;
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  // Acepta tanto `Date` como string "HH:MM:SS" / "HH:MM" y devuelve "HH:MM".
  #hm(t) {
    if (!t) return null;
    if (typeof t === "string") {
      const m = t.match(/^(\d{1,2}):(\d{2})/);
      if (m) return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
      return null;
    }
    const x = new Date(t);
    if (Number.isNaN(x.getTime())) return null;
    const h = String(x.getHours()).padStart(2, "0");
    const mi = String(x.getMinutes()).padStart(2, "0");
    return `${h}:${mi}`;
  }
}

export default new KanbanService();
