/* global $, bootstrap, Swal */
$(function () {
  const API_BASE = "/api/potenciales-clientes";
  const $modal = $("#standard-modal");
  const $modalDialog = $modal.find(".modal-dialog");
  const $modalTitle = $modal.find("#standard-modalLabel");
  const $modalBody = $modal.find(".modal-body");
  const $btnGuardar = $modal.find(".modal-footer .btn-primary");
  const $btnConvertir = $("#js-btn-convertir-pp");
  const bsModal = new bootstrap.Modal($modal[0]);

  const MODAL_LG_CLASSES = "modal-lg modal-dialog-scrollable";

  let editingId = null;
  let lookups = {
    tareas: [],
    niveles: [],
    instituciones: [],
    proveedores: [],
    origenes: [],
    tipos_documento: [],
  };
  // Cache de carreras por institucion_id (se cargan al elegir universidad)
  const carrerasByInstitucion = new Map();

  // ---- Helpers ---------------------------------------------------------

  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (t) => {
      t.addEventListener("mouseenter", Swal.stopTimer);
      t.addEventListener("mouseleave", Swal.resumeTimer);
    },
  });

  function showToast(msg, type = "success") {
    const icon =
      type === "success" ? "success" : type === "error" ? "error" : "info";
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

  function formatDate(d) {
    if (!d) return '<span class="text-muted small">—</span>';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime()))
      return '<span class="text-muted small">—</span>';
    return dt.toLocaleDateString("es-PE");
  }

  // Convierte fecha a "YYYY-MM-DD" para <input type="date">. Acepta Date,
  // string ISO, o algo que Date() pueda parsear.
  function formatDateInput(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    // Usar la fecha local (no UTC) para evitar off-by-one en bordes de día.
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function prioridadBadge(p) {
    if (!p) return '<span class="text-muted small">—</span>';
    const variant =
      p === "ALTA" ? "bg-danger" : p === "MEDIA" ? "bg-warning" : "bg-secondary";
    return `<span class="badge ${variant}">${escapeHtml(p)}</span>`;
  }

  // ---- Searchable selects (Choices.js) -------------------------------
  //
  // Choices.js envuelve el <select> en su propio DOM. Esto rompe el flujo
  // normal de jQuery (.html() / .val() sobre el <select> original),
  // pero el <select> sigue siendo la fuente de verdad para
  // .serializeArray() — Choices escribe en él al cambiar.
  //
  // Estrategia: mantener un Map<selector, Choices> y recrear las
  // instancias cada vez que se re-inyecta el HTML del modal (porque el
  // DOM viejo se destruye con el modal). Para la carrera, que se carga
  // dinámicamente sin re-inyectar el HTML, usamos setChoices() para
  // mantener la instancia viva.

  const choicesInstances = new Map();

  function destroyChoices(selector) {
    const c = choicesInstances.get(selector);
    if (c) {
      try { c.destroy(); } catch (e) { /* noop */ }
      choicesInstances.delete(selector);
    }
  }

  function destroyAllChoices() {
    for (const sel of Array.from(choicesInstances.keys())) {
      destroyChoices(sel);
    }
  }

  function makeChoices(selector, opts = {}) {
    const el = $modalBody.find(selector)[0];
    if (!el || typeof Choices === "undefined") return null;
    destroyChoices(selector);
    const instance = new Choices(el, {
      searchEnabled: true,
      searchPlaceholderValue: "Buscar…",
      noResultsText: "Sin resultados",
      itemSelectText: "",
      shouldSort: false,
      placeholder: true,
      placeholderValue: el.dataset.placeholder || "Seleccione…",
      ...opts,
    });
    choicesInstances.set(selector, instance);
    return instance;
  }

  // Inicializa los 3 selects pedidos: universidad, carrera, tarea.
  // Debe llamarse DESPUÉS de que el form HTML se inyecte en el modal.
  function initSearchableSelects() {
    makeChoices("#sel-institucion", { placeholderValue: "Seleccione una universidad" });
    // Carrera: arranca deshabilitado (Choices respeta el `disabled` del
    // <select>, pero también hay que setearlo vía la API para que la UI
    // de Choices refleje el estado).
    const carreraEl = $modalBody.find("#sel-carrera")[0];
    if (carreraEl) {
      destroyChoices("#sel-carrera");
      const inst = new Choices(carreraEl, {
        searchEnabled: true,
        searchPlaceholderValue: "Buscar…",
        noResultsText: "Sin resultados",
        itemSelectText: "",
        shouldSort: false,
        placeholder: true,
        placeholderValue: "Seleccione universidad primero",
      });
      inst.disable();
      choicesInstances.set("#sel-carrera", inst);
    }
    makeChoices('select[name="tarea_id"]', { placeholderValue: "Seleccione una tarea" });
  }

  // Reemplaza las opciones del select de carrera usando la API de Choices
  // (en lugar de .html() sobre el <select>, que no actualiza la UI).
  function setCarreraChoices(carreras, { enabled = true } = {}) {
    const inst = choicesInstances.get("#sel-carrera");
    const el = $modalBody.find("#sel-carrera")[0];
    if (!el) return;
    const choices = [
      { value: "", label: enabled ? "Seleccione una carrera" : "Seleccione universidad primero", disabled: !enabled, selected: true },
      ...(carreras || []).map((c) => ({ value: String(c.id), label: c.nombre })),
    ];
    if (inst) {
      inst.setChoices(choices, "value", "label", true);
      if (enabled) inst.enable();
      else inst.disable();
    } else {
      // Fallback (no debería pasar porque initSearchableSelects corre
      // antes de loadCarreras).
      el.innerHTML = choices
        .map((c) => `<option value="${c.value}"${c.disabled ? " disabled" : ""}>${escapeHtml(c.label)}</option>`)
        .join("");
    }
  }

  function setCarreraValue(value) {
    const inst = choicesInstances.get("#sel-carrera");
    if (inst) inst.setChoiceByValue(value == null ? "" : String(value));
    else $modalBody.find("#sel-carrera").val(value == null ? "" : String(value));
  }

  // ---- Form -----------------------------------------------------------

  function formHtml() {
    const tareasOpts = buildOptions(
      lookups.tareas,
      "id",
      "nombre",
      "Seleccione una tarea",
    );
    const nivelesOpts = buildOptions(
      lookups.niveles,
      "id",
      "nombre",
      "Seleccione un nivel",
    );
    const institucionesOpts = buildOptions(
      lookups.instituciones,
      "id",
      "nombre",
      "Seleccione una universidad",
    );
    const origenesOpts = buildOptions(
      lookups.origenes,
      "id",
      "nombre",
      "Seleccione un origen",
    );

    return `
      <form id="form-potencial" novalidate>
        <ul class="nav nav-tabs nav-bordered mb-3" role="tablist">
          <li class="nav-item">
            <a href="#tab-trabajo" data-bs-toggle="tab" class="nav-link active" aria-selected="true">
              <i class="ti ti-briefcase me-1"></i> Trabajo
            </a>
          </li>
          <li class="nav-item">
            <a href="#tab-tarea" data-bs-toggle="tab" class="nav-link" aria-selected="false">
              <i class="ti ti-checkbox me-1"></i> Tarea
            </a>
          </li>
          <li class="nav-item">
            <a href="#tab-contactos" data-bs-toggle="tab" class="nav-link" aria-selected="false">
              <i class="ti ti-users me-1"></i> Contactos
            </a>
          </li>
          ${
            editingId
              ? `<li class="nav-item">
            <a href="#tab-historial" data-bs-toggle="tab" class="nav-link" aria-selected="false">
              <i class="ti ti-history me-1"></i> Historial
            </a>
          </li>`
              : ""
          }
        </ul>

        <div class="tab-content">
          <!-- ====== TAB 1: Trabajo ====== -->
          <div class="tab-pane fade show active" id="tab-trabajo">
            <div class="row g-3">
              <div class="col-md-8">
                <label class="form-label">Título del trabajo</label>
                <input type="text" class="form-control" name="titulo_prospecto" maxlength="255" placeholder="Ej. Tesis de Ingeniería" />
              </div>
              <div class="col-md-4">
                <label class="form-label">Prioridad <span class="text-danger">*</span></label>
                <select class="form-select" name="prioridad" required>
                  <option value="">—</option>
                  <option value="ALTA">Alta</option>
                  <option value="MEDIA">Media</option>
                  <option value="BAJA">Baja</option>
                </select>
              </div>

              <div class="col-md-6">
                <label class="form-label">Universidad</label>
                <select class="form-select" name="institucion_id" id="sel-institucion">
                  ${institucionesOpts}
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Carrera</label>
                <select class="form-select" name="carrera_id" id="sel-carrera" disabled>
                  <option value="">Seleccione una universidad primero</option>
                </select>
              </div>

              <div class="col-md-6">
                <label class="form-label">Nivel académico</label>
                <select class="form-select" name="nivel_academico_id">
                  ${nivelesOpts}
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Fecha tentativa de entrega</label>
                <input type="date" class="form-control" name="fecha_entrega" />
              </div>

              <div class="col-md-6">
                <label class="form-label">Origen del contacto <span class="text-danger">*</span></label>
                <select class="form-select" name="origen_id" required>
                  ${origenesOpts}
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Link Drive</label>
                <input type="url" class="form-control" name="link_drive" maxlength="150" placeholder="https://drive.google.com/..." />
                <small class="text-muted">Se guarda el actual y el historial.</small>
              </div>

              <div class="col-12">
                <label class="form-label">Observaciones y detalles</label>
                <textarea class="form-control" name="contenido" rows="3" placeholder="Notas, detalles, contexto..."></textarea>
              </div>
            </div>
          </div>

          <!-- ====== TAB 2: Tarea ====== -->
          <div class="tab-pane fade" id="tab-tarea">
            ${
              editingId
                ? `<div class="d-flex align-items-center justify-content-between mb-2">
                <div>
                  <h6 class="text-uppercase text-muted fs-xxs mb-0">Actividades del prospecto</h6>
                  <small class="text-muted">Lista de actividades registradas. Para agregar una nueva, pulsa "Agregar actividad".</small>
                </div>
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-primary-subtle text-primary" id="actividades-count">0</span>
                  <button type="button" id="btn-add-actividad" class="btn btn-sm btn-primary">
                    <i class="ti ti-plus me-1"></i> Agregar actividad
                  </button>
                </div>
              </div>
              <div id="actividades-list" class="mb-3"></div>
              <div id="add-actividad-form" style="display: none;" class="card border mb-3">
                <div class="card-body">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <strong class="text-muted fs-xxs text-uppercase">Nueva actividad</strong>
                    <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-cancel-add-actividad" title="Cerrar">
                      <i class="ti ti-x"></i>
                    </button>
                  </div>
                  <div class="row g-2">
                    <div class="col-md-12">
                      <label class="form-label">Tarea a asignar <span class="text-danger">*</span></label>
                      <select class="form-select" id="sel-tarea-nueva" required>
                        <option value="">Seleccione una tarea</option>
                        ${tareasOpts}
                      </select>
                      <small class="text-muted">Se creará una actividad en estado <strong>pendiente</strong>.</small>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Fecha de asignación <span class="text-danger">*</span></label>
                      <input type="date" class="form-control" id="sel-fecha-nueva" required />
                    </div>
                    <div class="col-md-6" id="wrap-hora-reunion-nueva" style="display: none;">
                      <label class="form-label">Hora de la reunión <span class="text-danger">*</span></label>
                      <input type="time" class="form-control" id="sel-hora-nueva" step="900" />
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Asignado a <span class="text-danger">*</span></label>
                      <select class="form-select" id="sel-usuario-nuevo" required disabled>
                        <option value="">Selecciona primero la fecha</option>
                      </select>
                      <small class="text-muted js-asignado-hint-nueva">Por defecto: VALORADOR activo (configurable por .env).</small>
                    </div>
                    <div class="col-md-3">
                      <label class="form-label">Prioridad</label>
                      <select class="form-select" id="sel-prioridad-nueva">
                        <option value="">—</option>
                        <option value="ALTA">ALTA</option>
                        <option value="MEDIA">MEDIA</option>
                        <option value="BAJA">BAJA</option>
                      </select>
                    </div>
                    <div class="col-md-3 d-flex align-items-end">
                      <button type="button" id="btn-save-nueva-actividad" class="btn btn-primary w-100">
                        <i class="ti ti-check me-1"></i> Guardar actividad
                      </button>
                    </div>
                  </div>
                  <small class="text-muted d-block mt-2">
                    Si la tarea es de tipo REUNIÓN, la asignación se forzará al ASISTENTE DE PRODUCCIÓN activo y se requerirá la hora.
                  </small>
                </div>
              </div>`
                : `<div class="row g-3">
              <div class="col-md-12">
                <label class="form-label">Tarea a asignar <span class="text-danger">*</span></label>
                <select class="form-select" name="tarea_id" required>
                  ${tareasOpts}
                </select>
                <small class="text-muted">Se creará una actividad en estado <strong>pendiente</strong>.</small>
              </div>

              <div class="col-12">
                <hr class="my-2" />
                <h6 class="text-uppercase text-muted fs-xxs mb-2">Asignación en el calendario</h6>
                <p class="small text-muted mb-2">
                  La actividad se agenda en el calendario del usuario seleccionado (8:00 por defecto, fin = horas estimadas de la tarea).
                </p>
              </div>

              <div class="col-md-6">
                <label class="form-label">Fecha de asignación <span class="text-danger">*</span></label>
                <input type="date" class="form-control" name="fecha_asignacion" id="sel-fecha-asignacion" required />
                <small class="text-muted js-fecha-hint">Por defecto: hoy.</small>
              </div>
              <div class="col-md-6" id="wrap-hora-reunion" style="display: none;">
                <label class="form-label">Hora de la reunión <span class="text-danger">*</span></label>
                <input type="time" class="form-control" name="hora_reunion" id="sel-hora-reunion" step="900" />
                <small class="text-muted js-hora-reunion-hint">Indica a qué hora se realizará la reunión.</small>
              </div>
              <div class="col-md-6">
                <label class="form-label">Asignado a <span class="text-danger">*</span></label>
                <select class="form-select" name="usuario_asignado_id" id="sel-usuario-asignado" required disabled>
                  <option value="">Cargando usuarios…</option>
                </select>
                <small class="text-muted js-asignado-hint">Por defecto: VALORADOR activo (configurable por .env).</small>
              </div>
            </div>`
            }
          </div>

          <!-- ====== TAB 3: Contactos ====== -->
          <div class="tab-pane fade" id="tab-contactos">
            <div class="d-flex align-items-center justify-content-between mb-2">
              <h6 class="text-uppercase text-muted fs-xxs mb-0">Contactos del cliente</h6>
              <button type="button" id="btn-add-contacto" class="btn btn-sm btn-outline-primary">
                <i class="ti ti-plus me-1"></i> Agregar contacto
              </button>
            </div>
            <small class="text-muted d-block mb-2">Mínimo 1 contacto. El celular es obligatorio.</small>

            <div id="contactos-list"></div>

            <div class="text-center text-muted py-3" id="contactos-empty">
              Aún no hay contactos. Haz clic en "Agregar contacto".
            </div>
          </div>

          ${
            editingId
              ? `<div class="tab-pane fade" id="tab-historial">
            <div class="d-flex align-items-center justify-content-between mb-3">
              <div>
                <h6 class="text-uppercase text-muted fs-xxs mb-0">Línea de tiempo</h6>
                <small class="text-muted">Historial de cambios de estado del prospecto.</small>
              </div>
              <span class="badge bg-primary-subtle text-primary" id="historial-count">0</span>
            </div>
            <div id="historial-list"></div>
          </div>`
              : ""
          }
        </div>
      </form>
    `;
  }

  // ---- Repeater de contactos ----------------------------------------

  function contactoRowHtml(idx) {
    const tiposDocOpts = buildOptions(
      lookups.tipos_documento || [],
      "id",
      "nombre",
      "Tipo doc.",
    );
    return `
      <div class="card border mb-2 js-contacto-row" data-idx="${idx}">
        <div class="card-body p-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <strong class="text-muted fs-xxs text-uppercase">Contacto #${idx + 1}</strong>
            <button type="button" class="btn btn-sm btn-outline-danger js-contacto-remove" title="Quitar">
              <i class="ti ti-x"></i>
            </button>
          </div>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label">Nombres</label>
              <input type="text" class="form-control js-c-nombres" maxlength="50" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Apellidos</label>
              <input type="text" class="form-control js-c-apellidos" maxlength="50" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Celular <span class="text-danger">*</span></label>
              <input type="text" class="form-control js-c-celular" maxlength="15" required />
            </div>
            <div class="col-md-4">
              <label class="form-label">Tipo de documento</label>
              <select class="form-select js-c-tipo-doc">
                ${tiposDocOpts}
              </select>
            </div>
            <div class="col-md-5">
              <label class="form-label">Número de documento</label>
              <input type="text" class="form-control js-c-num-doc" maxlength="20" placeholder="Ej. 12345678" />
            </div>
            <div class="col-md-3 d-flex align-items-end">
              <button type="button" class="btn btn-outline-primary btn-sm w-100 js-c-buscar-dni" title="Buscar datos del documento (RENIEC/SUNAT)">
                <i class="ti ti-search me-1"></i> Buscar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function refreshContactosEmpty() {
    const $rows = $("#contactos-list .js-contacto-row");
    $("#contactos-empty").toggle($rows.length === 0);
  }

  function reindexContactos() {
    $("#contactos-list .js-contacto-row").each(function (i) {
      $(this)
        .attr("data-idx", i)
        .find("strong.text-muted")
        .text(`Contacto #${i + 1}`);
    });
  }

  function addContactoRow() {
    const idx = $("#contactos-list .js-contacto-row").length;
    $("#contactos-list").append(contactoRowHtml(idx));
    refreshContactosEmpty();
  }

  function collectContactos() {
    const items = [];
    $("#contactos-list .js-contacto-row").each(function () {
      const $r = $(this);
      const tipoDocId = $r.find(".js-c-tipo-doc").val();
      const numDoc = $r.find(".js-c-num-doc").val();
      items.push({
        nombres: $r.find(".js-c-nombres").val() || null,
        apellidos: $r.find(".js-c-apellidos").val() || null,
        celular: $r.find(".js-c-celular").val() || null,
        tipo_documento_id: tipoDocId ? Number(tipoDocId) : null,
        numero_documento: numDoc ? String(numDoc).trim() || null : null,
      });
    });
    return items;
  }

  // Busca el id del tipo_documento cuya abreviatura sea "DNI" dentro del
  // catálogo cargado. Si no la encuentra, devuelve null.
  function defaultDniTipoId() {
    const list = lookups.tipos_documento || [];
    const found = list.find(
      (t) => String(t.abreviatura || "").toUpperCase() === "DNI",
    );
    return found ? found.id : null;
  }

  // Llama a /api/usuarios/search-document para auto-rellenar nombres /
  // apellidos del contacto. Sólo aplica si el row no tiene ya esos
  // campos llenos (para no pisar lo escrito a mano por el usuario).
  async function buscarDNI($row) {
    const $num = $row.find(".js-c-num-doc");
    const $tipo = $row.find(".js-c-tipo-doc");
    const $nombres = $row.find(".js-c-nombres");
    const $apellidos = $row.find(".js-c-apellidos");
    const $btn = $row.find(".js-c-buscar-dni");
    if (!$row.length) return;

    const numero = String($num.val() || "").trim();
    if (!numero) {
      showToast("Ingresa un número de documento para buscar.", "error");
      $num.trigger("focus");
      return;
    }
    // Si el usuario no eligió tipo de documento, asumimos DNI (es lo más
    // común). Si eligió RUC, también funciona porque la API lo enruta.
    const tipoId = $tipo.val() || defaultDniTipoId();
    if (tipoId) $tipo.val(String(tipoId));

    const prevText = $btn.html();
    $btn.prop("disabled", true).html(
      '<span class="spinner-border spinner-border-sm me-1" role="status"></span>Buscando…',
    );
    try {
      const qs = new URLSearchParams({
        tipoDocumento_id: tipoId ? String(tipoId) : "",
        numero_documento: numero,
      }).toString();
      const res = await fetch(`/api/usuarios/search-document?${qs}`);
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(
          (json && json.error) || "No se encontró información para ese documento.",
        );
      }
      const d = json.data;
      // Aplica sólo si el campo está vacío: respetamos lo que el usuario ya
      // haya escrito a mano.
      if (!$nombres.val() && d.nombres) $nombres.val(d.nombres);
      if (!$apellidos.val()) {
        if (d.apellidos) $apellidos.val(d.apellidos);
        else {
          const ap =
            [d.apellido_paterno, d.apellido_materno]
              .filter(Boolean)
              .join(" ")
              .trim() || "";
          if (ap) $apellidos.val(ap);
        }
      }
      showToast("Datos encontrados.", "success");
    } catch (err) {
      showToast(err.message || "No se pudo consultar el documento.", "error");
    } finally {
      $btn.prop("disabled", false).html(prevText);
    }
  }

  // ---- Historial ----------------------------------------------------

  function formatDateTime(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleString("es-PE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Formatea una hora que viene de Prisma como string ISO
  // (e.g. "1970-01-01T18:00:00.000Z" porque el servicio usa Date.UTC).
  // Devuelve "HH:MM" en UTC, que es lo que el backend almacenó.
  function formatHoraIso(d) {
    if (!d) return "—";
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) {
      // Fallback: extraer HH:MM del string si es ISO
      const m = String(d).match(/T(\d{2}):(\d{2})/);
      return m ? `${m[1]}:${m[2]}` : "—";
    }
    const hh = String(dt.getUTCHours()).padStart(2, "0");
    const mm = String(dt.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // ---- Asignación (fecha + usuario) --------------------------------

  // Constante del ROL del ASISTENTE DE PRODUCCIÓN (no del usuario).
  // El match se hace por `rol.id` en el payload del backend, no por el
  // id del usuario (que puede ser cualquier número).
  const ROL_ASISTENTE_PROD_ID = 11;

  // Controller del fetch en vuelo de `loadUsuariosAsignables`. Sirve para
  // cancelar la petición anterior cuando se dispara una nueva (caso típico:
  // el fetch inicial de `initAsignacion` y el re-fetch que dispara
  // `applyReunionRule` al elegir tarea REUNIÓN). Si el más viejo terminara
  // después del nuevo, sobrescribiría la preselección del ASISTENTE DE
  // PRODUCCIÓN con el default (valorador) — bug reportado.
  let usuariosFetchCtrl = null;

  // Trae los usuarios asignables y preselecciona el del día si existe.
  async function loadUsuariosAsignables(fecha, opts = {}) {
    // Cancela cualquier fetch previo: solo procesamos la respuesta de la
    // última llamada (la del último cambio de fecha / tarea).
    if (usuariosFetchCtrl) {
      try { usuariosFetchCtrl.abort(); } catch (e) { /* noop */ }
    }
    usuariosFetchCtrl = typeof AbortController !== "undefined"
      ? new AbortController()
      : null;
    const signal = usuariosFetchCtrl ? usuariosFetchCtrl.signal : undefined;

    const $sel = $modalBody.find("#sel-usuario-asignado");
    const $hint = $modalBody.find(".js-asignado-hint");
    if (!$sel.length) return;
    if (!fecha) {
      $sel
        .html(`<option value="">Seleccione primero una fecha</option>`)
        .prop("disabled", true);
      return;
    }
    $sel.prop("disabled", true).html(`<option value="">Cargando…</option>`);
    try {
      const res = await fetch(
        `${API_BASE}/usuarios-asignables?fecha=${encodeURIComponent(fecha)}`,
        signal ? { signal } : undefined,
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      const usuarios = json.data.usuarios || [];
      const asignados = json.data.asignados_del_dia || [];
      // El backend ahora devuelve `default_assignee` según el modo activo
      // (VALORADOR por defecto, o auxiliar del día si se cambia por .env).
      // Ya excluye a usuarios de cumpleaños al elegirlo.
      const defaultAssignee = json.data.default_assignee || null;
      const optsHtml = [`<option value="">Seleccione un usuario</option>`];
      for (const u of usuarios) {
        const rolTxt = u.rol ? ` · ${escapeHtml(u.rol.nombre)}` : "";
        const rolId = u.rol && u.rol.id != null ? u.rol.id : "";
        // Los cumpleañeros se muestran con 🎂 y NO se pueden elegir.
        if (u.es_cumpleanios_hoy) {
          optsHtml.push(
            `<option value="${u.id}" data-rol-id="${rolId}" disabled title="Cumple años el ${escapeHtml(fecha)}">🎂 ${escapeHtml(u.nombre)}${rolTxt} (cumpleaños)</option>`,
          );
        } else {
          optsHtml.push(
            `<option value="${u.id}" data-rol-id="${rolId}">${escapeHtml(u.nombre)}${rolTxt}</option>`,
          );
        }
      }
      $sel.html(optsHtml.join("")).prop("disabled", false);

      // Resolver el "preferido" por ROL (no por user.id) cuando aplica:
      //   - `preferredRolId` → primer usuario activo con ese rol
      //     (caso reunión: ASISTENTE DE PRODUCCIÓN = 11)
      //   - `preferredUserId` → un user.id específico (compatibilidad)
      // El preferido se busca dentro de `usuarios` (no en la lista ya
      // renderizada) para tener acceso al `rol.id` y al flag de cumple.
      const motivo = opts.preferredHint || "regla de reunión";
      const preferred = opts.preferredRolId
        ? usuarios.find(
            (u) => u.rol && Number(u.rol.id) === Number(opts.preferredRolId),
          )
        : opts.preferredUserId
        ? usuarios.find((u) => u.id === opts.preferredUserId)
        : null;

      // Preselección (orden de prioridad):
      //   1) Si el front pasa `preferredRolId` o `preferredUserId` (caso
      //      reunión) → usarlo si está disponible y habilitado.
      //   2) Si veníamos editando y el previo sigue existiendo → respetarlo.
      //   3) Si el back manda `default_assignee` → usarlo.
      //   4) Fallback: primer asignado del día (modo histórico).
      //   5) Si nada calza → dejar vacío.
      const prev = opts.keepSelected ? $sel.data("prev") : null;
      if (preferred) {
        // Si la opción está deshabilitada (cumpleañero) el navegador
        // ignora `.val()` y el select queda visualmente vacío.
        // Mostramos un hint informativo y dejamos el select sin selección
        // para que el usuario elija a otro manualmente.
        const $optPref = $sel.find(
          `option[value="${preferred.id}"]`,
        );
        if ($optPref.length && $optPref.prop("disabled")) {
          $sel.val("");
          $hint.html(
            `<i class="ti ti-cake me-1"></i>Asignado por defecto (${escapeHtml(motivo)}): <strong>${escapeHtml(preferred.nombre)}</strong> está de cumpleaños hoy. Elige a otro usuario manualmente.`,
          );
        } else {
          $sel.val(String(preferred.id));
          $hint.html(
            `Asignado por defecto (${escapeHtml(motivo)}): <strong>${escapeHtml(preferred.nombre)}</strong>.`,
          );
        }
      } else if (opts.preferredRolId || opts.preferredUserId) {
        // Nos pidieron un preferido (regla de reunión) pero no aparece
        // en la lista → está inactivo, no existe o no tiene ese rol.
        // No aplicamos default.
        $sel.val("");
        const label = opts.preferredRolId
          ? `rol_id=${opts.preferredRolId}`
          : `id=${opts.preferredUserId}`;
        $hint.html(
          `El usuario preferido (${escapeHtml(label)}) no está disponible (inactivo, sin ese rol, o no existe). Elige manualmente.`,
        );
      } else if (prev && usuarios.find((u) => u.id === prev)) {
        $sel.val(String(prev));
      } else if (defaultAssignee && usuarios.find((u) => u.id === defaultAssignee.id)) {
        $sel.val(String(defaultAssignee.id));
        const motivoDA = defaultAssignee.motivo || "default";
        $hint.html(
          `Asignado por defecto (${escapeHtml(motivoDA)}): <strong>${escapeHtml(defaultAssignee.nombre)}</strong>.`,
        );
      } else if (asignados.length > 0) {
        $sel.val(String(asignados[0].id));
        $hint.html(
          `Asignado por defecto al auxiliar del día: <strong>${escapeHtml(asignados[0].nombre)}</strong>.`,
        );
      } else {
        $sel.val("");
        $hint.html(
          "No se encontró un asignado automático. Elige manualmente.",
        );
      }
      $sel.data("prev", $sel.val());
    } catch (err) {
      // Si la petición fue cancelada por un fetch más nuevo, noop.
      if (err && err.name === "AbortError") return;
      $sel
        .html(`<option value="">Error al cargar</option>`)
        .prop("disabled", true);
      showToast(err.message || "Error al cargar usuarios.", "error");
    } finally {
      // Limpiamos el controller si sigue siendo el actual (no fue
      // reemplazado por un fetch posterior).
      if (usuariosFetchCtrl && signal && signal === usuariosFetchCtrl.signal) {
        usuariosFetchCtrl = null;
      }
    }
  }

  function initAsignacion() {
    const $fecha = $modalBody.find("#sel-fecha-asignacion");
    const $sel = $modalBody.find("#sel-usuario-asignado");
    if (!$fecha.length) return;

    // Si no hay fecha, no hacemos fetch.
    const fecha = $fecha.val();
    if (fecha) loadUsuariosAsignables(fecha);

    // Guardar selección actual para no pisarla en re-fetches.
    $sel.on("change", function () {
      $sel.data("prev", $sel.val());
    });
  }

  // ---- Asignación para el form de "Agregar actividad" --------------
  //
  // Misma lógica que el form de alta:
  //   - Tarea REUNIÓN → preselecciona ASISTENTE DE PRODUCCIÓN (rol_id=11)
  //   - Tarea normal → preselecciona VALORADOR (default del backend)
  //   - Cumpleañeros del día se muestran deshabilitados
  //   - Input de hora aparece solo si es REUNIÓN
  let nuevaFetchCtrl = null;
  async function loadUsuariosAsignablesForNueva(fecha, opts = {}) {
    const $sel = $modalBody.find("#sel-usuario-nuevo");
    if (!$sel.length) return;
    if (!fecha) {
      $sel
        .html(`<option value="">Selecciona primero la fecha</option>`)
        .prop("disabled", true);
      return;
    }
    if (nuevaFetchCtrl) {
      try { nuevaFetchCtrl.abort(); } catch (e) { /* noop */ }
    }
    nuevaFetchCtrl =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    const signal = nuevaFetchCtrl ? nuevaFetchCtrl.signal : undefined;
    $sel.prop("disabled", true).html(`<option value="">Cargando…</option>`);
    try {
      const res = await fetch(
        `${API_BASE}/usuarios-asignables?fecha=${encodeURIComponent(fecha)}`,
        signal ? { signal } : undefined,
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      const usuarios = json.data.usuarios || [];
      const defaultAssignee = json.data.default_assignee || null;
      const optsHtml = [`<option value="">Seleccione un usuario</option>`];
      for (const u of usuarios) {
        const rolTxt = u.rol ? ` · ${escapeHtml(u.rol.nombre)}` : "";
        const rolId = u.rol && u.rol.id != null ? u.rol.id : "";
        if (u.es_cumpleanios_hoy) {
          optsHtml.push(
            `<option value="${u.id}" data-rol-id="${rolId}" disabled title="Cumple años el ${escapeHtml(fecha)}">🎂 ${escapeHtml(u.nombre)}${rolTxt} (cumpleaños)</option>`,
          );
        } else {
          optsHtml.push(
            `<option value="${u.id}" data-rol-id="${rolId}">${escapeHtml(u.nombre)}${rolTxt}</option>`,
          );
        }
      }
      $sel.html(optsHtml.join("")).prop("disabled", false);

      // Preselección (mismo orden que `loadUsuariosAsignables`):
      //   1) `preferredRolId` (caso reunión: ASISTENTE DE PRODUCCIÓN)
      //   2) `default_assignee` del backend (VALORADOR)
      //   3) vacío
      const preferred = opts.preferredRolId
        ? usuarios.find(
            (u) =>
              u.rol && Number(u.rol.id) === Number(opts.preferredRolId),
          )
        : null;
      const motivo = opts.preferredHint || "regla de reunión";

      if (preferred) {
        const $optPref = $sel.find(`option[value="${preferred.id}"]`);
        if ($optPref.length && $optPref.prop("disabled")) {
          // Cumpleañero: no se puede seleccionar visualmente
          $sel.val("");
        } else {
          $sel.val(String(preferred.id));
        }
      } else if (!opts.preferredRolId && defaultAssignee && usuarios.find((u) => u.id === defaultAssignee.id)) {
        $sel.val(String(defaultAssignee.id));
      } else {
        $sel.val("");
      }
    } catch (err) {
      if (err && err.name === "AbortError") return;
      $sel
        .html(`<option value="">Error al cargar</option>`)
        .prop("disabled", true);
      showToast(err.message || "Error al cargar usuarios.", "error");
    } finally {
      if (nuevaFetchCtrl && signal && signal === nuevaFetchCtrl.signal) {
        nuevaFetchCtrl = null;
      }
    }
  }

  // Aplica la regla de REUNIÓN al form de "Agregar actividad" (misma
  // lógica que en el alta):
  //   - Muestra/oculta el input de hora
  //   - Setea el default de hora (próximo bloque de 30 min, mín 09:00)
  //   - Si hay fecha, fuerza la preselección del ASISTENTE DE
  //     PRODUCCIÓN (rol_id=11) en el select de asignado.
  function applyReunionRuleNueva(isReunion) {
    const $wrapHora = $modalBody.find("#wrap-hora-reunion-nueva");
    const $hora = $modalBody.find("#sel-hora-nueva");
    const $fecha = $modalBody.find("#sel-fecha-nueva");
    if (!$wrapHora.length) return;
    if (isReunion) {
      $wrapHora.show();
      if (!$hora.val()) {
        const now = new Date();
        const minTotal = now.getHours() * 60 + now.getMinutes();
        const startMin = Math.max(minTotal + 30, 9 * 60);
        const rounded = Math.ceil(startMin / 30) * 30;
        const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
        const mm = String(rounded % 60).padStart(2, "0");
        $hora.val(`${hh}:${mm}`);
      }
      $hora.prop("required", true);
      // Si ya hay fecha, recargamos usuarios con preferredRolId=11
      // para que el ASISTENTE DE PRODUCCIÓN quede preseleccionado.
      const fecha = $fecha.val();
      if (fecha) {
        loadUsuariosAsignablesForNueva(fecha, {
          preferredRolId: ROL_ASISTENTE_PROD_ID,
          preferredHint: "regla de reunión",
        });
      }
    } else {
      $wrapHora.hide();
      $hora.prop("required", false).val("");
      // Si hay fecha, re-cargamos con el default (VALORADOR) sin
      // preferredRolId para que el form principal maneje la preselección.
      const fecha = $fecha.val();
      if (fecha) {
        loadUsuariosAsignablesForNueva(fecha);
      }
    }
  }

  // Inicializa los handlers del form de "Agregar actividad" (sólo se
  // llama una vez por apertura del modal, cuando la pestaña existe).
  function initNuevaActividadForm() {
    const $form = $modalBody.find("#add-actividad-form");
    if (!$form.length) return;
    if ($form.data("inited")) return;
    $form.data("inited", true);

    // Choices.js para el select de tarea
    makeChoices("#sel-tarea-nueva", { placeholderValue: "Seleccione una tarea" });

    // Cuando cambia la tarea: aplicar regla de reunión
    $form.find("#sel-tarea-nueva").on("change", function () {
      const tareaId = $(this).val();
      const tarea = (lookups.tareas || []).find(
        (x) => Number(x.id) === Number(tareaId),
      );
      const isReunion = isReunionTarea(tarea);
      applyReunionRuleNueva(isReunion);
    });

    // Cuando cambia la fecha: recargar usuarios asignables
    $form.find("#sel-fecha-nueva").on("change", function () {
      loadUsuariosAsignablesForNueva($(this).val());
    });

    // Botón "Cancelar"
    $form.find("#btn-cancel-add-actividad").on("click", function () {
      $form.hide();
      resetNuevaActividadForm();
    });

    // Botón "Guardar actividad"
    $form.find("#btn-save-nueva-actividad").on("click", function () {
      submitNuevaActividad();
    });
  }

  function resetNuevaActividadForm() {
    const $form = $modalBody.find("#add-actividad-form");
    if (!$form.length) return;
    $form.find("#sel-tarea-nueva").val("");
    $form.find("#sel-fecha-nueva").val("");
    $form.find("#sel-hora-nueva").val("");
    $form.find("#sel-usuario-nuevo").html(
      `<option value="">Selecciona primero la fecha</option>`,
    ).prop("disabled", true);
    $form.find("#sel-prioridad-nueva").val("");
    applyReunionRuleNueva(false);
  }

  // POST /api/potenciales-clientes/:id/actividades
  async function submitNuevaActividad() {
    const $form = $modalBody.find("#add-actividad-form");
    if (!$form.length || !editingId) return;

    const tareaId = $form.find("#sel-tarea-nueva").val();
    const fecha = $form.find("#sel-fecha-nueva").val();
    const hora = $form.find("#sel-hora-nueva").val();
    const usuarioId = $form.find("#sel-usuario-nuevo").val();
    const prioridad = $form.find("#sel-prioridad-nueva").val() || null;

    if (!tareaId) {
      showToast("Selecciona una tarea.", "error");
      $form.find("#sel-tarea-nueva").trigger("focus");
      return;
    }
    if (!fecha) {
      showToast("Selecciona la fecha.", "error");
      $form.find("#sel-fecha-nueva").trigger("focus");
      return;
    }
    if (!usuarioId) {
      showToast("Selecciona el usuario asignado.", "error");
      $form.find("#sel-usuario-nuevo").trigger("focus");
      return;
    }
    // Si es reunión, hora es obligatoria
    const tarea = (lookups.tareas || []).find(
      (x) => Number(x.id) === Number(tareaId),
    );
    if (isReunionTarea(tarea) && !hora) {
      showToast("Indica la hora de la reunión.", "error");
      $form.find("#sel-hora-nueva").trigger("focus");
      return;
    }

    const payload = {
      tarea_id: Number(tareaId),
      fecha_asignacion: fecha,
      usuario_asignado_id: Number(usuarioId),
      prioridad,
    };
    if (hora) payload.hora_reunion = hora;

    const $btn = $form.find("#btn-save-nueva-actividad");
    $btn.prop("disabled", true).html(
      '<span class="spinner-border spinner-border-sm me-1"></span> Guardando…',
    );
    try {
      const res = await fetch(`${API_BASE}/${editingId}/actividades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error");
      }
      showToast(json.message || "Actividad agregada.", "success");
      // Reset + cerrar form
      resetNuevaActividadForm();
      $form.hide();
      // Re-cargar el prospecto y re-renderizar la lista
      await refreshProspectoYRender();
    } catch (err) {
      showToast(err.message || "No se pudo agregar la actividad.", "error");
    } finally {
      $btn.prop("disabled", false).html(
        '<i class="ti ti-check me-1"></i> Guardar actividad',
      );
    }
  }

  // Re-fetch del prospecto desde el backend y re-render de las
  // secciones que dependen de actividades / historial.
  async function refreshProspectoYRender() {
    if (!editingId) return;
    try {
      const res = await fetch(`${API_BASE}/${editingId}`);
      const json = await res.json();
      if (!res.ok || !json.success) return;
      const p = json.data;
      if (!p) return;
      renderActividades(p.actividades || []);
      renderHistorial(p.historial || []);
    } catch (err) {
      // noop
    }
  }

  // Helper: ¿la tarea seleccionada es de tipo REUNIÓN? Mismo criterio
  // que en el form principal: nombre contiene "reunion" (sin acentos) o
  // id === TIPO_REUNION_ID (2). La relación Prisma llega como
  // `tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea`.
  function isReunionTarea(tarea) {
    if (!tarea) return false;
    const tt = tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea;
    if (tt && Number(tt.id) === 2) return true;
    if (tt && tt.tipo && normTipo(tt.tipo).includes("reunion")) return true;
    return false;
  }

  // Normaliza un string para comparar tipos: minúsculas + sin acentos.
  function normTipo(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // Aplica o revoca la regla de reunión sobre la sección de asignación:
  //  - Si isReunion: fecha=hoy, input deshabilitado, hint informativo,
  //    preselecciona al usuario con rol ASISTENTE DE PRODUCCIÓN
  //    (rol.id=11) en el select.
  //  - Si !isReunion: input habilitado, hint por defecto, no tocamos el
  //    usuario (deja la selección actual o la vuelve a cargar con la
  //    fecha vigente).
  function applyReunionRule(isReunion) {
    const $fecha = $modalBody.find("#sel-fecha-asignacion");
    const $hint = $modalBody.find(".js-fecha-hint");
    const $wrapHora = $modalBody.find("#wrap-hora-reunion");
    const $hora = $modalBody.find("#sel-hora-reunion");
    if (!$fecha.length) return;
    if (isReunion) {
      const today = formatDateInput(new Date());
      // Sugerimos la fecha de hoy, pero el usuario puede cambiarla.
      if (!$fecha.val()) $fecha.val(today);
      $fecha.prop("readonly", false).prop("disabled", false);
      $hint.html(
        '<i class="ti ti-calendar-event me-1"></i>Reunión: se sugiere la fecha de hoy, pero puedes ajustarla si la reunión se agenda para otro día.',
      );
      // Mostramos el input de hora. Si está vacío, le ponemos un
      // default razonable (próximo bloque de 30 min a partir de ahora,
      // mínimo 09:00 para no sugerir horas de madrugada).
      $wrapHora.show();
      if (!$hora.val()) {
        const now = new Date();
        const minTotal = now.getHours() * 60 + now.getMinutes();
        const startMin = Math.max(minTotal + 30, 9 * 60);
        const rounded = Math.ceil(startMin / 30) * 30;
        const hh = String(Math.floor(rounded / 60)).padStart(2, "0");
        const mm = String(rounded % 60).padStart(2, "0");
        $hora.val(`${hh}:${mm}`);
      }
      $hora.prop("required", true);
      // Buscamos al usuario con rol ASISTENTE DE PRODUCCIÓN (rol.id=11)
      // en el select ya cargado. El match es por ROL, no por user.id
      // (el user.id del asistente puede ser cualquier número).
      const $sel = $modalBody.find("#sel-usuario-asignado");
      const $opt = $sel.find(
        `option[data-rol-id="${ROL_ASISTENTE_PROD_ID}"]:not([disabled])`,
      );
      if ($opt.length) {
        const userId = $opt.attr("value");
        $sel.val(String(userId)).trigger("change");
        const $hintAsig = $modalBody.find(".js-asignado-hint");
        const txt = $opt.text().trim();
        $hintAsig.html(
          `Asignado por defecto (regla de reunión): <strong>${escapeHtml(txt)}</strong>.`,
        );
      } else {
        // Refetch con la fecha actual y preferredRolId=11 para que el
        // usuario con ese rol quede preseleccionado (o vacío si no hay
        // ninguno activo / no tiene ese rol).
        loadUsuariosAsignables($fecha.val() || today, {
          preferredRolId: ROL_ASISTENTE_PROD_ID,
          preferredHint: "regla de reunión",
        });
      }
    } else {
      $fecha.prop("readonly", false).prop("disabled", false);
      $hint.text("Por defecto: hoy.");
      // Ocultamos el input de hora y le quitamos el required para que
      // no bloquee el submit cuando la tarea no es de reunión.
      $wrapHora.hide();
      $hora.prop("required", false).val("");
      // Si hay fecha seleccionada, re-carga usuarios con el default
      // normal (VALORADOR) sin preferredUserId.
      const fecha = $fecha.val();
      if (fecha) {
        loadUsuariosAsignables(fecha, { keepSelected: true });
      }
    }
  }

  function renderHistorial(items) {
    const $list = $("#historial-list");
    if (!$list.length) return;
    const arr = Array.isArray(items) ? items : [];
    $("#historial-count").text(arr.length);

    if (arr.length === 0) {
      $list.html(`<div class="text-center text-muted py-3">
        Aún no hay movimientos en el historial.
      </div>`);
      return;
    }

    const colorByEstado = {
      registrado: "bg-success",
      actualizado: "bg-info",
      asignado: "bg-primary",
      completado: "bg-success",
      perdido: "bg-danger",
      cancelado: "bg-secondary",
    };

    $list.html(`
      <div class="timeline">
        ${arr
          .map((h, i) => {
            const isLast = i === arr.length - 1;
            const color = colorByEstado[(h.estado || "").toLowerCase()] || "bg-secondary";
            const usuario = h.usuario?.nombre || h.usuario?.usuario || "Sistema";
            return `
              <div class="d-flex gap-3 ${isLast ? "" : "pb-3"}">
                <div class="flex-shrink-0 d-flex flex-column align-items-center">
                  <span class="rounded-circle ${color} d-flex align-items-center justify-content-center text-white" style="width: 28px; height: 28px;">
                    <i class="ti ti-${h.activo ? "player-play" : "check"} fs-xs"></i>
                  </span>
                  ${
                    !isLast
                      ? '<span class="flex-grow-1 border-start border-2 border-light my-1" style="min-height: 24px;"></span>'
                      : ""
                  }
                </div>
                <div class="flex-grow-1">
                  <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="badge ${color}">${escapeHtml(h.estado || "—")}</span>
                    ${
                      h.activo
                        ? '<span class="badge bg-warning-subtle text-warning">Vigente</span>'
                        : ""
                    }
                  </div>
                  <div class="small text-muted mt-1">
                    <i class="ti ti-calendar me-1"></i>
                    ${escapeHtml(formatDateTime(h.fecha_inicio))}
                    ${
                      h.fecha_fin
                        ? ` <span class="mx-1">→</span> ${escapeHtml(formatDateTime(h.fecha_fin))}`
                        : ' <span class="ms-1 fst-italic">(en curso)</span>'
                    }
                  </div>
                  ${
                    h.comentario
                      ? `<div class="small mt-1">${escapeHtml(h.comentario)}</div>`
                      : ""
                  }
                  <div class="small text-muted mt-1">
                    <i class="ti ti-user me-1"></i>${escapeHtml(usuario)}
                  </div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `);
  }

  // Renderiza la lista de actividades del prospecto (en la pestaña
  // "Actividades" del modal de edición). Muestra: tarea, fecha, hora,
  // asignado, prioridad y estado_progreso.
  function renderActividades(items) {
    const $list = $("#actividades-list");
    if (!$list.length) return;
    const arr = Array.isArray(items) ? items : [];
    $("#actividades-count").text(arr.length);

    if (arr.length === 0) {
      $list.html(`<div class="text-center text-muted py-3">
        Aún no hay actividades registradas. Haz clic en "Agregar actividad".
      </div>`);
      return;
    }

    const estadoColor = {
      pendiente: "bg-warning-subtle text-warning",
      en_progreso: "bg-info-subtle text-info",
      completado: "bg-success-subtle text-success",
      cancelado: "bg-secondary-subtle text-secondary",
    };
    const prioridadColor = {
      ALTA: "bg-danger-subtle text-danger",
      MEDIA: "bg-warning-subtle text-warning",
      BAJA: "bg-info-subtle text-info",
    };

    $list.html(`
      <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
          <thead class="text-muted text-uppercase fs-xxs">
            <tr>
              <th>#</th>
              <th>Tarea</th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Asignado a</th>
              <th>Prioridad</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${arr
              .map((a, i) => {
                const fechaTxt = a.fecha_inicio
                  ? formatDateInput(a.fecha_inicio)
                  : "—";
                const horaTxt = a.hora_inicio
                  ? formatHoraIso(a.hora_inicio)
                  : "—";
                const asignadoTxt =
                  a.usuario_asignado?.nombre ||
                  a.usuario_asignado?.usuario ||
                  "—";
                const tareaTxt = a.tarea?.nombre || "—";
                const prio = (a.prioridad || "").toUpperCase();
                const estado = (a.estado_progreso || "").toLowerCase();
                return `
                  <tr>
                    <td class="text-muted">${i + 1}</td>
                    <td>${escapeHtml(tareaTxt)}</td>
                    <td>${escapeHtml(fechaTxt)}</td>
                    <td>${escapeHtml(horaTxt)}</td>
                    <td>${escapeHtml(asignadoTxt)}</td>
                    <td>${
                      prio
                        ? `<span class="badge ${prioridadColor[prio] || "bg-secondary-subtle text-secondary"}">${escapeHtml(prio)}</span>`
                        : "—"
                    }</td>
                    <td><span class="badge ${estadoColor[estado] || "bg-secondary-subtle text-secondary"}">${escapeHtml(a.estado_progreso || "—")}</span></td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `);
  }

  // ---- Carreras por institución --------------------------------------

  async function loadCarreras(institucionId) {
    if (!institucionId) {
      setCarreraChoices([], { enabled: false });
      return;
    }
    if (carrerasByInstitucion.has(institucionId)) {
      setCarreraChoices(carrerasByInstitucion.get(institucionId), { enabled: true });
      return;
    }
    try {
      setCarreraChoices(
        [{ id: 0, nombre: "Cargando…" }],
        { enabled: false },
      );
      const res = await fetch(
        `${API_BASE}/carreras?institucion_id=${institucionId}`,
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      carrerasByInstitucion.set(institucionId, json.data);
      setCarreraChoices(json.data, { enabled: true });
    } catch (err) {
      showToast(err.message || "Error al cargar carreras.", "error");
      setCarreraChoices([{ id: -1, nombre: "Error al cargar" }], { enabled: false });
    }
  }

  // ---- Modal ---------------------------------------------------------

  function openCreateModal() {
    editingId = null;
    $modalTitle.text("Nuevo Potencial Cliente");
    $modalBody.html(formHtml());
    $btnGuardar.text("Registrar").prop("disabled", false);
    $btnConvertir.hide();
    initSearchableSelects();
    addContactoRow(); // empezamos con 1 contacto

    // Inicializa la sección de asignación: fecha = hoy, cargar usuarios.
    const $fecha = $modalBody.find("#sel-fecha-asignacion");
    $fecha.val(formatDateInput(new Date()));
    initAsignacion();

    bsModal.show();
  }

  async function openEditModal(id) {
    $btnGuardar.prop("disabled", true);
    try {
      const res = await fetch(`${API_BASE}/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      const p = json.data;
      if (!p) throw new Error("Potencial cliente no encontrado.");

      editingId = id;
      const esCliente = p.estado_cliente === "cliente";
      $modalTitle.text(
        esCliente
          ? `Editar Cliente #${id}`
          : `Editar Potencial Cliente #${id}`,
      );
      $modalBody.html(formHtml());
      initSearchableSelects();
      const $form = $("#form-potencial");

      // Datos del trabajo
      $form.find('[name="titulo_prospecto"]').val(p.titulo_prospecto || "");
      $form.find('[name="prioridad"]').val(p.prioridad || "");
      $form.find('[name="nivel_academico_id"]').val(
        p.nivel_academico ? String(p.nivel_academico.id) : "",
      );
      $form.find('[name="fecha_entrega"]').val(formatDateInput(p.fecha_entrega));
      $form.find('[name="origen_id"]').val(p.origen ? String(p.origen.id) : "");
      $form.find('[name="link_drive"]').val(p.link_drive || "");
      $form.find('[name="contenido"]').val(p.contenido || "");

      // Universidad → cargar carreras → seleccionar carrera
      const institucionId = p.carrera?.institucion?.id;
      const carreraId = p.carrera?.id;
      if (institucionId) {
        const instUni = choicesInstances.get("#sel-institucion");
        if (instUni) {
          instUni.setChoiceByValue(String(institucionId));
        }
        await loadCarreras(institucionId);
        if (carreraId) setCarreraValue(String(carreraId));
      }

      // Tarea
      const instTarea = choicesInstances.get('select[name="tarea_id"]');
      if (p.actividad?.tarea) {
        const t = (lookups.tareas || []).find(
          (x) => Number(x.id) === Number(p.actividad.tarea.id),
        );
        if (instTarea && t) {
          instTarea.setValue([{ value: String(t.id), label: t.nombre }]);
        }
      }

      // Color: ya no se edita desde el modal; se conserva el de la
      // actividad (asignado de forma aleatoria al crearse).

      // Contactos: una fila por contacto, pre-rellenada
      $("#contactos-list").empty();
      const contactos = Array.isArray(p.contactos) ? p.contactos : [];
      if (contactos.length === 0) {
        addContactoRow();
      } else {
        contactos.forEach((c) => addContactoRow());
        $("#contactos-list .js-contacto-row").each(function (i) {
          const c = contactos[i];
          if (!c) return;
          const $r = $(this);
          $r.find(".js-c-nombres").val(c.nombres || "");
          $r.find(".js-c-apellidos").val(c.apellidos || "");
          $r.find(".js-c-celular").val(c.celular || "");
          $r.find(".js-c-tipo-doc").val(
            c.tipo_documento_id ? String(c.tipo_documento_id) : "",
          );
          $r.find(".js-c-num-doc").val(c.numero_documento || "");
        });
      }
      refreshContactosEmpty();

      // Historial
      renderHistorial(p.historial || []);

      // Actividades (lista + form de "Agregar actividad")
      renderActividades(p.actividades || []);
      initNuevaActividadForm();

      // Mostrar/ocultar el botón "Convertir a cliente" según el estado
      if (p.estado_cliente === "potencial cliente") {
        $btnConvertir.show().prop("disabled", false).text("Convertir a cliente");
      } else {
        $btnConvertir.hide();
      }

      $btnGuardar.text("Actualizar").prop("disabled", false);
      bsModal.show();
    } catch (err) {
      showToast(err.message || "No se pudo cargar el potencial cliente.", "error");
      $btnGuardar.prop("disabled", false);
      $btnConvertir.hide();
    }
  }

  async function submitForm() {
    // En edición la pestaña "Tarea" ya no tiene los campos de tarea/
    // asignación (se gestionan vía "Agregar actividad"), así que
    // recolectamos sólo los datos del prospecto + contactos.
    const data = editingId ? collectDataForEdit() : collectData();
    if (!data) return;

    const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
    const method = editingId ? "PUT" : "POST";

    try {
      $btnGuardar.prop("disabled", true).text("Guardando...");
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al guardar.");
      }
      showToast(json.message || "Guardado correctamente.");
      bsModal.hide();
      $("#table-potenciales").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $btnGuardar.prop("disabled", false).text(editingId ? "Actualizar" : "Registrar");
    }
  }

  async function promptTareaConversion() {
    const tareas = lookups.tareas || [];
    if (tareas.length === 0) {
      showToast("No hay tareas disponibles.", "error");
      return null;
    }

    const optionsHtml = tareas
      .map(
        (t) =>
          `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`,
      )
      .join("");

    const result = await Swal.fire({
      title: "Selecciona la tarea",
      html: `<div class="mb-2 text-muted small">¿Qué actividad vas a asignar al nuevo cliente?</div>
             <select id="swal-conv-tarea" class="form-select">${optionsHtml}</select>`,
      showCancelButton: true,
      confirmButtonText: "Convertir",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        // Forzar re-render de Bootstrap o Choices si hiciera falta
      },
      preConfirm: () => {
        const val = document.getElementById("swal-conv-tarea").value;
        if (!val) {
          Swal.showValidationMessage("Selecciona una tarea");
          return false;
        }
        return Number(val);
      },
    });

    return result.isConfirmed ? result.value : null;
  }

  // Convierte el prospecto en cliente usando los datos actuales del
  // formulario de edición. Mismo endpoint y misma lógica que el botón
  // "Convertir" del modal de conversión: se envían los datos del trabajo
  // y los contactos, más la tarea seleccionada por el usuario.
  async function aplicarConvertirDesdeEdicion() {
    if (!editingId) {
      showToast(
        "No hay un potencial cliente cargado para convertir.",
        "error",
      );
      return;
    }
    const data = collectDataForConvert();
    if (!data) return;

    // Pedir la tarea a asignar al nuevo cliente
    const tareaId = await promptTareaConversion();
    if (!tareaId) return; // usuario canceló

    data.tarea_id = tareaId;

    $btnConvertir.prop("disabled", true).text("Convirtiendo…");
    $btnGuardar.prop("disabled", true);
    try {
      const res = await fetch(`${API_BASE}/${editingId}/convertir`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(
          json.error || "Error al convertir el potencial cliente.",
        );
      }
      showToast(json.message || "Convertido a cliente correctamente.");
      bsModal.hide();
      $("#table-potenciales").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al convertir.", "error");
    } finally {
      $btnConvertir.prop("disabled", false).text("Convertir a cliente");
      $btnGuardar.prop("disabled", false);
    }
  }

  // Recolecta los datos del formulario de edición específicamente para
  // la conversión. A diferencia de `collectData`, exige los datos del
  // trabajo como obligatorios (al pasar a cliente, el registro debe
  // estar completo). El campo `tarea_id` lo agrega el caller
  // (aplicarConvertirDesdeEdicion) después de pedirselo al usuario.
  function collectDataForConvert() {
    const $form = $("#form-potencial");
    const raw = {};
    $form.serializeArray().forEach(({ name, value }) => {
      if (value === "" || value == null) return;
      raw[name] = value;
    });

    // ---- Datos obligatorios al convertir a cliente -------------------
    // NOTA: `titulo_prospecto` NO es obligatorio en la conversión —
    //       un cliente puede no tener título de trabajo asignado.
    if (!raw.institucion_id) {
      showToast(
        "Selecciona la universidad para convertir a cliente.",
        "error",
      );
      // Cambiar a la pestaña Trabajo para que el usuario vea el campo.
      $form.find('[href="#tab-trabajo"]').tab("show");
      $form.find('[name="institucion_id"]').trigger("focus");
      return null;
    }
    if (!raw.carrera_id) {
      showToast("Selecciona la carrera para convertir a cliente.", "error");
      $form.find('[href="#tab-trabajo"]').tab("show");
      $form.find('[name="carrera_id"]').trigger("focus");
      return null;
    }
    if (!raw.nivel_academico_id) {
      showToast(
        "Selecciona el nivel académico para convertir a cliente.",
        "error",
      );
      $form.find('[href="#tab-trabajo"]').tab("show");
      $form.find('[name="nivel_academico_id"]').trigger("focus");
      return null;
    }
    if (!raw.prioridad) {
      showToast("Selecciona la prioridad para convertir a cliente.", "error");
      $form.find('[href="#tab-trabajo"]').tab("show");
      $form.find('[name="prioridad"]').trigger("focus");
      return null;
    }
    if (!raw.fecha_entrega) {
      showToast(
        "Selecciona la fecha de entrega para convertir a cliente.",
        "error",
      );
      $form.find('[href="#tab-trabajo"]').tab("show");
      $form.find('[name="fecha_entrega"]').trigger("focus");
      return null;
    }

    // ---- Contactos --------------------------------------------------
    const contactos = collectContactos();
    if (contactos.length === 0) {
      showToast(
        "Agrega al menos un contacto para convertir a cliente.",
        "error",
      );
      $form.find('[href="#tab-contactos"]').tab("show");
      return null;
    }
    const sinCelular = contactos.findIndex((c) => !c.celular);
    if (sinCelular !== -1) {
      showToast(
        `El contacto #${sinCelular + 1} requiere celular.`,
        "error",
      );
      $form.find('[href="#tab-contactos"]').tab("show");
      return null;
    }
    const sinNombres = contactos.findIndex((c) => !c.nombres);
    if (sinNombres !== -1) {
      showToast(
        `El contacto #${sinNombres + 1} requiere nombres.`,
        "error",
      );
      $form.find('[href="#tab-contactos"]').tab("show");
      return null;
    }
    const sinApellidos = contactos.findIndex((c) => !c.apellidos);
    if (sinApellidos !== -1) {
      showToast(
        `El contacto #${sinApellidos + 1} requiere apellidos.`,
        "error",
      );
      $form.find('[href="#tab-contactos"]').tab("show");
      return null;
    }

    return {
      titulo_prospecto: raw.titulo_prospecto,
      institucion_id: Number(raw.institucion_id),
      carrera_id: Number(raw.carrera_id),
      nivel_academico_id: Number(raw.nivel_academico_id),
      fecha_entrega: raw.fecha_entrega,
      prioridad: raw.prioridad,
      link_drive: raw.link_drive || null,
      contenido: raw.contenido || null,
      contactos,
    };
  }

  function collectData() {
    const $form = $("#form-potencial");
    const raw = {};
    $form.serializeArray().forEach(({ name, value }) => {
      if (value === "" || value == null) return;
      raw[name] = value;
    });

    const contactos = collectContactos();
    if (contactos.length === 0) {
      showToast("Agrega al menos un contacto.", "error");
      return null;
    }
    const sinCelular = contactos.findIndex((c) => !c.celular);
    if (sinCelular !== -1) {
      showToast(`El contacto #${sinCelular + 1} requiere celular.`, "error");
      return null;
    }
    if (!raw.tarea_id) {
      showToast("Selecciona una tarea en la pestaña 'Tarea'.", "error");
      return null;
    }
    if (!raw.fecha_asignacion) {
      showToast("Selecciona la fecha de asignación.", "error");
      return null;
    }
    if (!raw.usuario_asignado_id) {
      showToast("Selecciona el usuario asignado.", "error");
      return null;
    }
    if (!raw.prioridad) {
      showToast("Selecciona la prioridad.", "error");
      $form.find('[href="#tab-trabajo"]').tab("show");
      $form.find('[name="prioridad"]').trigger("focus");
      return null;
    }
    if (!raw.origen_id) {
      showToast("Selecciona el origen del contacto.", "error");
      $form.find('[href="#tab-trabajo"]').tab("show");
      $form.find('[name="origen_id"]').trigger("focus");
      return null;
    }

    return {
      titulo_prospecto: raw.titulo_prospecto || null,
      institucion_id: raw.institucion_id ? Number(raw.institucion_id) : null,
      carrera_id: raw.carrera_id ? Number(raw.carrera_id) : null,
      nivel_academico_id: raw.nivel_academico_id
        ? Number(raw.nivel_academico_id)
        : null,
      fecha_entrega: raw.fecha_entrega || null,
      prioridad: raw.prioridad || null,
      origen_id: raw.origen_id ? Number(raw.origen_id) : null,
      contenido: raw.contenido || null,
      link_drive: raw.link_drive || null,
      tarea_id: Number(raw.tarea_id),
      contactos,
      fecha_asignacion: raw.fecha_asignacion || null,
      usuario_asignado_id: raw.usuario_asignado_id
        ? Number(raw.usuario_asignado_id)
        : null,
      // Solo se envía si la tarea es de tipo REUNIÓN. El backend lo exige.
      hora_reunion: raw.hora_reunion || null,
      // color: el backend lo asigna aleatoriamente al crear.
    };
  }

  // Variante de `collectData` para cuando se edita un prospecto existente.
  // En modo edición la pestaña "Tarea" NO contiene los selects de
  // tarea/fecha/asignado de la actividad principal (esos se manejan vía
  // "Agregar actividad"), así que sólo recolectamos los campos del
  // prospecto + contactos.
  function collectDataForEdit() {
    const $form = $("#form-potencial");
    const raw = {};
    $form.serializeArray().forEach(({ name, value }) => {
      if (value === "" || value == null) return;
      raw[name] = value;
    });

    const contactos = collectContactos();
    if (contactos.length === 0) {
      showToast("Agrega al menos un contacto.", "error");
      return null;
    }
    const sinCelular = contactos.findIndex((c) => !c.celular);
    if (sinCelular !== -1) {
      showToast(`El contacto #${sinCelular + 1} requiere celular.`, "error");
      return null;
    }

    return {
      titulo_prospecto: raw.titulo_prospecto || null,
      institucion_id: raw.institucion_id ? Number(raw.institucion_id) : null,
      carrera_id: raw.carrera_id ? Number(raw.carrera_id) : null,
      nivel_academico_id: raw.nivel_academico_id
        ? Number(raw.nivel_academico_id)
        : null,
      fecha_entrega: raw.fecha_entrega || null,
      prioridad: raw.prioridad || null,
      origen_id: raw.origen_id ? Number(raw.origen_id) : null,
      contenido: raw.contenido || null,
      link_drive: raw.link_drive || null,
      contactos,
    };
  }

  // ---- Inicialización ------------------------------------------------

  async function loadLookups() {
    const res = await fetch(`${API_BASE}/lookups`);
    const json = await res.json();
    if (!res.ok || !json.success)
      throw new Error("No se pudieron cargar los catálogos.");
    lookups = json.data;
    // Pre-cachea las carreras de la primera institución (si hay) por
    // si la usan al editar. No es crítico.
  }

  // ---- Convertir potencial → cliente ---------------------------------

  const convModalEl = document.getElementById("convertir-modal");
  const convModal = new bootstrap.Modal(convModalEl);
  let convProspectoId = null;
  // Cache de carreras por institucion_id (se carga al elegir universidad
  // en el modal de convertir).
  const convCarrerasByInstitucion = new Map();

  const $convFechaEnt = $("#js-conv-fecha-entrega");
  const $convMotivo = $("#js-conv-motivo");
  const $convPlan = $("#js-conv-plan");
  const $convAplicar = $("#js-conv-aplicar");
  // Nuevos campos
  const $convTitulo = $("#js-conv-titulo-prospecto");
  const $convPrioridad = $("#js-conv-prioridad");
  const $convInstitucion = $("#js-conv-institucion");
  const $convCarrera = $("#js-conv-carrera");
  const $convNivel = $("#js-conv-nivel");
  const $convLinkDrive = $("#js-conv-link-drive");
  const $convContenido = $("#js-conv-contenido");
  const $convContactosList = $("#js-conv-contactos-list");
  const $convContactosEmpty = $("#js-conv-contactos-empty");
  const $convColor = $("#js-conv-color");
  const $convColorText = $("#js-conv-color-text");

  function convContactoRowHtml(idx) {
    return `
      <div class="card border mb-2 js-conv-contacto" data-idx="${idx}">
        <div class="card-body p-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <strong class="text-muted fs-xxs text-uppercase">Contacto #${idx + 1}</strong>
            <button type="button" class="btn btn-sm btn-outline-danger js-conv-contacto-remove" title="Quitar">
              <i class="ti ti-x"></i>
            </button>
          </div>
          <div class="row g-2">
            <div class="col-md-4">
              <label class="form-label">Nombres</label>
              <input type="text" class="form-control js-conv-c-nombres" maxlength="50" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Apellidos</label>
              <input type="text" class="form-control js-conv-c-apellidos" maxlength="50" />
            </div>
            <div class="col-md-4">
              <label class="form-label">Celular <span class="text-danger">*</span></label>
              <input type="text" class="form-control js-conv-c-celular" maxlength="15" required />
            </div>
          </div>
        </div>
      </div>
    `;
  }
  function refreshConvContactosEmpty() {
    $convContactosEmpty.toggle(
      $convContactosList.find(".js-conv-contacto").length === 0,
    );
  }
  function reindexConvContactos() {
    $convContactosList.find(".js-conv-contacto").each(function (i) {
      $(this)
        .attr("data-idx", i)
        .find("strong.text-muted")
        .text(`Contacto #${i + 1}`);
    });
  }
  function addConvContacto() {
    const idx = $convContactosList.find(".js-conv-contacto").length;
    $convContactosList.append(convContactoRowHtml(idx));
    refreshConvContactosEmpty();
  }
  function collectConvContactos() {
    const items = [];
    $convContactosList.find(".js-conv-contacto").each(function () {
      const $r = $(this);
      items.push({
        nombres: $r.find(".js-conv-c-nombres").val() || null,
        apellidos: $r.find(".js-conv-c-apellidos").val() || null,
        celular: $r.find(".js-conv-c-celular").val() || null,
      });
    });
    return items;
  }

  async function loadConvCarreras(institucionId) {
    if (!institucionId) {
      $convCarrera
        .html(`<option value="">Seleccione universidad primero</option>`)
        .prop("disabled", true);
      return;
    }
    if (convCarrerasByInstitucion.has(String(institucionId))) {
      renderConvCarreras(convCarrerasByInstitucion.get(String(institucionId)));
      return;
    }
    $convCarrera.prop("disabled", true).html(`<option value="">Cargando…</option>`);
    try {
      const res = await fetch(
        `${API_BASE}/carreras?institucion_id=${institucionId}`,
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      convCarrerasByInstitucion.set(String(institucionId), json.data || []);
      renderConvCarreras(json.data || []);
    } catch (err) {
      $convCarrera.html(`<option value="">Error al cargar</option>`);
      showToast(err.message || "Error al cargar carreras.", "error");
    }
  }

  function renderConvCarreras(carreras) {
    const opts = [`<option value="">Seleccione una carrera</option>`];
    (carreras || []).forEach((c) => {
      opts.push(
        `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`,
      );
    });
    $convCarrera.html(opts.join("")).prop("disabled", false);
  }

  function colorByPrioridad(p) {
    if (p === "ALTA") return "#dc3545";
    if (p === "MEDIA") return "#f59e0b";
    if (p === "BAJA") return "#3b82f6";
    return "#3b82f6";
  }

  function initConvColorPicker() {
    $convColor.off("input.conv").on("input.conv", function () {
      $convColorText.val(($convColor.val() || "").toUpperCase());
    });
    $convColorText.off("change.conv").on("change.conv", function () {
      const v = String($convColorText.val() || "").trim();
      if (/^#([A-Fa-f0-9]{6})$/.test(v)) $convColor.val(v.toLowerCase());
    });
    $("#js-conv-color-presets button[data-color]")
      .off("click.conv")
      .on("click.conv", function () {
        const c = String($(this).data("color") || "").toLowerCase();
        $convColor.val(c).trigger("input");
      });

    let colorTocado = false;
    $convColor.off("change.conv").on("change.conv", function () {
      colorTocado = true;
    });
    $convColorText.off("input.conv2").on("input.conv2", function () {
      colorTocado = true;
    });
    $convPrioridad.off("change.conv").on("change.conv", function () {
      if (colorTocado) return;
      const c = colorByPrioridad($(this).val());
      $convColor.val(c).trigger("input");
    });
  }

  async function openConvertirModal(id) {
    convProspectoId = id;
    $("#js-conv-id").text(id);
    $convPlan.hide().empty();
    $convAplicar.prop("disabled", false).text("Convertir");

    // Limpieza por las dudas
    $convContactosList.empty();
    refreshConvContactosEmpty();
    $convCarrera
      .html(`<option value="">Seleccione universidad primero</option>`)
      .prop("disabled", true);

    try {
      const res = await fetch(`${API_BASE}/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      const p = json.data;
      if (!p) throw new Error("Potencial cliente no encontrado.");

      // ---- Datos del trabajo -----------------------------------------
      $convTitulo.val(p.titulo_prospecto || "");
      $convPrioridad.val(p.prioridad || "");
      $convFechaEnt.val(formatDateInput(p.fecha_entrega));
      $convLinkDrive.val(p.link_drive || "");
      $convContenido.val(p.contenido || "");

      // Universidad / carrera / nivel
      $convInstitucion.html(
        buildOptions(
          lookups.instituciones || [],
          "id",
          "nombre",
          "Seleccione una universidad",
        ),
      );
      $convNivel.html(
        buildOptions(lookups.niveles || [], "id", "nombre", "Seleccione un nivel"),
      );

      const institucionId = p.carrera?.institucion?.id;
      const carreraId = p.carrera?.id;
      if (institucionId) {
        $convInstitucion.val(String(institucionId));
        await loadConvCarreras(institucionId);
        if (carreraId) $convCarrera.val(String(carreraId));
      }
      if (p.nivel_academico) {
        $convNivel.val(String(p.nivel_academico.id));
      }

      // Color
      const color = p.actividad?.color || colorByPrioridad(p.prioridad);
      $convColor.val(color);
      $convColorText.val(String(color).toUpperCase());
      initConvColorPicker();

      // ---- Contactos (pre-cargar) -----------------------------------
      const contactos = Array.isArray(p.contactos) ? p.contactos : [];
      if (contactos.length === 0) {
        addConvContacto();
      } else {
        contactos.forEach((c) => addConvContacto());
        $convContactosList.find(".js-conv-contacto").each(function (i) {
          const c = contactos[i];
          if (!c) return;
          const $r = $(this);
          $r.find(".js-conv-c-nombres").val(c.nombres || "");
          $r.find(".js-conv-c-apellidos").val(c.apellidos || "");
          $r.find(".js-conv-c-celular").val(c.celular || "");
        });
      }
      refreshConvContactosEmpty();
    } catch (err) {
      showToast(err.message || "Error al abrir el formulario.", "error");
    }
    convModal.show();
  }

  async function aplicarConvertir() {
    const contactos = collectConvContactos();
    if (contactos.length === 0) {
      showToast("Agrega al menos un contacto.", "error");
      return;
    }
    const sinCel = contactos.findIndex((c) => !c.celular);
    if (sinCel !== -1) {
      showToast(`El contacto #${sinCel + 1} requiere celular.`, "error");
      return;
    }

    const body = {
      titulo_prospecto: $convTitulo.val() || null,
      prioridad: $convPrioridad.val() || null,
      institucion_id: $convInstitucion.val() ? Number($convInstitucion.val()) : null,
      carrera_id: $convCarrera.val() ? Number($convCarrera.val()) : null,
      nivel_academico_id: $convNivel.val() ? Number($convNivel.val()) : null,
      fecha_entrega: $convFechaEnt.val() || null,
      link_drive: $convLinkDrive.val() || null,
      contenido: $convContenido.val() || null,
      contactos,
      color: $convColor.val() || null,
      motivo: $convMotivo.val() || null,
    };

    $convAplicar.prop("disabled", true).text("Aplicando…");
    try {
      const res = await fetch(`${API_BASE}/${convProspectoId}/convertir`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(json.message || "Convertido a cliente correctamente.");
        convModal.hide();
        $("#table-potenciales").DataTable().ajax.reload(null, false);
        return;
      }
      // Otros errores
      showToast((json && json.error) || "Error al convertir.", "error");
    } catch (err) {
      showToast(err.message || "Error al convertir.", "error");
    } finally {
      $convAplicar.prop("disabled", false).text("Convertir");
    }
  }

  $convInstitucion.on("change", function () {
    loadConvCarreras($(this).val());
  });
  $("#js-conv-add-contacto").on("click", addConvContacto);
  $convContactosList.on("click", ".js-conv-contacto-remove", function () {
    $(this).closest(".js-conv-contacto").remove();
    reindexConvContactos();
    refreshConvContactosEmpty();
  });
  $convAplicar.on("click", aplicarConvertir);

  // Limpia el modal al cerrar (carrera, contactos, plan)
  convModalEl.addEventListener("hidden.bs.modal", function () {
    $convPlan.hide().empty();
    $convContactosList.empty();
    refreshConvContactosEmpty();
    $convCarrera
      .html(`<option value="">Seleccione universidad primero</option>`)
      .prop("disabled", true);
    convProspectoId = null;
  });

  // Render de la celda "Contactos"
  function renderContactosCell(contactos) {
    if (!contactos || !contactos.length) {
      return '<span class="text-muted small">—</span>';
    }
    const items = contactos
      .map((c) => {
        const nombre = [c.nombres, c.apellidos]
          .filter(Boolean)
          .map((s) => escapeHtml(s))
          .join(" ");
        return `<div class="small">
          <i class="ti ti-user-circle me-1 text-muted"></i>${nombre || "—"}
          <span class="text-muted ms-1">${escapeHtml(c.celular || "")}</span>
        </div>`;
      })
      .join("");
    return `<div>${items}</div>`;
  }

  function renderUniCarreraCell(carrera) {
    if (!carrera) return '<span class="text-muted small">—</span>';
    const uni = carrera.institucion
      ? `<div class="small text-muted">${escapeHtml(carrera.institucion.nombre || "")}</div>`
      : "";
    return `<div>${escapeHtml(carrera.nombre || "—")}${uni}</div>`;
  }

  function renderTipoCell(proveedor) {
    if (proveedor) {
      return `<span class="badge bg-info-subtle text-info">
        <i class="ti ti-building me-1"></i>${escapeHtml(proveedor.nombre)}
      </span>`;
    }
    return `<span class="badge bg-primary-subtle text-primary">
      <i class="ti ti-user me-1"></i>Propio
    </span>`;
  }

  const table = $("#table-potenciales").DataTable({
    language: window.DATATABLES_ES_CONFIG,
    ajax: {
      url: API_BASE,
      dataSrc: "data",
    },
    columns: [
      {
        data: "id",
        orderable: false,
        searchable: false,
        className: "text-center",
        render: (_d, _t, _r, meta) =>
          meta.row + meta.settings._iDisplayStart + 1,
      },
      {
        data: "titulo_prospecto",
        defaultContent: '<span class="text-muted">—</span>',
      },
      {
        data: "contactos",
        orderable: false,
        searchable: false,
        render: (d) => renderContactosCell(d),
      },
      {
        data: "carrera",
        orderable: false,
        searchable: false,
        render: (d) => renderUniCarreraCell(d),
      },
      {
        data: "actividad",
        defaultContent: '<span class="text-muted small">—</span>',
        render: (a) =>
          a && a.tarea
            ? escapeHtml(a.tarea.nombre)
            : '<span class="text-muted small">—</span>',
      },
      {
        data: "proveedor",
        orderable: false,
        searchable: false,
        render: (d) => renderTipoCell(d),
      },
      {
        data: "prioridad",
        render: (d) => prioridadBadge(d),
      },
      {
        data: "fecha_entrega",
        render: (d) => formatDate(d),
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: "text-center",
        render: (_d, _t, row) =>
          `<i class="ti ti-edit fs-4 text-info btn-edit" style="cursor: pointer;" title="Editar" data-id="${row.id}"></i>`,
      },
    ],
  });

  // ---- Eventos -------------------------------------------------------

  $("#btn-nuevo-potencial").on("click", openCreateModal);
  $btnGuardar.on("click", submitForm);
  $btnConvertir.on("click", aplicarConvertirDesdeEdicion);

  $("#table-potenciales").on("click", ".btn-edit", function () {
    openEditModal(Number($(this).data("id")));
  });

  // Eventos delegados del modal (form se reinyecta en cada apertura)
  $modalBody.on("click", "#btn-add-contacto", function () {
    addContactoRow();
  });
  $modalBody.on("click", "#btn-add-actividad", function () {
    const $form = $modalBody.find("#add-actividad-form");
    if (!$form.length) return;
    $form.show();
    // Si ya hay fecha en el form principal, la reusamos como default
    const $fechaNueva = $form.find("#sel-fecha-nueva");
    if (!$fechaNueva.val()) {
      const today = formatDateInput(new Date());
      $fechaNueva.val(today);
      loadUsuariosAsignablesForNueva(today);
    }
  });
  $modalBody.on("click", ".js-contacto-remove", function () {
    $(this).closest(".js-contacto-row").remove();
    reindexContactos();
    refreshContactosEmpty();
  });
  $modalBody.on("click", ".js-c-buscar-dni", function () {
    const $row = $(this).closest(".js-contacto-row");
    buscarDNI($row);
  });
  $modalBody.on("keydown", ".js-c-num-doc", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      const $row = $(this).closest(".js-contacto-row");
      buscarDNI($row);
    }
  });
  $modalBody.on("change", "#sel-institucion", function () {
    loadCarreras($(this).val());
  });
  // Al cambiar la fecha de asignación, re-carga usuarios y preselecciona
  // el auxiliar del día (si existe).
  $modalBody.on("change", "#sel-fecha-asignacion", function () {
    const fecha = $(this).val();
    loadUsuariosAsignables(fecha, { keepSelected: true });
  });
  // Regla de REUNIÓN: si la tarea seleccionada es de tipo REUNIONES
  // (o tiene el id de tipo_tarea=2, que es la fila "REUNION/REUNIONES"
  // en su tabla), forzamos fecha=hoy (no modificable) y preseleccionamos
  // al usuario con rol ASISTENTE DE PRODUCCIÓN (rol.id=11). El backend
  // también lo enforza en el `create`.
  $modalBody.on("change", 'select[name="tarea_id"]', function () {
    const tareaId = Number($(this).val());
    const tarea = (lookups.tareas || []).find(
      (t) => Number(t.id) === tareaId,
    );
    const tipoTareaObj = tarea && tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea;
    // Match flexible:
    //   - por nombre: contiene "REUNION" (cubre "REUNION", "REUNIONES",
    //     "Reunión", etc., ignorando acentos/case)
    //   - por id de la tabla tipo_tarea: id === 2
    const matchesByName =
      tipoTareaObj &&
      tipoTareaObj.tipo &&
      normTipo(tipoTareaObj.tipo).includes(normTipo("REUNION"));
    const matchesById =
      tipoTareaObj && Number(tipoTareaObj.id) === 2;
    const isReunion = !!(matchesByName || matchesById);
    applyReunionRule(isReunion);
  });

  // Limpia el body al cerrar y quita modal-lg
  $modal.on("hidden.bs.modal", function () {
    destroyAllChoices();
    $modalBody.empty();
    $modalDialog.removeClass(MODAL_LG_CLASSES);
    $btnConvertir.hide();
    editingId = null;
  });
  $modal.on("show.bs.modal", function () {
    $modalDialog.addClass(MODAL_LG_CLASSES);
  });

  loadLookups().catch((err) =>
    showToast(err.message || "Error cargando catálogos.", "error"),
  );
});
