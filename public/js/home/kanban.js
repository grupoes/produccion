/* global $, bootstrap, FullCalendar, Swal, Sortable */
$(function () {
  const API_MIAS = "/api/kanban/mias";
  const API_MOVER = (id) => `/api/kanban/mover/${id}`;
  const API_START = (id) => `/api/actividades/${id}/start`;
  const API_END = (id) => `/api/actividades/${id}/end`;

  // Estado en memoria
  let DATA = { usuario: null, columnas: [] };
  let CURRENT_VIEW = "board"; // 'board' | 'calendar'
  let calendar = null;

  // Guard defensivo: si Swal no cargó, degradar a console.
  const SwalSafe = window.Swal || null;
  const Toast = SwalSafe
    ? SwalSafe.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2500,
        timerProgressBar: true,
      })
    : null;
  function toast(msg, type = "success") {
    if (Toast) {
      const icon =
        type === "success" ? "success" : type === "error" ? "error" : "info";
      Toast.fire({ icon, title: msg });
    } else {
      // eslint-disable-next-line no-console
      console[type === "error" ? "error" : "log"]("[kanban]", msg);
    }
  }
  function confirmDialog(opts) {
    if (!SwalSafe) return Promise.resolve({ isConfirmed: true });
    return SwalSafe.fire(opts);
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // FIX QUIRÚRGICO: formatea un string ISO (con offset, devuelto por
  // kanban.service.js) a "dd-MM-yyyy HH:mm:ss" en la zona del navegador
  // del usuario. Antes usaba fecha_inicio + hora_inicio por separado, que
  // perdía el offset de la DB y mostraba la hora desfasada para usuarios
  // fuera del país.
  // Helper de fallback: si no tenemos el *_iso, armamos un ISO local
  // combinando fecha "YYYY-MM-DD" + hora "HH:mm[:ss]" para que new Date()
  // lo parsee como hora local del navegador. Devuelve null si falta data.
  function legacyJoinIso(fecha, hora) {
    if (!fecha) return null;
    const f = String(fecha).slice(0, 10);
    const h = hora ? String(hora).slice(0, 8) : "00:00:00";
    return `${f}T${h}`;
  }

  function formatDmyHis(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    // toLocaleString usa la zona del navegador → cada usuario ve su hora.
    return d.toLocaleString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  // Variante compacta de `formatDmyHis` con formato fijo
  // `dd-MM-yyyy HH:mm:ss` (guiones, sin coma, 24h). Usa los métodos
  // `getDate/getMonth/getFullYear/getHours/getMinutes/getSeconds` con
  // padding a 2 dígitos, así el formato es independiente del locale
  // del navegador (a diferencia de `toLocaleString` que produce
  // `dd/MM/yyyy, HH:mm:ss` en es-CO).
  //
  // Se usa solo en la card de la columna "En progreso" (la única
  // donde el usuario pidió explícitamente este formato). El resto
  // del Kanban sigue con `formatDmyHis` para mantener consistencia.
  function formatDmyHisShort(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
  }

  // Formatea solo la hora "HH:mm:ss" a partir de un ISO. Para compactar el
  // meta de la card cuando ya mostramos la fecha entera en otra línea.
  function formatHm(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  // ---- Filtros ---------------------------------------------------------
  const filters = {
    tipo: "",
    prioridad: "",
    estado: "",
    from: "",
    to: "",
  };

  function getFilters() {
    filters.tipo = $("#js-f-tipo").val() || "";
    filters.prioridad = $("#js-f-prio").val() || "";
    filters.estado = $("#js-f-estado").val() || "";
    filters.from = $("#js-f-from").val() || "";
    filters.to = $("#js-f-to").val() || "";
    return filters;
  }

  // Aplica los filtros a la lista plana de actividades.
  function applyFilters(actividades) {
    getFilters();
    const f = filters;
    return actividades.filter((a) => {
      if (f.estado && a.estado_progreso !== f.estado) return false;
      if (f.prioridad && (a.prioridad || "") !== f.prioridad) return false;
      if (f.tipo === "REUNION") {
        if (!/reunion/i.test(a.tipo_tarea || "")) return false;
      } else if (f.tipo === "OTROS") {
        if (/reunion/i.test(a.tipo_tarea || "")) return false;
      }
      if (f.from) {
        // Consideramos "fecha relevante" = fecha_inicio, fecha_inicio_real o fecha_termino_real
        const relevantes = [a.fecha_inicio, a.fecha_inicio_real, a.fecha_termino_real]
          .filter(Boolean);
        if (relevantes.length === 0) return false;
        const desde = f.from;
        if (!relevantes.some((r) => r >= desde)) return false;
      }
      if (f.to) {
        const relevantes = [a.fecha_inicio, a.fecha_inicio_real, a.fecha_termino_real]
          .filter(Boolean);
        if (relevantes.length === 0) return false;
        const hasta = f.to;
        if (!relevantes.some((r) => r <= hasta)) return false;
      }
      return true;
    });
  }

  function allItems() {
    const cols = DATA.columnas || [];
    const all = [];
    cols.forEach((c) => c.items.forEach((it) => all.push(it)));
    return all;
  }

  // ---- Fetch -----------------------------------------------------------
  async function loadMias({ includeCompleted = true } = {}) {
    try {
      const params = new URLSearchParams();
      if (!includeCompleted) params.set("includeCompleted", "0");
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      const url = params.toString() ? `${API_MIAS}?${params}` : API_MIAS;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      DATA = json.data || { usuario: null, columnas: [] };
      if (DATA.usuario) {
        const nombre =
          [DATA.usuario.nombres, DATA.usuario.apellidos].filter(Boolean).join(" ") ||
          DATA.usuario.usuario ||
          "Valorador";
        $("#js-kanban-user").text(nombre);
      }
    } catch (err) {
      console.error(err);
      toast(err.message || "No se pudieron cargar las tareas.", "error");
    }
  }

  // ---- Render: Tablero -------------------------------------------------
  function prioClass(p) {
    const k = (p || "").toLowerCase();
    if (k === "alta") return "prio-alta";
    if (k === "media") return "prio-media";
    if (k === "baja") return "prio-baja";
    return "";
  }

  function cardHtml(a) {
    const prio = a.prioridad || "—";
    const isCompletada = a.estado_progreso === "completada";
    // Reglas de fecha a mostrar:
    //   - Pendiente: fecha y hora en que la actividad entró a estado
    //     pendiente (= cuándo se creó / reasignó), traída de
    //     `actividad_estado_historial` (`pendiente_desde_iso`). Le dice
    //     al VALORADOR hace cuánto está en su cola pendiente (no la
    //     fecha asignada, que puede ser futura). Fallback a la
    //     asignada si el historial no tiene fila (ej. data legacy).
    //   - En progreso: fecha y hora de INICIO real (= cuándo se hizo
    //     click en "Iniciar" / cuándo se transicionó a en_progreso),
    //     traída de `actividad_estado_historial`
    //     (`inicio_en_progreso_iso`). Es Timestamptz correcto, no el
    //     Timetz con bug de offset. Fallback al asignado por si la
    //     data es legacy.
    //   - Completada: fecha y hora REAL de cierre (`termino_real_iso`),
    //     con cadena de fallback por si la data está parcial.
    let fechaIso = null;
    let fechaLabel = "Asignada";
    let fechaIcono = "ti-calendar";
    let fechaEstado = "asignada";
    // En la columna "En progreso" el usuario pidió explícitamente
    // formato `dd-MM-yyyy HH:mm:ss` (guiones, sin coma). Las otras
    // columnas siguen con `formatDmyHis` (toLocaleString) para
    // mantener consistencia con el resto del Kanban.
    let fechaFormatter = formatDmyHis;
    if (isCompletada) {
      fechaIso = a.termino_real_iso
        || a.inicio_en_progreso_iso
        || a.inicio_iso
        || legacyJoinIso(a.fecha_termino_real, a.hora_termino_real)
        || legacyJoinIso(a.fecha_inicio, a.hora_inicio);
      if (fechaIso) {
        fechaLabel = "Cerrada";
        fechaIcono = a.termino_real_iso ? "ti-circle-check" : "ti-calendar";
        fechaEstado = "cerrada";
      }
    } else if (a.estado_progreso === "pendiente") {
      fechaIso = a.pendiente_desde_iso
        || a.inicio_iso
        || legacyJoinIso(a.fecha_inicio, a.hora_inicio);
      if (a.pendiente_desde_iso) {
        fechaLabel = "Pendiente desde";
      } else {
        fechaLabel = "Asignada";
      }
    } else {
      // en_progreso: priorizamos el inicio real de
      // `actividad_estado_historial` (Timestamptz correcto). Si por
      // algún motivo no hay fila (ej. data legacy sin historial),
      // caemos al asignado. Usamos `formatDmyHisShort` para producir
      // exactamente `dd-MM-yyyy HH:mm:ss` (formato que pidió el
      // usuario para esta columna).
      fechaIso = a.inicio_en_progreso_iso
        || a.inicio_iso
        || legacyJoinIso(a.fecha_inicio, a.hora_inicio);
      fechaLabel = "Inicio";
      fechaIcono = "ti-player-play";
      fechaEstado = "asignada";
      fechaFormatter = formatDmyHisShort;
    }
    const fecha = fechaFormatter(fechaIso);
    // Fila destacada con la fecha/hora (es la info que el VALORADOR
    // más mira en la columna Pendiente: cuándo le toca trabajar).
    const fechaRow = fechaIso
      ? `<div class="kanban-card-date is-${fechaEstado}">
           <i class="ti ${fechaIcono}"></i>
           <span class="kanban-date-label">${fechaLabel}</span>
           <span class="kanban-date-value">${escapeHtml(fecha)}</span>
         </div>`
      : "";
    const prospectoLinea = a.prospecto_titulo
      ? `<div class="kanban-card-sub">
           <i class="ti ti-briefcase"></i> ${escapeHtml(a.prospecto_titulo)}
         </div>`
      : "";
    const contacto = a.contacto
      ? `<div class="kanban-card-sub">
           <i class="ti ti-phone"></i> ${escapeHtml(a.contacto.nombre || "Sin nombre")}
           ${a.contacto.celular
             ? `<span class="text-muted ms-1">· ${escapeHtml(a.contacto.celular)}</span>`
             : ""}
         </div>`
      : "";
    const asignadoPor = a.asignado_por
      ? `<div class="kanban-card-sub">
           <i class="ti ti-user-check"></i> Asignado por: <strong>${escapeHtml(
             a.asignado_por.nombre || a.asignado_por.usuario || "—",
           )}</strong>
         </div>`
      : "";
    // "Registrado por" viene de `actividades.usuario_register`. Es
    // distinto de "Asignado por" (que sale del historial del prospecto):
    // indica el usuario de la sesión que hizo POST al crear o re-agendar
    // la actividad. Para actividades legacy puede ser null.
    const registradoPor = a.registrado_por
      ? `<div class="kanban-card-sub">
           <i class="ti ti-user-plus"></i> Registrado por: <strong>${escapeHtml(
             a.registrado_por.nombre || a.registrado_por.usuario || "—",
           )}</strong>
         </div>`
      : "";
    const bloqueadaBadge = a.bloqueada
      ? '<span class="badge bg-danger-subtle text-danger ms-1"><i class="ti ti-lock"></i> Bloqueada</span>'
      : "";
    let actions = "";
    if (a.bloqueada) {
      actions = `<div class="kanban-card-actions">
        <button class="btn btn-light btn-sm" disabled title="${escapeHtml(
          a.motivo_reprograma || "Actividad bloqueada",
        )}">
          <i class="ti ti-lock"></i> No editable
        </button>
      </div>`;
    } else if (a.estado_progreso === "pendiente") {
      actions = `<div class="kanban-card-actions">
        <button class="btn btn-success btn-sm js-start" data-id="${a.id}">
          <i class="ti ti-player-play"></i> Iniciar
        </button>
        <button class="btn btn-light btn-sm js-detail" data-id="${a.id}">
          <i class="ti ti-eye"></i>
        </button>
      </div>`;
    } else if (a.estado_progreso === "en_progreso") {
      actions = `<div class="kanban-card-actions">
        <button class="btn btn-danger btn-sm js-end" data-id="${a.id}">
          <i class="ti ti-player-stop"></i> Terminar
        </button>
        <button class="btn btn-light btn-sm js-detail" data-id="${a.id}">
          <i class="ti ti-eye"></i>
        </button>
      </div>`;
    } else {
      actions = `<div class="kanban-card-actions">
        <button class="btn btn-light btn-sm js-detail" data-id="${a.id}">
          <i class="ti ti-eye"></i> Ver
        </button>
      </div>`;
    }

    return `
      <div class="kanban-card ${a.bloqueada ? "is-bloqueada" : ""}" data-id="${a.id}">
        <div class="kanban-card-title">${escapeHtml(a.tarea_nombre || "(sin tarea)")}</div>
        ${fechaRow}
        ${prospectoLinea}
        ${contacto}
        ${asignadoPor}
        ${registradoPor}
        <div class="kanban-card-meta">
          <span class="kanban-card-prio ${prioClass(a.prioridad)}">${escapeHtml(prio)}</span>
          ${a.tiempo_real_minutos
            ? // Mostramos minutos + fecha de cierre en el mismo badge
              // para que la card sea self-contained: la fechaRow de
              // arriba ya tiene la hora, pero el meta resume
              // "cuánto tardó y cuándo se cerró" en una sola línea.
              // La fecha viene de `termino_real_iso` (Timestamptz vía
              // #fetchTimeIso, con offset preservado).
              `<span class="text-success"><i class="ti ti-check"></i> ${a.tiempo_real_minutos} min real${a.termino_real_iso ? ` · ${formatDmyHis(a.termino_real_iso)}` : ""}</span>`
            : ""}
          ${bloqueadaBadge}
        </div>
        ${actions}
      </div>
    `;
  }

  function renderBoard() {
    const items = applyFilters(allItems());
    // Agrupar filtradas por estado_progreso
    const buckets = { pendiente: [], en_progreso: [], completada: [] };
    items.forEach((a) => {
      const k = buckets[a.estado_progreso] ? a.estado_progreso : "pendiente";
      buckets[k].push(a);
    });

    const colsHtml = ["pendiente", "en_progreso", "completada"]
      .map((k) => {
        const label = k === "en_progreso" ? "En progreso" : k.charAt(0).toUpperCase() + k.slice(1);
        const cards = buckets[k].map(cardHtml).join("");
        return `
          <div class="kanban-col" data-col="${k}">
            <div class="kanban-col-header">
              <span class="kanban-col-title">${label}</span>
              <span class="kanban-col-count">${buckets[k].length}</span>
            </div>
            <div class="kanban-col-body" data-drop="${k}">
              ${cards || `<div class="kanban-empty">Sin actividades</div>`}
            </div>
          </div>
        `;
      })
      .join("");

    $("#js-kanban-board").html(colsHtml);
    initSortables();
  }

  function initSortables() {
    document.querySelectorAll(".kanban-col-body").forEach((el) => {
      Sortable.create(el, {
        group: "kanban",
        animation: 150,
        ghostClass: "sortable-ghost",
        filter: ".kanban-empty, .is-bloqueada",
        preventOnFilter: true,
        onEnd: async (evt) => {
          const card = evt.item;
          const id = Number(card.dataset.id);
          const toCol = evt.to.dataset.drop;
          if (!id || !toCol) return;
          await moverActividad(id, toCol);
        },
      });
    });
  }

  async function moverActividad(id, estadoProgreso) {
    try {
      const res = await fetch(API_MOVER(id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_progreso: estadoProgreso }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al mover.");
      toast("Tarea movida a “" + humanEstado(estadoProgreso) + "”");
      // Re-fetch para reflejar el cambio de estado
      await loadMias();
      renderBoard();
      if (CURRENT_VIEW === "calendar") reloadCalendar();
    } catch (err) {
      toast(err.message || "No se pudo mover la tarea.", "error");
      // Restaurar visualmente: recargar
      await loadMias();
      renderBoard();
    }
  }

  function humanEstado(k) {
    if (k === "en_progreso") return "En progreso";
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  // ---- Render: Calendario ---------------------------------------------
  function parseIsoSafe(s) {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Mínimo de minutos para pintar un evento visiblemente. Actividades
  // muy cortas (<5 min) se inflan a 5 min para que el bloque no
  // desaparezca visualmente en la vista semana. NO confundir con la
  // duración REAL — el `Math.max(15, …)` previo inflaba hasta 3× una
  // tarea de 5 min y rompía la percepción del tiempo en pantalla.
  const FC_MIN_VISIBLE_MIN = 5;

  function buildCalendarEvents(items) {
    const events = [];
    items.forEach((a) => {
      // 1) Programado (si hay inicio_iso con offset preservado)
      const dProg = parseIsoSafe(a.inicio_iso);
      if (dProg) {
        const start = a.inicio_iso;
        // Para el fin programado: usamos el tiempo estimado del backend
        // (campo `tiempo_estimado_minutos` en `actividades`). Si es null
        // o <= 0, default 30 min. Mínimo visual FC_MIN_VISIBLE_MIN.
        const estMins = Number(a.tiempo_estimado_minutos) || 30;
        const mins = Math.max(FC_MIN_VISIBLE_MIN, estMins);
        const end = new Date(dProg.getTime() + mins * 60_000).toISOString();
        events.push({
          id: `prog-${a.id}`,
          title: `🕒 ${a.tarea_nombre || "(sin tarea)"}`,
          start,
          end,
          classNames: ["fc-event-prog"],
          extendedProps: { actividad: a, kind: "prog" },
        });
      } else if (a.inicio_iso) {
        console.warn(
          `[kanban] Actividad ${a.id} tiene inicio_iso inválido:`,
          a.inicio_iso,
        );
      }
      // 2) Real (si tiene inicio_en_progreso_iso con offset preservado,
      //    viene de `actividad_estado_historial` Timestamptz — NO del
      //    Timetz de `actividades.hora_inicio_real` que tenía bug de
      //    offset).
      const dReal = parseIsoSafe(a.inicio_en_progreso_iso);
      if (dReal) {
        const startR = a.inicio_en_progreso_iso;
        let endR = null;
        if (a.termino_real_iso) {
          // Cerrada: usar el timestamp real de cierre tal cual.
          endR = a.termino_real_iso;
        } else if (a.estado_progreso === "en_progreso") {
          // En curso: proyectar fin a now + 15 min (en zona del
          // navegador) para que la barra sea visible y proporcional
          // al tiempo que lleva. Antes era 30 min hardcodeado, lo que
          // generaba bloques enormes para actividades recién
          // iniciadas.
          endR = new Date(Date.now() + 15 * 60_000).toISOString();
        } else {
          // Fallback genérico: usar el tiempo real del backend si
          // existe; si no, 15 min. Mínimo FC_MIN_VISIBLE_MIN.
          const realMins = Number(a.tiempo_real_minutos) || 15;
          const mins = Math.max(FC_MIN_VISIBLE_MIN, realMins);
          endR = new Date(dReal.getTime() + mins * 60_000).toISOString();
        }
        events.push({
          id: `real-${a.id}`,
          title:
            a.estado_progreso === "completada"
              ? `✔ ${a.tarea_nombre || "(sin tarea)"}`
              : a.estado_progreso === "en_progreso"
                ? `▶ ${a.tarea_nombre || "(sin tarea)"} (en curso)`
                : `• ${a.tarea_nombre || "(sin tarea)"}`,
          start: startR,
          end: endR,
          classNames: [
            a.estado_progreso === "completada"
              ? "fc-event-real-completed"
              : a.estado_progreso === "en_progreso"
                ? "fc-event-real-progress"
                : "fc-event-real-pending",
          ],
          extendedProps: { actividad: a, kind: "real" },
        });
      }
      // Actividades sin hora (solo fecha) como evento todo el dia
      if (!dProg && !dReal) {
        var soloFecha = a.fecha_inicio;
        if (!soloFecha && a.pendiente_desde_iso) soloFecha = a.pendiente_desde_iso.slice(0, 10);
        if (!soloFecha && a.inicio_iso) soloFecha = a.inicio_iso.slice(0, 10);
        if (soloFecha) {
          events.push({
            id: "date-" + a.id,
            title: a.tarea_nombre || "(sin tarea)",
            start: soloFecha,
            allDay: true,
            classNames: ["fc-event-real-pending"],
            extendedProps: { actividad: a, kind: "date" },
          });
        }
      }
    });
    return events;
  }

  function addMinToIso(iso, mins) {
    try {
      const d = new Date(iso);
      d.setMinutes(d.getMinutes() + Number(mins || 0));
      return d.toISOString();
    } catch (e) {
      return iso;
    }
  }

  function initCalendar() {
    if (calendar) return;
    const el = document.getElementById("kanban-calendar");
    calendar = new FullCalendar.Calendar(el, {
      initialView: "timeGridWeek",
      locale: "es",
      firstDay: 1,
      slotMinTime: "07:00:00",
      slotMaxTime: "20:00:00",
      slotDuration: "00:30:00",
      slotLabelInterval: "01:00",
      allDaySlot: true,
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "timeGridWeek,timeGridDay,dayGridMonth",
      },
      buttonText: {
        today: "Hoy",
        month: "Mes",
        week: "Semana",
        day: "Día",
      },
      height: "auto",
      contentHeight: "auto",
      eventDidMount: function (info) {
        const a = info.event.extendedProps.actividad;
        const k = info.event.extendedProps.kind;
        const mins = a.tiempo_real_minutos
          ? ` · ${a.tiempo_real_minutos} min reales`
          : "";
        const prio = a.prioridad ? ` [${a.prioridad}]` : "";
        const kindLabel = k === "prog" ? "Programado" : k === "date" ? "Solo fecha" : "Real";
        info.el.title = `${a.tarea_nombre}${prio}\n${a.prospecto_titulo || "Sin prospecto"}${mins}\n(${kindLabel})`;
      },
      eventClick: function (info) {
        const a = info.event.extendedProps.actividad;
        openActModal(a);
      },
    });
    calendar.render();
    renderCalendarEvents();
  }

  function renderCalendarEvents() {
    if (!calendar) return;
    const items = applyFilters(allItems());
    const events = buildCalendarEvents(items);
    calendar.getEvents().forEach(function(e) { e.remove(); });
    events.forEach(function(ev) { calendar.addEvent(ev); });
  }

  function reloadCalendar() {
    renderCalendarEvents();
  }
  // ---- Modal detalle ---------------------------------------------------
  function openActModal(a) {
    const asignadoPor = a.asignado_por
      ? a.asignado_por.nombre || a.asignado_por.usuario || "—"
      : "—";
    const registradoPor = a.registrado_por
      ? a.registrado_por.nombre || a.registrado_por.usuario || "—"
      : "—";
    const contactoLinea = a.contacto
      ? [
          a.contacto.nombre || "—",
          a.contacto.celular ? `· ${a.contacto.celular}` : null,
          a.contacto.email ? `· ${a.contacto.email}` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : "—";
    const rows = [
      ["Tarea", a.tarea_nombre],
      ["Tipo de tarea", a.tipo_tarea || "—"],
      ["Prospecto", a.prospecto_titulo || "—"],
      ["Contacto", contactoLinea],
      ["Asignado por", asignadoPor],
      ["Registrado por", registradoPor],
      ["Prioridad", a.prioridad || "—"],
      ["Estado", humanEstado(a.estado_progreso)],
      ["Fecha programada", formatDmyHis(a.inicio_iso)],
      // Inicio real: viene de `actividad_estado_historial`
      // (Timestamptz correcto) en vez del Timetz con bug de offset.
      ["Inicio real", formatDmyHis(a.inicio_en_progreso_iso)],
      // Término real: cadena de fallback para que NUNCA salga "—"
      // cuando la actividad está cerrada:
      //   1) termino_real_iso → viene de `termino_real` (SQL con
      //      `to_char(fecha_termino_real, ...) || 'T' || hora_termino_real::text`),
      //      fuente principal.
      //   2) legacyJoinIso(fecha_termino_real, hora_termino_real) →
      //      concatenación de los campos crudos sin SQL (defensa para
      //      data legacy donde el SQL podría no traer la fila).
      //   3) inicio_en_progreso_iso → última línea de defensa: si
      //      por algún motivo no se seteó fecha_termino_real, usamos
      //      el inicio como aproximación del cierre.
      ["Término real", formatDmyHis(
        a.termino_real_iso
        || legacyJoinIso(a.fecha_termino_real, a.hora_termino_real)
        || a.inicio_en_progreso_iso
      )],
      ["Tiempo real", a.tiempo_real_minutos ? a.tiempo_real_minutos + " min" : "—"],
    ];
    if (a.bloqueada) rows.push(["Bloqueada", a.motivo_reprograma || "Sí"]);

    $("#js-act-modal-title").text(`Actividad #${a.id}`);
    $("#js-act-modal-body").html(`
      <dl class="row mb-0">
        ${rows
          .map(
            ([k, v]) =>
              `<dt class="col-5 text-muted fw-normal small">${escapeHtml(k)}</dt><dd class="col-7">${escapeHtml(String(v))}</dd>`,
          )
          .join("")}
      </dl>
    `);
    if (a.prospecto_id) {
      $("#js-act-modal-link")
        .attr("href", `/potenciales-clientes?id=${a.prospecto_id}`)
        .show();
    } else {
      $("#js-act-modal-link").hide();
    }
    const m = bootstrap.Modal.getOrCreateInstance(document.getElementById("js-act-modal"));
    m.show();

    // Si la actividad tiene prospecto, cargamos el historial del
    // prospecto (timeline con re-agendas, agregadas, conversión, etc.).
    if (a.prospecto_id) {
      loadHistorial(a.prospecto_id);
    } else {
      $("#js-act-historial-wrap").hide();
    }
  }

  // Carga y renderiza el historial del prospecto en el modal. Se hace
  // con fetch asíncrono para no bloquear la apertura del modal; si el
  // usuario cierra antes de que llegue, igual actualizamos el DOM
  // (estaría oculto detrás del backdrop, así que es inocuo).
  async function loadHistorial(prospectoId) {
    const $wrap = $("#js-act-historial-wrap");
    const $body = $("#js-act-historial-body");
    const $count = $("#js-act-historial-count");
    $wrap.show();
    $body.html(
      '<div class="text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Cargando historial…</div>',
    );
    $count.text("");
    try {
      const res = await fetch(
        `/api/potenciales-clientes/${encodeURIComponent(prospectoId)}/historial`,
        { headers: { Accept: "application/json" } },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      const items = Array.isArray(json.data) ? json.data : [];
      if (items.length === 0) {
        $body.html(
          '<div class="text-muted small">Sin movimientos registrados.</div>',
        );
        return;
      }
      $count.text(`(${items.length})`);
      $body.html(items.map(historialItemHtml).join(""));
    } catch (err) {
      $body.html(
        `<div class="text-danger small">No se pudo cargar el historial: ${escapeHtml(
          err.message || "Error",
        )}</div>`,
      );
    }
  }

  // Render de un movimiento del historial. Diferencia visualmente las
  // re-agendas (ámbar), las agregadas (verde) y la conversión a cliente
  // (índigo); el resto usa el color neutro del timeline.
  function historialItemHtml(h) {
    const fecha = h.fecha_inicio
      ? new Date(h.fecha_inicio).toLocaleString("es-PE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
    const usuario = h.usuario
      ? h.usuario.nombre || h.usuario.usuario || "—"
      : "—";
    const icon = h.es_reasignada
      ? "ti ti-calendar-time"
      : h.es_agregada
        ? "ti ti-circle-plus"
        : h.estado && h.estado.toLowerCase() === "cliente"
          ? "ti ti-badge-check"
          : "ti ti-circle-dot";
    const cls = h.es_reasignada
      ? "is-reasignada"
      : h.es_agregada
        ? "is-agregada"
        : h.estado && h.estado.toLowerCase() === "cliente"
          ? "is-cliente"
          : "";
    const comentario = h.comentario
      ? escapeHtml(h.comentario)
      : `<em class="text-muted">${escapeHtml(h.estado || "(sin comentario)")}</em>`;
    return `
      <div class="kanban-historial-item ${cls}">
        <i class="${icon} me-1 text-muted"></i>${comentario}
        <div class="kanban-historial-meta">
          <i class="ti ti-user"></i> ${escapeHtml(usuario)} ·
          <i class="ti ti-clock"></i> ${escapeHtml(fecha)}
        </div>
      </div>
    `;
  }

  // ---- Acciones Iniciar / Terminar ------------------------------------
  async function startActividad(id) {
    try {
      const res = await fetch(API_START(id), { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      toast("Tarea iniciada.");
      await loadMias();
      renderBoard();
      if (CURRENT_VIEW === "calendar") reloadCalendar();
    } catch (err) {
      toast(err.message || "No se pudo iniciar.", "error");
    }
  }

  async function endActividad(id) {
    try {
      const ok = await confirmDialog({
        title: "¿Terminar esta tarea?",
        text: "Se registrará el tiempo real y se moverá a Completada.",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, terminar",
        cancelButtonText: "Cancelar",
        reverseButtons: true,
        focusCancel: true,
      }).then((r) => r.isConfirmed);
      if (!ok) return;
      const res = await fetch(API_END(id), { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      const mins = json.duracion_minutos ?? 0;
      toast(`Tarea completada (${mins} min).`);
      await loadMias();
      renderBoard();
      if (CURRENT_VIEW === "calendar") reloadCalendar();
    } catch (err) {
      toast(err.message || "No se pudo terminar.", "error");
    }
  }

  // ---- Toggle vistas ---------------------------------------------------
  function setView(v) {
    CURRENT_VIEW = v;
    if (v === "board") {
      $("#js-view-board").addClass("active");
      $("#js-view-calendar").removeClass("active");
      $("#js-kanban-view").show();
      $("#js-calendar-view").hide();
      $("#js-f-date-wrap").hide();
      $("#js-f-date-wrap2").hide();
    } else {
      $("#js-view-calendar").addClass("active");
      $("#js-view-board").removeClass("active");
      $("#js-kanban-view").hide();
      $("#js-calendar-view").show();
      $("#js-f-date-wrap").show();
      $("#js-f-date-wrap2").show();
      // Inicializar calendario (lazy) y recargar
      if (!calendar) initCalendar();
      reloadCalendar();
    }
  }

  // ---- Eventos ---------------------------------------------------------
  $("#js-view-board").on("click", () => setView("board"));
  $("#js-view-calendar").on("click", () => setView("calendar"));

  $("#js-f-tipo, #js-f-prio, #js-f-estado, #js-f-from, #js-f-to").on(
    "change",
    () => {
      renderBoard();
      if (CURRENT_VIEW === "calendar") reloadCalendar();
    },
  );

  $("#js-f-clear").on("click", () => {
    $("#js-f-tipo").val("");
    $("#js-f-prio").val("");
    $("#js-f-estado").val("");
    $("#js-f-from").val("");
    $("#js-f-to").val("");
    renderBoard();
    if (CURRENT_VIEW === "calendar") reloadCalendar();
  });

  // Delegación para botones de las tarjetas
  $(document).on("click", ".js-start", function () {
    startActividad(Number($(this).data("id")));
  });
  $(document).on("click", ".js-end", function () {
    endActividad(Number($(this).data("id")));
  });
  $(document).on("click", ".js-detail", function () {
    const id = Number($(this).data("id"));
    const a = allItems().find((x) => x.id === id);
    if (a) openActModal(a);
  });

  // ---- Init ------------------------------------------------------------
  (async function init() {
    await loadMias();
    renderBoard();
  })();
});
