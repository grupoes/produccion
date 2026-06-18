/* global $, bootstrap, Swal */
$(function () {
  const API = "/api/configuracion-acciones";

  const $modal = $("#standard-modal");
  const $modalDialog = $modal.find(".modal-dialog");
  const $modalTitle = $modal.find("#standard-modalLabel");
  const $modalBody = $modal.find(".modal-body");
  const $btnGuardar = $modal.find(".modal-footer .btn-primary");
  const bsModal = new bootstrap.Modal($modal[0]);

  // ---------- Toast / helpers ------------------------------------------

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

  function setEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }

  // ====================================================================
  // TAB 1: Catálogo de Acciones
  // ====================================================================

  let editingAccionId = null;

  function accionFormHtml() {
    return `
      <form id="form-accion" novalidate>
        <div class="row g-3">
          <div class="col-md-12">
            <label class="form-label">Nombre <span class="text-danger">*</span></label>
            <input type="text" class="form-control" name="nombre_accion" required maxlength="50" placeholder="Ej. Crear, Editar, Aprobar..." />
          </div>
          <div class="col-md-12">
            <label class="form-label">Descripción</label>
            <textarea class="form-control" name="descripcion" rows="2" maxlength="255"></textarea>
          </div>
          <div class="col-md-12">
            <div class="form-check form-switch">
              <input type="checkbox" class="form-check-input" name="estado" id="chk-accion-estado" checked />
              <label class="form-check-label" for="chk-accion-estado">Activa</label>
            </div>
            <small class="text-muted d-block">
              Las acciones inactivas no aparecen en la matriz de asignación ni en los permisos.
            </small>
          </div>
        </div>
      </form>
    `;
  }

  function setAccionForm(a) {
    $("#form-accion")
      .find('[name="nombre_accion"]').val(a?.nombre_accion || "")
      .end()
      .find('[name="descripcion"]').val(a?.descripcion || "")
      .end()
      .find('[name="estado"]').prop("checked", a ? !!a.estado : true);
  }

  function serializeAccion() {
    const $f = $("#form-accion");
    return {
      nombre_accion: $f.find('[name="nombre_accion"]').val() || null,
      descripcion: $f.find('[name="descripcion"]').val() || null,
      estado: $f.find('[name="estado"]').is(":checked"),
    };
  }

  function openNuevaAccion() {
    editingAccionId = null;
    $modalTitle.text("Nueva Acción");
    $modalBody.html(accionFormHtml());
    $btnGuardar.text("Crear").prop("disabled", false);
    bsModal.show();
  }

  async function openEditarAccion(id) {
    try {
      const res = await fetch(`${API}/acciones/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");
      editingAccionId = id;
      $modalTitle.text(`Editar Acción #${id}`);
      $modalBody.html(accionFormHtml());
      setAccionForm(json.data);
      $btnGuardar.text("Actualizar").prop("disabled", false);
      bsModal.show();
    } catch (err) {
      showToast(err.message || "No se pudo cargar la acción.", "error");
    }
  }

  async function submitAccion() {
    const data = serializeAccion();
    if (!data.nombre_accion) {
      showToast("El nombre es obligatorio.", "error");
      $("#form-accion [name='nombre_accion']").focus();
      return;
    }
    const url = editingAccionId
      ? `${API}/acciones/${editingAccionId}`
      : `${API}/acciones`;
    const method = editingAccionId ? "PUT" : "POST";

    try {
      $btnGuardar.prop("disabled", true).text("Guardando...");
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error || "Error al guardar.");
      showToast(json.message || "Guardado correctamente.");
      bsModal.hide();
      $("#table-acciones").DataTable().ajax.reload(null, false);
      // Si la matriz ya está cargada, refrescarla por si cambió la lista de acciones
      if (matrizLoaded) refreshMatriz();
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $btnGuardar.prop("disabled", false).text(editingAccionId ? "Actualizar" : "Crear");
    }
  }

  async function desactivarAccion(id, nombre) {
    const ok = await confirmar({
      titulo: "¿Desactivar acción?",
      texto: `Vas a desactivar "${nombre}". Dejará de estar disponible en la matriz y en los permisos.`,
      confirmText: "Sí, desactivar",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API}/acciones/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error || "Error al desactivar.");
      showToast(json.message || "Acción desactivada.");
      $("#table-acciones").DataTable().ajax.reload(null, false);
      if (matrizLoaded) refreshMatriz();
    } catch (err) {
      showToast(err.message || "Error al desactivar.", "error");
    }
  }

  const tableAcciones = $("#table-acciones").DataTable({
    language: window.DATATABLES_ES_CONFIG,
    ajax: {
      url: `${API}/acciones`,
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
      { data: "nombre_accion", defaultContent: "—" },
      {
        data: "descripcion",
        defaultContent: '<span class="text-muted small">—</span>',
      },
      {
        data: "estado",
        className: "text-center",
        render: (d) =>
          d
            ? '<span class="badge bg-success-subtle text-success">Activa</span>'
            : '<span class="badge bg-secondary-subtle text-secondary">Inactiva</span>',
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: "text-center",
        render: (_d, _t, row) => {
          const nombre = row.nombre_accion || `acción #${row.id}`;
          return `
            <i class="ti ti-edit fs-4 text-info btn-edit-accion" style="cursor: pointer;" title="Editar" data-id="${row.id}"></i>
            <i class="ti ti-trash fs-4 text-danger btn-delete-accion" style="cursor: pointer; margin-left: 6px;" title="Desactivar" data-id="${row.id}" data-nombre="${escapeHtml(nombre)}"></i>
          `;
        },
      },
    ],
  });

  $("#btn-nueva-accion").on("click", openNuevaAccion);
  $btnGuardar.on("click", function () {
    // El botón "Guardar" del modal genérico se reutiliza:
    // - Si el modal es de acciones → submitAccion
    // - Si es de otra cosa → no hace nada aquí
    if ($("#form-accion").length) submitAccion();
  });
  $("#table-acciones").on("click", ".btn-edit-accion", function () {
    openEditarAccion(Number($(this).data("id")));
  });
  $("#table-acciones").on("click", ".btn-delete-accion", function () {
    const id = Number($(this).data("id"));
    const nombre = $(this).data("nombre");
    desactivarAccion(id, nombre);
  });

  // ====================================================================
  // TAB 2: Matriz submódulos × acciones
  // ====================================================================

  let matrizLoaded = false;
  // Estado: { padres, submodulos, acciones, checksOriginal, current }
  // current: Map<moduloId, Set<accionId>>
  const matrizState = {
    padres: [],
    submodulos: [],
    acciones: [],
    original: new Map(), // moduloId → Set<accionId> (lo que vino del backend)
    current: new Map(),  // moduloId → Set<accionId> (lo que el usuario ha marcado)
  };

  async function refreshMatriz() {
    const $body = $("#matriz-body");
    $body.html(`<div class="text-center text-muted py-5">
      <span class="spinner-border spinner-border-sm me-2"></span> Cargando matriz…
    </div>`);
    try {
      const res = await fetch(`${API}/matriz`);
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error || "Error al cargar la matriz.");

      const { padres, submodulos, acciones, checks } = json.data;
      matrizState.padres = padres || [];
      matrizState.submodulos = submodulos || [];
      matrizState.acciones = acciones || [];

      matrizState.original = new Map();
      matrizState.current = new Map();
      (submodulos || []).forEach((m) => {
        const set = new Set();
        (acciones || []).forEach((a) => {
          if (checks[`${m.id}-${a.id}`]) set.add(a.id);
        });
        matrizState.original.set(m.id, new Set(set));
        matrizState.current.set(m.id, new Set(set));
      });

      renderMatriz();
      matrizLoaded = true;
      updateDirtyBadge();
    } catch (err) {
      $body.html(`<div class="alert alert-danger mb-0">${escapeHtml(err.message || "Error al cargar la matriz.")}</div>`);
    }
  }

  function renderMatriz() {
    const $body = $("#matriz-body");
    const { submodulos, padres, acciones, current } = matrizState;

    if (acciones.length === 0) {
      $body.html(`<div class="alert alert-info mb-0">
        Aún no hay acciones activas. Crea al menos una en la pestaña "Acciones" para poder asignarla.
      </div>`);
      return;
    }
    if (submodulos.length === 0) {
      $body.html(`<div class="alert alert-info mb-0">
        Aún no hay submódulos activos. Crea módulos con padre asignado en la pantalla de Módulos.
      </div>`);
      return;
    }

    // Agrupa submódulos por padre
    const byPadre = new Map();
    const sinPadre = [];
    submodulos.forEach((m) => {
      if (m.idpadre) {
        if (!byPadre.has(m.idpadre)) byPadre.set(m.idpadre, []);
        byPadre.get(m.idpadre).push(m);
      } else {
        sinPadre.push(m);
      }
    });

    // Orden: padres por nombre; submódulos por nombre dentro de cada padre
    const padresOrden = padres
      .filter((p) => byPadre.has(p.id))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    sinPadre.sort((a, b) => a.nombre.localeCompare(b.nombre));

    let html = `
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-0 matriz-table">
          <thead class="thead-sm text-uppercase fs-xxs">
            <tr>
              <th style="min-width: 220px;">Submódulo</th>
    `;
    acciones.forEach((a) => {
      html += `<th class="text-center" style="min-width: 110px;">
        <div class="d-flex flex-column align-items-center gap-1">
          <span>${escapeHtml(a.nombre_accion)}</span>
          <button type="button" class="btn btn-sm btn-link p-0 js-col-toggle" data-accion="${a.id}" title="Marcar/Desmarcar toda la columna">
            <i class="ti ti-checks"></i>
          </button>
        </div>
      </th>`;
    });
    html += `</tr></thead><tbody>`;

    function renderRows(rows, groupLabel, groupIcon) {
      if (!rows.length) return "";
      let g = "";
      rows.forEach((m) => {
        const set = current.get(m.id) || new Set();
        g += `<tr>
          <td>
            <div class="d-flex align-items-center gap-2">
              <i class="ti ${escapeHtml(groupIcon || "folder")} text-muted"></i>
              <span>${escapeHtml(m.nombre)}</span>
              <span class="badge bg-light text-muted ms-auto js-row-count" data-modulo="${m.id}">
                ${set.size}/${acciones.length}
              </span>
              <button type="button" class="btn btn-sm btn-link p-0 js-row-toggle" data-modulo="${m.id}" title="Marcar/Desmarcar toda la fila">
                <i class="ti ti-checks"></i>
              </button>
            </div>
          </td>`;
        acciones.forEach((a) => {
          const checked = set.has(a.id);
          g += `<td class="text-center">
            <div class="form-check d-inline-block">
              <input type="checkbox" class="form-check-input js-cell"
                data-modulo="${m.id}" data-accion="${a.id}" ${checked ? "checked" : ""} />
            </div>
          </td>`;
        });
        g += `</tr>`;
      });
      return g;
    }

    padresOrden.forEach((p) => {
      const rows = byPadre.get(p.id).sort((a, b) => a.nombre.localeCompare(b.nombre));
      html += renderRows(rows, p.nombre, p.icono);
    });
    if (sinPadre.length) {
      html += renderRows(sinPadre, "Sin padre", "circle");
    }

    html += `</tbody></table></div>`;
    $body.html(html);
  }

  function updateDirtyBadge() {
    const { original, current, submodulos } = matrizState;
    let dirty = 0;
    submodulos.forEach((m) => {
      if (!setEqual(original.get(m.id) || new Set(), current.get(m.id) || new Set())) {
        dirty++;
      }
    });
    $("#matriz-dirty").toggle(dirty > 0).text(`${dirty} cambio${dirty === 1 ? "" : "s"} sin guardar`);
    $("#btn-save-matriz").prop("disabled", dirty === 0);
  }

  // Eventos delegados de la matriz
  $("#matriz-body").on("change", ".js-cell", function () {
    const $c = $(this);
    const moduloId = Number($c.data("modulo"));
    const accionId = Number($c.data("accion"));
    const set = matrizState.current.get(moduloId) || new Set();
    if ($c.is(":checked")) set.add(accionId);
    else set.delete(accionId);
    matrizState.current.set(moduloId, set);

    // Actualiza el contador de la fila
    $(`.js-row-count[data-modulo="${moduloId}"]`)
      .text(`${set.size}/${matrizState.acciones.length}`);

    updateDirtyBadge();
  });

  // Marcar/desmarcar toda la fila
  $("#matriz-body").on("click", ".js-row-toggle", function () {
    const moduloId = Number($(this).data("modulo"));
    const set = matrizState.current.get(moduloId) || new Set();
    const total = matrizState.acciones.length;
    const allOn = set.size === total;
    const next = new Set();
    if (!allOn) matrizState.acciones.forEach((a) => next.add(a.id));
    matrizState.current.set(moduloId, next);

    $(`#matriz-body .js-cell[data-modulo="${moduloId}"]`).prop("checked", !allOn);
    $(`.js-row-count[data-modulo="${moduloId}"]`)
      .text(`${!allOn ? total : 0}/${total}`);

    updateDirtyBadge();
  });

  // Marcar/desmarcar toda la columna
  $("#matriz-body").on("click", ".js-col-toggle", function () {
    const accionId = Number($(this).data("accion"));
    const { submodulos, current, acciones } = matrizState;
    const total = submodulos.length;
    // ¿Toda la columna está ya marcada?
    let allOn = 0;
    submodulos.forEach((m) => {
      if ((current.get(m.id) || new Set()).has(accionId)) allOn++;
    });
    const turnOn = allOn < total;
    submodulos.forEach((m) => {
      const set = current.get(m.id) || new Set();
      if (turnOn) set.add(accionId);
      else set.delete(accionId);
      current.set(m.id, set);
      $(`#matriz-body .js-cell[data-modulo="${m.id}"][data-accion="${accionId}"]`)
        .prop("checked", turnOn);
      $(`.js-row-count[data-modulo="${m.id}"]`)
        .text(`${set.size}/${acciones.length}`);
    });
    updateDirtyBadge();
  });

  // Guardar cambios
  $("#btn-save-matriz").on("click", async function () {
    const { original, current, submodulos } = matrizState;
    const changes = [];
    submodulos.forEach((m) => {
      const o = original.get(m.id) || new Set();
      const c = current.get(m.id) || new Set();
      if (!setEqual(o, c)) {
        changes.push({ modulo_id: m.id, accion_ids: [...c] });
      }
    });
    if (changes.length === 0) {
      showToast("No hay cambios para guardar.", "info");
      return;
    }

    try {
      $(this).prop("disabled", true).html(
        '<span class="spinner-border spinner-border-sm me-1"></span>Guardando...',
      );
      const res = await fetch(`${API}/matriz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error || "Error al guardar.");
      showToast(json.message || "Asignaciones actualizadas.");
      // Refresca la matriz para sincronizar original = current
      await refreshMatriz();
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $("#btn-save-matriz")
        .prop("disabled", false)
        .html('<i class="ti ti-device-floppy align-middle me-1"></i> Guardar cambios');
    }
  });

  // Carga inicial de la matriz al entrar al tab (y al volver a él)
  $('a[href="#tab-matriz"]').on("shown.bs.tab", function () {
    if (!matrizLoaded) refreshMatriz();
  });

  // ====================================================================
  // Modal cleanup
  // ====================================================================
  $modal.on("hidden.bs.modal", function () {
    $modalBody.empty();
    $modalDialog.removeClass("modal-lg modal-dialog-scrollable");
    editingAccionId = null;
  });
});
