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

  // Construye un evento compatible con FullCalendar v6 a partir de una
  // actividad REUNION. Usamos `fecha_inicio` + `hora_inicio` de la
  // actividad directamente, ya que algunas reuniones legacy no tienen
  // fila en `horario_usuario` (ver potenciales-clientes.service.js:966-972).
  function buildCalendarEvent(a) {
    const start = combineFechaHora(a.fecha_inicio, a.hora_inicio);
    const mins = Math.max(5, Number(a.tiempo_estimado_minutos) || 30);
    const end = start
      ? new Date(start.getTime() + mins * 60_000).toISOString()
      : null;
    const horaTxt = a.hora_inicio ? `${a.hora_inicio} · ` : "";
    const prospectoTxt = a.prospecto?.titulo
      ? ` · ${a.prospecto.titulo}`
      : "";
    // Color de la actividad: si no tiene, dejamos que FullCalendar use
    // el default. Usamos el color tanto para el fondo como para el borde
    // para que el evento se distinga visualmente.
    const color = a.color || null;
    return {
      id: `act-${a.id}`,
      title: `${horaTxt}${a.tarea?.nombre || "(sin tarea)"}${prospectoTxt}`,
      start: start ? start.toISOString() : null,
      end,
      classNames: [calendarClassForEstado(a.estado_progreso)],
      ...(color
        ? { backgroundColor: color, borderColor: color }
        : {}),
      extendedProps: {
        actividad_id: a.id,
        actividad: a,
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
    const contacto = a.prospecto?.contacto_principal || null;
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
          ${metaRow("ti-user", "Contacto", contacto)}
          ${metaRow("ti-building", "Universidad", universidad)}
          ${metaRow("ti-school", "Carrera", carrera)}
          ${metaRow("ti-bookmark", "Nivel académico", nivel)}
          ${metaRow("ti-clock", "Hora propuesta", hora)}
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

  // Abre el modal de detalle. `preselectedActividad` opcional: si llega,
  // usamos esos datos (cuando se llama desde el sidebar que ya los tiene
  // cacheados). Si no, hacemos fetch a /api/calendario-asistente/reuniones/:id.
  async function openDetailModal(actividadId, preselected) {
    const modal = getModal("js-cal-event-modal");
    if (!modal) return;

    // Limpiamos el modal mientras cargamos.
    const titleEl = document.getElementById("js-cal-event-title");
    if (titleEl) titleEl.textContent = "Cargando…";
    [
      "tarea", "tipo", "prioridad", "estado_progreso",
      "fecha", "hora", "duracion", "motivo",
      "titulo_prospecto", "estado_cliente", "fecha_contacto",
      "fecha_entrega", "link_drive",
    ].forEach((k) => setCalField(k, "—"));
    setCalFieldHTML("contactos", "");
    setCalWrap("contactos", false);
    const warn = document.getElementById("js-cal-event-warning");
    if (warn) warn.classList.add("d-none");
    document.getElementById("js-cal-btn-reprogramar")?.classList.add("d-none");
    document.getElementById("js-cal-btn-reasignar")?.classList.add("d-none");
    document.getElementById("js-cal-btn-eliminar")?.classList.add("d-none");

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
    setCalField(
      "tipo",
      data.tarea?.tipo_tarea?.tipo
        ? `${data.tarea.tipo_tarea.tipo}${data.tarea.tipo_tarea.color ? ` (${data.tarea.tipo_tarea.color})` : ""}`
        : "—",
    );
    setCalFieldHTML("prioridad", prioridadBadgeHtml(data.prioridad));
    setCalFieldHTML("estado_progreso", estadoBadgeHtml(data.estado_progreso));
    setCalField("fecha", data.fecha_inicio || "—");
    const horaTxt =
      data.hora_inicio
        ? `${data.hora_inicio}${data.slot?.hora_fin ? ` — ${data.slot.hora_fin}` : ""}`
        : "—";
    setCalField("hora", horaTxt);
    setCalField("duracion", formatMin(data.tiempo_estimado_minutos || data.slot?.duracion_minutos));
    setCalField("motivo", data.motivo_reprograma || "—");

    setCalField("titulo_prospecto", data.prospecto?.titulo || "—");
    setCalField("estado_cliente", data.prospecto?.estado_cliente || "—");
    setCalField("fecha_contacto", data.prospecto?.fecha_contacto || "—");
    setCalField("fecha_entrega", data.prospecto?.fecha_entrega || "—");
    if (data.prospecto?.link_drive) {
      setCalFieldHTML(
        "link_drive",
        `<a href="${escapeHtml(data.prospecto.link_drive)}" target="_blank" rel="noopener" class="link-primary text-break">${escapeHtml(data.prospecto.link_drive)}</a>`,
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

    // Habilitar botones según estado de la reunión.
    const enProgreso = String(data.estado_progreso || "").toLowerCase() === "en_progreso";
    const cancelada = !data.estado;
    if (warn && cancelada) {
      warn.classList.remove("d-none");
      setCalField("warning", "Esta reunión está cancelada.");
    }
    if (!enProgreso) {
      const btnRepro = document.getElementById("js-cal-btn-reprogramar");
      const btnReasig = document.getElementById("js-cal-btn-reasignar");
      const btnElim = document.getElementById("js-cal-btn-eliminar");
      if (btnRepro) {
        btnRepro.classList.remove("d-none");
        btnRepro.dataset.actividadId = String(data.id);
      }
      if (btnReasig) {
        btnReasig.classList.remove("d-none");
        btnReasig.dataset.actividadId = String(data.id);
      }
      if (btnElim) {
        btnElim.classList.remove("d-none");
        btnElim.dataset.actividadId = String(data.id);
      }
    }

    modal.show();
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
  let nuevaState = { prospecto: null, tareas: [], tareasTodas: [], usuarios: [] };
  let todosClientes = [];

  async function openNuevaModal(tab) {
    const modal = getModal("js-cal-nueva-modal");
    if (!modal) return;
    document.getElementById("js-cal-nueva-prospecto-q").value = "";
    document.getElementById("js-cal-nueva-prospecto-id").value = "";
    document.getElementById("js-cal-nueva-prospecto-sel").classList.add("d-none");
    document.getElementById("js-cal-nueva-prospecto-results").classList.add("d-none");
    document.getElementById("js-cal-nueva-prospecto-results").innerHTML = "";
    document.getElementById("js-cal-nueva-fecha").value = todayLocalYYYYMMDD();
    document.getElementById("js-cal-nueva-hora").value = "09:00";
    document.getElementById("js-cal-nueva-duracion").value = 60;
    document.getElementById("js-cal-nueva-prioridad").value = "MEDIA";
    document.getElementById("js-cal-nueva-motivo").value = "";
    document.getElementById("js-cal-nueva-result").innerHTML = "";

    // Cargar tareas (tipo REUNIÓN para el tab REUNIONES, todas para CLIENTES).
    try {
      const json = await fetchJSON("/api/tareas");
      const all = json.data || json || [];
      nuevaState.tareas = all.filter((t) => {
        const tipo = String(t.tipo_tarea?.tipo || "").toLowerCase();
        const id = Number(t.tipo_tarea?.id);
        return id === 2 || /reunion/.test(tipo);
      });
      nuevaState.tareasTodas = all;
    } catch (err) {
      console.error("[asistente-cal] loadTareas:", err);
      nuevaState.tareas = [];
      nuevaState.tareasTodas = [];
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
    // Poblar select de CLIENTES (todas las tareas).
    const selCliTarea = document.getElementById("js-cal-cli-tarea");
    if (selCliTarea) {
      selCliTarea.innerHTML = ['<option value="">— Selecciona una tarea —</option>']
        .concat(
          nuevaState.tareasTodas.map(
            (t) =>
              `<option value="${t.id}" data-horas="${t.horas_estimadas || 60}">${escapeHtml(t.nombre)}${t.horas_estimadas ? ` · ${t.horas_estimadas} min` : ""}</option>`,
          ),
        )
        .join("");
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

    nuevaState.prospecto = null;

    // Cargar clientes con actividades en segundo plano (no bloquea el modal).
    if (!todosClientes.length) cargarClientesConActividades();

    modal.show();
    // Mostrar/ocultar el botón "Crear reunión" del footer según el tab
    const btnCrear = document.getElementById("js-cal-nueva-aplicar");
    if (btnCrear) {
      btnCrear.style.display = tab === "clientes" ? "none" : "";
    }
    if (tab === "clientes") {
      document.getElementById("js-cal-tab-clientes-btn")?.click();
      setTimeout(() => {
        document.getElementById("js-cal-clientes-q")?.focus();
      }, 350);
    } else {
      document.getElementById("js-cal-tab-reuniones-btn")?.click();
      setTimeout(() => {
        document.getElementById("js-cal-nueva-prospecto-q")?.focus();
      }, 250);
    }
  }

  // -------- CLIENTES tab (select + actividades) --------------------
  async function cargarClientesConActividades() {
    const sel = document.getElementById("js-cal-clientes-select");
    if (!sel) return;
    const prevValue = sel.value;
    sel.innerHTML = '<option value="">— Cargando… —</option>';
    sel.disabled = true;
    try {
      const json = await fetchJSON("/api/calendario-asistente/clientes-con-actividades?limit=100");
      todosClientes = json.data || [];
    } catch (err) {
      console.error("[asistente-cal] loadClientes:", err);
      todosClientes = [];
    }
    const sorted = todosClientes.slice().sort((a, b) => {
      const aName = (a.titulo_prospecto || "").toLowerCase();
      const bName = (b.titulo_prospecto || "").toLowerCase();
      return aName.localeCompare(bName);
    });
    const options = ['<option value="">— Selecciona un cliente —</option>'];
    sorted.forEach((c) => {
      const contactosTxt = (c.contactos || [])
        .map((x) => [x.nombres, x.apellidos].filter(Boolean).join(" ").trim())
        .filter(Boolean)
        .join(", ");
      const label = `${c.titulo_prospecto || "(sin título)"}${contactosTxt ? ` · ${contactosTxt}` : ""}`;
      const selected = String(c.id) === String(prevValue) ? " selected" : "";
      options.push(`<option value="${c.id}"${selected}>${escapeHtml(label)}</option>`);
    });
    sel.innerHTML = options.join("");
    sel.disabled = false;
    if (prevValue && String(sel.value) === String(prevValue)) {
      onClienteSelect();
    }
  }

  function onClienteSelect() {
    const sel = document.getElementById("js-cal-clientes-select");
    const container = document.getElementById("js-cal-clientes-actividades");
    const form = document.getElementById("js-cal-clientes-form");
    const id = Number(sel?.value);
    if (!id || !todosClientes.length) {
      container.innerHTML = '<div class="text-center text-muted py-4"><i class="ti ti-info-circle me-1"></i>Seleccioná un cliente para programar una actividad.</div>';
      if (form) form.style.display = "none";
      return;
    }
    const cliente = todosClientes.find((c) => Number(c.id) === id);
    if (!cliente) {
      container.innerHTML = '<div class="text-center text-muted py-4">Cliente no encontrado.</div>';
      if (form) form.style.display = "none";
      return;
    }
    const acts = cliente.actividades || [];
    const contacto = (cliente.contactos || [])
      .map((x) => [x.nombres, x.apellidos].filter(Boolean).join(" ").trim())
      .filter(Boolean)
      .join(", ");
    container.innerHTML = `<div class="card border mb-2">
      <div class="card-body py-2 px-3">
        <div class="fw-medium">${escapeHtml(cliente.titulo_prospecto || "(sin título)")}</div>
        <div class="small text-muted">
          ${contacto ? `<i class="ti ti-user me-1"></i>${escapeHtml(contacto)}` : ""}
          ${cliente.fecha_entrega ? `<span class="ms-2"><i class="ti ti-calendar me-1"></i>F. entrega: ${escapeHtml(cliente.fecha_entrega)}</span>` : ""}
        </div>
      </div>
    </div>`;
    // Mostrar el formulario con defaults
    if (form) {
      form.style.display = "block";
      form.dataset.prospectoId = id;
    }
    document.getElementById("js-cal-cli-fecha").value = todayLocalYYYYMMDD();
    document.getElementById("js-cal-cli-hora").value = "09:00";
    document.getElementById("js-cal-cli-duracion").value = 60;
    document.getElementById("js-cal-cli-tarea").value = "";
    // Mostrar mensaje si no hay actividades
    if (!acts.length) {
      const fecha = todayLocalYYYYMMDD();
      const hora = "09:00";
      container.innerHTML += `<div class="alert alert-info py-2 small mb-0">
        <i class="ti ti-info-circle me-1"></i>
        Este cliente no tiene actividades previas. Se empezará desde <strong>${fecha}</strong> a las <strong>${hora}</strong>.
      </div>`;
    }
  }

  // Cuando cambia la tarea en CLIENTES, actualizar duración con horas_estimadas.
  document.getElementById("js-cal-cli-tarea")?.addEventListener("change", function () {
    const sel = this;
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.value) {
      const horas = Number(opt.getAttribute("data-horas")) || 60;
      document.getElementById("js-cal-cli-duracion").value = horas;
    }
  });

  // Submit del formulario CLIENTES.
  document.getElementById("js-cal-cli-programar")?.addEventListener("click", submitClienteProgramar);

  async function submitClienteProgramar() {
    const form = document.getElementById("js-cal-clientes-form");
    const prospectoId = Number(form?.dataset.prospectoId);
    const tareaId = Number(document.getElementById("js-cal-cli-tarea").value);
    const duracion = Number(document.getElementById("js-cal-cli-duracion").value);
    const fecha = document.getElementById("js-cal-cli-fecha").value;
    const hora = document.getElementById("js-cal-cli-hora").value;
    const usuarioId = Number(document.getElementById("js-cal-nueva-usuario")?.value || selUsuarios?.value);

    if (!prospectoId || !tareaId || !fecha || !hora || !duracion) {
      showToast("warning", "Completa todos los campos obligatorios.");
      return;
    }
    if (!usuarioId) {
      showToast("warning", "Seleccioná un usuario asignado en la pestaña REUNIONES o en el filtro superior.");
      return;
    }
    const btn = document.getElementById("js-cal-cli-programar");
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
        }),
      });
      showToast("success", "Actividad programada correctamente.");
      const modal = getModal("js-cal-nueva-modal");
      if (modal) modal.hide();
      await refreshAll();
    } catch (err) {
      if (err.status === 409 && err.payload) {
        renderConflictResult(
          "js-cal-clientes-actividades",
          err.payload,
          "No se pudo programar en el horario solicitado.",
        );
      } else {
        showToast("error", err.message || "Error al programar.");
      }
    } finally {
      btn.disabled = false;
    }
  }

  // Autocomplete prospectos.
  let prospectoSearchTimer = null;
  async function onProspectoSearchInput() {
    const q = document.getElementById("js-cal-nueva-prospecto-q").value;
    const listEl = document.getElementById("js-cal-nueva-prospecto-results");
    if (prospectoSearchTimer) clearTimeout(prospectoSearchTimer);
    prospectoSearchTimer = setTimeout(async () => {
      try {
        const json = await fetchJSON(
          `/api/calendario-asistente/prospectos?q=${encodeURIComponent(q)}&limit=10`,
        );
        const items = json.data || [];
        if (!items.length) {
          listEl.innerHTML = '<div class="list-group-item text-muted small">Sin resultados.</div>';
        } else {
          listEl.innerHTML = items
            .map((p) => {
              const contacto = (p.contactos || [])
                .map((c) => [c.nombres, c.apellidos].filter(Boolean).join(" "))
                .filter(Boolean)
                .join(", ");
              return `<button type="button" class="list-group-item list-group-item-action" data-id="${p.id}">
                <div class="fw-medium">${escapeHtml(p.titulo_prospecto || "(sin título)")}</div>
                <div class="small text-muted">
                  <span class="badge bg-secondary-subtle text-secondary me-1">${escapeHtml(p.estado_cliente || "—")}</span>
                  ${contacto ? `<i class="ti ti-user me-1"></i>${escapeHtml(contacto)}` : ""}
                </div>
              </button>`;
            })
            .join("");
        }
        listEl.classList.remove("d-none");
        listEl.querySelectorAll("button[data-id]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = Number(btn.getAttribute("data-id"));
            const p = items.find((x) => Number(x.id) === id);
            if (p) selectProspecto(p);
          });
        });
      } catch (err) {
        console.error("[asistente-cal] prospectos search:", err);
        listEl.innerHTML = `<div class="list-group-item text-danger small">${escapeHtml(err.message || "Error")}</div>`;
        listEl.classList.remove("d-none");
      }
    }, 200);
  }

  function selectProspecto(p) {
    nuevaState.prospecto = p;
    document.getElementById("js-cal-nueva-prospecto-q").value = p.titulo_prospecto || "";
    document.getElementById("js-cal-nueva-prospecto-id").value = String(p.id);
    const selEl = document.getElementById("js-cal-nueva-prospecto-sel");
    const contacto = (p.contactos || [])
      .map((c) => [c.nombres, c.apellidos].filter(Boolean).join(" ").trim() + (c.celular ? ` (${c.celular})` : ""))
      .filter(Boolean)
      .join(", ");
    selEl.innerHTML = `<i class="ti ti-check me-1"></i>Seleccionado: <strong>${escapeHtml(p.titulo_prospecto || "")}</strong>${contacto ? ` · ${escapeHtml(contacto)}` : ""}${p.fecha_entrega ? ` · F. entrega: <strong>${escapeHtml(p.fecha_entrega)}</strong>` : ""}`;
    selEl.classList.remove("d-none");
    document.getElementById("js-cal-nueva-prospecto-results").classList.add("d-none");
  }

  async function submitNueva() {
    const prospectoId = Number(document.getElementById("js-cal-nueva-prospecto-id").value);
    const tareaId = Number(document.getElementById("js-cal-nueva-tarea").value);
    const usuarioId = Number(document.getElementById("js-cal-nueva-usuario").value);
    const fecha = document.getElementById("js-cal-nueva-fecha").value;
    const hora = document.getElementById("js-cal-nueva-hora").value;
    const duracion = Number(document.getElementById("js-cal-nueva-duracion").value);
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
    setCalProgField("contacto", a.prospecto?.contacto_principal || "—");
    setCalProgField("universidad", a.prospecto?.universidad || "—");
    setCalProgField("carrera", a.prospecto?.carrera || "—");
    setCalProgField("nivel", a.prospecto?.nivel_academico || "—");
    setCalProgField("tarea", a.tarea?.nombre || "—");
    setCalProgField("fentrega", a.prospecto?.fecha_entrega || "—");
    const prioEl = document.querySelector('[data-cal-prog="prioridad"]');
    if (prioEl) {
      prioEl.innerHTML = prioridadBadgeHtml(a.prioridad);
    }

    // Defaults del formulario.
    document.getElementById("js-cal-prog-actividad-id").value = String(a.id);
    document.getElementById("js-cal-prog-fecha").value =
      a.fecha_inicio || todayLocalYYYYMMDD();
    // hora_inicio puede llegar como "HH:MM:SS"; normalizamos a "HH:MM".
    let hora = a.hora_inicio || "09:00";
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
      await fetchJSON(
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
      showToast("success", "Reunión programada.");
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
  async function submitEliminar(actividadId) {
    const ok = await confirmDialog(
      "¿Cancelar esta reunión?",
      "Quedará registrada como inactiva (no se borra de la base de datos).",
      "Sí, cancelar",
    );
    if (!ok) return;
    try {
      await fetchJSON(`/api/calendario-asistente/reuniones/${actividadId}`, {
        method: "DELETE",
      });
      showToast("success", "Reunión cancelada.");
      const modal = getModal("js-cal-event-modal");
      if (modal) modal.hide();
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

  // -------- refresh -------------------------------------------------
  async function refreshAll() {
    await Promise.all([loadReuniones(), loadCalendario()]);
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
        if (id) openDetailModal(id);
      },
      eventDrop: function (info) {
        const id = Number(info.event.extendedProps?.actividad_id || 0);
        if (!id) {
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
      });
    }
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
    // Reprogramar.
    document
      .getElementById("js-cal-rep-aplicar")
      ?.addEventListener("click", submitReprogramar);
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
    document
      .getElementById("js-cal-nueva-prospecto-q")
      ?.addEventListener("input", onProspectoSearchInput);
    document
      .getElementById("js-cal-nueva-prospecto-q")
      ?.addEventListener("focus", onProspectoSearchInput);
    document
      .getElementById("js-cal-nueva-aplicar")
      ?.addEventListener("click", submitNueva);
    // Programar (sidebar → modal → API).
    document
      .getElementById("js-cal-prog-aplicar")
      ?.addEventListener("click", submitProgramar);
    // CLIENTES tab: select change + refresh.
    document
      .getElementById("js-cal-clientes-select")
      ?.addEventListener("change", onClienteSelect);
    document
      .getElementById("js-cal-clientes-refresh")
      ?.addEventListener("click", function () {
        cargarClientesConActividades();
      });
    // Mostrar/ocultar el botón "Crear reunión" según el tab activo
    const btnCrearFooter = document.getElementById("js-cal-nueva-aplicar");
    document.getElementById("js-cal-tab-clientes-btn")?.addEventListener("click", function () {
      if (btnCrearFooter) btnCrearFooter.style.display = "none";
    });
    document.getElementById("js-cal-tab-reuniones-btn")?.addEventListener("click", function () {
      if (btnCrearFooter) btnCrearFooter.style.display = "";
    });
    // Cuando se muestra el tab CLIENTES, cargar datos si es primera vez.
    const clientesTab = document.getElementById("js-cal-tab-clientes");
    if (clientesTab) {
      clientesTab.addEventListener("show.bs.tab", function () {
        if (!todosClientes.length) {
          cargarClientesConActividades();
        }
      });
    }
  });
})();
