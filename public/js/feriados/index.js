/* global $, bootstrap, Swal */
$(function () {
  const API_BASE = "/api/feriados";
  const $modal = $("#standard-modal");
  const $modalTitle = $modal.find("#standard-modalLabel");
  const $modalBody = $modal.find(".modal-body");
  const $btnGuardar = $modal.find(".modal-footer .btn-primary");
  const bsModal = new bootstrap.Modal($modal[0]);

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

  // Convierte un Date (o string ISO) que viene de la API a "YYYY-MM-DD"
  // para que el <input type="date"> lo pueda mostrar. Si ya viene como
  // "YYYY-MM-DD…" se devuelve tal cual, sin pasar por Date (evita corrimientos
  // por timezone en zonas UTC-).
  function toDateInputValue(value) {
    if (!value) return "";
    if (typeof value === "string") {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // "YYYY-MM-DD" → "DD/MM/YYYY" para mostrar en la tabla.
  // Mismo criterio: si es string YYYY-MM-DD se parsea sin construir un Date.
  function formatDateForTable(value) {
    if (!value) return '<span class="text-muted small">—</span>';
    let y, m, day;
    if (typeof value === "string") {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        y = Number(match[1]);
        m = Number(match[2]);
        day = Number(match[3]);
      }
    }
    if (y === undefined) {
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return '<span class="text-muted small">—</span>';
      y = d.getFullYear();
      m = d.getMonth() + 1;
      day = d.getDate();
    }
    const dd = String(day).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    return `${dd}/${mm}/${y}`;
  }

  // ---- Form -----------------------------------------------------------

  function formHtml() {
    return `
      <form id="form-feriado" novalidate>
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label">Fecha <span class="text-danger">*</span></label>
            <input type="date" class="form-control" name="fecha" required />
          </div>
          <div class="col-md-8">
            <label class="form-label">Nombre <span class="text-danger">*</span></label>
            <input type="text" class="form-control" name="nombre" required maxlength="150" />
          </div>
        </div>
      </form>
    `;
  }

  function setFormFromFeriado(f) {
    const $form = $("#form-feriado");
    $form.find('[name="fecha"]').val(toDateInputValue(f.fecha));
    $form.find('[name="nombre"]').val(f.nombre || "");
  }

  function serializeForm() {
    const data = {};
    $("#form-feriado")
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
    $modalTitle.text("Nuevo Feriado");
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
      $modalTitle.text(`Editar Feriado #${id}`);
      $modalBody.html(formHtml());
      setFormFromFeriado(json.data);
      $btnGuardar.text("Actualizar").prop("disabled", false);
      bsModal.show();
    } catch (err) {
      showToast(err.message || "No se pudo cargar el feriado.", "error");
    }
  }

  async function submitForm() {
    const data = serializeForm();
    if (!data.fecha) {
      showToast("La fecha es obligatoria.", "error");
      $("#form-feriado [name='fecha']").focus();
      return;
    }
    if (!data.nombre) {
      showToast("El nombre es obligatorio.", "error");
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
      $("#table-feriados").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $btnGuardar.prop("disabled", false).text(editingId ? "Actualizar" : "Crear");
    }
  }

  async function deleteFeriado(id, label) {
    const ok = await confirmar({
      titulo: "¿Desactivar feriado?",
      texto: `Vas a desactivar "${label}". Podrás reactivarlo más tarde o volver a generarlo.`,
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
      showToast(json.message || "Feriado desactivado.");
      $("#table-feriados").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al desactivar.", "error");
    }
  }

  // ---- Generar del año ------------------------------------------------

  async function generarDelAnio() {
    const anioActual = new Date().getFullYear();

    // SweetAlert con un input numérico
    const { value: anioStr } = await Swal.fire({
      title: "Generar feriados del año",
      html: `
        <p class="text-muted mb-2">
          Se insertarán los feriados fijos de Perú y los móviles
          (Jueves / Viernes Santo) calculados desde Pascua.
        </p>
        <p class="text-muted small mb-2">
          Si ya existe un feriado activo en esa fecha, se omite.
          Si existe inactivo, se reactiva.
        </p>
        <input id="swal-anio" type="number" min="1900" max="2200"
               class="form-control" value="${anioActual}" />
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Generar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#6c757d",
      reverseButtons: true,
      focusConfirm: false,
      preConfirm: () => {
        const el = document.getElementById("swal-anio");
        const v = Number(el?.value);
        if (!Number.isInteger(v) || v < 1900 || v > 2200) {
          Swal.showValidationMessage("Ingresa un año válido (1900-2200).");
          return false;
        }
        return v;
      },
    });
    if (!anioStr) return;

    try {
      const res = await fetch(`${API_BASE}/generar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anio: anioStr }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Error al generar.");
      }

      const r = json.data;
      showToast(json.message, "success");
      $("#table-feriados").DataTable().ajax.reload(null, false);

      // Mostrar un resumen en otro SweetAlert (toast-like) con el detalle
      const li = (arr) =>
        arr.length
          ? arr
              .map(
                (x) =>
                  `<li><strong>${escapeHtml(x.fecha)}</strong> — ${escapeHtml(x.nombre)}</li>`,
              )
              .join("")
          : "<li class='text-muted'>—</li>";

      Swal.fire({
        title: `Feriados ${anioStr}`,
        html: `
          <div class="text-start">
            <p class="mb-1"><strong>Insertados (${r.insertados.length}):</strong></p>
            <ul class="ps-3 mb-2">${li(r.insertados)}</ul>
            <p class="mb-1"><strong>Reactivados (${r.reactivados.length}):</strong></p>
            <ul class="ps-3 mb-2">${li(r.reactivados)}</ul>
            <p class="mb-1"><strong>Omitidos (ya existían) (${r.omitidos.length}):</strong></p>
            <ul class="ps-3">${li(r.omitidos)}</ul>
          </div>
        `,
        icon: "info",
        confirmButtonText: "Cerrar",
      });
    } catch (err) {
      showToast(err.message || "Error al generar.", "error");
    }
  }

  // ---- Tabla e init ---------------------------------------------------

  $("#table-feriados").DataTable({
    language: window.DATATABLES_ES_CONFIG,
    ajax: {
      url: API_BASE,
      dataSrc: "data",
    },
    order: [[1, "desc"]], // ordenar por fecha descendente (más reciente arriba)
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
        data: "fecha",
        render: function (d) {
          return formatDateForTable(d);
        },
      },
      { data: "nombre", defaultContent: '<span class="text-muted">—</span>' },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: "text-center",
        render: function (_d, _t, row) {
          const label = `${row.nombre || ""} (${toDateInputValue(row.fecha)})`;
          return `
            <i class="ti ti-edit fs-4 text-info btn-edit" style="cursor: pointer;" title="Editar" data-id="${row.id}"></i>
            <i class="ti ti-trash fs-4 text-danger btn-delete" style="cursor: pointer; margin-left: 6px;" title="Eliminar" data-id="${row.id}" data-label="${escapeHtml(label)}"></i>
          `;
        },
      },
    ],
  });

  // ---- Eventos --------------------------------------------------------

  $("#btn-nuevo-feriado").on("click", openCreateModal);
  $("#btn-generar-feriados").on("click", generarDelAnio);
  $btnGuardar.on("click", submitForm);

  $("#table-feriados").on("click", ".btn-edit", function () {
    openEditModal(Number($(this).data("id")));
  });
  $("#table-feriados").on("click", ".btn-delete", function () {
    const id = Number($(this).data("id"));
    const label = $(this).data("label");
    deleteFeriado(id, label);
  });

  $modal.on("hidden.bs.modal", function () {
    $modalBody.empty();
    editingId = null;
  });
});
