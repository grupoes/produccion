/* global $, bootstrap, Swal, lucide */
$(function () {
  const API_BASE = "/api/modulos";
  const $modal = $("#standard-modal");
  const $modalTitle = $modal.find("#standard-modalLabel");
  const $modalBody = $modal.find(".modal-body");
  const $btnGuardar = $modal.find(".modal-footer .btn-primary");
  const bsModal = new bootstrap.Modal($modal[0]);

  let editingId = null;
  let padres = []; // catálogo de módulos padre (idpadre=null)

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

  function buildOptions(items, valueKey, labelKey, placeholder) {
    const opts = [`<option value="">${placeholder}</option>`];
    items.forEach((it) => {
      opts.push(
        `<option value="${it[valueKey]}">${escapeHtml(it[labelKey])}</option>`,
      );
    });
    return opts.join("");
  }

  // ---- Form -----------------------------------------------------------

  function formHtml() {
    const padreOpts = buildOptions(
      padres,
      "id",
      "modulo",
      "Seleccione un módulo padre",
    );

    return `
      <form id="form-modulo" novalidate>
        <div class="row g-3">
          <div class="col-md-8">
            <label class="form-label">Nombre <span class="text-danger">*</span></label>
            <input type="text" class="form-control" name="modulo" required maxlength="50" />
          </div>
          <div class="col-md-4">
            <label class="form-label">Orden</label>
            <input type="number" min="0" class="form-control" name="orden" placeholder="0" />
          </div>

          <div class="col-md-6">
            <label class="form-label">URL</label>
            <input type="text" class="form-control" name="url" maxlength="50" placeholder="/ejemplo/ruta" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Icono (Lucide)</label>
            <input type="text" class="form-control" name="icono" maxlength="20" placeholder="folder" />
            <small class="text-muted">Nombre del icono de Lucide (ej. <code>folder</code>, <code>user</code>, <code>shield</code>).</small>
          </div>

          <div class="col-12">
            <hr class="my-2" />
            <label class="form-label d-block">Tipo de módulo</label>
            <div class="btn-group btn-group-sm" role="group" aria-label="Tipo de módulo">
              <input type="radio" class="btn-check js-tipo" name="tipo_modulo" id="tipo_padre" value="padre" autocomplete="off" checked />
              <label class="btn btn-outline-primary" for="tipo_padre">
                <i data-lucide="folder" class="me-1 align-middle"></i> Padre (raíz)
              </label>
              <input type="radio" class="btn-check js-tipo" name="tipo_modulo" id="tipo_hijo" value="hijo" autocomplete="off" />
              <label class="btn btn-outline-primary" for="tipo_hijo">
                <i data-lucide="file" class="me-1 align-middle"></i> Hijo (submódulo)
              </label>
            </div>
            <input type="hidden" name="idpadre" id="input-idpadre" value="0" />
          </div>

          <div class="col-12" id="padre-select-wrapper" style="display: none;">
            <label class="form-label">Módulo padre <span class="text-danger">*</span></label>
            <select class="form-select" id="select-padre" name="padre_select">
              ${padreOpts}
            </select>
            <small class="text-muted">Solo aparecen los módulos padre (idpadre = 0) activos.</small>
          </div>
        </div>
      </form>
    `;
  }

  // Sincroniza el input hidden "idpadre" con el radio button y el select.
  // - "padre" → idpadre = 0
  // - "hijo"  → idpadre = <id del select>; oculta/muestra el wrapper.
  function syncTipoModulo() {
    const tipo = $('input[name="tipo_modulo"]:checked').val();
    if (tipo === "padre") {
      $("#input-idpadre").val("0");
      $("#padre-select-wrapper").hide();
      $("#select-padre").prop("required", false);
    } else {
      $("#padre-select-wrapper").show();
      $("#select-padre").prop("required", true);
      const sel = $("#select-padre").val();
      $("#input-idpadre").val(sel || "");
    }
  }

  function setTipoModuloFromData(t) {
    if (t.es_padre) {
      $("#tipo_padre").prop("checked", true).trigger("change");
    } else {
      $("#tipo_hijo").prop("checked", true).trigger("change");
      $("#select-padre").val(String(t.idpadre));
    }
    syncTipoModulo();
  }

  function setFormFromModulo(m) {
    const $form = $("#form-modulo");
    $form.find('[name="modulo"]').val(m.modulo || "");
    $form.find('[name="url"]').val(m.url || "");
    $form.find('[name="icono"]').val(m.icono || "");
    $form.find('[name="orden"]').val(m.orden != null ? m.orden : "");
    setTipoModuloFromData(m);
  }

  function serializeForm() {
    const data = {};
    $("#form-modulo")
      .serializeArray()
      .forEach(({ name, value }) => {
        if (name === "tipo_modulo" || name === "padre_select") return;
        if (value === "" || value == null) return;
        data[name] = value;
      });
    return data;
  }

  // ---- Modal ----------------------------------------------------------

  async function loadPadres(excludeId = null) {
    const url =
      excludeId != null
        ? `${API_BASE}/lookups?excludeId=${excludeId}`
        : `${API_BASE}/lookups`;
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error("No se pudo cargar padres.");
    padres = json.data.padres || [];
  }

  async function openCreateModal() {
    editingId = null;
    try {
      await loadPadres();
    } catch (err) {
      showToast(err.message || "Error cargando módulos padre.", "error");
    }
    $modalTitle.text("Nuevo Módulo");
    $modalBody.html(formHtml());
    lucide.createIcons();
    syncTipoModulo();
    $btnGuardar.text("Crear").prop("disabled", false);
    bsModal.show();
  }

  async function openEditModal(id) {
    try {
      // Cargamos el módulo y los padres en paralelo
      const [modRes, _] = await Promise.all([
        fetch(`${API_BASE}/${id}`),
        loadPadres(id),
      ]);
      const modJson = await modRes.json();
      if (!modRes.ok || !modJson.success)
        throw new Error(modJson.error || "Error");

      editingId = id;
      $modalTitle.text(`Editar Módulo #${id}`);
      $modalBody.html(formHtml());
      lucide.createIcons();
      setFormFromModulo(modJson.data);
      $btnGuardar.text("Actualizar").prop("disabled", false);
      bsModal.show();
    } catch (err) {
      showToast(err.message || "No se pudo cargar el módulo.", "error");
    }
  }

  async function submitForm() {
    const data = serializeForm();
    if (!data.modulo) {
      showToast("El nombre es obligatorio.", "error");
      $("#form-modulo [name='modulo']").focus();
      return;
    }
    // Si es hijo, validar que se haya elegido padre
    if ($('input[name="tipo_modulo"]:checked').val() === "hijo") {
      const sel = $("#select-padre").val();
      if (!sel) {
        showToast("Selecciona un módulo padre.", "error");
        return;
      }
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
      $("#table-modulos").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $btnGuardar.prop("disabled", false).text(editingId ? "Actualizar" : "Crear");
    }
  }

  async function deleteModulo(id, nombre) {
    const ok = await confirmar({
      titulo: "¿Desactivar módulo?",
      texto: `Vas a desactivar "${nombre}". Sus submódulos y permisos no se eliminarán, pero el módulo dejará de estar disponible en el menú.`,
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
      showToast(json.message || "Módulo desactivado.");
      $("#table-modulos").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al desactivar.", "error");
    }
  }

  // ---- Tabla e init ---------------------------------------------------

  $("#table-modulos").DataTable({
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
      { data: "modulo", defaultContent: '<span class="text-muted">—</span>' },
      {
        data: "url",
        defaultContent: '<span class="text-muted small">—</span>',
      },
      {
        data: "icono",
        className: "text-center",
        orderable: false,
        render: function (d) {
          if (!d) return '<span class="text-muted small">—</span>';
          return `<i data-lucide="${escapeHtml(d)}" title="${escapeHtml(d)}"></i>`;
        },
      },
      {
        data: "es_padre",
        orderable: false,
        render: function (d) {
          return d
            ? '<span class="badge bg-primary"><i data-lucide="folder" class="me-1 align-middle"></i>Padre</span>'
            : '<span class="badge bg-secondary"><i data-lucide="file" class="me-1 align-middle"></i>Hijo</span>';
        },
      },
      {
        data: null,
        orderable: false,
        render: function (_d, _t, row) {
          if (row.es_padre) return '<span class="text-muted small">—</span>';
          if (!row.padre) return '<span class="text-danger small">Sin padre</span>';
          return `<span class="fw-semibold">${escapeHtml(row.padre.nombre)}</span> <small class="text-muted">#${row.padre.id}</small>`;
        },
      },
      {
        data: "orden",
        className: "text-center",
        defaultContent: '<span class="text-muted small">—</span>',
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: "text-center",
        render: function (_d, _t, row) {
          const nombre = row.modulo || `módulo #${row.id}`;
          return `
            <i class="ti ti-edit fs-4 text-info btn-edit" style="cursor: pointer;" title="Editar" data-id="${row.id}"></i>
            <i class="ti ti-trash fs-4 text-danger btn-delete" style="cursor: pointer; margin-left: 6px;" title="Eliminar" data-id="${row.id}" data-nombre="${escapeHtml(nombre)}"></i>
          `;
        },
      },
    ],
    // Después de cada redibujo, re-crear los iconos de Lucide
    drawCallback: function () {
      lucide.createIcons();
    },
  });

  // ---- Eventos --------------------------------------------------------

  $("#btn-nuevo-modulo").on("click", openCreateModal);
  $btnGuardar.on("click", submitForm);

  $modalBody.on("change", 'input[name="tipo_modulo"]', syncTipoModulo);
  $modalBody.on("change", "#select-padre", function () {
    $("#input-idpadre").val($(this).val());
  });

  $("#table-modulos").on("click", ".btn-edit", function () {
    openEditModal(Number($(this).data("id")));
  });
  $("#table-modulos").on("click", ".btn-delete", function () {
    const id = Number($(this).data("id"));
    const nombre = $(this).data("nombre");
    deleteModulo(id, nombre);
  });

  $modal.on("hidden.bs.modal", function () {
    $modalBody.empty();
    editingId = null;
  });
});
