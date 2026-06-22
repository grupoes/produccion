// ===============================================================
// Modal "Agregar Cliente" (sin pasar por prospecto)
// Sólo ASISTENTE DE PRODUCCIÓN (rol.id = 11). Botón en el header
// del calendario dispara este módulo.
// ===============================================================

(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const state = {
    lookups: null,
    tareasById: new Map(),
    choicesInstances: [],
    contactoIndex: 0,
    actividadIndex: 0,
    cacheUsuariosPorFecha: new Map(),
  };

  // -------- Helpers --------

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const destroyAllChoices = () => {
    state.choicesInstances.forEach((c) => {
      try {
        c.destroy();
      } catch (_) {}
    });
    state.choicesInstances.length = 0;
  };

  const makeChoices = (el, opts = {}) => {
    if (!el || typeof Choices === "undefined") return null;
    const inst = new Choices(el, {
      searchEnabled: true,
      itemSelectText: "",
      shouldSort: false,
      ...opts,
    });
    state.choicesInstances.push(inst);
    return inst;
  };

  const todayYmd = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // Convierte minutos a "HH:MM". Acepta null/0 devolviendo "00:00".
  const minutosToHHMM = (min) => {
    const total = Math.max(0, Math.floor(Number(min) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  // Parsea "HH:MM" o "H:MM" a minutos. Devuelve null si el formato no es válido.
  const parseHHMMToMinutos = (s) => {
    const m = String(s || "").trim().match(/^(\d{1,3}):([0-5]\d)$/);
    if (!m) return null;
    const h = Number(m[1]);
    const mm = Number(m[2]);
    if (h > 999) return null;
    return h * 60 + mm;
  };

  const toast = (icon, title) =>
    Swal.fire({
      toast: true,
      position: "top-end",
      icon,
      title,
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
    });

  // -------- Lookups --------

  async function loadLookups() {
    if (state.lookups) return state.lookups;
    const r = await fetch("/api/potenciales-clientes/lookups");
    const j = await r.json();
    if (!j.success) throw new Error("No se pudieron cargar los catálogos.");
    state.lookups = j.data;
    state.tareasById = new Map(
      (state.lookups.tareas || []).map((t) => [
        t.id,
        { id: t.id, nombre: t.nombre, horas_estimadas: t.horas_estimadas, tipo_tarea: t.tipo_tarea_tarea_tipo_tareaTotipo_tarea },
      ]),
    );
    return state.lookups;
  }

  function fillStaticSelects() {
    const { niveles, instituciones, origenes, tareas } = state.lookups;

    const fill = (selId, items, valueKey, labelKey, placeholder) => {
      const sel = $(selId);
      if (!sel) return;
      sel.innerHTML =
        `<option value="">${esc(placeholder)}</option>` +
        items
          .map(
            (it) =>
              `<option value="${it[valueKey]}">${esc(it[labelKey])}</option>`,
          )
          .join("");
    };

    fill("#js-ac-origen", origenes || [], "id", "nombre", "— Seleccione —");
    fill("#js-ac-nivel", niveles || [], "id", "nombre", "— Seleccione —");
    // tareas se inyectan dinámicamente por fila.

    // Universidad y carrera se renderizan con Choices.js para permitir
    // búsqueda por nombre dentro de catálogos grandes.
    const instSel = $("#js-ac-institucion");
    const carrSel = $("#js-ac-carrera");
    if (instSel) {
      instSel.innerHTML =
        '<option value="">— Seleccione —</option>' +
        (instituciones || [])
          .map(
            (u) =>
              `<option value="${u.id}">${esc(u.nombre)}</option>`,
          )
          .join("");
    }
    if (carrSel) {
      carrSel.innerHTML =
        '<option value="">Seleccione universidad primero</option>';
    }

    state.institucionChoices = makeChoices(instSel, {
      searchEnabled: true,
      searchPlaceholderValue: "Buscar universidad…",
      noResultsText: "Sin coincidencias",
    });
    state.carreraChoices = makeChoices(carrSel, {
      searchEnabled: true,
      searchPlaceholderValue: "Buscar carrera…",
      noResultsText: "Sin coincidencias",
    });

    // Si Choices.js no está disponible (o el <select> no existe en el DOM),
    // no podemos cablear el cascade; el <select> nativo queda funcional
    // como fallback.
    if (!state.carreraChoices) {
      if (carrSel) carrSel.disabled = true;
      return;
    }

    // Estado inicial: bloqueado hasta que el usuario elija universidad.
    state.carreraChoices.disable();

    // Cascade universidad → carrera
    instSel.addEventListener("change", async () => {
      const id = instSel.value;
      if (!state.carreraChoices) return;
      // Reset del Choices de carrera
      state.carreraChoices.setChoices(
        [{ value: "", label: "Cargando...", disabled: true }],
        "value",
        "label",
        true,
      );
      state.carreraChoices.setValue([""]);
      state.carreraChoices.disable();
      if (!id) {
        state.carreraChoices.setChoices(
          [{ value: "", label: "Seleccione universidad primero", disabled: true }],
          "value",
          "label",
          true,
        );
        return;
      }
      try {
        const r = await fetch(
          `/api/potenciales-clientes/carreras?institucion_id=${id}`,
        );
        const j = await r.json();
        const list = j.success ? j.data : [];
        state.carreraChoices.setChoices(
          [
            { value: "", label: "— Seleccione —", placeholder: true },
            ...list.map((c) => ({ value: String(c.id), label: c.nombre })),
          ],
          "value",
          "label",
          true,
        );
        state.carreraChoices.enable();
      } catch (e) {
        state.carreraChoices.setChoices(
          [{ value: "", label: "Error al cargar", disabled: true }],
          "value",
          "label",
          true,
        );
      }
    });
  }

  // -------- Contactos dinámicos --------

  function tiposDocumentoOptionsHtml() {
    return (
      '<option value="">Tipo de documento</option>' +
      (state.lookups.tipos_documento || [])
        .map(
          (t) =>
            `<option value="${t.id}" data-abr="${esc(t.abreviatura || "")}">${esc(t.nombre || t.abreviatura || `Doc ${t.id}`)}</option>`,
        )
        .join("")
    );
  }

  function defaultDniTipoId() {
    const list = state.lookups.tipos_documento || [];
    const found = list.find((t) => {
      const abr = String(t.abreviatura || "").toUpperCase();
      const nom = String(t.nombre || "").toUpperCase();
      return (
        abr === "DNI" ||
        nom === "DNI" ||
        nom === "DOCUMENTO NACIONAL DE IDENTIDAD"
      );
    });
    return found ? found.id : null;
  }

  function isDniTipoDoc(tipoSel) {
    if (!tipoSel) return false;
    const opt = tipoSel.options?.[tipoSel.selectedIndex];
    if (!opt) return false;
    const abr = String(opt.dataset.abr || "").toUpperCase();
    const txt = String(opt.textContent || "").toUpperCase();
    return (
      abr === "DNI" ||
      txt === "DNI" ||
      txt === "DOCUMENTO NACIONAL DE IDENTIDAD"
    );
  }

  function refreshBuscarState(node) {
    const btn = $(".js-ac-buscar-dni", node);
    const numInput = $(".js-ac-num-doc", node);
    const tipoSel = $(".js-ac-tipo-doc", node);
    if (!btn) return;
    const isDni = isDniTipoDoc(tipoSel);
    const numero = String(numInput?.value || "").trim();
    btn.disabled = !(isDni && /^\d{8}$/.test(numero));
  }

  async function buscarDNI(row) {
    const numInput = $(".js-ac-num-doc", row);
    const tipoSel = $(".js-ac-tipo-doc", row);
    const nombresInput = $('[data-f="nombres"]', row);
    const apellidosInput = $('[data-f="apellidos"]', row);
    const btn = $(".js-ac-buscar-dni", row);
    if (!row) return;

    if (!isDniTipoDoc(tipoSel)) {
      toast(
        "warning",
        "La búsqueda sólo está disponible para Documento Nacional de Identidad (DNI).",
      );
      return;
    }

    const numero = String(numInput?.value || "").trim();
    if (!numero) {
      toast("warning", "Ingresa un número de documento para buscar.");
      numInput?.focus();
      return;
    }
    if (!/^\d{8}$/.test(numero)) {
      toast("warning", "El DNI debe tener exactamente 8 dígitos.");
      numInput?.focus();
      return;
    }

    const tipoId = tipoSel?.value || String(defaultDniTipoId() || "");

    const prevHtml = btn?.innerHTML;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-1"></span>Buscando…';
    }
    try {
      const qs = new URLSearchParams({
        tipoDocumento_id: tipoId,
        numero_documento: numero,
      }).toString();
      const res = await fetch(`/api/usuarios/search-document?${qs}`);
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(
          (json && json.error) ||
            "No se encontró información para ese documento.",
        );
      }
      const d = json.data;
      if (nombresInput && !nombresInput.value && d.nombres) {
        nombresInput.value = d.nombres;
      }
      if (apellidosInput && !apellidosInput.value) {
        if (d.apellidos) {
          apellidosInput.value = d.apellidos;
        } else {
          const ap =
            [d.apellido_paterno, d.apellido_materno]
              .filter(Boolean)
              .join(" ")
              .trim() || "";
          if (ap) apellidosInput.value = ap;
        }
      }
      toast("success", "Datos encontrados.");
    } catch (err) {
      toast("error", err.message || "No se pudo consultar el documento.");
    } finally {
      if (btn) btn.innerHTML = prevHtml;
      refreshBuscarState(row);
    }
  }

  function addContacto(data = {}) {
    state.contactoIndex += 1;
    const tpl = $("#tpl-ac-contacto");
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.idx = state.contactoIndex;
    $(".js-ac-contacto-num", node).textContent = `Contacto #${state.contactoIndex}`;

    const tipoSel = $(".js-ac-tipo-doc", node);
    if (tipoSel) {
      tipoSel.innerHTML = tiposDocumentoOptionsHtml();
    }

    $$("[data-f]", node).forEach((input) => {
      input.value = data[input.dataset.f] || "";
    });

    if (tipoSel) {
      if (!tipoSel.value) {
        const dniId = defaultDniTipoId();
        if (dniId) tipoSel.value = String(dniId);
      }
    }

    const buscarBtn = $(".js-ac-buscar-dni", node);
    if (buscarBtn) {
      buscarBtn.addEventListener("click", () => buscarDNI(node));
    }
    const numDocInput = $(".js-ac-num-doc", node);
    if (numDocInput) {
      numDocInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          buscarDNI(node);
        }
      });
      numDocInput.addEventListener("input", () => refreshBuscarState(node));
    }
    if (tipoSel) {
      tipoSel.addEventListener("change", () => refreshBuscarState(node));
    }

    refreshBuscarState(node);

    $(".js-ac-contacto-del", node).onclick = () => {
      node.remove();
      renderContactosEmpty();
    };
    $("#js-ac-contactos-list").appendChild(node);
    renderContactosEmpty();
    return node;
  }

  function renderContactosEmpty() {
    const empty = $("#js-ac-contactos-empty");
    empty.style.display = $("#js-ac-contactos-list").children.length === 0
      ? ""
      : "none";
  }

  function collectContactos() {
    return $$(".js-ac-contacto").map((row) => {
      const obj = {};
      $$("[data-f]", row).forEach((input) => {
        obj[input.dataset.f] = (input.value || "").trim();
      });
      if (obj.tipo_documento_id) {
        obj.tipo_documento_id = Number(obj.tipo_documento_id) || null;
      } else {
        obj.tipo_documento_id = null;
      }
      return obj;
    });
  }

  // -------- Actividades dinámicas --------

  function tareasOptionsHtml() {
    return (
      '<option value="">— Selecciona —</option>' +
      (state.lookups.tareas || [])
        .map(
          (t) =>
            `<option value="${t.id}" data-min="${t.horas_estimadas || 60}">${esc(t.nombre)}</option>`,
        )
        .join("")
    );
  }

  function addActividad(data = {}) {
    state.actividadIndex += 1;
    const tpl = $("#tpl-ac-actividad");
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.idx = state.actividadIndex;
    $(".js-ac-actividad-num", node).textContent = `Actividad #${state.actividadIndex}`;

    const tareaSel = $('[data-f="tarea_id"]', node);
    tareaSel.innerHTML = tareasOptionsHtml();
    if (data.tarea_id) tareaSel.value = String(data.tarea_id);
    node._tareaChoices = makeChoices(tareaSel, {
      searchEnabled: true,
      searchPlaceholderValue: "Buscar tarea…",
      noResultsText: "Sin coincidencias",
    });

    // Duración estimada: input editable, pre-rellenado desde la tarea
    // seleccionada (campo `horas_estimadas` que en realidad guarda minutos).
    const duracionInput = $('[data-f="duracion"]', node);
    const syncDuracionFromTarea = () => {
      const id = Number(tareaSel.value);
      const t = id ? state.tareasById.get(id) : null;
      const mins = t && t.horas_estimadas ? Number(t.horas_estimadas) : 60;
      duracionInput.value = minutosToHHMM(mins);
    };
    tareaSel.addEventListener("change", syncDuracionFromTarea);
    if (data.duracion) {
      // Si viene un valor explícito del payload (edición), respetarlo.
      const mins = parseHHMMToMinutos(data.duracion);
      duracionInput.value = mins != null ? minutosToHHMM(mins) : "";
    } else if (data.tarea_id) {
      syncDuracionFromTarea();
    } else {
      duracionInput.value = minutosToHHMM(60);
    }
    // Al perder foco, normalizar el formato a HH:MM (rellenar con 0 a la izq).
    duracionInput.addEventListener("blur", () => {
      const mins = parseHHMMToMinutos(duracionInput.value);
      if (mins != null) duracionInput.value = minutosToHHMM(mins);
    });

    const fechaInput = $('[data-f="fecha_asignacion"]', node);
    // Pre-rellenar con hoy para que loadUsuarios() dispare de una vez
    // y se pueda preseleccionar el usuario del header. El usuario puede
    // cambiar la fecha después.
    fechaInput.value = data.fecha_asignacion || todayYmd();

    const horaInput = $('[data-f="hora_inicio"]', node);
    // Si el payload trae hora explícita (caso edición), respetarla; si
    // no, la dejaremos vacía y la rellenaremos cuando se sepa el
    // usuario asignado (vía applyDefaultsFromUltimoHorario abajo).
    //
    // `usuarioTocoHora` se baja a false cuando el usuario escribe en el
    // input: a partir de ahí respetamos lo que tipeó aunque cambie el
    // usuario asignado.
    let usuarioTocoHora = !!data.hora_inicio;
    if (data.hora_inicio) horaInput.value = data.hora_inicio;

    const prioSel = $('[data-f="prioridad"]', node);
    if (data.prioridad) prioSel.value = data.prioridad;

    const usuarioSel = $('[data-f="usuario_asignado_id"]', node);

    const refreshWarning = () => {
      const warnEl = $(".js-ac-jornada-warning", node);
      warnEl.classList.add("d-none");
      warnEl.textContent = "";
      const uid = usuarioSel.value;
      const fecha = fechaInput.value;
      if (!uid || !fecha) return;
      fetch(
        `/api/horario/usuario-tiene-jornada?usuario_id=${encodeURIComponent(uid)}&fecha=${encodeURIComponent(fecha)}`,
      )
        .then((r) => r.json())
        .then((j) => {
          if (!j.success) return;
          const d = j.data;
          if (!d.tiene_jornada) {
            warnEl.textContent = `⚠ ${d.motivo || "Sin jornada configurada para este día. La actividad se programará manualmente fuera del horario laboral."}`;
            warnEl.classList.remove("d-none");
          }
        })
        .catch(() => {});
    };

    // Aplica los defaults de fecha+hora basados en el último bloque del
    // usuario seleccionado en `horario_usuario`. Si el usuario tiene
    // bloques registrados, replica la fecha y la hora del ÚLTIMO; si
    // NO tiene ninguno, deja hoy como fecha y la hora vacía.
    //
    // Sólo se aplica cuando el usuario aún NO tipeó una hora a mano:
    // una vez que el input hora tiene valor (por edición del usuario,
    // no por la preselección inicial), respetamos lo que haya puesto
    // aunque cambie el usuario asignado.
    //
    // El helper viene de `index.js` (window.asistenteCalApplyFechaHoraDefaults)
    // y consulta `/api/calendario-asistente/horario-ultimo`.
    const applyDefaultsFromUltimoHorario = () => {
      const uid = usuarioSel.value;
      if (!window.asistenteCalApplyFechaHoraDefaults) return;
      // Si el usuario ya tipeó una hora, respetamos lo que haya puesto.
      if (usuarioTocoHora) return;
      window.asistenteCalApplyFechaHoraDefaults(uid, fechaInput, horaInput);
    };

    const loadUsuarios = async () => {
      const fecha = fechaInput.value;
      usuarioSel.innerHTML = '<option value="">Cargando usuarios...</option>';
      if (!fecha) {
        usuarioSel.innerHTML = '<option value="">Selecciona fecha primero</option>';
        return;
      }
      try {
        const cacheKey = fecha;
        let data;
        if (state.cacheUsuariosPorFecha.has(cacheKey)) {
          data = state.cacheUsuariosPorFecha.get(cacheKey);
        } else {
          const r = await fetch(
            `/api/potenciales-clientes/usuarios-asignables?fecha=${encodeURIComponent(fecha)}`,
          );
          const j = await r.json();
          data = j.success ? j.data : { usuarios: [], default_assignee: null };
          state.cacheUsuariosPorFecha.set(cacheKey, data);
        }
        const usuarios = data.usuarios || [];
        usuarioSel.innerHTML =
          '<option value="">— Selecciona —</option>' +
          usuarios
            .map(
              (u) =>
                `<option value="${u.id}">${esc(u.label || u.nombre || `Usuario ${u.id}`)}</option>`,
            )
            .join("");
        // Pre-selección, en orden de prioridad:
        //   1) Usuario explícito del payload (caso edición)
        //   2) Usuario elegido en el header del calendario (#js-cal-user)
        //   3) default_assignee del backend (reglas POTENCIAL_AUTO_ASSIGN_MODE)
        const headerSel = document.getElementById("js-cal-user");
        const headerUid = headerSel ? headerSel.value : "";
        const idsValidos = new Set(usuarios.map((u) => String(u.id)));
        let preSelect = "";
        if (data.usuario_asignado_id && idsValidos.has(String(data.usuario_asignado_id))) {
          preSelect = String(data.usuario_asignado_id);
        } else if (data.usuario_id && idsValidos.has(String(data.usuario_id))) {
          preSelect = String(data.usuario_id);
        } else if (headerUid && idsValidos.has(String(headerUid))) {
          preSelect = String(headerUid);
        } else if (data.default_assignee && idsValidos.has(String(data.default_assignee))) {
          preSelect = String(data.default_assignee);
        }
        if (preSelect) usuarioSel.value = preSelect;

        refreshWarning();
        // Si preseleccionamos un usuario, aplicamos los defaults de
        // fecha+hora según su último horario_usuario. Importante: lo
        // hacemos DESPUÉS de refreshWarning para no pisar la fecha con
        // el último bloque del usuario cuando el back aún está
        // computando el warning de jornada.
        if (preSelect) applyDefaultsFromUltimoHorario();
      } catch (e) {
        usuarioSel.innerHTML = '<option value="">Error al cargar</option>';
      }
    };

    fechaInput.addEventListener("change", () => {
      // invalidar cache sólo para esta fecha no ayuda, pero dejamos recarga fresca
      loadUsuarios();
    });
    // Cambio manual de usuario: refrescar warning de jornada + aplicar
    // defaults de fecha+hora según el historial de horario_usuario del
    // nuevo usuario (mientras el usuario no haya tipeado una hora).
    usuarioSel.addEventListener("change", () => {
      refreshWarning();
      applyDefaultsFromUltimoHorario();
    });
    // Si el usuario ya tocó el campo hora, dejamos de aplicar defaults
    // automáticos (respetamos lo que tipeó).
    horaInput.addEventListener("input", () => {
      if (horaInput.value) usuarioTocoHora = true;
    });

    $(".js-ac-actividad-del", node).onclick = () => {
      if (node._tareaChoices) {
        try { node._tareaChoices.destroy(); } catch (_) {}
      }
      node.remove();
      renderActividadesEmpty();
    };

    $("#js-ac-actividades-list").appendChild(node);
    renderActividadesEmpty();

    // Si la fecha ya estaba prellenada, cargar usuarios
    if (fechaInput.value) loadUsuarios();

    return node;
  }

  function renderActividadesEmpty() {
    const empty = $("#js-ac-actividades-empty");
    // El bloque "empty" sólo existía cuando el usuario podía agregar
    // actividades dinámicamente. Como ahora la sección sólo permite 1
    // actividad, ese bloque se removió del HTML; si no está, no hacemos
    // nada.
    if (!empty) return;
    empty.style.display = $("#js-ac-actividades-list").children.length === 0
      ? ""
      : "none";
  }

  function collectActividades() {
    return $$(".js-ac-actividad").map((row) => {
      const obj = {};
      $$("[data-f]", row).forEach((input) => {
        obj[input.dataset.f] = (input.value || "").trim();
      });
      // Convertir duración "HH:MM" a minutos para el backend.
      const mins = parseHHMMToMinutos(obj.duracion);
      if (mins != null) {
        obj.duracion_minutos = mins;
      }
      return obj;
    });
  }

  // -------- Reset / open --------

  function resetModal() {
    state.contactoIndex = 0;
    state.actividadIndex = 0;
    state.cacheUsuariosPorFecha = new Map();
    $("#js-ac-contactos-list").innerHTML = "";
    $("#js-ac-actividades-list").innerHTML = "";
    $("#js-ac-result").innerHTML = "";
    $("#js-ac-titulo").value = "";
    $("#js-ac-prioridad").value = "";
    $("#js-ac-fecha-contacto").value = todayYmd();
    $("#js-ac-origen").value = "";
    $("#js-ac-nivel").value = "";
    $("#js-ac-link-drive").value = "";
    $("#js-ac-contenido").value = "";
    $("#js-ac-fecha-entrega").value = "";
    if (state.institucionChoices) {
      state.institucionChoices.setValue([""]);
    } else {
      $("#js-ac-institucion").value = "";
    }
    if (state.carreraChoices) {
      state.carreraChoices.setChoices(
        [{ value: "", label: "Seleccione universidad primero", disabled: true }],
        "value",
        "label",
        true,
      );
      state.carreraChoices.setValue([""]);
      state.carreraChoices.disable();
    } else {
      $("#js-ac-carrera").innerHTML =
        '<option value="">Seleccione universidad primero</option>';
      $("#js-ac-carrera").disabled = true;
    }
    // Defaults: 1 contacto + 1 actividad vacíos para que el usuario no
    // tenga que hacer dos clics extra al abrir.
    addContacto();
    addActividad();
  }

  async function openModal() {
    try {
      await loadLookups();
    } catch (e) {
      toast("error", "No se pudieron cargar los catálogos.");
      return;
    }
    fillStaticSelects();
    resetModal();

    const modalEl = $("#js-agregar-cliente-modal");
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }

  // -------- Submit --------

  function buildPayload() {
    return {
      cliente: {
        titulo_prospecto: $("#js-ac-titulo").value.trim(),
        fecha_contacto: $("#js-ac-fecha-contacto").value || null,
        origen_id: $("#js-ac-origen").value || null,
        institucion_id: $("#js-ac-institucion").value || null,
        carrera_id: $("#js-ac-carrera").value || null,
        nivel_academico_id: $("#js-ac-nivel").value || null,
        link_drive: $("#js-ac-link-drive").value.trim() || null,
        contenido: $("#js-ac-contenido").value.trim() || null,
        fecha_entrega: $("#js-ac-fecha-entrega").value || null,
        prioridad: $("#js-ac-prioridad").value || null,
        contactos: collectContactos(),
      },
      actividades: collectActividades(),
    };
  }

  function highlightConflicts(conflicts) {
    // Limpia marcas previas
    $$(".js-ac-actividad").forEach((row) => {
      row.classList.remove("border-danger", "border-2");
    });
    (conflicts || []).forEach((c) => {
      const row = $$(".js-ac-actividad")[c.index];
      if (row) {
        row.classList.add("border-danger", "border-2");
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  async function submit() {
    const result = $("#js-ac-result");
    result.innerHTML = "";

    const payload = buildPayload();

    // Validaciones cliente-side mínimas
    if (!payload.cliente.titulo_prospecto) {
      toast("warning", "El título del cliente es obligatorio.");
      return;
    }
    const contactosOk = payload.cliente.contactos.filter(
      (c) => c.celular && c.celular.length > 0,
    );
    if (contactosOk.length === 0) {
      toast("warning", "Agrega al menos un contacto con celular.");
      return;
    }
    if (payload.actividades.length === 0) {
      toast("warning", "Agrega al menos una actividad.");
      return;
    }
    for (const [i, a] of payload.actividades.entries()) {
      if (!a.tarea_id || !a.usuario_asignado_id || !a.fecha_asignacion || !a.hora_inicio) {
        toast(
          "warning",
          `Actividad #${i + 1}: completa tarea, usuario, fecha y hora.`,
        );
        return;
      }
      if (a.duracion && !/^\d{1,3}:[0-5]\d$/.test(a.duracion)) {
        toast(
          "warning",
          `Actividad #${i + 1}: la duración debe tener formato HH:MM.`,
        );
        return;
      }
    }

    const btn = $("#js-ac-guardar");
    btn.disabled = true;
    btn.innerHTML =
      '<span class="spinner-border spinner-border-sm me-1"></span> Guardando…';

    try {
      const r = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();

      if (r.status === 409 && j.conflicts) {
        highlightConflicts(j.conflicts);
        const lines = (j.conflicts || [])
          .map((c, i) => {
            const tarea = state.tareasById.get(Number(c.tarea_id));
            const tareaNombre = tarea ? tarea.nombre : `Tarea #${c.tarea_id}`;
            const choque = (c.conflicts || [])
              .map(
                (x) =>
                  `· ${x.hi?.slice(0, 5) || "?"}–${x.hf?.slice(0, 5) || "?"}${x.bloqueada ? " (bloqueada)" : ""}`,
              )
              .join("<br>");
            return `<b>Actividad #${(c.index ?? i) + 1}</b> (${tareaNombre})<br>${choque || "Conflicto de horario."}`;
          })
          .join("<br><br>");
        await Swal.fire({
          icon: "warning",
          title: "Conflictos de horario",
          html: `${j.error || "Una o más actividades chocan."}<br><br>${lines}`,
          confirmButtonText: "Ajustar y volver a intentar",
        });
        return;
      }

      if (!r.ok || !j.success) {
        await Swal.fire({
          icon: "error",
          title: "No se pudo guardar",
          text: j.error || `Error ${r.status}`,
        });
        return;
      }

      toast(
        "success",
        `Cliente #${j.data.id} creado (${j.data.actividades?.length || 0} actividad/es).`,
      );

      const modalEl = $("#js-cal-nueva-modal");
      bootstrap.Modal.getInstance(modalEl)?.hide();

      // Notificar al calendario para que refresque eventos
      window.dispatchEvent(new CustomEvent("cliente:creado"));
    } catch (e) {
      console.error(e);
      await Swal.fire({
        icon: "error",
        title: "Error de red",
        text: "No se pudo comunicar con el servidor.",
      });
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-save me-1"></i> Guardar cliente y actividades';
    }
  }

  // -------- Init --------

  // El tab "AGREGAR CLIENTE" vive dentro del modal "Programar" existente.
  // Cuando el usuario lo activa por primera vez, cargamos catálogos y
  // sembramos 1 contacto + 1 actividad vacíos. En activaciones
  // posteriores sólo reseteamos el formulario.
  let initialized = false;
  let formAlreadyReset = false;

  async function onTabShown() {
    if (!initialized) {
      try {
        await loadLookups();
        initialized = true;
      } catch (e) {
        toast("error", "No se pudieron cargar los catálogos.");
        return;
      }
      fillStaticSelects();
    }
    // Sólo reseteamos una vez por apertura del modal padre para no
    // pisar lo que el usuario está tipeando si vuelve a la pestaña.
    if (!formAlreadyReset) {
      resetModal();
      formAlreadyReset = true;
    }
  }

  // Cuando el modal padre se cierra, permitimos reset en la próxima apertura.
  function onModalHidden() {
    formAlreadyReset = false;
  }

  function init() {
    $("#js-ac-add-contacto")?.addEventListener("click", () => addContacto());
    $("#js-ac-guardar")?.addEventListener("click", submit);

    const tabBtn = $("#js-cal-tab-agregar-cliente-btn");
    if (tabBtn) {
      tabBtn.addEventListener("show.bs.tab", onTabShown);
    }

    const modalEl = $("#js-cal-nueva-modal");
    if (modalEl) {
      modalEl.addEventListener("hidden.bs.modal", onModalHidden);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();