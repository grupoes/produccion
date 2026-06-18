/* global $, bootstrap, Swal, lucide */
$(function () {
  const API = "/api/permisos";
  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
  });
  const showToast = (msg, type = "success") =>
    Toast.fire({ icon: type, title: msg });

  const confirmar = ({ titulo, texto, confirmText = "Sí, guardar", icon = "warning" } = {}) =>
    Swal.fire({
      title: titulo,
      text: texto,
      icon,
      showCancelButton: true,
      confirmButtonText: confirmText,
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#6c757d",
      reverseButtons: true,
      focusCancel: true,
    }).then((r) => r.isConfirmed);

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Estado en memoria
  let selectedRolId = null;
  let modulosTree = null; // { padres: [...], sueltos: [...] }
  let checks = {}; // { "moduloId-accionId": true }
  let initialChecks = {}; // para detectar cambios
  let editingRolId = null; // null = creando, número = editando

  // Modal estándar (declarado en layout.ejs)
  const $modal = $("#standard-modal");
  const $modalTitle = $modal.find("#standard-modalLabel");
  const $modalBody = $modal.find(".modal-body");
  const $modalGuardar = $modal.find(".modal-footer .btn-primary");
  const bsModal = new bootstrap.Modal($modal[0]);

  // ---- Render ---------------------------------------------------------

  function renderRoles(roles) {
    const $list = $("#roles-list");
    if (!roles || !roles.length) {
      $list.html(
        '<div class="text-center text-muted py-4">No hay roles activos.</div>',
      );
      return;
    }
    $list.html(
      roles
        .map(
          (r) => `
        <div class="list-group-item d-flex align-items-center justify-content-between rol-item px-3"
             data-rol-id="${r.id}"
             data-rol-nombre="${escapeHtml(r.nombre)}">
          <button type="button"
                  class="rol-select flex-grow-1 text-start d-flex align-items-center bg-transparent border-0 p-0">
            <i data-lucide="user-cog" class="me-2 align-middle text-secondary"></i>
            <span class="rol-nombre-text text-body">${escapeHtml(r.nombre)}</span>
          </button>
          <div class="dropdown">
            <button type="button"
                    class="btn btn-sm btn-link text-secondary p-1 rol-more"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                    title="Más opciones">
              <i data-lucide="more-vertical"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <button type="button" class="dropdown-item rol-edit"
                        data-rol-id="${r.id}" data-rol-nombre="${escapeHtml(r.nombre)}">
                  <i data-lucide="pencil" class="me-1 align-middle"></i> Editar
                </button>
              </li>
              <li><hr class="dropdown-divider"></li>
              <li>
                <button type="button" class="dropdown-item text-danger rol-delete"
                        data-rol-id="${r.id}" data-rol-nombre="${escapeHtml(r.nombre)}">
                  <i data-lucide="trash-2" class="me-1 align-middle"></i> Eliminar
                </button>
              </li>
            </ul>
          </div>
        </div>`,
        )
        .join(""),
    );
    lucide.createIcons();
  }

  function openNuevoRolModal() {
    editingRolId = null;
    $modalTitle.text("Nuevo rol");
    $modalBody.html(`
      <div class="mb-3">
        <label class="form-label" for="rol-nombre">Nombre del rol</label>
        <input type="text" id="rol-nombre" class="form-control" maxlength="50" autocomplete="off" />
        <div class="form-text">Máximo 50 caracteres.</div>
      </div>
    `);
    $modalGuardar.text("Crear").prop("disabled", false);
    bsModal.show();
    setTimeout(() => $("#rol-nombre").trigger("focus"), 200);
  }

  async function openEditRolModal(rolId) {
    try {
      const res = await fetch(`${API}/roles/${rolId}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error al cargar el rol.");
      const rol = json.data;
      editingRolId = rol.id;
      $modalTitle.text(`Editar rol: ${rol.nombre}`);
      $modalBody.html(`
        <div class="mb-3">
          <label class="form-label" for="rol-nombre">Nombre del rol</label>
          <input type="text" id="rol-nombre" class="form-control" maxlength="50" value="${escapeHtml(rol.nombre)}" autocomplete="off" />
          <div class="form-text">Máximo 50 caracteres.</div>
        </div>
      `);
      $modalGuardar.text("Guardar cambios").prop("disabled", false);
      bsModal.show();
      setTimeout(() => {
        const $inp = $("#rol-nombre");
        $inp.trigger("focus").val(rol.nombre);
      }, 200);
    } catch (err) {
      showToast(err.message || "Error al cargar el rol.", "error");
    }
  }

  async function submitRolForm() {
    const nombre = ($("#rol-nombre").val() || "").trim();
    if (!nombre) {
      showToast("El nombre del rol es obligatorio.", "warning");
      $("#rol-nombre").trigger("focus");
      return;
    }
    $modalGuardar.prop("disabled", true).text("Guardando...");
    try {
      const isEdit = editingRolId != null;
      const url = isEdit ? `${API}/roles/${editingRolId}` : `${API}/roles`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error al guardar el rol.");
      showToast(json.message || "Rol guardado.");
      bsModal.hide();
      await loadRoles();
      // Si editamos el rol actualmente seleccionado, refrescar título
      if (isEdit && editingRolId === selectedRolId) {
        const nuevoNombre = json.data && json.data.nombre ? json.data.nombre : nombre;
        $("#permisos-titulo").text(`Permisos: ${nuevoNombre}`);
      }
      // Si creamos un rol nuevo, lo dejamos listo para que se le asignen permisos al hacer click
    } catch (err) {
      showToast(err.message || "Error al guardar el rol.", "error");
      $modalGuardar.prop("disabled", false).text(editingRolId ? "Guardar cambios" : "Crear");
    }
  }

  async function eliminarRol(rolId, rolNombre) {
    if (rolId === selectedRolId) {
      showToast("No puedes eliminar el rol que estás editando.", "warning");
      return;
    }
    const ok = await confirmar({
      titulo: `¿Eliminar rol "${rolNombre}"?`,
      texto: "Esta acción es lógica: el rol se marcará como inactivo.",
      confirmText: "Sí, eliminar",
      icon: "warning",
    });
    if (!ok) return;
    try {
      const res = await fetch(`${API}/roles/${rolId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error al eliminar el rol.");
      showToast(json.message || "Rol eliminado.");
      await loadRoles();
    } catch (err) {
      showToast(err.message || "Error al eliminar el rol.", "error");
    }
  }

  // Busca el id de la acción "Ver" (o equivalente) para un módulo.
  // Devuelve null si el módulo no tiene una acción de tipo lectura.
  const VER_NAMES = ["ver", "listar", "consultar", "read", "view", "visualizar"];
  function getVerAccionId(modulo) {
    if (!modulo || !Array.isArray(modulo.acciones)) return null;
    const ver = modulo.acciones.find((a) =>
      VER_NAMES.includes((a.nombre || "").trim().toLowerCase()),
    );
    return ver ? ver.id : null;
  }

  function renderModulos(tree, currentChecks) {
    const $body = $("#permisos-body");
    if (!tree) {
      $body.html(
        '<div class="text-center text-muted py-4">No hay módulos configurados.</div>',
      );
      return;
    }
    const isChecked = (modId, accId) =>
      currentChecks[`${modId}-${accId}`] === true;

    // Renderiza una fila de módulo: "Ver" al lado del nombre, otras acciones a la derecha.
    // Si "Ver" no está marcado, las otras acciones quedan disabled.
    const renderModuloRow = (m) => {
      const verId = getVerAccionId(m);
      const verChecked = verId ? isChecked(m.id, verId) : false;
      const otras = (m.acciones || []).filter((a) => a.id !== verId);
      const otrasDisabled = verId != null && !verChecked;

      const verHtml = verId
        ? `<label class="form-check d-inline-flex align-items-center mb-0">
             <input type="checkbox" class="form-check-input ver-check me-2"
                    data-modulo-id="${m.id}" data-accion-id="${verId}"
                    ${verChecked ? "checked" : ""} />
             <span class="form-check-label fw-semibold">${escapeHtml(m.nombre)}</span>
           </label>`
        : `<span class="fw-semibold">${escapeHtml(m.nombre)}</span>`;

      const otrasHtml = otras.length
        ? otras
            .map(
              (a) => `
            <label class="form-check form-check-inline mb-0 me-3">
              <input type="checkbox" class="form-check-input permiso-check"
                     data-modulo-id="${m.id}" data-accion-id="${a.id}"
                     ${isChecked(m.id, a.id) ? "checked" : ""}
                     ${otrasDisabled ? "disabled" : ""} />
              <span class="form-check-label">${escapeHtml(a.nombre)}</span>
            </label>`,
            )
            .join("")
        : '<span class="text-muted small">Sin acciones adicionales</span>';

      return `
        <div class="d-flex align-items-start py-2 permiso-row" data-modulo-id="${m.id}">
          <div class="permiso-nombre" style="min-width: 240px;">
            ${verHtml}
            ${m.url ? `<div class="text-muted small ms-4 ps-1">${escapeHtml(m.url)}</div>` : ""}
          </div>
          <div class="flex-grow-1 d-flex flex-wrap align-items-center gap-1 permiso-otras">
            <span class="text-muted small me-2">Acciones:</span>
            ${otrasHtml}
          </div>
        </div>`;
    };

    let html = "";
    if (tree.padres && tree.padres.length) {
      tree.padres.forEach((p) => {
        const tieneHijos = p.hijos && p.hijos.length;
        const tieneAccionesPropias = p.acciones && p.acciones.length;
        html += `<div class="permiso-grupo mb-3">`;
        html += `<div class="permiso-grupo-header d-flex align-items-center mb-1">
                    <i data-lucide="${escapeHtml(p.icono || "folder")}" class="me-1"></i>
                    <strong>${escapeHtml(p.nombre)}</strong>
                  </div>`;
        if (tieneAccionesPropias) {
          html += `<div class="permiso-grupo-body ps-3">${renderModuloRow({ id: p.id, nombre: p.nombre, url: p.url, acciones: p.acciones })}</div>`;
        }
        if (tieneHijos) {
          html += `<div class="permiso-grupo-body ps-3">`;
          p.hijos.forEach((h) => {
            html += renderModuloRow(h);
          });
          html += `</div>`;
        }
        if (!tieneHijos && !tieneAccionesPropias) {
          html += `<div class="permiso-grupo-body ps-3 text-muted small">Sin acciones configuradas</div>`;
        }
        html += `</div>`;
      });
    }
    if (tree.sueltos && tree.sueltos.length) {
      html += `<div class="permiso-grupo mb-3">`;
      tree.sueltos.forEach((m) => {
        html += renderModuloRow(m);
      });
      html += `</div>`;
    }
    $body.html(html || '<div class="text-center text-muted py-4">No hay módulos para mostrar.</div>');
    lucide.createIcons();
  }

  function markSelectedRol() {
    $(".rol-item").removeClass("active");
    if (selectedRolId != null) {
      $(`.rol-item[data-rol-id="${selectedRolId}"]`).addClass("active");
    }
  }

  function setDirty(isDirty) {
    $("#permisos-dirty").toggle(isDirty);
    $("#btn-save-permisos").prop("disabled", !isDirty || selectedRolId == null);
  }

  // ---- Cargas iniciales ------------------------------------------------

  async function loadRoles() {
    const res = await fetch(`${API}/roles`);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || "Error al cargar roles.");
    renderRoles(json.data);
  }

  async function loadModulos() {
    const res = await fetch(`${API}/modulos`);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || "Error al cargar módulos.");
    modulosTree = json.data;
  }

  async function selectRol(rolId, rolNombre) {
    selectedRolId = Number(rolId);
    markSelectedRol();
    $("#permisos-titulo").text(`Permisos: ${rolNombre}`);
    $("#permisos-subtitulo").text("Marca las acciones permitidas para cada módulo.");

    const res = await fetch(`${API}/rol/${rolId}`);
    const json = await res.json();
    if (!res.ok || !json.success) {
      showToast(json.error || "Error al cargar permisos.", "error");
      return;
    }
    const savedChecks = json.data.checks || {};
    const savedItems = json.data.items || [];

    // Si el rol aún no tiene permisos guardados, marcamos "Ver" por defecto
    // en cada módulo que tenga esa acción. Si ya tiene permisos, respetamos
    // lo que el admin haya definido antes.
    checks = { ...savedChecks };
    if (!savedItems.length) {
      const applyVer = (modulo) => {
        const verId = getVerAccionId(modulo);
        if (verId) checks[`${modulo.id}-${verId}`] = true;
      };
      (modulosTree.padres || []).forEach((p) => {
        applyVer(p);
        (p.hijos || []).forEach(applyVer);
      });
      (modulosTree.sueltos || []).forEach(applyVer);
    }

    initialChecks = JSON.parse(JSON.stringify(checks));
    renderModulos(modulosTree, checks);
    setDirty(false);
  }

  async function savePermisos() {
    if (selectedRolId == null) return;
    const items = Object.keys(checks)
      .filter((k) => checks[k])
      .map((k) => {
        const [modulo_id, accion_id] = k.split("-").map(Number);
        return { modulo_id, accion_id };
      });
    const ok = await confirmar({
      titulo: "¿Guardar permisos?",
      texto: `Se reemplazarán los permisos actuales del rol por los marcados.`,
      confirmText: "Sí, guardar",
      icon: "warning",
    });
    if (!ok) return;

    try {
      $("#btn-save-permisos").prop("disabled", true).text("Guardando...");
      const res = await fetch(`${API}/rol/${selectedRolId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permisos: items }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error al guardar.");
      showToast(json.message || "Permisos guardados.");
      initialChecks = JSON.parse(JSON.stringify(checks));
      setDirty(false);
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $("#btn-save-permisos").prop("disabled", false).html(
        '<i class="ti ti-device-floppy align-middle me-1"></i> Guardar',
      );
    }
  }

  // ---- Eventos ---------------------------------------------------------

  // Click en el nombre/área seleccionable del rol
  $("#roles-list").on("click", ".rol-select", function (e) {
    e.preventDefault();
    e.stopPropagation();
    const $item = $(this).closest(".rol-item");
    const id = Number($item.data("rol-id"));
    if (id === selectedRolId) return;
    const nombre = $item.data("rol-nombre");
    // Si hay cambios sin guardar, avisar
    const isDirty = JSON.stringify(checks) !== JSON.stringify(initialChecks);
    if (isDirty) {
      Swal.fire({
        title: "Cambios sin guardar",
        text: "Tienes cambios sin guardar en el rol actual. ¿Descartarlos?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, descartar",
        cancelButtonText: "Cancelar",
        reverseButtons: true,
        focusCancel: true,
      }).then((r) => {
        if (r.isConfirmed) selectRol(id, nombre);
      });
    } else {
      selectRol(id, nombre);
    }
  });

  // Botón "+ Nuevo" rol
  $("#btn-nuevo-rol").on("click", openNuevoRolModal);

  // Editar / Eliminar desde el dropdown
  $("#roles-list").on("click", ".rol-edit", function (e) {
    e.stopPropagation();
    const id = Number($(this).data("rol-id"));
    openEditRolModal(id);
  });
  $("#roles-list").on("click", ".rol-delete", function (e) {
    e.stopPropagation();
    const id = Number($(this).data("rol-id"));
    const nombre = $(this).data("rol-nombre");
    eliminarRol(id, nombre);
  });

  // Modal: Guardar crea/edita el rol
  $modalGuardar.on("click", submitRolForm);
  $modal.on("hidden.bs.modal", function () {
    editingRolId = null;
    $modalBody.empty();
    $modalGuardar.prop("disabled", false).text("Guardar");
  });

  // Cambia una acción distinta de "Ver"
  $("#permisos-body").on("change", ".permiso-check", function () {
    const $cb = $(this);
    const key = `${$cb.data("modulo-id")}-${$cb.data("accion-id")}`;
    if ($cb.is(":checked")) checks[key] = true;
    else delete checks[key];

    setDirty(JSON.stringify(checks) !== JSON.stringify(initialChecks));
  });

  // Cambia el "Ver" de un módulo: gate de las demás acciones de ese módulo.
  // - Si se marca: habilita los otros checks (sin alterarlos).
  // - Si se desmarca: deshabilita y desmarca los otros checks del mismo módulo.
  $("#permisos-body").on("change", ".ver-check", function () {
    const $ver = $(this);
    const moduloId = $ver.data("modulo-id");
    const verKey = `${moduloId}-${$ver.data("accion-id")}`;

    if ($ver.is(":checked")) {
      checks[verKey] = true;
      $(`.permiso-check[data-modulo-id="${moduloId}"]`)
        .prop("disabled", false)
        .closest("label")
        .css("opacity", 1);
    } else {
      delete checks[verKey];
      $(`.permiso-check[data-modulo-id="${moduloId}"]`)
        .prop("checked", false)
        .prop("disabled", true)
        .closest("label")
        .css("opacity", 0.5);
      // Limpiar del mapa cualquier otra acción de este módulo
      Object.keys(checks).forEach((k) => {
        if (k.startsWith(`${moduloId}-`)) delete checks[k];
      });
    }

    setDirty(JSON.stringify(checks) !== JSON.stringify(initialChecks));
  });

  $("#btn-save-permisos").on("click", savePermisos);

  // ---- Boot -----------------------------------------------------------

  (async function init() {
    try {
      await Promise.all([loadRoles(), loadModulos()]);
    } catch (err) {
      showToast(err.message || "Error al inicializar.", "error");
    }
  })();
});
