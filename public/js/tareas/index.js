/* global $, bootstrap, Swal */
$(function () {
  const API_BASE = "/api/tareas";
  const $modal = $("#standard-modal");
  const $modalDialog = $modal.find(".modal-dialog");
  const $modalTitle = $modal.find("#standard-modalLabel");
  const $modalBody = $modal.find(".modal-body");
  const $btnGuardar = $modal.find(".modal-footer .btn-primary");
  const bsModal = new bootstrap.Modal($modal[0]);

  // En esta vista el modal va "large" con scroll.
  const MODAL_LG_CLASSES = "modal-lg modal-dialog-scrollable";

  let editingId = null;
  let lookups = { roles: [], tipoTarea: [] };

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
    const tipoOpts = buildOptions(
      lookups.tipoTarea,
      "id",
      "tipo",
      "Seleccione un tipo",
    );

    return `
      <form id="form-tarea" novalidate>
        <div class="row g-3">
          <div class="col-md-8">
            <label class="form-label">Nombre <span class="text-danger">*</span></label>
            <input type="text" class="form-control" name="nombre" required maxlength="150" />
          </div>
          <div class="col-md-4">
            <label class="form-label">Horas estimadas</label>
            <div class="input-group">
              <input type="number" min="0" class="form-control" name="horas" id="input-horas" placeholder="0" />
              <span class="input-group-text">h</span>
              <input type="number" min="0" max="59" class="form-control" name="minutos" id="input-minutos" placeholder="0" />
              <span class="input-group-text">m</span>
            </div>
            <small class="text-muted">Se guarda en minutos en la base de datos.</small>
          </div>

          <div class="col-md-12">
            <label class="form-label">Tipo de tarea</label>
            <select class="form-select" name="tipo_tarea_id">${tipoOpts}</select>
          </div>

          <div class="col-md-12">
            <label class="form-label d-block">
              Contexto <span class="text-danger">*</span>
            </label>
            <div class="d-flex gap-3 flex-wrap">
              <div class="form-check">
                <input class="form-check-input js-aplica" type="checkbox" id="chk-aplica-venta" name="aplica_en_ventas" />
                <label class="form-check-label" for="chk-aplica-venta">Venta</label>
              </div>
              <div class="form-check">
                <input class="form-check-input js-aplica" type="checkbox" id="chk-aplica-proyecto" name="aplica_en_proyecto" />
                <label class="form-check-label" for="chk-aplica-proyecto">Proyecto</label>
              </div>
            </div>
            <small class="text-muted">Marca al menos uno. Define si la tarea aplica a etapa de Venta, de Proyecto o ambas.</small>
          </div>
        </div>

        <hr class="my-3" />

        <div class="d-flex align-items-center justify-content-between mb-2">
          <h6 class="text-uppercase text-muted fs-xxs mb-0">Roles que ejecutan esta tarea</h6>
          <button type="button" id="btn-add-rol" class="btn btn-sm btn-outline-primary">
            <i class="ti ti-plus me-1"></i> Agregar rol
          </button>
        </div>

        <div class="table-responsive">
          <table class="table table-borderless align-middle mb-0">
            <thead>
              <tr class="text-uppercase fs-xxs text-muted">
                <th style="width: 60%;">Rol</th>
                <th class="text-center" style="width: 25%;">Prioridad</th>
                <th class="text-center" style="width: 15%;"></th>
              </tr>
            </thead>
            <tbody id="roles-tarea-body">
              <tr class="text-muted text-center js-empty-roles">
                <td colspan="3" class="py-3">
                  Aún no hay roles. Haz clic en "Agregar rol".
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <small class="text-muted d-block mt-2">
          <strong>Primaria</strong> = rol principal responsable de la tarea.
          <strong>Complementaria</strong> = rol de apoyo.
        </small>
      </form>
    `;
  }

  // Devuelve la fila HTML para un rol en la grilla de roles.
  // selected: rol_id o null; prioridad: 1 o 0.
  function rolRowHtml(selected, prioridad) {
    const rolOpts = buildOptions(
      lookups.roles,
      "id",
      "nombre",
      "Seleccione un rol",
    );
    // id único por fila → agrupa los dos radios con el mismo `name`
    // y permite que el `<label for="…">` cliquee el input.
    const gid =
      "g_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const priId = `pri_${gid}`;
    const comId = `com_${gid}`;
    return `
      <tr class="js-rol-row">
        <td>
          <select class="form-select form-select-sm js-rol-id">
            ${rolOpts}
          </select>
        </td>
        <td class="text-center">
          <div class="btn-group btn-group-sm" role="group" aria-label="Prioridad">
            <input type="radio" class="btn-check js-rol-prio" name="prio_${gid}" id="${priId}" value="1" autocomplete="off" ${prioridad === 1 ? "checked" : ""} />
            <label class="btn btn-sm btn-outline-primary" for="${priId}" title="Primaria">Primaria</label>

            <input type="radio" class="btn-check js-rol-prio" name="prio_${gid}" id="${comId}" value="0" autocomplete="off" ${prioridad === 0 ? "checked" : ""} />
            <label class="btn btn-sm btn-outline-secondary" for="${comId}" title="Complementaria">Complementaria</label>
          </div>
        </td>
        <td class="text-center">
          <button type="button" class="btn btn-sm btn-outline-danger js-rol-remove" title="Quitar">
            <i class="ti ti-x"></i>
          </button>
        </td>
      </tr>
    `;
  }

  function refreshEmptyRolesRow() {
    const $rows = $("#roles-tarea-body .js-rol-row");
    $(".js-empty-roles").toggle($rows.length === 0);
  }

  function addRolRow(rolId, prioridad) {
    $("#roles-tarea-body .js-empty-roles").hide();
    const $row = $(rolRowHtml(rolId, prioridad));
    if (rolId) $row.find(".js-rol-id").val(String(rolId));
    $("#roles-tarea-body").append($row);
    refreshEmptyRolesRow();
  }

  function collectRoles() {
    const items = [];
    const seen = new Set();
    $("#roles-tarea-body .js-rol-row").each(function () {
      const $row = $(this);
      const rolId = Number($row.find(".js-rol-id").val());
      if (!rolId) return;
      if (seen.has(rolId)) return; // dedupe
      seen.add(rolId);
      const prio = $row.find(".js-rol-prio:checked").val();
      items.push({
        rol_id: rolId,
        prioridad: prio === "1" ? 1 : 0,
      });
    });
    return items;
  }

  function setFormFromTarea(t) {
    const $form = $("#form-tarea");
    $form.find('[name="nombre"]').val(t.nombre || "");

    // horas_estimadas viene en MINUTOS desde la BD → partir en h y m
    const totalMin = t.horas_estimadas != null ? Number(t.horas_estimadas) : 0;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    $form.find('[name="horas"]').val(h > 0 ? h : "");
    $form.find('[name="minutos"]').val(m > 0 ? m : "");

    $form
      .find('[name="tipo_tarea_id"]')
      .val(t.tipo_tarea_id != null ? String(t.tipo_tarea_id) : "");

    $form
      .find('[name="aplica_en_ventas"]')
      .prop("checked", t.aplica_en_ventas !== false);
    $form
      .find('[name="aplica_en_proyecto"]')
      .prop("checked", t.aplica_en_proyecto !== false);

    $("#roles-tarea-body").empty();
    if (Array.isArray(t.roles) && t.roles.length) {
      t.roles.forEach((r) => addRolRow(r.rol_id, r.prioridad));
    } else {
      refreshEmptyRolesRow();
    }
  }

  function serializeForm() {
    const data = {};
    $("#form-tarea")
      .serializeArray()
      .forEach(({ name, value }) => {
        if (value === "" || value == null) return;
        data[name] = value;
      });
    // Combinar horas + minutos en un solo campo (en MINUTOS)
    const h = Number(data.horas) || 0;
    const m = Number(data.minutos) || 0;
    delete data.horas;
    delete data.minutos;
    data.horas_estimadas = h * 60 + m;

    // Los checkboxes no aparecen en serializeArray si están desmarcados.
    // Forzamos a booleano leyendo directo del DOM.
    data.aplica_en_ventas = $("#form-tarea [name='aplica_en_ventas']").is(
      ":checked",
    );
    data.aplica_en_proyecto = $("#form-tarea [name='aplica_en_proyecto']").is(
      ":checked",
    );

    data.roles = collectRoles();
    return data;
  }

  // ---- Modal ---------------------------------------------------------

  function openCreateModal() {
    editingId = null;
    $modalTitle.text("Nueva Tarea");
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
      $modalTitle.text(`Editar Tarea #${id}`);
      $modalBody.html(formHtml());
      setFormFromTarea(json.data);
      $btnGuardar.text("Actualizar").prop("disabled", false);
      bsModal.show();
    } catch (err) {
      showToast(err.message || "No se pudo cargar la tarea.", "error");
    }
  }

  async function submitForm() {
    const data = serializeForm();
    if (!data.nombre) {
      showToast("El nombre es obligatorio.", "error");
      $("#form-tarea [name='nombre']").focus();
      return;
    }
    if (!data.aplica_en_ventas && !data.aplica_en_proyecto) {
      showToast("Marca al menos un contexto: Venta o Proyecto.", "error");
      $("#form-tarea [name='aplica_en_ventas']").focus();
      return;
    }
    if (!data.roles || data.roles.length === 0) {
      showToast("Asigna al menos un rol a la tarea.", "error");
      return;
    }
    // Validar que cada rol tenga prioridad elegida
    const sinPrio = data.roles.some(
      (r) => r.prioridad !== 0 && r.prioridad !== 1,
    );
    if (sinPrio) {
      showToast(
        "Selecciona prioridad (Primaria/Complementaria) para todos los roles.",
        "error",
      );
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
      $("#table-tareas").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $btnGuardar
        .prop("disabled", false)
        .text(editingId ? "Actualizar" : "Crear");
    }
  }

  async function deleteTarea(id, nombre) {
    const ok = await confirmar({
      titulo: "¿Desactivar tarea?",
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
      showToast(json.message || "Tarea desactivada.");
      $("#table-tareas").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al desactivar.", "error");
    }
  }

  // ---- Inicialización ------------------------------------------------

  async function loadLookups() {
    const res = await fetch(`${API_BASE}/lookups`);
    const json = await res.json();
    if (!res.ok || !json.success)
      throw new Error("No se pudieron cargar los catálogos.");
    lookups = json.data;
  }

  // Render de badges: lista de strings → badges.
  function renderRolesCell(names, variant) {
    if (!names || !names.length) {
      return '<span class="text-muted small">—</span>';
    }
    return names
      .map(
        (n) =>
          `<span class="badge ${variant} me-1 mb-1">${escapeHtml(n)}</span>`,
      )
      .join("");
  }

  // Convierte minutos a "Xh Ym" / "Xh" / "Ym"
  function formatMinutos(min) {
    if (min == null || min === "") {
      return '<span class="text-muted small">—</span>';
    }
    const total = Number(min);
    if (Number.isNaN(total)) return '<span class="text-muted small">—</span>';
    if (total === 0) return '<span class="text-muted small">—</span>';
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h > 0 && m > 0) return `${h} h ${m} min`;
    if (h > 0) return `${h} h`;
    return `${m} min`;
  }

  const table = $("#table-tareas").DataTable({
    language: window.DATATABLES_ES_CONFIG,
    ajax: {
      url: `${API_BASE}`,
      dataSrc: "data",
    },
    columns: [
      {
        // Numeración correlativa (#) — refleja el orden actual de la tabla
        // (respeta filtros, paginación y orden).
        data: "id",
        orderable: false,
        searchable: false,
        className: "text-center",
        render: function (_d, _t, _row, meta) {
          return meta.row + meta.settings._iDisplayStart + 1;
        },
      },
      { data: "nombre", defaultContent: '<span class="text-muted">—</span>' },
      {
        data: null,
        render: function (_d, _t, row) {
          if (!row.tipo_tarea) {
            return '<span class="text-muted small">Sin tipo</span>';
          }
          const color = row.tipo_tarea.color || "#6c757d";
          const tipo = row.tipo_tarea.tipo || "—";
          return `<span class="badge" style="background-color:${escapeHtml(color)}; color:#fff;">${escapeHtml(tipo)}</span>`;
        },
      },
      {
        data: "horas_estimadas",
        defaultContent: '<span class="text-muted small">—</span>',
        className: "text-center",
        render: function (d) {
          return formatMinutos(d);
        },
      },
      {
        data: "aplica_en_ventas",
        className: "text-center",
        render: function (v) {
          return v
            ? '<i class="ti ti-check fs-4 text-success" title="Aplica en Venta"></i>'
            : '<i class="ti ti-x fs-4 text-muted" title="No aplica en Venta"></i>';
        },
      },
      {
        data: "aplica_en_proyecto",
        className: "text-center",
        render: function (v) {
          return v
            ? '<i class="ti ti-check fs-4 text-success" title="Aplica en Proyecto"></i>'
            : '<i class="ti ti-x fs-4 text-muted" title="No aplica en Proyecto"></i>';
        },
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        render: function (_d, _t, row) {
          if (!row.roles || !row.roles.length) {
            return '<span class="text-muted small">—</span>';
          }
          return row.roles
            .map((r) => {
              const isPri = Number(r.prioridad) === 1;
              const color = isPri ? "bg-primary" : "bg-secondary";
              const tag = isPri ? "P" : "C";
              const tooltip = isPri ? "Primaria" : "Complementaria";
              return `<span class="badge ${color} me-1 mb-1" title="${tooltip}">
                ${escapeHtml(r.rol_nombre || "—")} <span class="opacity-75">· ${tag}</span>
              </span>`;
            })
            .join("");
        },
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: "text-center",
        render: function (_d, _t, row) {
          const nombre = row.nombre || `tarea #${row.id}`;
          return `
            <i class="ti ti-edit fs-4 text-info btn-edit" style="cursor: pointer;" title="Editar" data-id="${row.id}"></i>
            <i class="ti ti-trash fs-4 text-danger btn-delete" style="cursor: pointer; margin-left: 6px;" title="Eliminar" data-id="${row.id}" data-nombre="${escapeHtml(nombre)}"></i>
          `;
        },
      },
    ],
  });

  // ---- Eventos -------------------------------------------------------

  $("#btn-nueva-tarea").on("click", openCreateModal);
  $btnGuardar.on("click", submitForm);

  // Eventos delegados del modal (form se reinyecta en cada apertura)
  $modalBody.on("click", "#btn-add-rol", function () {
    addRolRow(null, 1);
  });
  $modalBody.on("click", ".js-rol-remove", function () {
    $(this).closest("tr").remove();
    refreshEmptyRolesRow();
  });

  $("#table-tareas").on("click", ".btn-edit", function () {
    openEditModal(Number($(this).data("id")));
  });
  $("#table-tareas").on("click", ".btn-delete", function () {
    const id = Number($(this).data("id"));
    const nombre = $(this).data("nombre");
    deleteTarea(id, nombre);
  });

  // Limpia el body al cerrar y quita modal-lg
  $modal.on("hidden.bs.modal", function () {
    $modalBody.empty();
    $modalDialog.removeClass(MODAL_LG_CLASSES);
    editingId = null;
  });
  $modal.on("show.bs.modal", function () {
    $modalDialog.addClass(MODAL_LG_CLASSES);
  });

  loadLookups().catch((err) =>
    showToast(err.message || "Error cargando catálogos.", "error"),
  );
});
