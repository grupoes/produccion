// ============================================================================
// Calendario del Asistente de Producción (rol_id=11).
// ----------------------------------------------------------------------------
// Carga:
//   * Lista de usuarios (excluyendo rol_id=1 por defecto) para el <select>
//     del header.
//   * Lista de tareas de tipo REUNION para el sidebar izquierdo.
//   * Inicializa FullCalendar (que viene cargado por el layout vía el
//     bloque `script` al final del body).
//
// Modos soportados:
//   * Ver reuniones (sidebar + calendario filtrado por usuario del header).
//   * Detalle de reunión (modal con prospecto, tarea, prioridad, estado,
//     fecha, hora, duración, motivo, contactos).
//   * Reprogramar (drag&drop sobre el calendario o botón "Reprogramar" en
//     el modal de detalle). PATCH /api/calendario-asistente/reuniones/:id
//     con el algoritmo del scheduler. Si no entra, devuelve 409 con
//     `overflow.suggest()` (otros usuarios con hueco, horas extras, mover
//     deadline).
//   * Reasignar (modal con select poblado con los 5 mejores candidatos del
//     overflow para esa fecha/hora/duración).
//   * Nueva reunión (modal con autocomplete de prospectos, tarea filtrada a
//     REUNION, usuario asignado default = el del select del header).
//   * Eliminar (baja lógica en actividades + horario_usuario).
// ============================================================================
(function () {
  const selUsuarios = document.getElementById("js-cal-user");
  const listReuniones = document.getElementById("js-cal-reuniones-list");
  const countReuniones = document.getElementById("js-cal-reuniones-count");
  const btnNewReunion = document.getElementById("js-cal-new-reunion");

  // -------- helpers --------------------------------------------------
  const escapeHtml = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const fetchJSON = async (url, opts) => {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      ...(opts || {}),
    });
    if (!res.ok) {
      let detail = "";
      let payload = null;
      try {
        payload = await res.json();
        detail = payload?.error || "";
      } catch (_) {
        /* noop */
      }
      const err = new Error(`HTTP ${res.status} ${detail}`.trim());
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return res.json();
  };

  const getModal = (id) => {
    const el = document.getElementById(id);
    if (!el || !window.bootstrap) return null;
    return window.bootstrap.Modal.getOrCreateInstance(el);
  };

  const showToast = (icon, title) => {
    if (!window.Swal) return;
    window.Swal.fire({
      icon,
      title,
      toast: true,
      position: "top-end",
      timer: 2500,
      showConfirmButton: false,
    });
  };

  const confirmDialog = (title, text, confirmText = "Sí, continuar") => {
    if (!window.Swal) {
      return Promise.resolve(window.confirm(`${title}\n\n${text || ""}`));
    }
    return window.Swal.fire({
      title,
      text: text || "",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: "Cancelar",
    }).then((r) => !!r.isConfirmed);
  };

  const todayLocalYYYYMMDD = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  // Resuelve los defaults de fecha+hora para el modal "Programar" a
  // partir del historial de `horario_usuario` del usuario seleccionado.
  // Si tiene bloques registrados, usa la fecha del ÚLTIMO bloque y la
  // HORA FIN de ese bloque (la hora en que terminó la última actividad)
  // — así la nueva actividad se "engancha" justo después.
  // Si NO tiene ninguno, deja hoy como fecha y un string vacío para que
  // el usuario elija manualmente la hora.
  //
  // Acepta los ids de los inputs de fecha y hora como parámetros para
  // poder reusarse desde el modal principal ("Programar", tabs), desde el
  // modal legacy que se abre desde el sidebar, y desde la pestaña
  // "Agregar Cliente" del modal unificado.
  //
  // También acepta, opcionalmente, refs directos a los inputs (en lugar
  // de ids) — útil cuando los inputs están dentro de filas dinámicas
  // clonadas desde un <template> (caso de las actividades de "Agregar
  // Cliente") y no tienen id propio.
  async function applyFechaHoraDefaultsFromUsuario(usuarioId, fechaElOrId, horaElOrId) {
    const resolveEl = (e) =>
      e instanceof HTMLElement ? e : document.getElementById(e);
    const fechaEl = resolveEl(fechaElOrId);
    const horaEl = resolveEl(horaElOrId);
    if (!fechaEl || !horaEl) {
      console.warn("[asistente-cal] apply defaults: inputs no encontrados", { fechaElOrId, horaElOrId });
      return;
    }
    // Si no hay usuario seleccionado, default conservador: hoy + hora
    // vacía (el usuario completa la hora a mano).
    if (!usuarioId) {
      console.log("[asistente-cal] apply defaults: sin usuario, hoy + hora vacía");
      fechaEl.value = todayLocalYYYYMMDD();
      horaEl.value = "";
      return;
    }
    try {
      console.log("[asistente-cal] apply defaults: consultando horario-ultimo para usuario", usuarioId);
      const json = await fetchJSON(
        `/api/calendario-asistente/horario-ultimo?usuario_id=${encodeURIComponent(usuarioId)}`,
      );
      const d = (json && json.data) || {};
      console.log("[asistente-cal] apply defaults: respuesta", d);
      const horaDefault = d.hora_fin || d.hora_inicio;
      if (d.exists && d.fecha && horaDefault) {
        // Tiene historial → replicamos fecha y hora del último bloque.
        fechaEl.value = d.fecha;
        horaEl.value = horaDefault;
        console.log("[asistente-cal] apply defaults: aplicado", { fecha: d.fecha, hora: horaDefault });
      } else {
        // Sin historial → respetamos la fecha que el usuario haya puesto,
        // sólo dejamos la hora vacía para que elija.
        horaEl.value = "";
        console.log("[asistente-cal] apply defaults: sin historial, respetamos fecha + hora vacía");
      }
    } catch (err) {
      console.error("[asistente-cal] horario-ultimo error:", err);
      // Ante error, no rompemos el modal: defaults benignos.
      fechaEl.value = todayLocalYYYYMMDD();
      horaEl.value = "09:00";
    }
  }

  // Exponemos el helper en window para que módulos hermanos (ej.
  // `agregar-cliente.js`, que se carga como IIFE aparte y maneja
  // actividadess dinámicamente clonadas desde un <template>) puedan
  // reutilizar la misma lógica sin duplicar el endpoint/parsing.
  // Sin export se rompe el árbol: agregar-cliente.js no tiene acceso
  // al closure de este módulo.
  window.asistenteCalApplyFechaHoraDefaults = applyFechaHoraDefaultsFromUsuario;

  // -------- carga de usuarios ---------------------------------------
  async function loadUsuarios() {
    if (!selUsuarios) return;
    try {
      const json = await fetchJSON(
        "/api/calendario-asistente/usuarios?exclude_rol_id=1",
      );
      const data = json.data || [];
      if (!data.length) {
        selUsuarios.innerHTML = `<option value="">No hay usuarios disponibles</option>`;
        return;
      }
      const opts = [`<option value="">— Selecciona usuario —</option>`]
        .concat(
          data.map(
            (u) =>
              `<option value="${u.id}">${escapeHtml(
                u.nombre_completo,
              )}${u.rol?.nombre ? ` · ${escapeHtml(u.rol.nombre)}` : ""}</option>`,
          ),
        )
        .join("");
      selUsuarios.innerHTML = opts;
      selUsuarios.disabled = false;
    } catch (err) {
      console.error("[asistente-cal] loadUsuarios:", err);
      selUsuarios.innerHTML = `<option value="">Error al cargar usuarios</option>`;
    }
  }

  // Cache de actividades del sidebar (para reusar al abrir el modal de
  // Programar sin tener que volver a pegarle a la API).
  let sidebarActividadesById = new Map();

  // -------- carga de reuniones (sidebar) ----------------------------
  // Sidebar "TAREA · REUNIONES": muestra SOLO las actividades de tipo
  // REUNIONES que AÚN no fueron programadas formalmente (sin fila
  // activa en `horario_usuario`). Las que ya están programadas viven en
  // el calendario (loadCalendario → only_con_slot=true) y se omiten
  // acá para no duplicar la información.
  async function loadReuniones() {
    if (!listReuniones) return;
    try {
      const json = await fetchJSON(
        "/api/calendario-asistente/reuniones?only_sin_slot=true",
      );
      const data = json.data || [];
      sidebarActividadesById = new Map(data.map((a) => [Number(a.id), a]));
      if (countReuniones) countReuniones.textContent = String(data.length);
      if (!data.length) {
        listReuniones.innerHTML = `
          <div class="text-center text-muted py-4" style="font-size:0.85rem">
            <i class="ti ti-info-circle me-1"></i>
            No hay reuniones registradas.
          </div>`;
        return;
      }
      listReuniones.innerHTML = data.map(reunionItemHtml).join("");
    } catch (err) {
      console.error("[asistente-cal] loadReuniones:", err);
      listReuniones.innerHTML = `
        <div class="text-center text-danger py-4" style="font-size:0.85rem">
          <i class="ti ti-alert-triangle me-1"></i>
          Error al cargar las reuniones.
        </div>`;
      if (countReuniones) countReuniones.textContent = "0";
    }
  }

  // -------- carga del calendario (filtrado por usuario) -------------
  // Calendario: solo reuniones CON horario_usuario activo (las que ya
  // fueron programadas oficialmente). Filtradas por el usuario del
  // header.
  async function loadCalendario() {
    const cal = window.__ASISTENTE_CAL__;
    if (!cal) return;
    if (!selUsuarios || !selUsuarios.value) {
      cal.removeAllEvents();
      if (btnNewReunion) btnNewReunion.disabled = true;
      return;
    }
    const usuarioId = selUsuarios.value;
    if (btnNewReunion) btnNewReunion.disabled = false;
    try {
      const json = await fetchJSON(
        `/api/calendario-asistente/reuniones?usuario_id=${encodeURIComponent(usuarioId)}&only_con_slot=true`,
      );
      const data = json.data || [];
      // Eliminar eventos actuales y agregar los nuevos uno por uno.
      // Usamos `addEvent` en vez de `addEventSource` con array porque
      // en FullCalendar v6.1 removeAllEvents + addEventSource(array)
      // no garantiza que se rendericen en tiempo real.
      cal.getEvents().forEach((e) => e.remove());
      data.forEach((a) => {
        const ev = buildCalendarEvent(a);
        if (ev && ev.start) cal.addEvent(ev);
      });
    } catch (err) {
      console.error("[asistente-cal] loadCalendario:", err);
    }
  }

  // Construye un evento compatible con FullCalendar v6 a partir de un
  // objeto de la API. La API puede devolver dos formas:
  //
  //   * Una entrada por ACTIVIDAD (legacy o `only_sin_slot`): el campo
  //     `id` es el id numérico de la actividad y se usa para FullCalendar.
  //   * Una entrada por FILA de `horario_usuario` (`only_con_slot`): el
  //     campo `id` viene como string `"hu-<horario_usuario.id>"` y
  //     `actividad_id` apunta a la actividad padre. En este modo el
  //     evento se renderiza en la fecha/hora/duración del bloque, lo que
  //     permite que una actividad distribuida en varios bloques se vea
  //     partida en el calendario respetando la jornada.
  //
  // En ambos casos el `extendedProps.actividad_id` apunta a la actividad
  // padre, así los handlers `eventClick` / `eventDrop` / `eventResize`
  // siguen abriendo el modal de detalle correcto.
  function buildCalendarEvent(a) {
    const start = combineFechaHora(a.fecha_inicio, a.hora_inicio);
    // Para bloques de horario_usuario, la duración del evento es la del
    // BLOQUE (no la total de la actividad), así evitamos pintar 20h en un
    // solo bloque cuando la jornada sólo soporta 5h ese día.
    const mins = Math.max(5, Number(a.tiempo_estimado_minutos) || 30);
    const end = start
      ? new Date(start.getTime() + mins * 60_000).toISOString()
      : null;
    const horaTxt = a.hora_inicio ? `${a.hora_inicio} · ` : "";
    const prospectoTxt = a.prospecto?.titulo
      ? ` · ${a.prospecto.titulo}`
      : "";
    const color = a.color || null;
    // Si la API ya envía `id` como string (caso con-slot "hu-…") lo
    // respetamos; si no, prefijamos con "act-". Mantener el prefijo evita
    // colisiones con eventos de otras fuentes que usen ids numéricos.
    const eventId =
      typeof a.id === "string" && a.id.startsWith("hu-")
        ? a.id
        : `act-${a.id}`;
    // Actividad padre: en modo con-slot viene en `actividad_id`, en los
    // otros modos es el propio `id`. Esto garantiza que el modal de
    // detalle siga abriendo la actividad correcta aunque el evento en
    // pantalla sea uno de varios bloques.
    const parentActividadId = a.actividad_id != null
      ? Number(a.actividad_id)
      : Number(
          typeof a.id === "string" && a.id.startsWith("hu-")
            ? a.id.slice(3)
            : a.id,
        );
    const esLibre = a.marca === "libre";
    const esCanje = a.marca === "canje";
    const esPermiso = a.marca === "permiso";

    return {
      id: eventId,
      title: esCanje
        ? `${horaTxt}⏳ Canjeado`
        : esPermiso
          ? `${horaTxt}🔒 Permiso`
          : `${horaTxt}${a.tarea?.nombre || "(sin tarea)"}${prospectoTxt}`,
      start: start ? start.toISOString() : null,
      end,
      classNames: [calendarClassForEstado(a.estado_progreso)],
      ...(esLibre
        ? { backgroundColor: "#000", borderColor: "#000", textColor: "#fff" }
        : esCanje
          ? { backgroundColor: "#f59e0b", borderColor: "#f59e0b", textColor: "#fff" }
        : esPermiso
          ? { backgroundColor: "#e11d48", borderColor: "#e11d48", textColor: "#fff" }
        : color
          ? { backgroundColor: color, borderColor: color }
          : {}),
      extendedProps: {
        actividad_id: parentActividadId,
        horario_usuario_id:
          a.horario_usuario_id != null ? Number(a.horario_usuario_id) : null,
        actividad: a,
        marca: a.marca || null,
      },
    };
  }

  function calendarClassForEstado(estado) {
    const e = String(estado || "").toLowerCase();
    if (e === "completada") return "fc-event-real-completed";
    if (e === "en_progreso") return "fc-event-real-progress";
    return "fc-event-real-pending";
  }

  // Construye una fecha LOCAL a partir de los campos `fecha_inicio` y
  // `hora_inicio` que devuelve la API. Acepta tanto strings ("YYYY-MM-DD"
  // y "HH:MM", que es lo que envía hoy el backend) como instancias Date
  // (por compatibilidad con código viejo).
  //
  // Importante: para `fecha` evitamos `new Date("YYYY-MM-DD")` porque eso
  // se interpreta como UTC y, en zonas negativas, retrocede un día. Por
  // eso parseamos los dígitos y usamos el constructor por componentes.
  function combineFechaHora(fecha, hora) {
    try {
      let y, mo, d;
      if (fecha instanceof Date && !isNaN(fecha.getTime())) {
        // Date desde una columna `date` de Prisma viene a medianoche UTC.
        y = fecha.getUTCFullYear();
        mo = fecha.getUTCMonth();
        d = fecha.getUTCDate();
      } else if (typeof fecha === "string") {
        const m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        y = Number(m[1]);
        mo = Number(m[2]) - 1;
        d = Number(m[3]);
      } else {
        return null;
      }

      let h = 0;
      let mi = 0;
      if (hora instanceof Date && !isNaN(hora.getTime())) {
        h = hora.getHours();
        mi = hora.getMinutes();
      } else if (typeof hora === "string") {
        // Acepta "HH:MM[:SS]" o un ISO con "THH:MM".
        const hm =
          hora.match(/^(\d{1,2}):(\d{2})/) || hora.match(/T(\d{2}):(\d{2})/);
        if (hm) {
          h = Number(hm[1]);
          mi = Number(hm[2]);
        }
      }
      const res = new Date(y, mo, d, h, mi, 0, 0);
      return isNaN(res.getTime()) ? null : res;
    } catch (_) {
      return null;
    }
  }

  // Muestra "DD mmm · HH:MM" a partir de los campos crudos de la API.
  // Acepta strings ("YYYY-MM-DD" + "HH:MM") o Dates, igual que
  // combineFechaHora.
  function fmtFechaHora(fecha, hora) {
    try {
      const d = combineFechaHora(fecha, hora);
      if (!d) return "—";
      const fechaStr = d.toLocaleDateString("es", {
        day: "2-digit",
        month: "short",
      });
      const horaStr = d.toLocaleTimeString("es", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${fechaStr} · ${horaStr}`;
    } catch (_) {
      return "—";
    }
  }

  function estadoBadge(estado) {
    const e = String(estado || "").toLowerCase();
    if (e === "completada")
      return { txt: "Completada", bg: "#dcfce7", color: "#166534", icon: "ti-check" };
    if (e === "en_progreso")
      return { txt: "En progreso", bg: "#dbeafe", color: "#1d4ed8", icon: "ti-player-play" };
    return { txt: "Pendiente", bg: "#f3f4f6", color: "#4b5563", icon: "ti-circle-dot" };
  }

  function prioridadBadgeHtml(p) {
    if (!p) return '<span class="text-muted">—</span>';
    const v = String(p).toUpperCase();
    const cls =
      v === "ALTA"
        ? "bg-danger-subtle text-danger"
        : v === "MEDIA"
          ? "bg-warning-subtle text-warning"
          : "bg-secondary-subtle text-secondary";
    return `<span class="badge ${cls} px-2 py-1 fw-semibold">${escapeHtml(v)}</span>`;
  }

  function estadoBadgeHtml(e) {
    if (!e) return '<span class="text-muted">—</span>';
    const v = String(e).toLowerCase();
    const cls =
      v === "completada" || v === "completado"
        ? "bg-success-subtle text-success"
        : v === "en_progreso" || v === "en curso"
          ? "bg-info-subtle text-info"
          : "bg-primary-subtle text-primary";
    return `<span class="badge ${cls} px-2 py-1 fw-semibold">${escapeHtml(e)}</span>`;
  }

  function reunionItemHtml(a) {
    const tareaNombre = a.tarea?.nombre || "(sin tarea)";
    const colorTipo = a.tarea?.tipo_tarea?.color || "#6d28d9";
    const contactos = Array.isArray(a.prospecto?.contactos)
      ? a.prospecto.contactos.filter(Boolean)
      : [];
    const universidad = a.prospecto?.universidad || null;
    const carrera = a.prospecto?.carrera || null;
    const nivel = a.prospecto?.nivel_academico || null;
    const hora = a.hora_inicio || null;
    const st = estadoBadge(a.estado_progreso);

    // Render de un campo del card. Si `value` es null/""/"—", igual
    // dibujamos la fila con un placeholder "Sin <label>" en itálica
    // para que el usuario pueda distinguir "el campo existe pero el dato
    // falta" de "se rompió la conversión".
    const metaRow = (icon, label, value) => {
      const hasValue = value !== null && value !== undefined && value !== "" && value !== "—";
      const shown = hasValue
        ? escapeHtml(value)
        : `<span class="text-muted fst-italic">Sin ${escapeHtml(label.toLowerCase())}</span>`;
      return `<div class="reunion-meta">
         <i class="ti ${icon}"></i>
         <span title="${escapeHtml(label)}">${shown}</span>
       </div>`;
    };

    // Bloque "Contactos": lista dinámica con TODOS los contactos del
    // prospecto (no sólo el principal). El backend ya devuelve el array
    // `prospecto.contactos` con `nombre_completo` y `celular` armado.
    // Si la lista está vacía, mostramos el placeholder en itálica como
    // el resto de metaRows.
    const contactosHtml =
      contactos.length > 0
        ? `<div class="reunion-meta">
             <i class="ti ti-users"></i>
             <span title="Contactos">
               ${contactos
                 .map((c) => {
                   const nombre = c.nombre_completo || [c.nombres, c.apellidos].filter(Boolean).join(" ").trim();
                   const cel = c.celular ? ` <span class="text-muted">· ${escapeHtml(c.celular)}</span>` : "";
                   return nombre
                     ? `<span>${escapeHtml(nombre)}${cel}</span>`
                     : "";
                 })
                 .filter(Boolean)
                 .join('<span class="text-muted mx-1">·</span>')}
             </span>
           </div>`
        : `<div class="reunion-meta">
             <i class="ti ti-user"></i>
             <span title="Contacto">
               <span class="text-muted fst-italic">Sin contacto</span>
             </span>
           </div>`;

    return `
      <div class="reunion-item" data-id="${a.id}" data-nombre="${escapeHtml(tareaNombre)}" title="Tocá para programar">
        <div class="reunion-icon" style="background:${escapeHtml(colorTipo)}22;color:${escapeHtml(colorTipo)}">
          <i class="ti ti-calendar-plus"></i>
        </div>
        <div class="reunion-body">
          <div class="reunion-title">${escapeHtml(tareaNombre)}</div>
          ${
            a.prospecto?.titulo
              ? `<div class="reunion-meta" style="margin-top:0.05rem">
                  <i class="ti ti-briefcase"></i>
                  <span>${escapeHtml(a.prospecto.titulo)}</span>
                </div>`
              : ""
          }
          ${contactosHtml}
          ${metaRow("ti-building", "Universidad", universidad)}
          ${metaRow("ti-school", "Carrera", carrera)}
          ${metaRow("ti-bookmark", "Nivel académico", nivel)}
          ${metaRow("ti-clock", "Hora propuesta", hora)}
          ${metaRow(
            "ti-user-check",
            "Registrado por",
            a.registrado_por?.nombre_completo || null,
          )}
          <div class="reunion-meta" style="margin-top:0.2rem">
            <span class="badge" style="background:${st.bg};color:${st.color}">
              <i class="ti ${st.icon}"></i> ${escapeHtml(st.txt)}
            </span>
            ${
              a.tiene_slot
                ? `<span class="badge bg-success-subtle text-success">
                     <i class="ti ti-check"></i> Programada
                   </span>`
                : `<span class="badge bg-primary-subtle text-primary">
                     <i class="ti ti-calendar-plus"></i> Pendiente de programar
                   </span>`
            }
          </div>
        </div>
      </div>`;
  }

  // -------- modal de detalle ----------------------------------------
  function setCalField(name, value) {
    const el = document.querySelector(`[data-cal-field="${name}"]`);
    if (!el) return;
    if (value === null || value === undefined || value === "") {
      el.textContent = "—";
      return;
    }
    el.textContent = value;
  }
  function setCalFieldHTML(name, html) {
    const el = document.querySelector(`[data-cal-field="${name}"]`);
    if (!el) return;
    el.innerHTML = html;
  }
  function setCalWrap(name, show) {
    const el = document.querySelector(`[data-cal-wrap="${name}"]`);
    if (el) el.style.display = show ? "" : "none";
  }

  function formatMin(min) {
    if (!min) return "—";
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h > 0 && m > 0) return `${h} h ${m} min`;
    if (h > 0) return `${h} h`;
    return `${m} min`;
  }

  function fmtDDMMYYYY(ymd) {
    if (!ymd) return "—";
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return String(ymd);
  }

  // Abre el modal de detalle. `preselectedActividad` opcional: si llega,
  // usamos esos datos (cuando se llama desde el sidebar que ya los tiene
  // cacheados). Si no, hacemos fetch a /api/calendario-asistente/reuniones/:id.
  async function openDetailModal(actividadId, horarioId, preselected) {
    const modal = getModal("js-cal-event-modal");
    if (!modal) return;

    // Limpiamos el modal mientras cargamos.
    const titleEl = document.getElementById("js-cal-event-title");
    if (titleEl) titleEl.textContent = "Cargando…";
    [
      "tarea", "prioridad", "estado_progreso",
      "tiempo_real", "global_inicio", "global_termino",
      "slot_fecha", "slot_hora", "slot_duracion",
      "motivo",
      "titulo_prospecto", "estado_cliente", "fecha_contacto",
      "fecha_entrega", "link_drive",
    ].forEach((k) => setCalField(k, "—"));
    setCalFieldHTML("contactos", "");
    setCalWrap("contactos", false);
    setCalWrap("total_reales", false);
    setCalWrap("global_inicio", false);
    setCalWrap("global_termino", false);
    setCalWrap("motivo_row", false);
    const warn = document.getElementById("js-cal-event-warning");
    if (warn) warn.classList.add("d-none");
    document.getElementById("js-cal-btn-reprogramar")?.classList.add("d-none");
    document.getElementById("js-cal-btn-ajustar-duracion")?.classList.add("d-none");
    document.getElementById("js-cal-btn-reasignar")?.classList.add("d-none");
    document.getElementById("js-cal-btn-eliminar")?.classList.add("d-none");
    document.getElementById("js-cal-bloque-acciones")?.classList.add("d-none");

    let data = preselected;
    if (!data) {
      try {
        const json = await fetchJSON(
          `/api/calendario-asistente/reuniones/${actividadId}`,
        );
        data = json.data;
      } catch (err) {
        console.error("[asistente-cal] openDetailModal:", err);
        if (titleEl) titleEl.textContent = "Detalle de reunión";
        setCalField("tarea", `Error: ${err.message}`);
        modal.show();
        return;
      }
    }
    if (!data) {
      if (titleEl) titleEl.textContent = "Reunión no encontrada";
      modal.show();
      return;
    }

    // Título del modal: nombre de la tarea + prospecto
    const tareaNombre = data.tarea?.nombre || "(sin tarea)";
    const prospectoTxt = data.prospecto?.titulo
      ? ` — ${data.prospecto.titulo}`
      : "";
    if (titleEl) titleEl.textContent = `${tareaNombre}${prospectoTxt}`;

    setCalField("tarea", tareaNombre);
    setCalFieldHTML("prioridad", prioridadBadgeHtml(data.prioridad));
    setCalFieldHTML("estado_progreso", estadoBadgeHtml(data.estado_progreso));

    // Tiempo real (suma de duración de todos los bloques)
    if (data.total_minutos_reales) {
      setCalWrap("total_reales", true);
      setCalField("tiempo_real", formatMin(data.total_minutos_reales));
    }

    // Inicio global (primer bloque)
    if (data.global_inicio?.fecha) {
      setCalWrap("global_inicio", true);
      const txt = [fmtDDMMYYYY(data.global_inicio.fecha), data.global_inicio.hora].filter(Boolean).join(" ");
      setCalField("global_inicio", txt);
    }

    // Término global (último bloque)
    if (data.global_termino?.fecha) {
      setCalWrap("global_termino", true);
      const txt = [fmtDDMMYYYY(data.global_termino.fecha), data.global_termino.hora].filter(Boolean).join(" ");
      setCalField("global_termino", txt);
    }

    // Bloque en calendario — mostrar el bloque clickeado por horario_id
    const clickedBlock = horarioId && Array.isArray(data.bloques)
      ? data.bloques.find((b) => b.id === horarioId)
      : null;
    const slotBlock = clickedBlock || data.slot || null;
    setCalField("slot_fecha", slotBlock?.fecha ? fmtDDMMYYYY(slotBlock.fecha) : "—");
    const slotHoraTxt =
      slotBlock?.hora_inicio
        ? `${slotBlock.hora_inicio}${slotBlock.hora_fin ? ` — ${slotBlock.hora_fin}` : ""}`
        : "—";
    setCalField("slot_hora", slotHoraTxt);
    setCalField("slot_duracion", formatMin(slotBlock?.duracion_minutos));
    const slotMarca = slotBlock?.marca || null;
    if (slotMarca === "libre") {
      setCalWrap("slot_marca_row", true);
      setCalFieldHTML("slot_marca", '<span class="badge bg-dark">Hora libre</span>');
    } else if (slotMarca === "canje") {
      setCalWrap("slot_marca_row", true);
      setCalFieldHTML("slot_marca", '<span class="badge bg-warning text-dark">Canjeado</span>');
    } else {
      setCalWrap("slot_marca_row", false);
    }

    const esReunion =
      Number(data.tarea?.tipo_tarea?.id) === 2 ||
      data.hu_tipo === "reunion";
    if (esReunion && data.motivo_reprograma) {
      setCalWrap("motivo_row", true);
      setCalField("motivo", data.motivo_reprograma);
    }

    setCalField("titulo_prospecto", data.prospecto?.titulo || "—");
    setCalField("estado_cliente", data.prospecto?.estado_cliente || "—");
    setCalField("fecha_contacto", fmtDDMMYYYY(data.prospecto?.fecha_contacto));
    setCalField("fecha_entrega", fmtDDMMYYYY(data.prospecto?.fecha_entrega));
    if (data.prospecto?.link_drive) {
      setCalFieldHTML(
        "link_drive",
        `<a href="${escapeHtml(data.prospecto.link_drive)}" target="_blank" rel="noopener" class="text-primary fw-semibold text-break"><i class="ti ti-external-link me-1"></i>${escapeHtml(data.prospecto.link_drive)}</a>`,
      );
    } else {
      setCalField("link_drive", "—");
    }

    // Contactos
    const contactos = Array.isArray(data.prospecto?.contactos) ? data.prospecto.contactos : [];
    if (contactos.length) {
      setCalWrap("contactos", true);
      const html = contactos
        .map((c) => {
          const nombre = [c.nombres, c.apellidos].filter(Boolean).join(" ").trim();
          const tel = c.celular
            ? `<a href="tel:${escapeHtml(c.celular)}" class="link-primary ms-2"><i class="ti ti-phone me-1"></i>${escapeHtml(c.celular)}</a>`
            : "";
          return (
            `<li class="list-group-item d-flex flex-wrap align-items-center gap-1 px-0">` +
            `<span class="fw-medium">${escapeHtml(nombre || "—")}</span>` +
            tel +
            `</li>`
          );
        })
        .join("");
      setCalFieldHTML("contactos", html);
    } else {
      setCalWrap("contactos", false);
    }

    // Habilitar botones según estado de la actividad.
    const enProgreso = String(data.estado_progreso || "").toLowerCase() === "en_progreso";
    const cancelada = !data.estado;
    const etiqueta = esReunion ? "reunión" : "actividad";
    if (warn && cancelada) {
      warn.classList.remove("d-none");
      setCalField("warning", `Esta ${etiqueta} está cancelada.`);
    }
    if (!enProgreso) {
      const btnRepro = document.getElementById("js-cal-btn-reprogramar");
      const btnAjd = document.getElementById("js-cal-btn-ajustar-duracion");
      const btnReasig = document.getElementById("js-cal-btn-reasignar");
      const btnElim = document.getElementById("js-cal-btn-eliminar");
      const bloqueAcciones = document.getElementById("js-cal-bloque-acciones");
      const btnHoraExtra = document.getElementById("js-cal-btn-hora-extra");
      const btnHoraLibre = document.getElementById("js-cal-btn-hora-libre");
      if (btnRepro) {
        btnRepro.classList.remove("d-none");
        btnRepro.dataset.actividadId = String(data.id);
      }
      if (btnAjd && esReunion) {
        btnAjd.classList.remove("d-none");
        btnAjd.dataset.actividadId = String(data.id);
        btnAjd.dataset.duracionActual = String(data.tiempo_estimado_minutos || data.slot?.duracion_minutos || 60);
      }
      if (btnReasig) {
        btnReasig.classList.remove("d-none");
        btnReasig.dataset.actividadId = String(data.id);
      }
      if (btnElim) {
        btnElim.classList.remove("d-none");
        btnElim.dataset.actividadId = String(data.id);
        btnElim.dataset.esReunion = esReunion ? "1" : "0";
        btnElim.innerHTML = `<i class="ti ti-trash me-1"></i>Cancelar ${etiqueta}`;
      }
      // Botones de hora extra / libre: solo para actividades NO reunión,
      // solo si hay un bloque clickeado, y solo si el bloque no ya es hora libre
      const hid = horarioId || slotBlock?.id || null;
      if (bloqueAcciones && !esReunion && hid && slotMarca !== "libre") {
        bloqueAcciones.classList.remove("d-none");
        if (btnHoraExtra) {
          btnHoraExtra.dataset.actividadId = String(data.id);
          btnHoraExtra.dataset.horarioId = String(hid);
        }
        if (btnHoraLibre) {
          btnHoraLibre.dataset.actividadId = String(data.id);
          btnHoraLibre.dataset.horarioId = String(hid);
        }
      }
    }

    modal.show();
  }

  // -------- modal detalle de bloque canjeado -------------------------
  async function openCanjeDetailModal(horarioId) {
    const modal = getModal("js-he-canje-detail-modal");
    if (!modal) return;
    const content = document.getElementById("js-he-canje-detail-content");
    if (!content) { modal.show(); return; }
    content.innerHTML = '<p class="text-center text-muted py-3">Cargando…</p>';
    modal.show();

    try {
      const json = await fetchJSON(
        `/api/calendario-asistente/horas-extras/canje-detail?horario_id=${horarioId}`,
      );
      if (!json?.success) throw new Error("Error al obtener detalle");
      const d = json.data;
      const badgeHtml = '<span class="badge bg-warning text-dark">Canjeado</span>';
      const extrasHtml = d.extras.length
        ? `<table class="table table-sm table-bordered mb-0 mt-2">
            <thead class="table-light">
              <tr>
                <th>Fecha</th>
                <th>Prospecto</th>
                <th>Actividad</th>
                <th>Minutos</th>
              </tr>
            </thead>
            <tbody>
              ${d.extras.map(e => `<tr>
                <td>${escapeHtml(e.fecha)}</td>
                <td>${escapeHtml(e.prospecto)}</td>
                <td>${escapeHtml(e.actividad)}</td>
                <td>${e.minutos} min</td>
              </tr>`).join('')}
            </tbody>
          </table>`
        : '<p class="text-muted mb-0">Sin horas extra vinculadas.</p>';

      content.innerHTML = `
        <dl class="row mb-3">
          <dt class="col-4 fw-medium text-muted">Fecha</dt>
          <dd class="col-8">${escapeHtml(d.bloque.fecha)}</dd>
          <dt class="col-4 fw-medium text-muted">Horario</dt>
          <dd class="col-8">${escapeHtml(d.bloque.hora_inicio)} — ${escapeHtml(d.bloque.hora_fin)}</dd>
          <dt class="col-4 fw-medium text-muted">Duración</dt>
          <dd class="col-8">${d.bloque.duracion_minutos} min</dd>
          <dt class="col-4 fw-medium text-muted">Estado</dt>
          <dd class="col-8">${badgeHtml}</dd>
        </dl>
        <hr class="my-2">
        <h6 class="text-uppercase text-muted fs-xxs fw-semibold mb-2">Horas extra canjeadas</h6>
        ${extrasHtml}
      `;
    } catch (e) {
      content.innerHTML = `<div class="alert alert-danger py-2 mb-0">Error: ${escapeHtml(e.message)}</div>`;
    }
  }

  // -------- modal reprogramar ---------------------------------------
  function openReprogramarModal(actividadId, defaults = {}) {
    const modal = getModal("js-cal-reprogramar-modal");
    if (!modal) return;
    document.getElementById("js-cal-rep-fecha").value = defaults.fecha || todayLocalYYYYMMDD();
    document.getElementById("js-cal-rep-hora").value = defaults.hora || "09:00";
    document.getElementById("js-cal-rep-duracion").value = defaults.duracion || 60;
    document.getElementById("js-cal-rep-motivo").value = defaults.motivo || "";
    document.getElementById("js-cal-rep-result").innerHTML = "";
    const btn = document.getElementById("js-cal-rep-aplicar");
    if (btn) {
      btn.disabled = false;
      btn.dataset.actividadId = String(actividadId);
    }
    // Flag para distinguir entre "se aplicó OK" y "se cerró sin aplicar".
    // Si el usuario cierra el modal sin aplicar (Cancelar / ESC / click
    // afuera), el listener `hidden.bs.modal` revierte el evento arrastrado
    // refrescando desde el servidor.
    const modalEl = document.getElementById("js-cal-reprogramar-modal");
    if (modalEl) modalEl.dataset.applied = "0";
    modal.show();
  }

  async function submitReprogramar() {
    const btn = document.getElementById("js-cal-rep-aplicar");
    const id = Number(btn?.dataset.actividadId || 0);
    if (!id) return;
    const fecha = document.getElementById("js-cal-rep-fecha").value;
    const hora = document.getElementById("js-cal-rep-hora").value;
    const duracion = Number(document.getElementById("js-cal-rep-duracion").value);
    const motivo = document.getElementById("js-cal-rep-motivo").value;
    if (!fecha || !hora || !duracion) {
      showToast("warning", "Completa fecha, hora y duración.");
      return;
    }
    btn.disabled = true;
    try {
      await fetchJSON(
        `/api/calendario-asistente/reuniones/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fecha_destino: fecha,
            hora_inicio: hora,
            duracion_minutos: duracion,
            motivo: motivo || undefined,
          }),
        },
      );
      const modalEl = document.getElementById("js-cal-reprogramar-modal");
      if (modalEl) modalEl.dataset.applied = "1";
      showToast("success", "Reunión reprogramada.");
      const modal = getModal("js-cal-reprogramar-modal");
      if (modal) modal.hide();
      await refreshAll();
    } catch (err) {
      if (err.status === 409 && err.payload) {
        renderConflictResult(
          "js-cal-rep-result",
          err.payload,
          "No entra en la fecha/hora indicada.",
        );
      } else {
        showToast("error", err.message || "Error al reprogramar.");
      }
    } finally {
      btn.disabled = false;
    }
  }

  // -------- modal ajustar duración ----------------------------------
  function openAjustarDuracionModal(actividadId, duracionActual) {
    const modal = getModal("js-cal-ajustar-duracion-modal");
    if (!modal) return;
    document.getElementById("js-cal-ajd-actual").value = `${duracionActual} min`;
    document.getElementById("js-cal-ajd-nueva").value = duracionActual;
    document.getElementById("js-cal-ajd-result").innerHTML = "";
    const btn = document.getElementById("js-cal-ajd-aplicar");
    if (btn) {
      btn.disabled = false;
      btn.dataset.actividadId = String(actividadId);
    }
    modal.show();
  }

  async function submitAjustarDuracion() {
    const btn = document.getElementById("js-cal-ajd-aplicar");
    const id = Number(btn?.dataset.actividadId || 0);
    if (!id) return;
    const nuevaDuracion = Number(document.getElementById("js-cal-ajd-nueva").value);
    if (!nuevaDuracion || nuevaDuracion < 5) {
      showToast("warning", "La duración debe ser al menos 5 minutos.");
      return;
    }
    btn.disabled = true;
    try {
      const adjResp = await fetchJSON(`/api/calendario-asistente/reuniones/${id}/ajustar-duracion`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duracion_minutos: nuevaDuracion }),
      });
      if (adjResp?.data?.warnings?.length > 0) {
        for (const w of adjResp.data.warnings) {
          showToast("warning", `No se puede programar completamente: faltan ${w.faltan} minutos. Cambia de auxiliar.`);
        }
      }
      showToast("success", "Duración ajustada.");
      const modal = getModal("js-cal-ajustar-duracion-modal");
      if (modal) modal.hide();
      await refreshAll();
    } catch (err) {
      if (err.status === 409 && err.payload) {
        const resultEl = document.getElementById("js-cal-ajd-result");
        if (resultEl) {
          resultEl.innerHTML = `<div class="alert alert-danger mb-0 py-2 fs-sm"><i class="ti ti-alert-triangle me-1"></i>${escapeHtml(err.payload.error || err.message)}</div>`;
        }
      } else {
        showToast("error", err.message || "Error al ajustar duración.");
      }
    } finally {
      btn.disabled = false;
    }
  }

  // -------- modal reasignar -----------------------------------------
  let reasignarState = { fecha: null, hora: null, duracion: null, candidates: [] };

  function openReasignarModal(actividadId, defaults = {}) {
    const modal = getModal("js-cal-reasignar-modal");
    if (!modal) return;
    document.getElementById("js-cal-rea-fecha").value = defaults.fecha || todayLocalYYYYMMDD();
    document.getElementById("js-cal-rea-hora").value = defaults.hora || "09:00";
    document.getElementById("js-cal-rea-duracion").value = defaults.duracion || 60;
    document.getElementById("js-cal-rea-motivo").value = defaults.motivo || "";
    document.getElementById("js-cal-rea-result").innerHTML =
      '<div class="text-muted small">Elegí fecha/hora/duración y tocá "Con hueco" para ver candidatos.</div>';
    const sel = document.getElementById("js-cal-rea-usuario");
    sel.innerHTML = '<option value="">— Toca "Con hueco" —</option>';
    reasignarState = { fecha: null, hora: null, duracion: null, candidates: [] };
    const btn = document.getElementById("js-cal-rea-aplicar");
    if (btn) {
      btn.disabled = true;
      btn.dataset.actividadId = String(actividadId);
    }
    modal.show();
  }

  async function loadCandidatosConHueco() {
    const fecha = document.getElementById("js-cal-rea-fecha").value;
    const hora = document.getElementById("js-cal-rea-hora").value;
    const duracion = Number(document.getElementById("js-cal-rea-duracion").value);
    if (!fecha || !hora || !duracion) {
      showToast("warning", "Completa fecha, hora y duración.");
      return;
    }
    const resultEl = document.getElementById("js-cal-rea-result");
    const sel = document.getElementById("js-cal-rea-usuario");
    if (resultEl) {
      resultEl.innerHTML = '<div class="text-center text-muted py-2"><span class="spinner-border spinner-border-sm me-2"></span>Buscando candidatos…</div>';
    }
    try {
      // Llamamos a /api/horario/sugerir pasando el mismo usuario original
      // para que el overflow devuelva los "otrosAuxiliares". Si quisiéramos
      // buscar hueco en el mismo usuario, también devuelve fits=true con
      // un slot. Pero acá lo que queremos es la lista de otros.
      const btn = document.getElementById("js-cal-rea-aplicar");
      const id = Number(btn?.dataset.actividadId || 0);
      if (!id) return;

      // Primero cargamos la reunión actual para saber usuario y deadline.
      const det = await fetchJSON(`/api/calendario-asistente/reuniones/${id}`);
      const act = det.data;
      if (!act) throw new Error("No se pudo cargar la reunión.");

      // Para cada candidato del overflow, necesitamos probar si tiene
      // hueco. La forma más simple es llamar a /api/horario/sugerir por
      // cada uno, pero eso es N+1. Una alternativa más barata es
      // disparar N peticiones en paralelo (limitado a 5).
      // Pero como todavía no tenemos la lista de candidatos, lo que
      // hacemos es: usamos /api/horario/sugerir sobre el USUARIO ORIGINAL
      // con deadline, lo que dispara overflow.suggest() y nos da la lista
      // de `otherAuxiliares`. Cada uno de ellos ya tiene slot validado
      // por el propio overflow (ver overflow.service.js#findOtherAuxiliaresWithSlot).
      const sug = await fetchJSON("/api/horario/sugerir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario_id: act.usuario_id,
          fecha,
          minutos: duracion,
          prioridad: act.prioridad || null,
          deadline: act.prospecto?.fecha_entrega || null,
          prospecto_id: act.prospecto_id || null,
        }),
      });

      // El endpoint /sugerir devuelve:
      //   - si fits:true → {success, fits, plan:{slot,...}}
      //   - si fits:false → {success, fits:false, suggestions:{otherAuxiliares, horasExtras, moverDeadline}, reason,...}
      let candidates = [];
      if (sug.success && sug.fits === false && sug.suggestions) {
        candidates = sug.suggestions.otherAuxiliares || [];
      } else if (sug.success && sug.fits === true) {
        // El usuario original tiene hueco: le avisamos y le sugerimos usar
        // "Reprogramar" en su lugar. Igualmente listamos otros candidatos
        // corriendo placeActivity para cada uno del mismo rol. Como
        // /sugerir ya hizo eso internamente solo si NO entraba, acá no
        // llegamos a la lista. Mostramos mensaje.
        candidates = [];
        if (resultEl) {
          resultEl.innerHTML = `<div class="alert alert-info py-2 mb-2">
            <i class="ti ti-info-circle me-1"></i>
            El usuario original <strong>tiene hueco</strong> en ese horario.
            Usá "Reprogramar" si querés mantener al mismo usuario.
          </div>`;
        }
      }

      reasignarState = { fecha, hora, duracion, candidates };
      if (!candidates.length) {
        sel.innerHTML = '<option value="">— Sin candidatos con hueco —</option>';
        return;
      }
      const opts = [`<option value="">— Selecciona candidato —</option>`]
        .concat(
          candidates.map(
            (c) =>
              `<option value="${c.usuario_id}">${escapeHtml(c.nombre)} · ${escapeHtml(c.slot.hi)}–${escapeHtml(c.slot.hf)}${c.moves?.length ? " (reacomoda)" : ""}</option>`,
          ),
        )
        .join("");
      sel.innerHTML = opts;
      if (resultEl) {
        resultEl.innerHTML = `<div class="text-success small"><i class="ti ti-check me-1"></i>${candidates.length} candidato(s) con hueco. Elegí uno y tocá "Reasignar".</div>`;
      }
    } catch (err) {
      console.error("[asistente-cal] loadCandidatosConHueco:", err);
      if (resultEl) {
        resultEl.innerHTML = `<div class="alert alert-danger py-2 mb-0">${escapeHtml(err.message || "Error")}</div>`;
      }
    }
  }

  async function submitReasignar() {
    const btn = document.getElementById("js-cal-rea-aplicar");
    const id = Number(btn?.dataset.actividadId || 0);
    if (!id) return;
    const nuevoUsuarioId = Number(document.getElementById("js-cal-rea-usuario").value);
    if (!nuevoUsuarioId) {
      showToast("warning", "Elegí un candidato con hueco.");
      return;
    }
    const fecha = document.getElementById("js-cal-rea-fecha").value;
    const hora = document.getElementById("js-cal-rea-hora").value;
    const duracion = Number(document.getElementById("js-cal-rea-duracion").value);
    const motivo = document.getElementById("js-cal-rea-motivo").value;
    btn.disabled = true;
    try {
      await fetchJSON(`/api/calendario-asistente/reuniones/${id}/reasignar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nuevo_usuario_id: nuevoUsuarioId,
          fecha,
          hora_inicio: hora,
          duracion_minutos: duracion,
          motivo: motivo || undefined,
        }),
      });
      showToast("success", "Reunión reasignada.");
      const modal = getModal("js-cal-reasignar-modal");
      if (modal) modal.hide();
      await refreshAll();
    } catch (err) {
      if (err.status === 409 && err.payload) {
        renderConflictResult(
          "js-cal-rea-result",
          err.payload,
          "No se pudo reasignar (conflicto).",
        );
      } else {
        showToast("error", err.message || "Error al reasignar.");
      }
    } finally {
      btn.disabled = false;
    }
  }

  // -------- modal programar (REUNIONES + CLIENTES) ------------------
  let nuevaState = { prospecto: null, tareas: [], usuarios: [] };

  async function openNuevaModal(tab) {
    const modal = getModal("js-cal-nueva-modal");
    if (!modal) return;
    document.getElementById("js-cal-nueva-prospecto-id").value = "";
    document.getElementById("js-cal-nueva-prospecto-sel").classList.add("d-none");
    if (prospectoChoices) {
      prospectoChoices.setChoiceByValue("");
      prospectoChoices.setChoices([], "value", "label", true);
    }
    // Defaults de fecha+hora se aplican DESPUÉS de cargar el select de
    // usuario (abajo), usando el historial de horario_usuario del usuario
    // seleccionado. Si no se llega a cargar, fallback a hoy/09:00.
    document.getElementById("js-cal-nueva-fecha").value = todayLocalYYYYMMDD();
    document.getElementById("js-cal-nueva-hora").value = "09:00";
    document.getElementById("js-cal-nueva-duracion-h").value = 1;
    document.getElementById("js-cal-nueva-duracion-m").value = 0;
    document.getElementById("js-cal-nueva-prioridad").value = "MEDIA";
    document.getElementById("js-cal-nueva-motivo").value = "";
    document.getElementById("js-cal-nueva-result").innerHTML = "";

    // Cargar tareas (todas).
    try {
      const json = await fetchJSON("/api/tareas");
      const all = json.data || json || [];
      nuevaState.tareas = all;
    } catch (err) {
      console.error("[asistente-cal] loadTareas:", err);
      nuevaState.tareas = [];
    }
    // Poblar select de REUNIONES (sólo tipo REUNIÓN).
    const selTarea = document.getElementById("js-cal-nueva-tarea");
    selTarea.innerHTML = ['<option value="">— Selecciona —</option>']
      .concat(
        nuevaState.tareas.map(
          (t) =>
            `<option value="${t.id}">${escapeHtml(t.nombre)}${t.horas_estimadas ? ` · ${t.horas_estimadas} min` : ""}</option>`,
        ),
      )
      .join("");
    if (typeof Choices !== "undefined") {
      if (selTarea._choices) selTarea._choices.destroy();
      selTarea._choices = new Choices(selTarea, {
        searchEnabled: true,
        searchPlaceholderValue: "Buscar actividad…",
        itemSelectText: "",
        shouldSort: false,
        placeholder: true,
        placeholderValue: "Seleccionar…",
      });
      selTarea.addEventListener("change", function () {
        const val = this.value;
        if (!val) return;
        const t = nuevaState.tareas.find((x) => String(x.id) === val);
        if (t && t.horas_estimadas) {
          const totalMin = Number(t.horas_estimadas) || 0;
          document.getElementById("js-cal-nueva-duracion-h").value = Math.floor(totalMin / 60);
          document.getElementById("js-cal-nueva-duracion-m").value = totalMin % 60;
        }
      });
    }
    // Cargar usuarios (reusamos el mismo endpoint del header, parseando
    // el <option> existente para no hacer doble fetch).
    nuevaState.usuarios = [];
    if (selUsuarios) {
      Array.from(selUsuarios.options).forEach((opt) => {
        if (opt.value) {
          nuevaState.usuarios.push({
            id: Number(opt.value),
            nombre: opt.textContent.trim(),
          });
        }
      });
    }
    const selUsuario = document.getElementById("js-cal-nueva-usuario");
    const defaultUid = selUsuarios?.value || "";
    selUsuario.innerHTML = ['<option value="">— Selecciona —</option>']
      .concat(
        nuevaState.usuarios.map(
          (u) =>
            `<option value="${u.id}"${String(u.id) === String(defaultUid) ? " selected" : ""}>${escapeHtml(u.nombre)}</option>`,
        ),
      )
      .join("");
    // Asegurar que el select refleje el valor por defecto (algunos
    // navegadores/Boostrap pueden no aplicar el atributo `selected`
    // cuando se reasigna innerHTML, así que forzamos el valor por JS).
    if (defaultUid) selUsuario.value = String(defaultUid);

    // Defaults de fecha+hora desde el historial del usuario seleccionado.
    // Prioridad de selección del "usuario seleccionado":
    //   1) El dropdown del propio modal (lo que ve el usuario en el form).
    //   2) El filtro del header (selUsuarios).
    //   3) null → defaults hoy + hora vacía.
    const modalSelectedUid = selUsuario.value
      ? Number(selUsuario.value)
      : null;
    const effectiveUid = modalSelectedUid || (defaultUid ? Number(defaultUid) : null);
    await applyFechaHoraDefaultsFromUsuario(
      effectiveUid,
      "js-cal-nueva-fecha",
      "js-cal-nueva-hora",
    );

    nuevaState.prospecto = null;

    modal.show();
    document.getElementById("js-cal-tab-reuniones-btn")?.click();
    setTimeout(() => {
      if (prospectoChoices) {
        prospectoChoices.setChoiceByValue("");
        prospectoChoices.setChoices([], "value", "label", true);
      }
    }, 250);
  }

  // Prospecto select con Choices.js (búsqueda remota).
  let prospectoChoices = null;
  function initProspectoChoices() {
    const el = document.getElementById("js-cal-nueva-prospecto");
    if (!el || typeof Choices === "undefined") return;
    if (prospectoChoices) prospectoChoices.destroy();
    prospectoChoices = new Choices(el, {
      searchEnabled: true,
      searchPlaceholderValue: "Buscar por título, nombre o documento…",
      itemSelectText: "",
      noResultsText: "Sin resultados",
      noChoicesText: "Escribe para buscar…",
      shouldSort: false,
      placeholder: true,
      placeholderValue: "Buscar cliente…",
    });
    let timer = null;
    el.addEventListener("search", (e) => {
      const q = (e.detail?.value || "").trim();
      if (timer) clearTimeout(timer);
      if (q.length < 2) {
        prospectoChoices.setChoices([], "value", "label", true);
        return;
      }
      timer = setTimeout(async () => {
        try {
          const json = await fetchJSON(
            `/api/calendario-asistente/prospectos?q=${encodeURIComponent(q)}&limit=10`,
          );
          const items = (json.data || []).map((p) => {
            const contacto = (p.contactos || [])
              .map((c) => [c.nombres, c.apellidos].filter(Boolean).join(" "))
              .filter(Boolean)
              .join(", ");
            return {
              value: String(p.id),
              label: `${p.titulo_prospecto || "(sin título)"}${contacto ? ` — ${contacto}` : ""}`,
              customProperties: p,
            };
          });
          prospectoChoices.setChoices(items, "value", "label", true);
        } catch (_) {
          // Silencio en errores de red.
        }
      }, 250);
    });
    el.addEventListener("addItem", (e) => {
      const choice = e.detail;
      if (!choice || !choice.value) return;
      const p = choice?.customProperties;
      if (p && String(p.id) === choice.value) {
        selectProspecto(p);
        return;
      }
      fetchJSON(`/api/calendario-asistente/prospectos?limit=50`)
        .then((json) => {
          const found = (json.data || []).find((x) => String(x.id) === choice.value);
          if (found) selectProspecto(found);
        })
        .catch(() => {});
    });
  }

  function selectProspecto(p) {
    nuevaState.prospecto = p;
    document.getElementById("js-cal-nueva-prospecto-id").value = String(p.id);
    const selEl = document.getElementById("js-cal-nueva-prospecto-sel");
    const contacto = (p.contactos || [])
      .map((c) => [c.nombres, c.apellidos].filter(Boolean).join(" ").trim() + (c.celular ? ` (${c.celular})` : ""))
      .filter(Boolean)
      .join(", ");
    selEl.innerHTML = `<i class="ti ti-check me-1"></i>Seleccionado: <strong>${escapeHtml(p.titulo_prospecto || "")}</strong>${contacto ? ` · ${escapeHtml(contacto)}` : ""}${p.fecha_entrega ? ` · F. entrega: <strong>${escapeHtml(p.fecha_entrega)}</strong>` : ""}`;
    selEl.classList.remove("d-none");
    cargarActividadesProspecto(p.id);
  }

  async function cargarActividadesProspecto(prospectoId) {
    const container = document.getElementById("js-cal-nueva-actividades-container");
    const tbody = document.getElementById("js-cal-nueva-actividades-tbody");
    try {
      const json = await fetchJSON(`/api/calendario-asistente/prospectos/${prospectoId}/actividades`);
      const actividades = Array.isArray(json.data) ? json.data : [];
      if (actividades.length === 0) {
        container.classList.add("d-none");
        return;
      }
      tbody.innerHTML = actividades.map((a) => {
        const finFecha = a.fecha_fin || a.fecha_inicio;
        const finHora = a.hora_fin || calcularHoraFin(a.hora_inicio, a.tiempo_estimado_minutos);
        return `<tr>
          <td><strong>${escapeHtml(a.tarea_nombre || "")}</strong></td>
          <td style="white-space:nowrap">${escapeHtml(formatMin(a.tiempo_estimado_minutos))}</td>
          <td style="white-space:nowrap">${escapeHtml(a.usuario_nombre || "—")}</td>
          <td style="white-space:nowrap">${escapeHtml(formatearFecha(a.fecha_inicio))} ${escapeHtml(a.hora_inicio || "")}</td>
          <td style="white-space:nowrap">${escapeHtml(formatearFecha(finFecha))} ${escapeHtml(finHora || "")}</td>
        </tr>`;
      }).join("");
      container.classList.remove("d-none");
    } catch {
      container.classList.add("d-none");
    }
  }

  function calcularHoraFin(horaInicio, minutos) {
    if (!horaInicio || !minutos) return "";
    const [hh, mm] = horaInicio.split(":").map(Number);
    const totalMin = hh * 60 + mm + minutos;
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function formatearFecha(fecha) {
    if (!fecha) return "";
    const [y, m, d] = fecha.split("-");
    if (!y || !m || !d) return fecha;
    return `${d}-${m}-${y}`;
  }

  async function submitNueva() {
    const prospectoId = Number(document.getElementById("js-cal-nueva-prospecto-id").value);
    const tareaId = Number(document.getElementById("js-cal-nueva-tarea").value);
    const usuarioId = Number(document.getElementById("js-cal-nueva-usuario").value);
    const fecha = document.getElementById("js-cal-nueva-fecha").value;
    const hora = document.getElementById("js-cal-nueva-hora").value;
    const duracion =
      Number(document.getElementById("js-cal-nueva-duracion-h").value) * 60 +
      Number(document.getElementById("js-cal-nueva-duracion-m").value);
    const prioridad = document.getElementById("js-cal-nueva-prioridad").value;
    const motivo = document.getElementById("js-cal-nueva-motivo").value;
    if (!prospectoId || !tareaId || !usuarioId || !fecha || !hora || !duracion) {
      showToast("warning", "Completa todos los campos obligatorios.");
      return;
    }
    const btn = document.getElementById("js-cal-nueva-aplicar");
    btn.disabled = true;
    try {
      await fetchJSON("/api/calendario-asistente/reuniones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospecto_id: prospectoId,
          tarea_id: tareaId,
          usuario_id: usuarioId,
          fecha,
          hora_inicio: hora,
          duracion_minutos: duracion,
          prioridad,
          motivo: motivo || undefined,
        }),
      });
      showToast("success", "Reunión creada.");
      const modal = getModal("js-cal-nueva-modal");
      if (modal) modal.hide();
      await refreshAll();
    } catch (err) {
      if (err.status === 409 && err.payload) {
        renderConflictResult(
          "js-cal-nueva-result",
          err.payload,
          "No hay hueco en la jornada del usuario asignado.",
        );
      } else {
        showToast("error", err.message || "Error al crear la reunión.");
      }
    } finally {
      btn.disabled = false;
    }
  }

  // -------- modal programar (reunión legacy sin slot) ---------------
  // Se abre al tocar una card del sidebar "TAREA · REUNIONES". Toma los
  // datos de la actividad cacheada (sidebarActividadesById) y los usa
  // como defaults del formulario. Si por algún motivo la actividad no
  // está en el cache, hace fetch al endpoint de detalle.
  function setCalProgField(name, value) {
    const el = document.querySelector(`[data-cal-prog="${name}"]`);
    if (!el) return;
    if (value === null || value === undefined || value === "") {
      el.textContent = "—";
      return;
    }
    el.textContent = value;
  }

  async function openProgramarModal(actividadId) {
    console.log("[asistente-cal] openProgramarModal called with id=", actividadId);
    const modal = getModal("js-cal-programar-modal");
    if (!modal) {
      console.log("[asistente-cal] modal element not found or bootstrap missing");
      return;
    }
    console.log("[asistente-cal] modal instance obtained", modal);
    let a = sidebarActividadesById.get(Number(actividadId));
    // Si el item en cache no trae `registrado_por` (porque se cargó
    // antes de ese cambio), pedimos el detalle fresco al backend para
    // asegurarnos de mostrar quién creó la reunión.
    if (a && !a.registrado_por) {
      try {
        const json = await fetchJSON(
          `/api/calendario-asistente/reuniones/${actividadId}`,
        );
        if (json && json.data) {
          a = { ...a, ...json.data };
          sidebarActividadesById.set(Number(actividadId), a);
        }
      } catch (err) {
        console.warn("[asistente-cal] no se pudo refrescar detalle:", err);
      }
    }
    if (!a) {
      console.log("[asistente-cal] not in cache, fetching from API…");
      try {
        const json = await fetchJSON(
          `/api/calendario-asistente/reuniones/${actividadId}`,
        );
        a = json.data;
      } catch (err) {
        console.error("[asistente-cal] openProgramarModal:", err);
        showToast("error", err.message || "No se pudo cargar la reunión.");
        return;
      }
    }
    if (!a) {
      showToast("error", "Reunión no encontrada.");
      return;
    }

    // Card resumen del prospecto.
    setCalProgField("titulo", a.prospecto?.titulo || "—");
    // Contactos: lista TODOS los del prospecto (no sólo el principal),
    // con su celular. Si no hay ninguno, "—".
    const progContactos = Array.isArray(a.prospecto?.contactos)
      ? a.prospecto.contactos.filter(Boolean)
      : [];
    const progContactosEl = document.querySelector('[data-cal-prog="contactos"]');
    if (progContactosEl) {
      if (progContactos.length === 0) {
        progContactosEl.textContent = "—";
      } else {
        progContactosEl.innerHTML = progContactos
          .map((c) => {
            const nombre =
              c.nombre_completo ||
              [c.nombres, c.apellidos].filter(Boolean).join(" ").trim();
            const cel = c.celular
              ? ` <span class="text-muted">· ${escapeHtml(c.celular)}</span>`
              : "";
            return nombre
              ? `<div>${escapeHtml(nombre)}${cel}</div>`
              : "";
          })
          .filter(Boolean)
          .join("");
      }
    }
    setCalProgField("universidad", a.prospecto?.universidad || "—");
    setCalProgField("carrera", a.prospecto?.carrera || "—");
    setCalProgField("nivel", a.prospecto?.nivel_academico || "—");
    setCalProgField("tarea", a.tarea?.nombre || "—");
    setCalProgField("fentrega", a.prospecto?.fecha_entrega || "—");
    const prioEl = document.querySelector('[data-cal-prog="prioridad"]');
    if (prioEl) {
      prioEl.innerHTML = prioridadBadgeHtml(a.prioridad);
    }
    // "Registrado por" — usuario de la sesión que creó la actividad
    // (auditoría, no es el asignado). Nullable en actividades legacy.
    const regPorEl = document.querySelector('[data-cal-prog="registrado_por"]');
    if (regPorEl) {
      regPorEl.textContent = a.registrado_por?.nombre_completo || "—";
    }

    // Defaults del formulario.
    // IMPORTANTE: el sidebar muestra actividades SIN horario_usuario
    // (aún no programadas formalmente), por lo que `a.fecha_inicio` /
    // `a.hora_inicio` son los valores "marcados" al crear la actividad
    // y deben respetarse como prefill del modal. NO los pisamos con el
    // historial de horario_usuario (eso aplica sólo a "Agregar Cliente",
    // donde la actividad es nueva y no tiene hora propia).
    document.getElementById("js-cal-prog-actividad-id").value = String(a.id);
    document.getElementById("js-cal-prog-fecha").value =
      a.fecha_inicio || todayLocalYYYYMMDD();
    // hora_inicio puede llegar como "HH:MM:SS"; normalizamos a "HH:MM".
    let hora = a.hora_inicio || "";
    if (typeof hora === "string" && hora.length >= 5) hora = hora.slice(0, 5);
    document.getElementById("js-cal-prog-hora").value = hora;
    document.getElementById("js-cal-prog-duracion").value =
      Number(a.tiempo_estimado_minutos) || 60;
    document.getElementById("js-cal-prog-motivo").value = "";
    document.getElementById("js-cal-prog-result").innerHTML = "";

    // Combo de usuarios: reusamos las options del header y dejamos
    // seleccionado el usuario que ya tenía la actividad.
    const selProgUsuario = document.getElementById("js-cal-prog-usuario");
    const defaultUid = a.usuario_id || selUsuarios?.value || "";
    const opciones = ['<option value="">— Selecciona —</option>'];
    if (selUsuarios) {
      Array.from(selUsuarios.options).forEach((opt) => {
        if (!opt.value) return;
        opciones.push(
          `<option value="${opt.value}"${
            String(opt.value) === String(defaultUid) ? " selected" : ""
          }>${escapeHtml(opt.textContent.trim())}</option>`,
        );
      });
    }
    selProgUsuario.innerHTML = opciones.join("");
    // Forzar el valor por JS para cubrir quirks de `selected` en
    // reasignación de innerHTML.
    if (defaultUid) selProgUsuario.value = String(defaultUid);

    modal.show();
  }

  async function submitProgramar() {
    const btn = document.getElementById("js-cal-prog-aplicar");
    const id = Number(document.getElementById("js-cal-prog-actividad-id").value);
    if (!id) return;
    const usuarioId = Number(document.getElementById("js-cal-prog-usuario").value);
    const fecha = document.getElementById("js-cal-prog-fecha").value;
    const hora = document.getElementById("js-cal-prog-hora").value;
    const duracion = Number(document.getElementById("js-cal-prog-duracion").value);
    const motivo = document.getElementById("js-cal-prog-motivo").value;
    if (!usuarioId || !fecha || !hora || !duracion) {
      showToast("warning", "Completa usuario, fecha, hora y duración.");
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetchJSON(
        `/api/calendario-asistente/reuniones/${id}/programar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usuario_id: usuarioId,
            fecha,
            hora_inicio: hora,
            duracion_minutos: duracion,
            motivo: motivo || undefined,
          }),
        },
      );
      // Toast rico: indica si se movieron, partieron o reorganizaron otras
      // actividades para que el Asistente sepa qué se reubicó.
      const applied = res?.plan?.applied || {
        moves: 0,
        splits: 0,
        overflow: 0,
        cascadeMoves: 0,
      };
      const blocked = res?.plan?.blockedMoves || [];
      const parts = ["Reunión programada."];
      if (applied.moves > 0) {
        parts.push(
          `Se movieron ${applied.moves} actividad${applied.moves === 1 ? "" : "es"}.`,
        );
      }
      if (applied.splits > 0) {
        parts.push(
          `Se partieron ${applied.splits} actividad${applied.splits === 1 ? "" : "es"}.`,
        );
      }
      if (applied.cascadeMoves > 0) {
        parts.push(
          `Se reorganizaron ${applied.cascadeMoves} bloque${applied.cascadeMoves === 1 ? "" : "s"} de la actividad para hacer espacio.`,
        );
      }
      if (applied.overflow > 0) {
        parts.push(
          `Hubo ${applied.overflow} bloque${applied.overflow === 1 ? "" : "s"} que ${applied.overflow === 1 ? "pasó" : "pasaron"} al día siguiente.`,
        );
      }
      if (blocked.length > 0) {
        parts.push(
          `${blocked.length} actividad${blocked.length === 1 ? "" : "es"} no se ${blocked.length === 1 ? "pudo" : "pudieron"} reordenar.`,
        );
      }
      showToast("success", parts.join(" "));
      const modal = getModal("js-cal-programar-modal");
      if (modal) modal.hide();
      await refreshAll();
    } catch (err) {
      if (err.status === 409 && err.payload) {
        renderConflictResult(
          "js-cal-prog-result",
          err.payload,
          "No hay hueco en la jornada del usuario asignado.",
        );
      } else {
        showToast("error", err.message || "Error al programar la reunión.");
      }
    } finally {
      btn.disabled = false;
    }
  }

  // -------- eliminar ------------------------------------------------
  async function submitGuardarBloque(actividadId, horarioId, tipo) {
    const etiqueta = tipo === "extra" ? "hora extra" : "hora libre";
    const confirmTxt = tipo === "extra"
      ? "El bloque se deshabilitará y las actividades siguientes ocuparán su lugar. Se guardará como hora extra pendiente."
      : "El bloque se deshabilitará y las actividades siguientes ocuparán su lugar. Se registrará como hora libre.";
    const modal = getModal("js-cal-event-modal");
    if (modal) modal.hide();
    const { isConfirmed } = await Swal.fire({
      title: `¿Guardar como ${etiqueta}?`,
      text: confirmTxt,
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'Atrás',
      confirmButtonColor: tipo === "extra" ? '#6c757d' : '#28a745',
    });
    if (!isConfirmed) {
      if (modal) modal.show();
      return;
    }
    try {
      const json = await fetchJSON(
        `/api/calendario-asistente/reuniones/${actividadId}/bloque/${horarioId}/guardar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo }),
        },
      );
      showToast("success", json.data?.mensaje || `Bloque guardado como ${etiqueta}.`);
      await refreshAll();
    } catch (err) {
      showToast("error", err.message || "Error al guardar el bloque.");
    }
  }

  async function submitEliminar(actividadId) {
    const btn = document.getElementById("js-cal-btn-eliminar");
    const esReunion = btn?.dataset?.esReunion === "1";
    const etiqueta = esReunion ? "reunión" : "actividad";
    
    // Ocultamos el modal de Bootstrap temporalmente porque atrapa el foco
    // y no deja escribir en el SweetAlert.
    const modal = getModal("js-cal-event-modal");
    if (modal) modal.hide();

    const { value: motivo, isConfirmed } = await Swal.fire({
      title: `¿Cancelar esta ${etiqueta}?`,
      text: "Quedará registrada como inactiva. Por favor, indica el motivo de la cancelación:",
      input: 'textarea',
      inputPlaceholder: 'Escribe el motivo aquí...',
      inputAttributes: {
        'aria-label': 'Motivo de la cancelación'
      },
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'Atrás',
      confirmButtonColor: '#d33',
      inputValidator: (value) => {
        if (!value || !value.trim()) {
          return '¡El motivo es obligatorio!'
        }
      }
    });

    if (!isConfirmed) {
      // Si canceló la acción, volvemos a mostrar el modal de detalles
      if (modal) modal.show();
      return;
    }

    try {
      await fetchJSON(`/api/calendario-asistente/reuniones/${actividadId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() })
      });
      showToast("success", `${etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)} cancelada.`);
      await refreshAll();
    } catch (err) {
      showToast("error", err.message || "Error al cancelar.");
    }
  }

  // -------- render 409 (overflow suggestions) -----------------------
  function renderConflictResult(containerId, payload, leadText) {
    const cont = document.getElementById(containerId);
    if (!cont) return;
    const s = payload.suggestions || {};
    const mensaje = payload.error || leadText;
    const blocked = payload.blockedMoves || [];
    const blockedReasonTxt = (b) => {
      if (b.motivo === "deadline") {
        const dl = b.deadline
          ? ` (entrega ${String(b.deadline).slice(0, 10)})`
          : "";
        return `supera la fecha de entrega${dl}`;
      }
      if (b.motivo === "ALTA") return "tiene prioridad ALTA";
      if (b.motivo === "fuera_jornada")
        return "no entra en la jornada de ese día";
      return b.motivo || "no se puede mover";
    };
    const blockedHtml = blocked.length
      ? `<h6 class="fs-xxs text-uppercase text-muted fw-semibold mt-2">
           Actividades que no se pudieron reordenar
         </h6>
         <ul class="list-group list-group-flush mb-2">
           ${blocked
             .map(
               (b) =>
                 `<li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><i class="ti ti-ban me-1 text-danger"></i>Actividad #${escapeHtml(String(b.actividad_id))}</span>
                    <span class="badge bg-danger-subtle text-danger">${escapeHtml(blockedReasonTxt(b))}</span>
                  </li>`,
             )
             .join("")}
         </ul>`
      : "";
    const other = (s.otherAuxiliares || []).map(
      (a) =>
        `<li class="list-group-item d-flex justify-content-between align-items-center">
          <span><i class="ti ti-user me-1 text-primary"></i>${escapeHtml(a.nombre)}</span>
          <span class="badge bg-primary-subtle text-primary">${escapeHtml(a.slot.hi)} — ${escapeHtml(a.slot.hf)}</span>
        </li>`,
    ).join("");
    const he = s.horasExtras || null;
    const mv = s.moverDeadline || null;
    cont.innerHTML =
      `<div class="alert alert-warning mb-2">
        <i class="ti ti-alert-triangle me-1"></i>
        <strong>${escapeHtml(mensaje)}</strong>
        ${payload.reason ? ` <small class="text-muted">(${escapeHtml(payload.reason)})</small>` : ""}
      </div>` +
      blockedHtml +
      (other
        ? `<h6 class="fs-xxs text-uppercase text-muted fw-semibold">Otros usuarios con hueco</h6>
           <ul class="list-group list-group-flush mb-2">${other}</ul>`
        : "") +
      (he
        ? `<div class="alert alert-info py-2 mb-2">
            <i class="ti ti-clock-plus me-1"></i>Como horas extras: <strong>${escapeHtml(he.texto)}</strong>
          </div>`
        : "") +
      (mv
        ? `<div class="alert alert-secondary py-2 mb-0">
            <i class="ti ti-calendar-arrow-down me-1"></i>O correr el deadline al
            <strong>${escapeHtml(String(mv.fecha_sugerida).slice(0, 10))}</strong>
          </div>`
        : "");
  }

  // -------- horas extras: selección + acciones ----------------------
  let heSelected = new Set();

  function actualizarHeButtons() {
    const btnCanjear = document.getElementById("js-he-btn-canjear");
    const btnPagar = document.getElementById("js-he-btn-pagar");
    const selEl = document.getElementById("js-he-seleccionados");
    const count = heSelected.size;
    if (selEl) selEl.textContent = `${count} seleccionado${count !== 1 ? "s" : ""}`;
    if (btnCanjear) btnCanjear.disabled = count === 0;
    if (btnPagar) btnPagar.disabled = count === 0;
  }

  function toggleHeRowCb(id, checked) {
    if (checked) heSelected.add(id);
    else heSelected.delete(id);
    actualizarHeButtons();
  }

  // -------- refresh -------------------------------------------------
  function renderTablaHorasExtras(data) {
    const tbody = document.getElementById("js-he-tbody");
    if (!tbody) return;
    const totalExtra = document.getElementById("js-he-total-extra");
    const totalLibre = document.getElementById("js-he-total-libre");
    if (totalExtra) totalExtra.textContent = `${data.resumen.extra.count} (${data.resumen.extra.minutos} min)`;
    if (totalLibre) totalLibre.textContent = `${data.resumen.libre.count} (${data.resumen.libre.minutos} min)`;
    if (!data.rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">No hay horas registradas esta semana.</td></tr>';
      heSelected.clear();
      actualizarHeButtons();
      return;
    }
    heSelected.clear();
    tbody.innerHTML = data.rows.map(r => {
      const badge = r.tipo === "extra"
        ? '<span class="badge bg-secondary">Extra</span>'
        : '<span class="badge bg-success">Libre</span>';
      const isExtra = r.tipo === "extra";
      return `<tr>
        <td><input type="checkbox" class="form-check-input he-row-cb" data-id="${r.id}" ${isExtra ? "" : "disabled"}></td>
        <td>${escapeHtml(r.fecha)}</td>
        <td>${escapeHtml(r.hora_inicio)}</td>
        <td>${escapeHtml(r.hora_fin)}</td>
        <td>${escapeHtml(r.prospecto)}</td>
        <td>${escapeHtml(r.actividad)}</td>
        <td>${r.minutos} min</td>
        <td>${badge}</td>
      </tr>`;
    }).join('');
    actualizarHeButtons();
  }

  // -------- horas extras: eventos ----------------------------------
  document.getElementById("js-he-select-all")?.addEventListener("change", function () {
    const checked = this.checked;
    document.querySelectorAll(".he-row-cb:not(:disabled)").forEach(cb => {
      cb.checked = checked;
      toggleHeRowCb(Number(cb.dataset.id), checked);
    });
  });

  document.getElementById("js-he-tbody")?.addEventListener("change", function (e) {
    const cb = e.target.closest(".he-row-cb");
    if (!cb) return;
    toggleHeRowCb(Number(cb.dataset.id), cb.checked);
  });

  document.getElementById("js-he-btn-pagar")?.addEventListener("click", async function () {
    const ids = Array.from(heSelected);
    if (!ids.length) return;
    const ok = await Swal.fire({
      title: "¿Pagar horas extras?",
      text: `Se marcarán ${ids.length} hora${ids.length !== 1 ? "s" : ""} extra${ids.length !== 1 ? "s" : ""} como pagadas.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Sí, pagar",
      cancelButtonText: "Cancelar",
    });
    if (!ok.isConfirmed) return;
    try {
      await fetchJSON("/api/calendario-asistente/horas-extras/pagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      showToast("success", `${ids.length} hora${ids.length !== 1 ? "s" : ""} pagada${ids.length !== 1 ? "s" : ""}.`);
      const modal = getModal("js-he-modal");
      if (modal) modal.hide();
      await loadResumenHorasExtras();
    } catch (e) {
      showToast("error", e.message || "Error al pagar horas extras.");
    }
  });

  document.getElementById("js-he-btn-canjear")?.addEventListener("click", function () {
    const fechaEl = document.getElementById("js-he-canje-fecha");
    const errEl = document.getElementById("js-he-canje-error");
    if (fechaEl) fechaEl.value = "";
    if (errEl) errEl.classList.add("d-none");
    const modal = new bootstrap.Modal(document.getElementById("js-he-canje-modal"));
    modal.show();
  });

  document.getElementById("js-he-canje-aplicar")?.addEventListener("click", async function () {
    const ids = Array.from(heSelected);
    if (!ids.length) return;
    const fechaEl = document.getElementById("js-he-canje-fecha");
    const horaEl = document.getElementById("js-he-canje-hora");
    const errEl = document.getElementById("js-he-canje-error");
    const fecha = fechaEl?.value;
    const hora = horaEl?.value;
    if (!fecha) {
      if (errEl) {
        errEl.textContent = "Debes seleccionar una fecha.";
        errEl.classList.remove("d-none");
      }
      return;
    }
    if (!hora) {
      if (errEl) {
        errEl.textContent = "Debes seleccionar una hora.";
        errEl.classList.remove("d-none");
      }
      return;
    }
    if (errEl) errEl.classList.add("d-none");
    const btn = this;
    btn.disabled = true;
    try {
      await fetchJSON("/api/calendario-asistente/horas-extras/canjear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, fecha_destino: fecha, hora_inicio: hora }),
      });
      showToast("success", `${ids.length} hora${ids.length !== 1 ? "s" : ""} canjeada${ids.length !== 1 ? "s" : ""}.`);
      const submodal = getModal("js-he-canje-modal");
      if (submodal) submodal.hide();
      const modal = getModal("js-he-modal");
      if (modal) modal.hide();
      await loadResumenHorasExtras();
    } catch (e) {
      showToast("error", e.message || "Error al canjear horas extras.");
    } finally {
      btn.disabled = false;
    }
  });

  async function loadResumenHorasExtras() {
    const uid = selUsuarios?.value;
    if (!uid) return;
    try {
      const json = await fetchJSON(
        `/api/calendario-asistente/horas-extras/resumen?usuario_id=${encodeURIComponent(uid)}`,
      );
      if (!json?.success) return;
      const d = json.data;
      const el = document.getElementById("js-horas-extras-resumen");
      if (!el) return;
      // Guardar data para el modal
      el.dataset.heData = JSON.stringify(d);
      const partes = [];
      if (d.resumen.extra?.count > 0) {
        partes.push(`<span class="text-secondary fw-medium"><i class="ti ti-clock-plus me-1"></i>Extra: ${d.resumen.extra.count} (${d.resumen.extra.minutos} min)</span>`);
      }
      if (d.resumen.libre?.count > 0) {
        partes.push(`<span class="text-success fw-medium"><i class="ti ti-clock-off me-1"></i>Libre: ${d.resumen.libre.count} (${d.resumen.libre.minutos} min)</span>`);
      }
      el.innerHTML = partes.length
        ? `<a href="#" class="text-decoration-none" data-bs-toggle="modal" data-bs-target="#js-he-modal">${partes.join(' · ')}</a>`
        : '';
    } catch (e) {
      // silent
    }
  }

  // Al abrir el modal de horas extras, renderizar la tabla
  const heModal = document.getElementById("js-he-modal");
  if (heModal) {
    heModal.addEventListener("show.bs.modal", function () {
      const el = document.getElementById("js-horas-extras-resumen");
      const selectAll = document.getElementById("js-he-select-all");
      if (selectAll) selectAll.checked = false;
      if (!el?.dataset?.heData) return;
      try {
        renderTablaHorasExtras(JSON.parse(el.dataset.heData));
      } catch (_) {}
    });
  }

  async function refreshAll() {
    await Promise.all([loadReuniones(), loadCalendario(), loadResumenHorasExtras()]);
  }

  // -------- FullCalendar --------------------------------------------
  function initCalendar() {
    if (typeof FullCalendar === "undefined") {
      console.error(
        "[asistente-cal] FullCalendar no está cargado. Revisa el orden de <script> en admin.routes.js.",
      );
      const calEl = document.getElementById("calendar");
      if (calEl) {
        calEl.innerHTML =
          '<div class="alert alert-danger m-3">FullCalendar no se cargó. Revisa la consola.</div>';
      }
      return null;
    }
    const calEl = document.getElementById("calendar");
    if (!calEl) return null;
    const cal = new FullCalendar.Calendar(calEl, {
      initialView: "timeGridWeek",
      locale: "es",
      firstDay: 1,
      hiddenDays: [0],
      slotMinTime: "07:00:00",
      slotMaxTime: "20:00:00",
      slotDuration: "00:15:00",
      slotLabelInterval: "01:00",
      // Altura mínima por fila de 15 min para que eventos cortos (5-15 min)
      // se vean con altura legible y no se apilen ilegibles.
      slotMinHeight: 28,
      allDaySlot: false,
      height: "auto",
      contentHeight: "auto",
      expandRows: true,
      nowIndicator: true,
      editable: true,
      eventStartEditable: true,
      eventDurationEditable: true,
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
      events: [],
      eventDidMount: function (info) {
        const a = info.event.extendedProps?.actividad;
        info.el.title =
          a?.hora_inicio && a?.tarea?.nombre
            ? `${a.hora_inicio} · ${a.tarea.nombre}`
            : info.event.title;
      },
      eventClick: function (info) {
        const id = Number(info.event.extendedProps?.actividad_id || 0);
        const hid = Number(info.event.extendedProps?.horario_usuario_id || 0);
        const marca = info.event.extendedProps?.marca || null;
        if (!id && hid && marca === "permiso") {
          // Bloque permiso: mostrar info
          const a = info.event.extendedProps?.actividad;
          showToast("info", `🔒 Permiso: ${a?.hora_inicio || ""} – ${a?.hora_fin || ""} (bloque fijo)`);
        } else if (!id && hid) {
          // Bloque sin actividad (canje/libre): mostrar detalle del canje
          openCanjeDetailModal(hid);
        } else if (id) {
          openDetailModal(id, hid);
        }
      },
      eventDrop: function (info) {
        const id = Number(info.event.extendedProps?.actividad_id || 0);
        const marca = info.event.extendedProps?.marca || null;
        if (!id || marca === "permiso") {
          info.revert();
          return;
        }
        const newStart = info.event.start;
        const newEnd = info.event.end;
        const mins = newStart && newEnd
          ? Math.max(5, Math.round((newEnd.getTime() - newStart.getTime()) / 60_000))
          : Math.max(5, Number(info.event.extendedProps?.actividad?.tiempo_estimado_minutos) || 60);
        const hh = newStart ? String(newStart.getHours()).padStart(2, "0") : "09";
        const mm = newStart ? String(newStart.getMinutes()).padStart(2, "0") : "00";
        const fecha = newStart
          ? `${newStart.getFullYear()}-${String(newStart.getMonth() + 1).padStart(2, "0")}-${String(newStart.getDate()).padStart(2, "0")}`
          : todayLocalYYYYMMDD();
        openReprogramarModal(id, { fecha, hora: `${hh}:${mm}`, duracion: mins });
      },
      eventResize: function (info) {
        const id = Number(info.event.extendedProps?.actividad_id || 0);
        if (!id) {
          info.revert();
          return;
        }
        const newEnd = info.event.end;
        const newStart = info.event.start;
        const mins = newStart && newEnd
          ? Math.max(5, Math.round((newEnd.getTime() - newStart.getTime()) / 60_000))
          : Math.max(5, Number(info.event.extendedProps?.actividad?.tiempo_estimado_minutos) || 60);
        const hh = newStart ? String(newStart.getHours()).padStart(2, "0") : "09";
        const mm = newStart ? String(newStart.getMinutes()).padStart(2, "0") : "00";
        const fecha = newStart
          ? `${newStart.getFullYear()}-${String(newStart.getMonth() + 1).padStart(2, "0")}-${String(newStart.getDate()).padStart(2, "0")}`
          : todayLocalYYYYMMDD();
        openReprogramarModal(id, { fecha, hora: `${hh}:${mm}`, duracion: mins });
      },
    });
    cal.render();
    window.__ASISTENTE_CAL__ = cal;
    return cal;
  }

  // -------- permisos modal ------------------------------------------
  let permisosPreviewData = null;
  let permisosUsuariosCache = [];

  function loadPermisosUsuarios() {
    const sel = document.getElementById("cal-pu-usuario");
    const filtro = document.getElementById("cal-pu-filtro-usuario");
    if (!sel) return;
    const opts = ['<option value="">— Selecciona —</option>'];
    const filtroOpts = ['<option value="">Todos</option>'];
    if (selUsuarios) {
      Array.from(selUsuarios.options).forEach((opt) => {
        if (!opt.value) return;
        const label = opt.textContent.trim();
        opts.push(`<option value="${opt.value}">${escapeHtml(label)}</option>`);
        filtroOpts.push(`<option value="${opt.value}">${escapeHtml(label)}</option>`);
      });
    }
    sel.innerHTML = opts.join("");
    filtro.innerHTML = filtroOpts.join("");
  }

  async function onClickPermisosPreview() {
    const usuarioId = document.getElementById("cal-pu-usuario").value;
    const fecha = document.getElementById("cal-pu-fecha").value;
    const horaInicio = document.getElementById("cal-pu-hora-inicio").value;
    const horaFin = document.getElementById("cal-pu-hora-fin").value;
    if (!usuarioId || !fecha || !horaInicio || !horaFin) {
      showToast("warning", "Completa todos los campos requeridos.");
      return;
    }
    const btn = document.getElementById("cal-pu-btn-preview");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Analizando…';
    try {
      const json = await fetchJSON(
        `/api/calendario-asistente/permisos/preview?usuario_id=${encodeURIComponent(usuarioId)}&fecha=${encodeURIComponent(fecha)}&hora_inicio=${encodeURIComponent(horaInicio)}&hora_fin=${encodeURIComponent(horaFin)}`,
      );
      permisosPreviewData = json.data;
      renderPermisosPreview(permisosPreviewData);
      document.getElementById("cal-pu-btn-crear").disabled = false;
    } catch (e) {
      showToast("error", "Error en preview: " + e.message);
      document.getElementById("cal-pu-preview-content").innerHTML = "";
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-eye me-1"></i>Vista previa';
    }
  }

  function renderPermisosPreview(data) {
    const content = document.getElementById("cal-pu-preview-content");
    if (!data) { content.innerHTML = ""; return; }
    const paramsHTML = `<p class="mb-1 small"><strong>${escapeHtml(data.fecha)}</strong> ${escapeHtml(data.hora_inicio)} – ${escapeHtml(data.hora_fin)}</p>`;
    if (!data.actividades?.length) {
      content.innerHTML = paramsHTML + '<div class="alert alert-success py-1 mb-0 small"><i class="ti ti-check me-1"></i>No hay actividades en este rango.</div>';
      return;
    }
    const urgentes = data.urgentes || [];
    const movibles = (data.actividades || []).filter(a => a.prioridad !== "ALTA" && !a.bloqueada);
    const noMovibles = data.no_movibles || [];
    let html = paramsHTML + `<div class="mb-1 small"><strong>Total:</strong> ${data.actividades.length}</div>`;
    if (urgentes.length) {
      html += `<div class="alert alert-warning py-1 px-2 mb-1 small"><i class="ti ti-alert-triangle me-1"></i><strong>${urgentes.length} urgente(s)</strong> — no se moverán<ul class="mb-0 mt-1 ps-3">`;
      urgentes.forEach(a => html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")}</li>`);
      html += "</ul></div>";
    }
    if (movibles.length) {
      html += `<div class="alert alert-info py-1 px-2 mb-1 small"><i class="ti ti-arrows-shuffle me-1"></i><strong>${movibles.length} reprogramable(s)</strong><ul class="mb-0 mt-1 ps-3">`;
      movibles.forEach(a => html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")} (${escapeHtml(a.hora_inicio)}–${escapeHtml(a.hora_fin)})</li>`);
      html += "</ul></div>";
    }
    if (noMovibles.length) {
      html += `<div class="alert alert-danger py-1 px-2 mb-1 small"><i class="ti ti-x me-1"></i><strong>${noMovibles.length} no movible(s)</strong><ul class="mb-0 mt-1 ps-3">`;
      noMovibles.forEach(a => html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")} (${escapeHtml(a.motivo || "")})</li>`);
      html += "</ul></div>";
    }
    content.innerHTML = html;
  }

  async function onClickPermisosCrear() {
    const usuarioId = document.getElementById("cal-pu-usuario").value;
    const fecha = document.getElementById("cal-pu-fecha").value;
    const horaInicio = document.getElementById("cal-pu-hora-inicio").value;
    const horaFin = document.getElementById("cal-pu-hora-fin").value;
    const motivo = document.getElementById("cal-pu-motivo").value;
    if (!usuarioId || !fecha || !horaInicio || !horaFin) {
      showToast("warning", "Completa todos los campos requeridos.");
      return;
    }
    const ok = await confirmDialog("¿Crear permiso?", "Se reprogramarán las actividades automáticamente.", "Sí, crear");
    if (!ok) return;
    const btn = document.getElementById("cal-pu-btn-crear");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creando…';
    try {
      const json = await fetchJSON("/api/calendario-asistente/permisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: Number(usuarioId), fecha, hora_inicio: horaInicio, hora_fin: horaFin, motivo }),
      });
      renderPermisoResultado(json.data);
      cargarPermisosList();
      document.getElementById("cal-pu-motivo").value = "";
      document.getElementById("cal-pu-btn-crear").disabled = true;
      document.getElementById("cal-pu-preview-content").innerHTML = "";
    } catch (e) {
      showToast("error", "Error al crear permiso: " + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-lock me-1"></i>Crear permiso y reprogramar';
    }
  }

  function renderPermisoResultado(data) {
    const content = document.getElementById("cal-pu-crear-content");
    if (!data) { content.innerHTML = ""; return; }
    let html = `<div class="alert alert-success py-2 mb-0 small"><i class="ti ti-check me-1"></i>Permiso creado.</div>`;
    if (data.urgentes?.length) {
      html += `<div class="alert alert-warning py-1 px-2 mb-1 small"><i class="ti ti-alert-triangle me-1"></i><strong>${data.urgentes.length} urgente(s) no movidas</strong><ul class="mb-0 mt-1 ps-3">`;
      data.urgentes.forEach(a => html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")}</li>`);
      html += "</ul></div>";
    }
    if (data.reprogramadas?.length) {
      html += `<div class="alert alert-success py-1 px-2 mb-1 small"><i class="ti ti-check me-1"></i><strong>${data.reprogramadas.length} reprogramada(s)</strong><ul class="mb-0 mt-1 ps-3">`;
      data.reprogramadas.forEach(a => html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")}: ${escapeHtml(a.fecha_origen)} ${escapeHtml(a.hora_origen)} → <strong>${escapeHtml(a.fecha_destino)} ${escapeHtml(a.hora_destino)}</strong></li>`);
      html += "</ul></div>";
    }
    if (data.no_movibles?.length) {
      html += `<div class="alert alert-danger py-1 px-2 mb-1 small"><i class="ti ti-x me-1"></i><strong>${data.no_movibles.length} no movible(s)</strong><ul class="mb-0 mt-1 ps-3">`;
      data.no_movibles.forEach(a => html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")} (${escapeHtml(a.motivo || "")})</li>`);
      html += "</ul></div>";
    }
    content.innerHTML = html;
  }

  async function cargarPermisosList() {
    const filtro = document.getElementById("cal-pu-filtro-usuario")?.value || "";
    let url = "/api/calendario-asistente/permisos";
    if (filtro) url += "?usuario_id=" + encodeURIComponent(filtro);
    try {
      const json = await fetchJSON(url);
      renderPermisosList(json.data || []);
    } catch (e) {
      showToast("error", "Error al cargar permisos: " + e.message);
    }
  }

  function renderPermisosList(permisos) {
    const tbody = document.getElementById("cal-pu-tbody");
    const empty = document.getElementById("cal-pu-empty");
    if (!tbody) return;
    if (!permisos.length) {
      tbody.innerHTML = "";
      if (empty) empty.classList.remove("d-none");
      return;
    }
    if (empty) empty.classList.add("d-none");
    tbody.innerHTML = permisos.map(p => `<tr>
      <td>${escapeHtml(p.usuario_persona || p.usuario_nombre || "—")}</td>
      <td>${escapeHtml(p.fecha || "—")}</td>
      <td>${escapeHtml(p.hora_inicio || "—")}</td>
      <td>${escapeHtml(p.hora_fin || "—")}</td>
      <td>${escapeHtml(p.motivo || "—")}</td>
      <td><button class="btn btn-sm btn-outline-danger cal-pu-btn-eliminar" data-id="${p.id}"><i class="ti ti-trash"></i></button></td>
    </tr>`).join("");
    tbody.querySelectorAll(".cal-pu-btn-eliminar").forEach(btn => {
      btn.addEventListener("click", () => onClickPermisoEliminar(btn.dataset.id));
    });
  }

  async function onClickPermisoEliminar(id) {
    if (!await confirmDialog("¿Eliminar permiso?", "Se restaurará el horario anterior.")) return;
    try {
      await fetchJSON(`/api/calendario-asistente/permisos/${id}`, { method: "DELETE" });
      showToast("success", "Permiso eliminado.");
      cargarPermisosList();
    } catch (e) {
      showToast("error", "Error al eliminar permiso: " + e.message);
    }
  }

  // -------- ausencias modal -----------------------------------------
  let ausenciasPreviewData = [];

  function openAusenciasModal() {
    const modal = getModal("js-cal-ausencias-modal");
    if (!modal) return;
    const sel = document.getElementById("cal-au-usuario");
    // Poblar el select con los mismos usuarios del header
    sel.innerHTML = '<option value="">— Selecciona —</option>';
    if (selUsuarios) {
      Array.from(selUsuarios.options).forEach(opt => {
        if (!opt.value) return;
        sel.innerHTML += `<option value="${opt.value}">${escapeHtml(opt.textContent.trim())}</option>`;
      });
    }
    const uid = selUsuarios?.value || "";
    if (uid) sel.value = uid;
    sel.disabled = false;
    document.getElementById("cal-au-fecha-desde").value = "";
    document.getElementById("cal-au-fecha-hasta").value = "";
    document.getElementById("cal-au-motivo").value = "";
    document.getElementById("cal-au-preview-status").textContent = "";
    document.getElementById("cal-au-actividades-wrap").classList.add("d-none");
    document.getElementById("cal-au-urgentes-warning").classList.add("d-none");
    document.getElementById("cal-au-result").innerHTML = "";
    document.getElementById("cal-au-btn-ejecutar").disabled = true;
    ausenciasPreviewData = [];
    modal.show();
  }

  async function submitPreviewAusencia() {
    const uid = Number(selUsuarios?.value) || Number(document.getElementById("cal-au-usuario").value);
    const fechaDesde = document.getElementById("cal-au-fecha-desde").value;
    const fechaHasta = document.getElementById("cal-au-fecha-hasta").value;
    if (!uid) { showToast("warning", "Seleccioná un usuario."); return; }
    if (!fechaDesde || !fechaHasta) { showToast("warning", "Completá las fechas."); return; }
    if (fechaDesde > fechaHasta) { showToast("warning", "'Desde' debe ser anterior a 'Hasta'."); return; }
    const statusEl = document.getElementById("cal-au-preview-status");
    if (statusEl) statusEl.textContent = "Consultando…";
    try {
      const json = await fetchJSON(
        `/api/calendario-asistente/permisos/ausencias/preview?usuario_id=${uid}&fecha_desde=${encodeURIComponent(fechaDesde)}&fecha_hasta=${encodeURIComponent(fechaHasta)}`,
      );
      ausenciasPreviewData = json.data || [];
      if (statusEl) statusEl.textContent = `${ausenciasPreviewData.length} actividad(es) encontradas.`;
      renderAusenciaPreview(ausenciasPreviewData);
    } catch (err) {
      if (statusEl) statusEl.textContent = "Error";
      showToast("error", err.message || "Error en preview.");
    }
  }

  function renderAusenciaPreview(actividades) {
    const wrap = document.getElementById("cal-au-actividades-wrap");
    const tbody = document.getElementById("cal-au-tbody");
    const countEl = document.getElementById("cal-au-actividades-count");
    const warning = document.getElementById("cal-au-urgentes-warning");
    const btnEjecutar = document.getElementById("cal-au-btn-ejecutar");
    if (!wrap || !tbody) return;
    if (!actividades.length) { wrap.classList.add("d-none"); return; }
    wrap.classList.remove("d-none");
    if (countEl) countEl.textContent = String(actividades.length);
    const tieneUrgente = actividades.some(a => a.prioridad === "ALTA" || a.bloqueada);
    warning.classList.toggle("d-none", !tieneUrgente);
    tbody.innerHTML = actividades.map((a, i) => {
      const esUrgente = a.prioridad === "ALTA" || a.bloqueada;
      const prioBadge = a.prioridad === "ALTA" ? '<span class="badge bg-danger-subtle text-danger">ALTA</span>' : a.prioridad === "MEDIA" ? '<span class="badge bg-warning-subtle text-warning">MEDIA</span>' : '<span class="badge bg-secondary-subtle text-secondary">BAJA</span>';
      const bloqueadaTag = a.bloqueada ? '<span class="badge bg-dark text-white ms-1">Bloqueada</span>' : "";
      return `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(a.titulo_prospecto || "—")}</td>
        <td>${escapeHtml(a.tarea_nombre || "—")}</td>
        <td>${escapeHtml(a.fecha)}</td>
        <td>${escapeHtml(a.hora_inicio)}</td>
        <td>${prioBadge}${bloqueadaTag}</td>
        <td>${escapeHtml(a.fecha_entrega || "—")}</td>
        <td>
          <select class="form-select form-select-sm cal-au-accion" data-actividad-id="${a.actividad_id}">
            <option value="reasignar">Reasignar</option>
            <option value="bono"${esUrgente ? " selected" : ""}>Pasar a bono</option>
          </select>
          <div class="cal-au-usuario-destino-wrap" style="margin-top:4px;${esUrgente ? "display:none" : ""}">
            <select class="form-select form-select-sm cal-au-usuario-destino" data-actividad-id="${a.actividad_id}">
              <option value="">Cambiar usuario…</option>
            </select>
          </div>
        </td>
      </tr>`;
    }).join("");
    const destSelects = tbody.querySelectorAll(".cal-au-usuario-destino");
    if (selUsuarios) {
      Array.from(selUsuarios.options).forEach(opt => {
        if (!opt.value) return;
        const label = opt.textContent.trim();
        destSelects.forEach(sel => { sel.innerHTML += `<option value="${opt.value}">${escapeHtml(label)}</option>`; });
      });
    }
    tbody.querySelectorAll(".cal-au-accion").forEach(sel => {
      sel.addEventListener("change", function () {
        const row = this.closest("tr");
        const w = row?.querySelector(".cal-au-usuario-destino-wrap");
        if (w) w.style.display = this.value === "reasignar" ? "" : "none";
      });
    });
    if (btnEjecutar) btnEjecutar.disabled = false;
  }

  async function submitEjecutarAusencia() {
    const uid = Number(selUsuarios?.value) || Number(document.getElementById("cal-au-usuario").value);
    const fechaDesde = document.getElementById("cal-au-fecha-desde").value;
    const fechaHasta = document.getElementById("cal-au-fecha-hasta").value;
    const motivo = document.getElementById("cal-au-motivo").value || "Ausencia";
    if (!uid || !fechaDesde || !fechaHasta) { showToast("warning", "Completá todos los campos."); return; }
    const tbody = document.getElementById("cal-au-tbody");
    const acciones = [];
    tbody?.querySelectorAll(".cal-au-accion").forEach(sel => {
      const actividadId = Number(sel.dataset.actividadId);
      if (!actividadId) return;
      const acc = { actividad_id: actividadId, accion: sel.value };
      if (sel.value === "reasignar") {
        const row = sel.closest("tr");
        const destSel = row?.querySelector(".cal-au-usuario-destino");
        const destinoId = Number(destSel?.value || 0);
        if (destinoId) acc.usuario_destino_id = destinoId;
      }
      acciones.push(acc);
    });
    if (!acciones.length) { showToast("warning", "No hay actividades."); return; }
    const ok = await confirmDialog("¿Ejecutar ausencia?", `Se procesarán ${acciones.length} actividad(es).`, "Sí, ejecutar");
    if (!ok) return;
    const btnEjecutar = document.getElementById("cal-au-btn-ejecutar");
    if (btnEjecutar) btnEjecutar.disabled = true;
    try {
      const json = await fetchJSON("/api/calendario-asistente/permisos/ausencias/ejecutar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: uid, fecha_desde: fechaDesde, fecha_hasta: fechaHasta, motivo, acciones }),
      });
      const data = json.data || {};
      const resultEl = document.getElementById("cal-au-result");
      const partes = [];
      if (data.reasignadas?.length) partes.push(`<span class="text-success fw-semibold">${data.reasignadas.length} reasignada(s)</span>`);
      if (data.bonos?.length) {
        const bonosReales = data.bonos.filter(b => b.tipo !== "bono_auto");
        const bonosAuto = data.bonos.filter(b => b.tipo === "bono_auto");
        if (bonosReales.length) partes.push(`<span class="text-secondary">${bonosReales.length} a bono</span>`);
        if (bonosAuto.length) partes.push(`<span class="text-warning">${bonosAuto.length} pasaron a bono (no caben antes del deadline)</span>`);
      }
      if (data.errores?.length) partes.push(`<span class="text-danger">${data.errores.length} error(es)</span>`);
      if (resultEl) {
        resultEl.innerHTML = `<div class="alert alert-success py-2 mb-0"><i class="ti ti-check me-1"></i> Ausencia ejecutada.<br><small>${partes.length ? partes.join(" · ") : "Sin cambios."}</small></div>`;
      }
      showToast("success", "Ausencia ejecutada.");
      setTimeout(async () => {
        const modal = getModal("js-cal-ausencias-modal");
        if (modal) modal.hide();
        await refreshAll();
      }, 2000);
    } catch (err) {
      const resultEl = document.getElementById("cal-au-result");
      if (resultEl) resultEl.innerHTML = `<div class="alert alert-danger py-2 mb-0">${escapeHtml(err.message || "Error")}</div>`;
      showToast("error", err.message || "Error al ejecutar ausencia.");
    } finally {
      if (btnEjecutar) btnEjecutar.disabled = false;
    }
  }

  // -------- init ----------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    // Mover todos los modales de la página a <body> para evitar que
    // el anidamiento dentro de .container-fluid rompa position: fixed.
    document.querySelectorAll(".modal").forEach((el) => {
      if (el.parentElement !== document.body) {
        document.body.appendChild(el);
      }
    });
    loadUsuarios();
    loadReuniones();
    loadResumenHorasExtras();
    initCalendar();
    // Delegación de clics en sidebar (se adjunta UNA vez en init).
    if (listReuniones) {
      listReuniones.addEventListener("click", (e) => {
        const item = e.target.closest(".reunion-item");
        if (!item) return;
        const rawId = item.getAttribute("data-id");
        const id = Number(rawId || 0);
        if (!id) return;
        openProgramarModal(id);
      });
    }
    if (selUsuarios) {
      selUsuarios.addEventListener("change", function () {
        loadCalendario();
        loadResumenHorasExtras();
      });
    }
    // Cuando el modal "Agregar cliente" termina de guardar, el módulo
    // `agregar-cliente.js` dispara `cliente:creado` en `window`.
    // Refetchamos el calendario para que el/los bloques nuevos aparezcan
    // sin que el usuario tenga que recargar la página.
    window.addEventListener("cliente:creado", function () {
      loadCalendario();
      // Si hay sidebar de reuniones, lo refrescamos también para que
      // el nuevo cliente aparezca en la lista de "pendientes / hoy".
      if (typeof loadReuniones === "function") {
        try { loadReuniones(); } catch (_) {}
      }
    });
    if (btnNewReunion) {
      btnNewReunion.addEventListener("click", function () {
        openNuevaModal();
      });
    }
    // Botones del modal de detalle.
    document
      .getElementById("js-cal-btn-reprogramar")
      ?.addEventListener("click", function () {
        const id = Number(this.dataset.actividadId || 0);
        if (!id) return;
        const modal = getModal("js-cal-event-modal");
        if (modal) modal.hide();
        openReprogramarModal(id);
      });
    document
      .getElementById("js-cal-btn-ajustar-duracion")
      ?.addEventListener("click", function () {
        const id = Number(this.dataset.actividadId || 0);
        const duracion = Number(this.dataset.duracionActual || 60);
        if (!id) return;
        const modal = getModal("js-cal-event-modal");
        if (modal) modal.hide();
        openAjustarDuracionModal(id, duracion);
      });
    document
      .getElementById("js-cal-btn-reasignar")
      ?.addEventListener("click", function () {
        const id = Number(this.dataset.actividadId || 0);
        if (!id) return;
        const modal = getModal("js-cal-event-modal");
        if (modal) modal.hide();
        openReasignarModal(id);
      });
    document
      .getElementById("js-cal-btn-eliminar")
      ?.addEventListener("click", function () {
        const id = Number(this.dataset.actividadId || 0);
        if (!id) return;
        submitEliminar(id);
      });
    document
      .getElementById("js-cal-btn-hora-extra")
      ?.addEventListener("click", function () {
        const id = Number(this.dataset.actividadId || 0);
        const hid = Number(this.dataset.horarioId || 0);
        if (!id || !hid) return;
        submitGuardarBloque(id, hid, "extra");
      });
    document
      .getElementById("js-cal-btn-hora-libre")
      ?.addEventListener("click", function () {
        const id = Number(this.dataset.actividadId || 0);
        const hid = Number(this.dataset.horarioId || 0);
        if (!id || !hid) return;
        submitGuardarBloque(id, hid, "libre");
      });
    // Reprogramar.
    document
      .getElementById("js-cal-rep-aplicar")
      ?.addEventListener("click", submitReprogramar);
    // Ajustar duracion.
    document
      .getElementById("js-cal-ajd-aplicar")
      ?.addEventListener("click", submitAjustarDuracion);
    // Si el modal de reprogramar se cierra sin aplicar (Cancelar, ESC,
    // click afuera), refrescamos el calendario para revertir cualquier
    // cambio visual de un drag&drop previo.
    document
      .getElementById("js-cal-reprogramar-modal")
      ?.addEventListener("hidden.bs.modal", function () {
        if (this.dataset.applied === "1") return;
        refreshAll();
      });
    // Reasignar.
    document
      .getElementById("js-cal-rea-buscar")
      ?.addEventListener("click", loadCandidatosConHueco);
    document
      .getElementById("js-cal-rea-usuario")
      ?.addEventListener("change", function () {
        const btn = document.getElementById("js-cal-rea-aplicar");
        if (btn) btn.disabled = !this.value;
      });
    document
      .getElementById("js-cal-rea-aplicar")
      ?.addEventListener("click", submitReasignar);
    // Nueva.
    initProspectoChoices();
    document
      .getElementById("js-cal-nueva-aplicar")
      ?.addEventListener("click", submitNueva);
    // Al cambiar el usuario en el modal "Programar", refrescar los
    // defaults de fecha+hora desde su historial de horario_usuario.
    document
      .getElementById("js-cal-nueva-usuario")
      ?.addEventListener("change", function () {
        applyFechaHoraDefaultsFromUsuario(
          this.value ? Number(this.value) : null,
          "js-cal-nueva-fecha",
          "js-cal-nueva-hora",
        );
      });
    // Programar (sidebar → modal → API).
    document
      .getElementById("js-cal-prog-aplicar")
      ?.addEventListener("click", submitProgramar);
    // CLIENTES tab: select change + refresh.
    // Mostrar/ocultar el botón "Crear reunión" según el tab activo
    const btnCrearFooter = document.getElementById("js-cal-nueva-aplicar");
    document.getElementById("js-cal-tab-agregar-cliente-btn")?.addEventListener("click", function () {
      if (btnCrearFooter) btnCrearFooter.style.display = "none";
    });
    document.getElementById("js-cal-tab-reuniones-btn")?.addEventListener("click", function () {
      if (btnCrearFooter) btnCrearFooter.style.display = "";
    });
    // Permisos modal
    const btnPermisos = document.getElementById("js-cal-btn-permisos");
    if (btnPermisos) {
      btnPermisos.addEventListener("click", function () {
        loadPermisosUsuarios();
        cargarPermisosList();
        document.getElementById("cal-pu-preview-content").innerHTML = "";
        document.getElementById("cal-pu-crear-content").innerHTML = "";
        document.getElementById("cal-pu-btn-crear").disabled = true;
        const modal = getModal("js-cal-permisos-modal");
        if (modal) modal.show();
      });
    }
    document.getElementById("cal-pu-btn-preview")?.addEventListener("click", onClickPermisosPreview);
    document.getElementById("cal-pu-btn-crear")?.addEventListener("click", onClickPermisosCrear);
    document.getElementById("cal-pu-filtro-usuario")?.addEventListener("change", cargarPermisosList);
    // Ausencias modal
    const btnAusencias = document.getElementById("js-cal-btn-ausencias");
    if (selUsuarios) {
      selUsuarios.addEventListener("change", function () {
        if (btnAusencias) btnAusencias.disabled = !this.value;
      });
    }
    if (btnAusencias) {
      btnAusencias.addEventListener("click", openAusenciasModal);
    }
    document.getElementById("cal-au-btn-preview")?.addEventListener("click", submitPreviewAusencia);
    document.getElementById("cal-au-btn-ejecutar")?.addEventListener("click", submitEjecutarAusencia);
  });
})();
