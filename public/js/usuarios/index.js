/* global $, bootstrap, Swal */
$(function () {
  const API_BASE = "/api/usuarios";
  const $modal = $("#standard-modal");
  const $modalDialog = $modal.find(".modal-dialog");
  const $modalTitle = $modal.find("#standard-modalLabel");
  const $modalBody = $modal.find(".modal-body");
  const $btnGuardar = $modal.find(".modal-footer .btn-primary");
  const bsModal = new bootstrap.Modal($modal[0]);

  // Solo en esta vista queremos el modal "large" con scroll interno.
  // Se aplica al abrir y se quita al cerrar para no afectar a otros módulos
  // que también reusen #standard-modal del layout.
  const MODAL_LG_CLASSES = "modal-lg modal-dialog-scrollable";

  // Estado de la edición actual
  let editingId = null;
  let lookups = { roles: [], tipoDocumento: [], tipoJornada: [] };

  // ---- Helpers ---------------------------------------------------------

  // Notificaciones tipo toast (esquina superior derecha)
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

  // Diálogo de confirmación con SweetAlert2
  function confirmar({ titulo, texto, confirmText = "Sí", cancelText = "Cancelar", icon = "warning" } = {}) {
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

  function buildOptions(items, valueKey, labelKey, placeholder) {
    const opts = [`<option value="">${placeholder}</option>`];
    items.forEach((it) => {
      opts.push(
        `<option value="${it[valueKey]}">${escapeHtml(it[labelKey])}</option>`,
      );
    });
    return opts.join("");
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

  function formHtml(usuario) {
    const p = (usuario && usuario.personas) || {};
    const rolOpts = buildOptions(
      lookups.roles,
      "id",
      "nombre",
      "Seleccione un rol",
    );
    const tdOpts = buildOptions(
      lookups.tipoDocumento,
      "id",
      "nombre",
      "Seleccione tipo doc.",
    );
    const tjOpts = buildOptions(
      lookups.tipoJornada,
      "id",
      "nombre_jornada",
      "Seleccione jornada",
    );
    const initialUsuario = usuario ? usuario.usuario : "";

    return `
      <form id="form-usuario" novalidate>
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label">Tipo documento</label>
            <select class="form-select" id="select-tipo-documento" name="persona.tipoDocumento_id">
              ${tdOpts}
            </select>
          </div>
          <div class="col-md-5">
            <label class="form-label">N° documento</label>
            <div class="input-group">
              <input type="text" id="input-numero-documento" class="form-control" name="persona.numero_documento" value="${escapeHtml(p.numero_documento)}" maxlength="12" />
              <button type="button" id="btn-buscar-documento" class="btn btn-outline-primary" style="display: none;" title="Buscar en RENIEC/SUNAT">
                <i class="ti ti-search"></i> Buscar
              </button>
            </div>
            <small class="text-muted" id="search-hint">Seleccione un tipo de documento para poder buscar.</small>
          </div>
          <div class="col-md-3">
            <label class="form-label">Celular</label>
            <input type="text" class="form-control" name="persona.celular" value="${escapeHtml(p.celular)}" maxlength="15" />
          </div>

          <div class="col-md-6">
            <label class="form-label">Nombres <span class="text-danger">*</span></label>
            <input type="text" id="input-nombres" class="form-control" name="persona.nombres" value="${escapeHtml(p.nombres)}" required maxlength="50" />
          </div>
          <div class="col-md-6">
            <label class="form-label">Apellidos</label>
            <input type="text" id="input-apellidos" class="form-control" name="persona.apellidos" value="${escapeHtml(p.apellidos)}" maxlength="50" />
          </div>

          <div class="col-md-6">
            <label class="form-label">Correo <span class="text-danger">*</span></label>
            <input type="email" id="input-email" class="form-control" name="persona.email" value="${escapeHtml(p.email)}" required maxlength="50" />
            <small class="text-muted">Se usará como usuario de inicio de sesión.</small>
          </div>
          <div class="col-md-3">
            <label class="form-label">Fecha nacimiento</label>
            <input type="date" class="form-control" name="persona.fecha_nacimiento" value="${escapeHtml(p.fecha_nacimiento ? p.fecha_nacimiento.substring(0, 10) : "")}" />
          </div>
          <div class="col-md-3">
            <label class="form-label">Usuario (correo)</label>
            <input type="text" id="input-usuario" class="form-control" name="usuario" value="${escapeHtml(initialUsuario)}" readonly tabindex="-1" style="background-color: #e9ecef;" />
          </div>

          <div class="col-md-12">
            <label class="form-label">Dirección</label>
            <input type="text" class="form-control" name="persona.direccion" value="${escapeHtml(p.direccion)}" maxlength="100" />
          </div>

          <hr class="my-2" />

          <div class="col-md-4">
            <label class="form-label">Clave <span class="text-danger" id="clave-required-mark">*</span></label>
            <input type="password" class="form-control" name="clave" maxlength="50" placeholder="${editingId ? "Dejar vacío para no cambiar" : ""}" />
            <small class="text-muted" id="clave-hint"></small>
          </div>
          <div class="col-md-4">
            <label class="form-label">Rol</label>
            <select class="form-select" name="rol_id">${rolOpts}</select>
          </div>

          <div class="col-md-4">
            <label class="form-label">Tipo de jornada</label>
            <select class="form-select" id="select-tipo-jornada" name="tipo_jornada_id">${tjOpts}</select>
          </div>
        </div>

        <div id="horario-section" class="mt-3" style="display: none;">
          <hr class="my-3" />
          <div class="d-flex align-items-center justify-content-between mb-2">
            <h6 class="text-uppercase text-muted fs-xxs mb-0">Horario de Jornada</h6>
            <small class="text-muted">Marca los turnos que aplican para este usuario.</small>
          </div>

          <div class="table-responsive">
            <table class="table table-borderless align-middle mb-0 horario-jornada">
              <thead>
                <tr class="text-uppercase fs-xxs text-muted">
                  <th class="text-muted" style="width: 12%;">Día</th>
                  <th colspan="3" class="text-center text-muted" style="width: 44%;">Turno Mañana</th>
                  <th colspan="3" class="text-center text-muted" style="width: 44%;">Turno Tarde</th>
                </tr>
                <tr class="text-uppercase fs-xxs text-muted">
                  <th></th>
                  <th class="text-center">Habilitar</th>
                  <th class="text-center">Inicio</th>
                  <th class="text-center">Salida</th>
                  <th class="text-center">Habilitar</th>
                  <th class="text-center">Inicio</th>
                  <th class="text-center">Salida</th>
                </tr>
              </thead>
              <tbody>
                ${horarioGridHtml()}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    `;
  }

  // Días: 1=Lunes ... 6=Sábado
  const DIAS = [
    { id: 1, nombre: "Lunes" },
    { id: 2, nombre: "Martes" },
    { id: 3, nombre: "Miércoles" },
    { id: 4, nombre: "Jueves" },
    { id: 5, nombre: "Viernes" },
    { id: 6, nombre: "Sábado" },
  ];

  // Defaults según la imagen
  const DEFAULT_TURNOS = {
    1: { habilitado: true, inicio: "08:00", fin: "13:00" },
    2: { habilitado: true, inicio: "15:00", fin: "19:00" },
  };

  function horarioGridHtml() {
    return DIAS.map((d) => `
      <tr>
        <td class="fw-semibold">${d.nombre}</td>
        <td class="text-center">
          <input type="checkbox" class="form-check-input js-horario-hab" data-dia="${d.id}" data-turno="1" />
        </td>
        <td>
          <input type="time" class="form-control form-control-sm js-horario-inicio" data-dia="${d.id}" data-turno="1" value="${DEFAULT_TURNOS[1].inicio}" />
        </td>
        <td>
          <input type="time" class="form-control form-control-sm js-horario-fin" data-dia="${d.id}" data-turno="1" value="${DEFAULT_TURNOS[1].fin}" />
        </td>
        <td class="text-center">
          <input type="checkbox" class="form-check-input js-horario-hab" data-dia="${d.id}" data-turno="2" />
        </td>
        <td>
          <input type="time" class="form-control form-control-sm js-horario-inicio" data-dia="${d.id}" data-turno="2" value="${DEFAULT_TURNOS[2].inicio}" />
        </td>
        <td>
          <input type="time" class="form-control form-control-sm js-horario-fin" data-dia="${d.id}" data-turno="2" value="${DEFAULT_TURNOS[2].fin}" />
        </td>
      </tr>
    `).join("");
  }

  function syncUsuarioFromEmail() {
    const email = $("#input-email").val().trim();
    $("#input-usuario").val(email);
  }

  // Por defecto el tipo de documento es "DOCUMENTO DE IDENTIDAD NACIONAL"
  // (DNI). Solo se aplica si el select aún no tiene valor (caso crear).
  // En editar, se respeta el valor previamente guardado.
  function applyTipoDocumentoDefault() {
    const $select = $("#select-tipo-documento");
    if (!$select.length) return;
    if ($select.val()) {
      toggleBuscarDocumento();
      return;
    }
    let matchId = null;
    $select.find("option").each(function () {
      const text = $(this).text().trim().toLowerCase();
      if (
        text === "documento de identidad nacional" ||
        text === "dni" ||
        text.includes("documento de identidad nacional")
      ) {
        matchId = $(this).val();
        return false;
      }
    });
    if (matchId) $select.val(matchId);
    toggleBuscarDocumento();
  }

  function toggleBuscarDocumento() {
    const hasValue = !!$("#select-tipo-documento").val();
    $("#btn-buscar-documento").toggle(hasValue);
    $("#search-hint").text(
      hasValue
        ? "Solo DNI/RUC. Si encuentra datos, se autocompletarán."
        : "Seleccione un tipo de documento para poder buscar.",
    );
  }

  // Jornada: muestra/oculta la grilla de horario cuando el tipo es
  // Full Time o Part Time (case-insensitive sobre el texto de la opción).
  function toggleHorarioSection() {
    const $select = $("#select-tipo-jornada");
    if (!$select.length) return;
    const text = $select.find("option:selected").text().trim().toLowerCase();
    const show = text === "full time" || text === "part time";
    $("#horario-section").toggle(show);
  }

  // Habilita/deshabilita los inputs de inicio/fin de un turno según su checkbox
  function applyHorarioRowState(dia, turno) {
    const $hab = $(`.js-horario-hab[data-dia="${dia}"][data-turno="${turno}"]`);
    const $inicio = $(`.js-horario-inicio[data-dia="${dia}"][data-turno="${turno}"]`);
    const $fin = $(`.js-horario-fin[data-dia="${dia}"][data-turno="${turno}"]`);
    const checked = $hab.is(":checked");
    $inicio.prop("disabled", !checked);
    $fin.prop("disabled", !checked);
    $inicio.css("opacity", checked ? 1 : 0.5);
    $fin.css("opacity", checked ? 1 : 0.5);
  }

  // Aplica los defaults visuales: Lunes-Vie habilitado en ambos turnos;
  // Sábado solo turno mañana.
  function applyHorarioDefaults() {
    DIAS.forEach((d) => {
      const mananaEnabled = d.id <= 5; // 1-5 = L-V
      $(`.js-horario-hab[data-dia="${d.id}"][data-turno="1"]`)
        .prop("checked", mananaEnabled);
      $(`.js-horario-hab[data-dia="${d.id}"][data-turno="2"]`)
        .prop("checked", d.id <= 5);
      applyHorarioRowState(d.id, 1);
      applyHorarioRowState(d.id, 2);
    });
  }

  function collectHorario() {
    const items = [];
    DIAS.forEach((d) => {
      [1, 2].forEach((turno) => {
        const $hab = $(`.js-horario-hab[data-dia="${d.id}"][data-turno="${turno}"]`);
        const $inicio = $(`.js-horario-inicio[data-dia="${d.id}"][data-turno="${turno}"]`);
        const $fin = $(`.js-horario-fin[data-dia="${d.id}"][data-turno="${turno}"]`);
        items.push({
          dia_semana: d.id,
          turno,
          habilitado: $hab.is(":checked"),
          hora_inicio: $inicio.val() || null,
          hora_fin: $fin.val() || null,
        });
      });
    });
    return items;
  }

  function setSelectValue($form, name, value) {
    const $el = $form.find(`[name="${name}"]`);
    if ($el.length && value != null) $el.val(String(value));
  }

  function setFormFromUsuario(usuario) {
    const $form = $("#form-usuario");
    if (!usuario) return;
    setSelectValue($form, "rol_id", usuario.rol_id);
    setSelectValue($form, "tipo_jornada_id", usuario.tipo_jornada_id);
    if (usuario.personas) {
      setSelectValue(
        $form,
        "persona.tipoDocumento_id",
        usuario.personas.tipoDocumento_id,
      );
    }
  }

  function serializeForm() {
    const data = { persona: {} };
    $("#form-usuario")
      .serializeArray()
      .forEach(({ name, value }) => {
        if (value === "" || value == null) return;
        if (name.startsWith("persona.")) {
          data.persona[name.split(".").slice(1).join(".")] = value;
        } else {
          data[name] = value;
        }
      });
    return data;
  }

  function openCreateModal() {
    editingId = null;
    $modalTitle.text("Nuevo Usuario");
    $modalBody.html(formHtml(null));
    applyTipoDocumentoDefault();
    applyHorarioDefaults();
    toggleHorarioSection();
    $btnGuardar.text("Crear").prop("disabled", false);
    $("#clave-required-mark").show();
    bsModal.show();
  }

  async function openEditModal(id) {
    try {
      const res = await fetch(`${API_BASE}/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Error");

      editingId = id;
      $modalTitle.text(`Editar Usuario #${id}`);
      $modalBody.html(formHtml(json.data));
      setFormFromUsuario(json.data);
      applyTipoDocumentoDefault();
      applyHorarioFromUsuario(json.data);
      toggleHorarioSection();
      $btnGuardar.text("Actualizar").prop("disabled", false);
      $("#clave-required-mark").hide();
      bsModal.show();
    } catch (err) {
      showToast(err.message || "No se pudo cargar el usuario.", "error");
    }
  }

  // Pinta el horario que viene del backend al editar.
  // Se asume que la respuesta incluye `horario: [{ dia_semana, hora_inicio, hora_fin, estado }, ...]`,
  // ya ordenado por (dia_semana ASC, hora_inicio ASC). El primer registro de
  // cada día es mañana y el segundo es tarde.
  function applyHorarioFromUsuario(usuario) {
    // 1) Resetear toda la grilla a "deshabilitado"
    DIAS.forEach((d) => {
      [1, 2].forEach((turno) => {
        $(`.js-horario-hab[data-dia="${d.id}"][data-turno="${turno}"]`)
          .prop("checked", false);
        $(`.js-horario-inicio[data-dia="${d.id}"][data-turno="${turno}"]`)
          .val(DEFAULT_TURNOS[turno].inicio);
        $(`.js-horario-fin[data-dia="${d.id}"][data-turno="${turno}"]`)
          .val(DEFAULT_TURNOS[turno].fin);
        applyHorarioRowState(d.id, turno);
      });
    });

    const items = Array.isArray(usuario?.horario) ? usuario.horario : [];
    // Agrupar por día
    const byDia = {};
    items.forEach((it) => {
      const d = Number(it.dia_semana);
      if (!byDia[d]) byDia[d] = [];
      byDia[d].push(it);
    });

    Object.keys(byDia).forEach((dStr) => {
      const d = Number(dStr);
      const list = byDia[d];
      list.forEach((it, idx) => {
        // idx 0 → mañana, idx 1 → tarde
        const turno = idx + 1;
        if (turno > 2) return; // más de 2 turnos no soportado en UI
        $(`.js-horario-hab[data-dia="${d}"][data-turno="${turno}"]`)
          .prop("checked", true);
        $(`.js-horario-inicio[data-dia="${d}"][data-turno="${turno}"]`)
          .val(it.hora_inicio || DEFAULT_TURNOS[turno].inicio);
        $(`.js-horario-fin[data-dia="${d}"][data-turno="${turno}"]`)
          .val(it.hora_fin || DEFAULT_TURNOS[turno].fin);
        applyHorarioRowState(d, turno);
      });
    });
  }

  async function submitForm() {
    const data = serializeForm();

    if (data.persona && !data.persona.email) {
      showToast("El correo es obligatorio (se usa como usuario).", "error");
      $("#input-email").focus();
      return;
    }
    if (!data.usuario) {
      showToast("El campo Usuario (correo) es obligatorio.", "error");
      return;
    }
    if (!editingId && !data.clave) {
      showToast("La clave es obligatoria al crear.", "error");
      return;
    }
    if (data.persona && !data.persona.nombres) {
      showToast("El nombre de la persona es obligatorio.", "error");
      return;
    }

    const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
    const method = editingId ? "PUT" : "POST";

    // Adjuntar el horario al payload para que el backend lo persista
    // solo si la jornada es Full Time / Part Time.
    data.horario = collectHorario();

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
      $("#table-users").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $btnGuardar.prop("disabled", false).text(editingId ? "Actualizar" : "Crear");
    }
  }

  async function buscarDocumento() {
    const $btn = $("#btn-buscar-documento");
    const $numero = $("#input-numero-documento");
    const tipoDocumentoId = $('select[name="persona.tipoDocumento_id"]').val();
    const numero = ($numero.val() || "").trim();

    if (!numero) {
      showToast("Ingrese un número de documento para buscar.", "error");
      $numero.focus();
      return;
    }

    const originalHtml = $btn.html();
    $btn.prop("disabled", true).html(
      '<span class="spinner-border spinner-border-sm me-1"></span>Buscando...',
    );

    try {
      const params = new URLSearchParams({
        tipoDocumento_id: tipoDocumentoId || "",
        numero_documento: numero,
      });
      const res = await fetch(`${API_BASE}/search-document?${params}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se encontró el documento.");

      const d = json.data || {};
      const currentNombres = $("#input-nombres").val().trim();
      const currentApellidos = $("#input-apellidos").val().trim();
      const $direccion = $('input[name="persona.direccion"]');
      const $fechaNac = $('input[name="persona.fecha_nacimiento"]');

      if ((!currentNombres || currentNombres === $("#input-nombres").data("autofilled")) && d.nombres) {
        $("#input-nombres").val(d.nombres).data("autofilled", d.nombres);
      }
      if ((!currentApellidos || currentApellidos === $("#input-apellidos").data("autofilled")) && d.apellidos) {
        $("#input-apellidos").val(d.apellidos).data("autofilled", d.apellidos);
      }
      if (d.direccion && !$direccion.val().trim()) {
        $direccion.val(d.direccion);
      }
      if (d.fecha_nacimiento && !$fechaNac.val()) {
        $fechaNac.val(d.fecha_nacimiento);
      }

      showToast("Datos encontrados y autocompletados.");
    } catch (err) {
      showToast(err.message || "No se pudo consultar el documento.", "error");
    } finally {
      $btn.prop("disabled", false).html(originalHtml);
    }
  }

  async function deleteUsuario(id, nombre) {
    const ok = await confirmar({
      titulo: "¿Desactivar usuario?",
      texto: `Vas a desactivar a "${nombre}". Podrás reactivarlo más tarde desde la base de datos.`,
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
      showToast(json.message || "Usuario desactivado.");
      $("#table-users").DataTable().ajax.reload(null, false);
    } catch (err) {
      showToast(err.message || "Error al desactivar.", "error");
    }
  }

  // ---- Inicialización --------------------------------------------------

  async function loadLookups() {
    const res = await fetch(`${API_BASE}/lookups`);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error("No se pudieron cargar los catálogos.");
    lookups = json.data;
  }

  const table = $("#table-users").DataTable({
    language: window.DATATABLES_ES_CONFIG,
    ajax: {
      url: `${API_BASE}`,
      dataSrc: "data",
    },
    columns: [
      { data: "id" },
      {
        data: "personas.numero_documento",
        defaultContent: '<span class="text-muted">Sin doc.</span>',
      },
      {
        data: null,
        render: function (_d, _t, row) {
          if (row.personas && row.personas.nombres && row.personas.apellidos) {
            return `${row.personas.nombres} ${row.personas.apellidos}`;
          } else if (row.personas && row.personas.nombres) {
            return row.personas.nombres;
          }
          return '<span class="text-muted">Sin nombre</span>';
        },
      },
      {
        data: "roles.nombre",
        defaultContent: '<span class="text-muted">Sin rol</span>',
        render: function (data) {
          return data
            ? `<span class="badge bg-primary">${escapeHtml(data)}</span>`
            : '<span class="text-muted">Sin rol</span>';
        },
      },
      {
        data: "personas.email",
        defaultContent: '<span class="text-muted">Sin correo</span>',
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: "text-center",
        render: function (_d, _t, row) {
          const nombre = row.personas
            ? `${row.personas.nombres || ""} ${row.personas.apellidos || ""}`.trim()
            : `usuario #${row.id}`;
          return `
            <i class="ti ti-edit fs-4 text-info btn-edit" style="cursor: pointer;" title="Editar" data-id="${row.id}"></i>
            <i class="ti ti-trash fs-4 text-danger btn-delete" style="cursor: pointer; margin-left: 6px;" title="Eliminar" data-id="${row.id}" data-nombre="${escapeHtml(nombre)}"></i>
          `;
        },
      },
    ],
  });

  // ---- Eventos ---------------------------------------------------------

  $("#btn-nuevo-usuario").on("click", openCreateModal);
  $btnGuardar.on("click", submitForm);

  // Eventos delegados del modal (el form se reinyecta cada vez)
  $modalBody.on("input", "#input-email", syncUsuarioFromEmail);
  $modalBody.on("change", "#select-tipo-documento", toggleBuscarDocumento);
  $modalBody.on("change", "#select-tipo-jornada", toggleHorarioSection);
  $modalBody.on("change", ".js-horario-hab", function () {
    const $el = $(this);
    applyHorarioRowState($el.data("dia"), $el.data("turno"));
  });
  $modalBody.on("click", "#btn-buscar-documento", buscarDocumento);
  $modalBody.on("keydown", "#input-numero-documento", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      buscarDocumento();
    }
  });

  $("#table-users").on("click", ".btn-edit", function () {
    openEditModal(Number($(this).data("id")));
  });

  $("#table-users").on("click", ".btn-delete", function () {
    const id = Number($(this).data("id"));
    const nombre = $(this).data("nombre");
    deleteUsuario(id, nombre);
  });

  // Limpia el body del modal al cerrarlo para no arrastrar inputs viejos
  $modal.on("hidden.bs.modal", function () {
    $modalBody.empty();
    $modalDialog.removeClass(MODAL_LG_CLASSES);
    editingId = null;
  });

  // Aplica modal-lg mientras se muestra (solo en esta vista)
  $modal.on("show.bs.modal", function () {
    $modalDialog.addClass(MODAL_LG_CLASSES);
  });

  // Carga inicial de catálogos
  loadLookups().catch((err) =>
    showToast(err.message || "Error cargando catálogos.", "error"),
  );
});
