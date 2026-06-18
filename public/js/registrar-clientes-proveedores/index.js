/* global $, bootstrap, Swal */
$(function () {
  const API = "/api/clientes-proveedores";
  const POTENCIALES_API = "/api/potenciales-clientes";

  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
  });
  function showToast(msg, type = "success") {
    const icon = type === "success" ? "success" : type === "error" ? "error" : "info";
    Toast.fire({ icon, title: msg });
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
  function buildOptions(items, valueKey, labelKey, placeholder) {
    const opts = [`<option value="">${placeholder}</option>`];
    items.forEach((it) => {
      opts.push(
        `<option value="${it[valueKey]}">${escapeHtml(it[labelKey])}</option>`,
      );
    });
    return opts.join("");
  }

  // ---- Searchable selects (Choices.js) -------------------------------
  //
  // Inicializa Universidad, Carrera y Tarea como selects con búsqueda.
  // Choices.js v11 escribe en el <select> original cuando el usuario
  // elige una opción, así que .serializeArray() / .val() siguen
  // funcionando como fuente de verdad.
  //
  // Carrera arranca deshabilitada y se va poblando vía setChoices() al
  // elegir una universidad (sin re-inyectar HTML).

  function makeChoices(el, options = {}) {
    if (!el || typeof Choices === "undefined") return null;
    // Si ya hay una instancia previa sobre el mismo <select>, la
    // destruimos para no duplicar wrappers.
    if (el._choices) {
      try { el._choices.destroy(); } catch (e) { /* noop */ }
    }
    const inst = new Choices(el, {
      searchEnabled: true,
      searchPlaceholderValue: "Buscar…",
      noResultsText: "Sin resultados",
      itemSelectText: "",
      shouldSort: false,
      placeholder: true,
      ...options,
    });
    el._choices = inst;
    return inst;
  }

  const $form = $("#form-cliente-proveedor");
  const $contactosList = $("#js-cp-contactos-list");
  const $contactosEmpty = $("#js-cp-contactos-empty");

  // ---- Lookups -------------------------------------------------------

  async function loadLookups() {
    const res = await fetch(`${POTENCIALES_API}/lookups`);
    const json = await res.json();
    if (!res.ok || !json.success)
      throw new Error("No se pudieron cargar los catálogos.");
    const data = json.data;

    $("#js-cp-proveedor").html(
      buildOptions(data.proveedores || [], "id", "nombre", "Seleccione un proveedor"),
    );
    $("#js-cp-institucion").html(
      buildOptions(
        data.instituciones || [],
        "id",
        "nombre",
        "Seleccione una universidad",
      ),
    );
    $("#js-cp-nivel").html(
      buildOptions(data.niveles || [], "id", "nombre", "Seleccione un nivel"),
    );
    $("#js-cp-tarea").html(
      buildOptions(data.tareas || [], "id", "nombre", "Seleccione una tarea"),
    );
    // Agregar data-horas a cada option
    (data.tareas || []).forEach((t) => {
      const opt = document.querySelector(`#js-cp-tarea option[value="${t.id}"]`);
      if (opt) opt.setAttribute("data-horas", t.horas_estimadas || 60);
    });

    // Inicializa los 3 selects con búsqueda (Choices.js).
    makeChoices(document.getElementById("js-cp-institucion"), {
      placeholderValue: "Seleccione una universidad",
    });
    const carreraEl = document.getElementById("js-cp-carrera");
    if (carreraEl) {
      const inst = makeChoices(carreraEl, {
        placeholderValue: "Seleccione universidad primero",
      });
      if (inst) inst.disable();
    }
    makeChoices(document.getElementById("js-cp-tarea"), {
      placeholderValue: "Seleccione una tarea",
    });
  }

  // ---- Carreras por institución --------------------------------------

  async function loadCarreras(institucionId) {
    const sel = document.getElementById("js-cp-carrera");
    if (!sel) return;
    const inst = sel._choices;

    if (!institucionId) {
      if (inst) {
        inst.setChoices(
          [{ value: "", label: "Seleccione universidad primero", disabled: true, selected: true }],
          "value",
          "label",
          true,
        );
        inst.disable();
      } else {
        sel.innerHTML = `<option value="" disabled selected>Seleccione universidad primero</option>`;
        sel.disabled = true;
      }
      return;
    }

    // Cargando…
    if (inst) {
      inst.setChoices(
        [{ value: "", label: "Cargando…", disabled: true, selected: true }],
        "value",
        "label",
        true,
      );
      inst.disable();
    } else {
      sel.innerHTML = `<option value="" disabled selected>Cargando…</option>`;
      sel.disabled = true;
    }

    try {
      const res = await fetch(
        `${POTENCIALES_API}/carreras?institucion_id=${institucionId}`,
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      const choices = [
        { value: "", label: "Seleccione una carrera", selected: true },
        ...(json.data || []).map((c) => ({ value: String(c.id), label: c.nombre })),
      ];
      if (inst) {
        inst.setChoices(choices, "value", "label", true);
        inst.enable();
      } else {
        sel.innerHTML = choices
          .map(
            (c) =>
              `<option value="${c.value}"${c.selected ? " selected" : ""}>${escapeHtml(c.label)}</option>`,
          )
          .join("");
        sel.disabled = false;
      }
    } catch (err) {
      if (inst) {
        inst.setChoices(
          [{ value: "", label: "Error al cargar", disabled: true, selected: true }],
          "value",
          "label",
          true,
        );
      } else {
        sel.innerHTML = `<option value="" disabled selected>Error al cargar</option>`;
      }
      showToast(err.message || "Error.", "error");
    }
  }

  // ---- Contactos -----------------------------------------------------

  function contactoRowHtml(idx) {
    return `
      <div class="card border mb-2 js-cp-contacto" data-idx="${idx}">
        <div class="card-body p-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <strong class="text-muted fs-xxs text-uppercase">Contacto #${idx + 1}</strong>
            <button type="button" class="btn btn-sm btn-outline-danger js-cp-contacto-remove" title="Quitar">
              <i class="ti ti-x"></i>
            </button>
          </div>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label">Nombres</label>
              <input type="text" class="form-control js-cp-c-nombres" maxlength="50" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Apellidos</label>
              <input type="text" class="form-control js-cp-c-apellidos" maxlength="50" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Celular <span class="text-danger">*</span></label>
              <input type="text" class="form-control js-cp-c-celular" maxlength="15" required />
            </div>
          </div>
        </div>
      </div>
    `;
  }
  function refreshContactosEmpty() {
    $contactosEmpty.toggle($contactosList.find(".js-cp-contacto").length === 0);
  }
  function reindexContactos() {
    $contactosList.find(".js-cp-contacto").each(function (i) {
      $(this)
        .attr("data-idx", i)
        .find("strong.text-muted")
        .text(`Contacto #${i + 1}`);
    });
  }
  function addContacto() {
    const idx = $contactosList.find(".js-cp-contacto").length;
    $contactosList.append(contactoRowHtml(idx));
    refreshContactosEmpty();
  }
  function collectContactos() {
    const items = [];
    $contactosList.find(".js-cp-contacto").each(function () {
      const $r = $(this);
      items.push({
        nombres: $r.find(".js-cp-c-nombres").val() || null,
        apellidos: $r.find(".js-cp-c-apellidos").val() || null,
        celular: $r.find(".js-cp-c-celular").val() || null,
      });
    });
    return items;
  }

  // ---- Submit --------------------------------------------------------

  function collectData() {
    const $f = $form;
    const raw = {};
    $f.serializeArray().forEach(({ name, value }) => {
      if (value === "" || value == null) return;
      raw[name] = value;
    });

    const contactos = collectContactos();
    const sinCel = contactos.findIndex((c) => !c.celular);
    if (sinCel !== -1) {
      showToast(`El contacto #${sinCel + 1} requiere celular.`, "error");
      return null;
    }

    if (!raw.proveedor_id) {
      showToast("Selecciona un proveedor.", "error");
      return null;
    }
    if (!raw.titulo_prospecto) {
      showToast("Ingresa un título.", "error");
      return null;
    }
    if (!raw.fecha_entrega) {
      showToast("Selecciona la fecha de entrega.", "error");
      return null;
    }
    if (!raw.tarea_id) {
      showToast("Selecciona una tarea.", "error");
      return null;
    }

    return {
      proveedor_id: Number(raw.proveedor_id),
      titulo_prospecto: raw.titulo_prospecto,
      institucion_id: raw.institucion_id ? Number(raw.institucion_id) : null,
      carrera_id: raw.carrera_id ? Number(raw.carrera_id) : null,
      nivel_academico_id: raw.nivel_academico_id
        ? Number(raw.nivel_academico_id)
        : null,
      fecha_entrega: raw.fecha_entrega,
      prioridad: raw.prioridad || null,
      link_drive: raw.link_drive || null,
      contenido: raw.contenido || null,
      contactos,
      tarea_id: Number(raw.tarea_id),
      tiempo_estimado_minutos: raw.tiempo_estimado_minutos
        ? Number(raw.tiempo_estimado_minutos)
        : 60,
    };
  }

  async function submitForm(ev) {
    ev.preventDefault();
    const body = collectData();
    if (!body) return;

    const $btn = $("#js-cp-guardar");
    $btn.prop("disabled", true).text("Registrando…");
    try {
      const res = await fetch(API, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(json.message || "Cliente de proveedor registrado.");
        $form.trigger("reset");
        $contactosList.empty();
        refreshContactosEmpty();
        resetChoicesSelects();
        return;
      }
      showToast((json && json.error) || "Error al registrar.", "error");
    } catch (err) {
      showToast(err.message || "Error al registrar.", "error");
    } finally {
      $btn.prop("disabled", false).text("Registrar cliente");
    }
  }

  // Limpia los 3 selects con Choices y deja carrera deshabilitada.
  function resetChoicesSelects() {
    ["js-cp-institucion", "js-cp-tarea"].forEach((id) => {
      const el = document.getElementById(id);
      if (el && el._choices) el._choices.setValue([""]);
    });
    // Carrera: volver al estado deshabilitado con placeholder.
    loadCarreras("");
  }

  // ---- Init ----------------------------------------------------------

  $("#js-cp-institucion").on("change", function () {
    loadCarreras($(this).val());
  });
  // Al cambiar la tarea, pre-llenar la duración con horas_estimadas
  $("#js-cp-tarea").on("change", function () {
    const opt = this.options[this.selectedIndex];
    if (opt && opt.value) {
      const horas = Number(opt.getAttribute("data-horas")) || 60;
      document.getElementById("js-cp-duracion").value = horas;
    }
  });
  $("#js-cp-add-contacto").on("click", addContacto);
  $contactosList.on("click", ".js-cp-contacto-remove", function () {
    $(this).closest(".js-cp-contacto").remove();
    reindexContactos();
    refreshContactosEmpty();
  });
  $("#js-cp-limpiar").on("click", function () {
    $form.trigger("reset");
    $contactosList.empty();
    refreshContactosEmpty();
    resetChoicesSelects();
  });
  $form.on("submit", submitForm);

  loadLookups().catch((err) =>
    showToast(err.message || "Error cargando catálogos.", "error"),
  );
});
