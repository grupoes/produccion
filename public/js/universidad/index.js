/* global $, bootstrap, Swal */
$(function () {
  const API_BASE = "/api/universidad";
  const $modal = $("#standard-modal");
  const $modalDialog = $modal.find(".modal-dialog");
  const $modalTitle = $modal.find("#standard-modalLabel");
  const $modalBody = $modal.find(".modal-body");
  const $btnGuardar = $modal.find(".modal-footer .btn-primary");
  const bsModal = new bootstrap.Modal($modal[0]);

  // Sector y tipo son valores fijos (no vienen de la BD)
  const SECTORES = ["Pública", "Privada"];
  const TIPOS = ["UNIVERSIDAD", "INSTITUTO"];

  let editingId = null;

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

  function buildOptions(items, placeholder) {
    const opts = [`<option value="">${placeholder}</option>`];
    items.forEach((v) => {
      opts.push(`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`);
    });
    return opts.join("");
  }

  // ---- Form -----------------------------------------------------------

  function formHtml() {
    return `
      <form id="form-institucion" novalidate>
        <div class="row g-3">
          <div class="col-md-8">
            <label class="form-label">Nombre <span class="text-danger">*</span></label>
            <input type="text" class="form-control" name="nombre" required maxlength="100" />
          </div>
          <div class="col-md-4">
            <label class="form-label">Abreviatura</label>
            <input type="text" class="form-control" name="abreviatura" maxlength="100" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Tipo <span class="text-danger">*</span></label>
            <select class="form-select" name="tipo" required>
              ${buildOptions(TIPOS, "Seleccione un tipo")}
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">Sector <span class="text-danger">*</span></label>
            <select class="form-select" name="sector" required>
              ${buildOptions(SECTORES, "Seleccione un sector")}
            </select>
          </div>
        </div>
      </form>
    `;
  }

  function setFormFromInstitucion(inst) {
    const $form = $("#form-institucion");
    $form.find('[name="nombre"]').val(inst.nombre || "");
    $form.find('[name="abreviatura"]').val(inst.abreviatura || "");
    $form.find('[name="tipo"]').val(inst.tipo || "");
    $form.find('[name="sector"]').val(inst.sector || "");
  }

  function serializeForm() {
    const data = {};
    $("#form-institucion")
      .serializeArray()
      .forEach(({ name, value }) => {
        if (value === "" || value == null) return;
        data[name] = value;
      });
    return data;
  }

  // ---- Modal ----------------------------------------------------------

  function openCreateModal() {
    editingId = null;
    $modalTitle.text("Nueva Institución");
    $modalBody.html(formHtml());
    $btnGuardar.text("Crear").prop("disabled", false);
    bsModal.show();
  }

  async function openEditModal(id) {
    try {
      const res = await fetch(`${API_BASE}/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");

      editingId = id;
      $modalTitle.text(`Editar Institución #${id}`);
      $modalBody.html(formHtml());
      setFormFromInstitucion(json.data);
      $btnGuardar.text("Actualizar").prop("disabled", false);
      bsModal.show();
    } catch (err) {
      showToast(err.message || "No se pudo cargar la institución.", "error");
    }
  }

  async function submitForm() {
    const data = serializeForm();
    if (!data.nombre) {
      showToast("El nombre es obligatorio.", "error");
      $("#form-institucion [name='nombre']").focus();
      return;
    }
    if (!data.tipo) {
      showToast("Selecciona un tipo.", "error");
      return;
    }
    if (!data.sector) {
      showToast("Selecciona un sector.", "error");
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
      $("#table-instituciones").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $btnGuardar.prop("disabled", false).text(editingId ? "Actualizar" : "Crear");
    }
  }

  async function deleteInstitucion(id, nombre) {
    const ok = await confirmar({
      titulo: "¿Desactivar institución?",
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
      showToast(json.message || "Institución desactivada.");
      $("#table-instituciones").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al desactivar.", "error");
    }
  }

  // ---- Tabla e init ---------------------------------------------------

  function sectorBadge(s) {
    if (!s) return '<span class="text-muted small">—</span>';
    const cls = s.toLowerCase() === "pública" || s.toLowerCase() === "publica" ? "bg-success" : "bg-info";
    return `<span class="badge ${cls}">${escapeHtml(s)}</span>`;
  }

  function tipoBadge(t) {
    if (!t) return '<span class="text-muted small">—</span>';
    return `<span class="badge bg-primary">${escapeHtml(t)}</span>`;
  }

  $("#table-instituciones").DataTable({
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
        data: "abreviatura",
        defaultContent: '<span class="text-muted small">—</span>',
      },
      {
        data: "tipo",
        orderable: false,
        render: function (d) {
          return tipoBadge(d);
        },
      },
      {
        data: "sector",
        orderable: false,
        render: function (d) {
          return sectorBadge(d);
        },
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: "text-center",
        render: function (_d, _t, row) {
          const nombre = row.nombre || `institución #${row.id}`;
          return `
            <i class="ti ti-edit fs-4 text-info btn-edit" style="cursor: pointer;" title="Editar" data-id="${row.id}"></i>
            <i class="ti ti-trash fs-4 text-danger btn-delete" style="cursor: pointer; margin-left: 6px;" title="Eliminar" data-id="${row.id}" data-nombre="${escapeHtml(nombre)}"></i>
          `;
        },
      },
    ],
  });

  // ---- Eventos --------------------------------------------------------

  $("#btn-nueva-institucion").on("click", openCreateModal);
  $btnGuardar.on("click", submitForm);

  $("#table-instituciones").on("click", ".btn-edit", function () {
    openEditModal(Number($(this).data("id")));
  });
  $("#table-instituciones").on("click", ".btn-delete", function () {
    const id = Number($(this).data("id"));
    const nombre = $(this).data("nombre");
    deleteInstitucion(id, nombre);
  });

  $modal.on("hidden.bs.modal", function () {
    $modalBody.empty();
    editingId = null;
  });
});
