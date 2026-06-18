/* global $, bootstrap, Swal */
$(function () {
  const API_BASE = "/api/carreras";
  const API_INST = "/api/universidad";
  const $modal = $("#standard-modal");
  const $modalDialog = $modal.find(".modal-dialog");
  const $modalTitle = $modal.find("#standard-modalLabel");
  const $modalBody = $modal.find(".modal-body");
  const $btnGuardar = $modal.find(".modal-footer .btn-primary");
  const bsModal = new bootstrap.Modal($modal[0]);

  let editingId = null;
  let instituciones = [];
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
      placeholderValue: opts.placeholderValue || "Seleccione…",
      ...opts,
    });
    choicesInstances.set(selector, instance);
    return instance;
  }

  // ---- Helpers --------------------------------------------------------

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

  function confirmar({
    titulo,
    texto,
    confirmText = "Sí",
    cancelText = "Cancelar",
    icon = "warning",
  } = {}) {
    return Swal.fire({
      title: titulo,
      text: texto,
      icon,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      confirmButtonColor: icon === "warning" ? "#d33" : "#3085d6",
      cancelButtonColor: "#6c757d",
      reverseButtons: true,
      focusCancel: true,
    }).then((r) => r.isConfirmed);
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

  async function loadInstituciones() {
    try {
      const res = await fetch(API_INST);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      instituciones = json.data || [];
    } catch (err) {
      showToast("No se pudieron cargar las instituciones.", "error");
      instituciones = [];
    }
  }

  function buildInstitucionOptions(selectedId) {
    const opts = [`<option value="">Seleccione una institución</option>`];
    instituciones.forEach((i) => {
      const sel = Number(selectedId) === Number(i.id) ? "selected" : "";
      opts.push(
        `<option value="${i.id}" ${sel}>${escapeHtml(i.nombre || `Institución #${i.id}`)}</option>`,
      );
    });
    return opts.join("");
  }

  // ---- Form -----------------------------------------------------------

  function formHtml() {
    return `
      <form id="form-carrera" novalidate>
        <div class="row g-3">
          <div class="col-md-12">
            <label class="form-label">Nombre <span class="text-danger">*</span></label>
            <input type="text" class="form-control" name="nombre" required maxlength="100" />
          </div>
          <div class="col-md-12">
            <label class="form-label">Institución <span class="text-danger">*</span></label>
            <select class="form-select" name="institucion_id" required>
              ${buildInstitucionOptions()}
            </select>
          </div>
        </div>
      </form>
    `;
  }

  function setFormFromCarrera(c) {
    const $form = $("#form-carrera");
    $form.find('[name="nombre"]').val(c.nombre || "");
    $form
      .find('[name="institucion_id"]')
      .val(c.institucion_id ? String(c.institucion_id) : "");
  }

  function serializeForm() {
    const data = {};
    $("#form-carrera")
      .serializeArray()
      .forEach(({ name, value }) => {
        if (value === "" || value == null) return;
        data[name] = value;
      });
    return data;
  }

  // ---- Modal ----------------------------------------------------------

  async function openCreateModal() {
    await loadInstituciones();
    editingId = null;
    $modalTitle.text("Nueva Carrera");
    $modalBody.html(formHtml());
    makeChoices('select[name="institucion_id"]', {
      placeholderValue: "Seleccione una institución",
    });
    $btnGuardar.text("Crear").prop("disabled", false);
    bsModal.show();
  }

  async function openEditModal(id) {
    try {
      await loadInstituciones();
      const res = await fetch(`${API_BASE}/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");

      editingId = id;
      $modalTitle.text(`Editar Carrera #${id}`);
      $modalBody.html(formHtml());
      setFormFromCarrera(json.data);
      const inst = makeChoices('select[name="institucion_id"]', {
        placeholderValue: "Seleccione una institución",
      });
      if (inst && json.data.institucion_id) {
        inst.setChoiceByValue(String(json.data.institucion_id));
      }
      $btnGuardar.text("Actualizar").prop("disabled", false);
      bsModal.show();
    } catch (err) {
      showToast(err.message || "No se pudo cargar la carrera.", "error");
    }
  }

  async function submitForm() {
    const data = serializeForm();
    if (!data.nombre) {
      showToast("El nombre es obligatorio.", "error");
      $("#form-carrera [name='nombre']").focus();
      return;
    }
    if (!data.institucion_id) {
      showToast("Selecciona una institución.", "error");
      $("#form-carrera [name='institucion_id']").focus();
      return;
    }

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
      $("#table-carreras").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $btnGuardar.prop("disabled", false).text(editingId ? "Actualizar" : "Crear");
    }
  }

  async function deleteCarrera(id, nombre) {
    const ok = await confirmar({
      titulo: "¿Desactivar carrera?",
      texto: `Vas a desactivar "${nombre}". Podrás reactivarla más tarde desde la base de datos.`,
      confirmText: "Sí, desactivar",
      cancelText: "Cancelar",
      icon: "warning",
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al desactivar.");
      }
      showToast(json.message || "Carrera desactivada.");
      $("#table-carreras").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al desactivar.", "error");
    }
  }

  // ---- Tabla e init ---------------------------------------------------

  function estadoBadge(estado) {
    if (estado === false)
      return '<span class="badge bg-secondary-subtle text-secondary">Inactiva</span>';
    return '<span class="badge bg-success-subtle text-success">Activa</span>';
  }

  $("#table-carreras").DataTable({
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
        render: function (_d, _t, _row, meta) {
          return meta.row + meta.settings._iDisplayStart + 1;
        },
      },
      {
        data: "nombre",
        defaultContent: '<span class="text-muted">—</span>',
      },
      {
        data: "institucion",
        orderable: false,
        render: function (d) {
          const nombre = d && d.nombre ? d.nombre : "—";
          return `<span class="small">${escapeHtml(nombre)}</span>`;
        },
      },
      {
        data: "estado",
        orderable: false,
        className: "text-center",
        render: function (d) {
          return estadoBadge(d);
        },
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: "text-center",
        render: function (_d, _t, row) {
          const nombre = row.nombre || `carrera #${row.id}`;
          return `
            <i class="ti ti-edit fs-4 text-info btn-edit" style="cursor: pointer;" title="Editar" data-id="${row.id}"></i>
            <i class="ti ti-trash fs-4 text-danger btn-delete" style="cursor: pointer; margin-left: 6px;" title="Eliminar" data-id="${row.id}" data-nombre="${escapeHtml(nombre)}"></i>
          `;
        },
      },
    ],
  });

  // ---- Eventos --------------------------------------------------------

  $("#btn-nueva-carrera").on("click", openCreateModal);
  $btnGuardar.on("click", submitForm);

  $("#table-carreras").on("click", ".btn-edit", function () {
    openEditModal(Number($(this).data("id")));
  });
  $("#table-carreras").on("click", ".btn-delete", function () {
    const id = Number($(this).data("id"));
    const nombre = $(this).data("nombre");
    deleteCarrera(id, nombre);
  });

  $modal.on("hidden.bs.modal", function () {
    destroyAllChoices();
    $modalBody.empty();
    editingId = null;
  });
});
