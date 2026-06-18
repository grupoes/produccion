(() => {
  const $ = (sel) => document.querySelector(sel);
  const usrSelect = $("#usuario-select");
  const fileInput = $("#excel-file");
  const btnPreview = $("#btn-preview");
  const previewSpinner = $("#preview-spinner");
  const stepUpload = $("#step-upload");
  const stepPreview = $("#step-preview");
  const stepResult = $("#step-result");
  const previewTbody = $("#preview-tbody");
  const previewCount = $("#preview-count");
  const previewErrors = $("#preview-errors");
  const previewErrorsAlert = $("#preview-errors-alert");
  const previewErrorsText = $("#preview-errors-text");
  const btnBack = $("#btn-back");
  const btnReset = $("#btn-reset");
  const resultContent = $("#result-content");
  const sheetMapping = $("#sheet-mapping");
  const sheetMappingList = $("#sheet-mapping-list");

  let resultados = [];
  let tareas = [];
  let catalogos = { instituciones: [], carreras: [], niveles: [] };
  let sheetVendedores = {};

  // ---- helpers de tiempo ----
  function fmtMinutos(m) {
    if (m == null || isNaN(m)) return "";
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  function parseMinutos(str) {
    if (!str) return null;
    const parts = str.split(":");
    if (parts.length !== 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  // ---- Choices.js helpers ----
  const choicesInstances = [];

  function destroyAllChoices() {
    choicesInstances.forEach((c) => {
      try { c.destroy(); } catch (e) { /* noop */ }
    });
    choicesInstances.length = 0;
  }

  function makeChoices(el, opts = {}) {
    if (!el || typeof Choices === "undefined") return null;
    const inst = new Choices(el, {
      searchEnabled: true,
      searchPlaceholderValue: "Buscar…",
      noResultsText: "Sin resultados",
      itemSelectText: "",
      shouldSort: false,
      placeholder: true,
      placeholderValue: el.dataset.placeholder || "Seleccione…",
      ...opts,
    });
    choicesInstances.push(inst);
    return inst;
  }

  function updateCarreraChoices(idx, instId) {
    const sel = document.querySelector(`.carrera-select[data-idx="${idx}"]`);
    if (!sel) return;
    const filtered = instId
      ? catalogos.carreras.filter((c) => c.institucion_id === instId)
      : catalogos.carreras;
    const currentVal = sel.value;
    const rawChoices = [{ value: "", label: "(sin carrera)", selected: !currentVal }];
    filtered.forEach((c) => {
      rawChoices.push({ value: String(c.id), label: c.nombre, selected: currentVal === String(c.id) });
    });
    const inst = sel._choicesInstance;
    if (inst) {
      inst.setChoices(rawChoices, "value", "label", true);
    } else {
      sel.innerHTML = '<option value="">(sin carrera)</option>' +
        filtered.map((c) => `<option value="${c.id}"${currentVal === String(c.id) ? " selected" : ""}>${esc(c.nombre)}</option>`).join("");
    }
  }

  // ---- Cargar usuarios (todos, para asignado y vendedores) ----
  let allUsuarios = [];

  fetch("/api/importacion/usuarios")
    .then((r) => r.json())
    .then((res) => {
      if (res.success && res.data.length) {
        allUsuarios = res.data;
        const opts = res.data.map((u) => {
          const nombre = u.personas
            ? [u.personas.nombres, u.personas.apellidos].filter(Boolean).join(" ").trim() || u.usuario
            : u.usuario;
          const rol = u.roles ? ` (${u.roles.nombre})` : "";
          return `<option value="${u.id}">${nombre}${rol}</option>`;
        }).join("");
        usrSelect.innerHTML = '<option value="">Seleccionar usuario...</option>' + opts;
        usrSelect.disabled = false;
      } else {
        usrSelect.innerHTML = '<option value="">No hay usuarios disponibles</option>';
      }
      checkForm();
    })
    .catch(() => {
      usrSelect.innerHTML = '<option value="">Error al cargar usuarios</option>';
    });

  function checkForm() {
    const hasFile = fileInput.files?.length;
    btnPreview.disabled = !usrSelect.value || !hasFile;
    if (!hasFile) sheetMapping.classList.add("d-none");
  }

  usrSelect.addEventListener("change", checkForm);

  // ---- Al seleccionar archivo, leer hojas ----
  fileInput.addEventListener("change", async () => {
    checkForm();
    sheetMapping.classList.add("d-none");
    sheetMappingList.innerHTML = "";
    sheetVendedores = {};

    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("archivo", file);

    try {
      const res = await fetch("/api/importacion/hojas", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.success || !data.data?.length) return;

      const sheets = data.data;
      sheetMappingList.innerHTML = sheets.map((s, i) => {
        const vendOpts = allUsuarios.map((u) => {
          const nombre = u.personas
            ? [u.personas.nombres, u.personas.apellidos].filter(Boolean).join(" ").trim() || u.usuario
            : u.usuario;
          const rol = u.roles ? ` (${u.roles.nombre})` : "";
          return `<option value="${u.id}">${nombre}${rol}</option>`;
        }).join("");

        return `<div class="row mb-2 align-items-center">
          <div class="col-sm-4"><strong>${esc(s.name)}</strong> <span class="text-muted">(${s.rowCount} filas)</span></div>
          <div class="col-sm-8">
            <select class="form-select form-select-sm vendedor-select" data-sheet="${esc(s.name)}">
              <option value="">Seleccionar vendedor…</option>
              ${vendOpts}
            </select>
          </div>
        </div>`;
      }).join("");

      sheetMapping.classList.remove("d-none");

      // Inicializar Choices en cada vendedor-select
      sheetMappingList.querySelectorAll(".vendedor-select").forEach((sel) => {
        const inst = makeChoices(sel, { placeholderValue: "Seleccionar vendedor…" });
        sel.addEventListener("change", function () {
          const sheetName = this.dataset.sheet;
          const vId = this.value || null;
          if (vId) sheetVendedores[sheetName] = vId;
          else delete sheetVendedores[sheetName];
        });
      });

      // Auto-seleccionar primer usuario si solo hay una hoja
      if (sheets.length === 1 && allUsuarios.length) {
        const sel = sheetMappingList.querySelector(".vendedor-select");
        if (sel) {
          sel.value = "";
          // No auto-seleccionamos, dejamos que el usuario elija
        }
      }
    } catch (err) {
      console.error("Error al leer hojas:", err);
    }
  });

  // ---- Vista previa ----
  btnPreview.addEventListener("click", async () => {
    const file = fileInput.files[0];
    if (!file || !usrSelect.value) return;

    btnPreview.disabled = true;
    previewSpinner.classList.remove("d-none");

    const formData = new FormData();
    formData.append("archivo", file);
    formData.append("usuario_id", usrSelect.value);
    formData.append("sheet_vendedores", JSON.stringify(sheetVendedores));

    try {
      const res = await fetch("/api/importacion/preview", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!data.success) {
        let msg = data.error || "Error al procesar el archivo.";
        if (data.detalles?.length) {
          msg += "<ul>" + data.detalles.map((d) => `<li>${d}</li>`).join("") + "</ul>";
        }
        alert(msg);
        return;
      }

      resultados = data.resultados;
      tareas = data.tareas || [];
      catalogos = data.catalogos || { instituciones: [], carreras: [], niveles: [] };

      if (data.advertencias?.length) {
        if (!confirm("Advertencias:\n\n" + data.advertencias.join("\n") + "\n\n¿Deseas continuar con la vista previa?")) {
          btnPreview.disabled = false;
          previewSpinner.classList.add("d-none");
          return;
        }
      }

      renderPreview(data.total);
    } catch (err) {
      alert("Error de conexión: " + err.message);
    } finally {
      btnPreview.disabled = false;
      previewSpinner.classList.add("d-none");
    }
  });

  function renderPreview(total) {
    destroyAllChoices();

    previewCount.textContent = `${total} filas cargadas en ${resultados.reduce((acc, r) => acc.add(r.sheetName), new Set()).size} hoja(s)`;
    previewErrorsAlert.classList.add("d-none");

    const tareaOptions = tareas
      .map((t) => `<option value="${t.id}" data-minutos="${t.horas_estimadas || 60}">${esc(t.nombre)} (${t.horas_estimadas || 60} min)</option>`)
      .join("");

    // Agrupar por sheetName
    const groups = {};
    resultados.forEach((d, idx) => {
      const sn = d.sheetName || "Hoja1";
      if (!groups[sn]) groups[sn] = { rows: [], indexes: [] };
      groups[sn].rows.push(d);
      groups[sn].indexes.push(idx);
    });
    const sheetNames = Object.keys(groups);

    // Tabs
    const tabsEl = $("#sheet-tabs");
    tabsEl.innerHTML = [
      ...sheetNames.map((sn, i) =>
        `<li class="nav-item">
          <a href="#tab-${esc(sn.replace(/\s+/g, "_"))}" data-bs-toggle="tab" class="nav-link${i === 0 ? " active" : ""}" aria-selected="${i === 0}">
            <i class="ti ti-file-spreadsheet me-1"></i>${esc(sn)}
            <span class="badge bg-secondary ms-1">${groups[sn].rows.length}</span>
          </a>
        </li>`
      ),
      `<li class="nav-item">
        <a href="#tab-unir" data-bs-toggle="tab" class="nav-link" aria-selected="false">
          <i class="ti ti-merge me-1"></i> Unir
        </a>
      </li>`
    ].join("");

    // Obtener valores únicos de AUXILIAR
    const auxValues = [...new Set(resultados.map((d) => d.auxiliar).filter(Boolean))].sort();

    // Contenido de tabs
    const contentEl = $("#sheet-tab-content");
    const getVendedorName = (id) => {
      if (!id) return null;
      const u = allUsuarios.find((x) => x.id === Number(id));
      if (!u) return null;
      return u.personas
        ? [u.personas.nombres, u.personas.apellidos].filter(Boolean).join(" ").trim() || u.usuario
        : u.usuario;
    };
    const headerRow = `<tr>
      <th>#</th>
      <th>Cliente</th>
      <th>Celular</th>
      <th>Descripción</th>
      <th style="min-width:160px">Tarea</th>
      <th style="min-width:100px">Tiempo</th>
      <th style="min-width:90px">Prioridad</th>
      <th style="min-width:140px">Universidad</th>
      <th style="min-width:140px">Carrera</th>
      <th style="min-width:120px">Nivel Acad.</th>
      <th>Link Drive</th>
      <th>Fecha Entrega</th>
      <th>Jefe que lo valoró</th>
      <th>Auxiliar</th>
    </tr>`;
    const unirHeaderRow = `<tr>
      <th style="width:40px"><input type="checkbox" id="unir-select-all"></th>
      <th>#</th>
      <th>Cliente</th>
      <th>Celular</th>
      <th>Descripción</th>
      <th style="min-width:160px">Tarea</th>
      <th style="min-width:100px">Tiempo</th>
      <th style="min-width:90px">Prioridad</th>
      <th style="min-width:140px">Universidad</th>
      <th style="min-width:140px">Carrera</th>
      <th style="min-width:120px">Nivel Acad.</th>
      <th>Link Drive</th>
      <th>Fecha Entrega</th>
      <th>Jefe que lo valoró</th>
      <th>Auxiliar</th>
      <th style="min-width:180px">Programación</th>
    </tr>`;

    const rowHtml = (d, j, idx) => {
      const instOpts = catalogos.instituciones
        .map((i) => `<option value="${i.id}"${i.id === d.institucionId ? " selected" : ""}>${esc(i.nombre)}${i.abreviatura ? " (" + esc(i.abreviatura) + ")" : ""}</option>`)
        .join("");
      const carrerasFiltradas = d.institucionId
        ? catalogos.carreras.filter((c) => c.institucion_id === d.institucionId)
        : catalogos.carreras;
      const carreraOpts = carrerasFiltradas
        .map((c) => `<option value="${c.id}"${c.id === d.carreraId ? " selected" : ""}>${esc(c.nombre)}</option>`)
        .join("");
      const nivelOpts = catalogos.niveles
        .map((n) => `<option value="${n.id}"${n.id === d.nivelId ? " selected" : ""}>${esc(n.nombre)}</option>`)
        .join("");
      const prioOpts = ["ALTA", "MEDIA", "BAJA"]
        .map((p) => `<option value="${p}"${p === d.prioridad ? " selected" : ""}>${p}</option>`)
        .join("");

      return `<tr>
        <td>${j + 1}</td>
        <td>${esc(d.cliente)}</td>
        <td style="min-width:140px"><input type="text" class="form-control form-control-sm celular-input" data-idx="${idx}" value="${esc(d.celular || "")}" placeholder="Celular"></td>
        <td title="${esc(d.descripcion)}">${esc(trunc(d.descripcion, 30))}</td>
        <td>
          <select class="form-select form-select-sm tarea-select" data-idx="${idx}" data-placeholder="Seleccionar tarea…">
            <option value="">Seleccionar tarea…</option>
            ${tareaOptions}
          </select>
        </td>
        <td><input type="text" class="form-control form-control-sm tiempo-input" data-idx="${idx}" value="${d.duracion ? fmtMinutos(d.duracion) : ""}" placeholder="HH:MM"></td>
        <td>
          <select class="form-select form-select-sm prio-select" data-idx="${idx}">
            ${prioOpts}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm inst-select" data-idx="${idx}" data-placeholder="Buscar universidad…">
            <option value="">(sin universidad)</option>
            ${instOpts}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm carrera-select" data-idx="${idx}" data-placeholder="Buscar carrera…">
            <option value="">(sin carrera)</option>
            ${carreraOpts || '<option value="">(selecciona universidad primero)</option>'}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm nivel-select" data-idx="${idx}" data-placeholder="Buscar nivel…">
            <option value="">(sin nivel)</option>
            ${nivelOpts}
          </select>
        </td>
        <td title="${esc(d.link_drive || "")}" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.link_drive || "—")}</td>
        <td>${esc(d.fecha_entrega || "—")}</td>
        <td>${esc(d.jefe_que_lo_valoro || "—")}</td>
        <td>${esc(d.auxiliar || "—")}</td>
      </tr>`;
    };

    const unirRowHtml = (d, j, idx) => {
      const instOpts = catalogos.instituciones
        .map((i) => `<option value="${i.id}"${i.id === d.institucionId ? " selected" : ""}>${esc(i.nombre)}${i.abreviatura ? " (" + esc(i.abreviatura) + ")" : ""}</option>`)
        .join("");
      const carrerasFiltradas = d.institucionId
        ? catalogos.carreras.filter((c) => c.institucion_id === d.institucionId)
        : catalogos.carreras;
      const carreraOpts = carrerasFiltradas
        .map((c) => `<option value="${c.id}"${c.id === d.carreraId ? " selected" : ""}>${esc(c.nombre)}</option>`)
        .join("");
      const nivelOpts = catalogos.niveles
        .map((n) => `<option value="${n.id}"${n.id === d.nivelId ? " selected" : ""}>${esc(n.nombre)}</option>`)
        .join("");
      const prioOpts = ["ALTA", "MEDIA", "BAJA"]
        .map((p) => `<option value="${p}"${p === d.prioridad ? " selected" : ""}>${p}</option>`)
        .join("");

      return `<tr>
        <td><input type="checkbox" class="unir-row-check" data-idx="${idx}"></td>
        <td>${j + 1}</td>
        <td>${esc(d.cliente)}</td>
        <td style="min-width:140px"><input type="text" class="form-control form-control-sm celular-input" data-idx="${idx}" value="${esc(d.celular || "")}" placeholder="Celular"></td>
        <td title="${esc(d.descripcion)}">${esc(trunc(d.descripcion, 30))}</td>
        <td>
          <select class="form-select form-select-sm tarea-select" data-idx="${idx}" data-placeholder="Seleccionar tarea…">
            <option value="">Seleccionar tarea…</option>
            ${tareaOptions}
          </select>
        </td>
        <td><input type="text" class="form-control form-control-sm tiempo-input" data-idx="${idx}" value="${d.duracion ? fmtMinutos(d.duracion) : ""}" placeholder="HH:MM"></td>
        <td>
          <select class="form-select form-select-sm prio-select" data-idx="${idx}">
            ${prioOpts}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm inst-select" data-idx="${idx}" data-placeholder="Buscar universidad…">
            <option value="">(sin universidad)</option>
            ${instOpts}
          </select>
        </td>
        <td style="min-width:160px">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <span class="text-muted" style="font-size:.7rem;">Carrera</span>
            <button class="btn btn-sm btn-outline-success p-0 agregar-carrera-btn" data-idx="${idx}" title="Agregar carrera" style="width:18px;height:18px;font-size:12px;line-height:1;">+</button>
          </div>
          <select class="form-select form-select-sm carrera-select" data-idx="${idx}" data-placeholder="Buscar carrera…">
            <option value="">(sin carrera)</option>
            ${carreraOpts || '<option value="">(selecciona universidad primero)</option>'}
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm nivel-select" data-idx="${idx}" data-placeholder="Buscar nivel…">
            <option value="">(sin nivel)</option>
            ${nivelOpts}
          </select>
        </td>
        <td title="${esc(d.link_drive || "")}" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.link_drive || "—")}</td>
        <td>${esc(d.fecha_entrega || "—")}</td>
        <td>${esc(d.jefe_que_lo_valoro || "—")}</td>
        <td>${esc(d.auxiliar || "—")}</td>
        <td>${j === 0 ? '<input type="datetime-local" class="form-control form-control-sm unir-fecha-inicio">' : ""}</td>
      </tr>`;
    };

    contentEl.innerHTML = [
      ...sheetNames.map((sn, i) => {
        const { rows, indexes } = groups[sn];
        const vId = sheetVendedores[sn];
        const vName = getVendedorName(vId);
        return `<div class="tab-pane fade${i === 0 ? " show active" : ""}" id="tab-${esc(sn.replace(/\s+/g, "_"))}" role="tabpanel">
          ${vName ? `<div class="alert alert-info py-1 mb-2"><i class="ti ti-user-check me-1"></i><strong>Vendedor:</strong> ${esc(vName)}</div>` : ""}
          <div class="table-responsive" style="overflow-x:auto;">
            <table class="table table-sm table-bordered table-hover" style="font-size:.8rem;">
              <thead class="table-light">${headerRow}</thead>
              <tbody>${rows.map((d, j) => rowHtml(d, j, indexes[j])).join("")}</tbody>
            </table>
          </div>
        </div>`;
      }),
      `<div class="tab-pane fade" id="tab-unir" role="tabpanel">
        <div class="mb-3">
          <label class="form-label">Filtrar por Auxiliar</label>
          <div class="dropdown">
            <button class="btn btn-outline-secondary dropdown-toggle form-select text-start" type="button" data-bs-toggle="dropdown" aria-expanded="false" id="unir-dropdown-btn">
              Seleccionar auxiliar…
            </button>
            <div class="dropdown-menu p-2" style="min-width:220px;" id="unir-dropdown-menu">
              ${auxValues.map((v) =>
                `<div class="form-check">
                  <input class="form-check-input unir-check" type="checkbox" id="unir-${esc(v)}" value="${esc(v)}">
                  <label class="form-check-label" for="unir-${esc(v)}">${esc(v)}</label>
                </div>`
              ).join("")}
              <div class="dropdown-divider"></div>
              <button class="btn btn-sm btn-primary w-100" id="unir-aplicar">Aplicar filtro</button>
            </div>
          </div>
        </div>
        <div id="unir-table-wrapper"></div>
        <button id="btn-import-unir" class="btn btn-success mt-2" style="display:none;">
          <i class="ti ti-upload me-1"></i> Importar Actividades
        </button>
        <span id="import-spinner-unir" class="spinner-border spinner-border-sm text-success d-none ms-2" role="status">
          <span class="visually-hidden">Importando...</span>
        </span>
      </div>`
    ].join("");

    // Bind eventos en pestañas de hojas
    sheetNames.forEach((sn) => {
      const tabId = `tab-${sn.replace(/\s+/g, "_")}`;
      const tab = document.getElementById(tabId);
      if (!tab) return;
      tab.querySelectorAll(".tarea-select, .tiempo-input, .celular-input").forEach((el) => {
        const idx = Number(el.dataset.idx);
        if (el.classList.contains("tarea-select")) {
          el.addEventListener("change", function () {
            const i = Number(this.dataset.idx);
            const opt = this.options[this.selectedIndex];
            const minutos = opt ? Number(opt.dataset.minutos) : 60;
            if (resultados[i]) {
              resultados[i]._tarea_id = this.value ? Number(this.value) : null;
              resultados[i].duracion = minutos;
            }
            const tiempoEl = tab.querySelector(`.tiempo-input[data-idx="${i}"]`);
            if (tiempoEl) tiempoEl.value = fmtMinutos(minutos);
          });
        }
        if (el.classList.contains("tiempo-input")) {
          el.addEventListener("change", function () {
            const i = Number(this.dataset.idx);
            const m = parseMinutos(this.value);
            if (resultados[i] && m != null) resultados[i].duracion = m;
          });
        }
        if (el.classList.contains("celular-input")) {
          el.addEventListener("change", function () {
            const i = Number(this.dataset.idx);
            if (resultados[i]) resultados[i].celular = this.value.trim();
          });
        }
      });
    });

    // Filtrar en pestaña Unir por checkboxes dentro de dropdown
    const updateUnirTable = () => {
      const selected = [...document.querySelectorAll(".unir-check:checked")].map((cb) => cb.value);
      const btn = $("#unir-dropdown-btn");
      const wrapper = $("#unir-table-wrapper");
      const importBtn = document.getElementById("btn-import-unir");
      const spinner = document.getElementById("import-spinner-unir");
      if (!selected.length) {
        btn.textContent = "Seleccionar auxiliar…";
        wrapper.innerHTML = "";
        if (importBtn) importBtn.style.display = "none";
        return;
      }
      btn.textContent = `Auxiliar: ${selected.join(", ")}`;
      const filtered = resultados.filter((d) => selected.includes(d.auxiliar));
      wrapper.innerHTML = `<div class="table-responsive" style="overflow-x:auto;">
        <table class="table table-sm table-bordered table-hover" style="font-size:.8rem;">
          <thead class="table-light">${unirHeaderRow}</thead>
          <tbody>
            ${filtered.map((d, j) => {
              const globalIdx = resultados.indexOf(d);
              return unirRowHtml(d, j, globalIdx);
            }).join("")}
          </tbody>
        </table>
      </div>`;
      if (importBtn) importBtn.style.display = "";
      const selAll = document.getElementById("unir-select-all");
      if (selAll) {
        selAll.addEventListener("change", function () {
          document.querySelectorAll(".unir-row-check").forEach((cb) => { cb.checked = this.checked; });
        });
      }
      wrapper.querySelectorAll(".prio-select, .tarea-select, .inst-select, .carrera-select, .nivel-select, .tiempo-input, .celular-input").forEach((el) => {
        const idx = Number(el.dataset.idx);
        if (el.classList.contains("prio-select") && resultados[idx]?.prioridad) el.value = resultados[idx].prioridad;
        if (el.classList.contains("inst-select") && resultados[idx]?.institucionId) el.value = resultados[idx].institucionId;
        if (el.classList.contains("carrera-select") && resultados[idx]?.carreraId) el.value = resultados[idx].carreraId;
        if (el.classList.contains("nivel-select") && resultados[idx]?.nivelId) el.value = resultados[idx].nivelId;
        if (el.classList.contains("tarea-select")) {
          el.addEventListener("change", function () {
            const i = Number(this.dataset.idx);
            const opt = this.options[this.selectedIndex];
            const minutos = opt ? Number(opt.dataset.minutos) : 60;
            if (resultados[i]) {
              resultados[i]._tarea_id = this.value ? Number(this.value) : null;
              resultados[i].duracion = minutos;
            }
            const tiempoEl = wrapper.querySelector(`.tiempo-input[data-idx="${i}"]`);
            if (tiempoEl) tiempoEl.value = fmtMinutos(minutos);
          });
        }
        if (el.classList.contains("inst-select")) {
          el.addEventListener("change", function () {
            const i = Number(this.dataset.idx);
            const val = this.value ? Number(this.value) : null;
            if (resultados[i]) resultados[i].institucionId = val;
            updateCarreraChoices(i, val);
          });
        }
        if (el.classList.contains("carrera-select")) {
          el.addEventListener("change", function () {
            const i = Number(this.dataset.idx);
            if (resultados[i]) resultados[i].carreraId = this.value ? Number(this.value) : null;
          });
        }
        if (el.classList.contains("nivel-select")) {
          el.addEventListener("change", function () {
            const i = Number(this.dataset.idx);
            if (resultados[i]) resultados[i].nivelId = this.value ? Number(this.value) : null;
          });
        }
        if (el.classList.contains("tiempo-input")) {
          el.addEventListener("change", function () {
            const i = Number(this.dataset.idx);
            const m = parseMinutos(this.value);
            if (resultados[i] && m != null) resultados[i].duracion = m;
          });
          return;
        }
        if (el.classList.contains("celular-input")) {
          el.addEventListener("change", function () {
            const i = Number(this.dataset.idx);
            if (resultados[i]) resultados[i].celular = this.value.trim();
          });
          return;
        }
        makeChoices(el, el.classList.contains("prio-select") ? { searchEnabled: false, placeholder: false } : {});
      });

      wrapper.querySelectorAll(".agregar-carrera-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const idx = Number(this.dataset.idx);
          const instSelect = wrapper.querySelector(`.inst-select[data-idx="${idx}"]`);
          const instId = instSelect ? Number(instSelect.value) : null;
          if (!instId) {
            alert("Selecciona primero una universidad.");
            return;
          }
          // Llenar modal con universidades
          const modalInst = document.getElementById("carrera-modal-universidad");
          modalInst.innerHTML = catalogos.instituciones
            .map((i) => `<option value="${i.id}"${i.id === instId ? " selected" : ""}>${esc(i.nombre)}</option>`)
            .join("");
          document.getElementById("carrera-modal-nombre").value = "";
          document.getElementById("carrera-modal-nombre").dataset.idx = idx;
          const modal = new bootstrap.Modal(document.getElementById("modal-agregar-carrera"));
          modal.show();
        });
      });
    };

    const aplicarBtn = $("#unir-aplicar");
    if (aplicarBtn) {
      aplicarBtn.addEventListener("click", () => {
        updateUnirTable();
        const dd = $("#unir-dropdown-btn");
        if (dd && window.bootstrap?.Dropdown) {
          bootstrap.Dropdown.getInstance(dd)?.hide();
        }
      });
    }

    // Configurar botón importar dentro de Unir
    const setupImportBtn = () => {
      const importBtn = document.getElementById("btn-import-unir");
      const spinner = document.getElementById("import-spinner-unir");
      if (!importBtn) return;
      importBtn.addEventListener("click", async () => {
        const selected = [...document.querySelectorAll(".unir-check:checked")].map((cb) => cb.value);
        const aImportar = resultados.filter((d) => selected.includes(d.auxiliar) && d._tarea_id);
        if (!aImportar.length) {
          alert("Selecciona al menos un auxiliar y asigna tareas a las filas antes de importar.");
          return;
        }

        const usuarioId = usrSelect ? Number(usrSelect.value) : null;
        if (!usuarioId) {
          alert("Debes seleccionar un usuario en el paso 1.");
          return;
        }

        const fechaInput = document.querySelector(".unir-fecha-inicio");
        const fechaInicio = fechaInput ? fechaInput.value : "";
        if (!fechaInicio) {
          alert("Debes ingresar la fecha y hora de inicio de programación en la primera fila.");
          return;
        }

        const sinTarea = resultados.filter((d) => selected.includes(d.auxiliar) && !d._tarea_id).length;
        let msg = `¿Programar e importar ${aImportar.length} actividades`;
        if (sinTarea > 0) msg += ` (${sinTarea} filas sin tarea se omitirán)`;
        msg += "?";
        if (!confirm(msg)) return;

        importBtn.disabled = true;
        if (spinner) spinner.classList.remove("d-none");

        try {
          const res = await fetch("/api/importacion/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resultados: aImportar, usuario_id: usuarioId, fecha_inicio: fechaInicio }),
          });
          const data = await res.json();
          if (data.success) {
            renderResult(data);
          } else {
            alert(data.error || "Error al importar.");
          }
        } catch (err) {
          alert("Error de conexión: " + err.message);
        } finally {
          importBtn.disabled = false;
          if (spinner) spinner.classList.add("d-none");
        }
      });
    };
    setupImportBtn();

    // Modal guardar carrera
    const guardarBtn = document.getElementById("btn-guardar-carrera");
    if (!guardarBtn) {
      console.error("btn-guardar-carrera no encontrado en el DOM");
    } else {
    guardarBtn.addEventListener("click", async function () {
      const nombre = document.getElementById("carrera-modal-nombre").value.trim();
      const institucion_id = Number(document.getElementById("carrera-modal-universidad").value);
      const idx = Number(document.getElementById("carrera-modal-nombre").dataset.idx);
      if (!nombre) { alert("Ingresa el nombre de la carrera."); return; }
      if (!institucion_id) { alert("Selecciona una universidad."); return; }
      try {
        this.disabled = true;
        const res = await fetch("/api/carreras", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre, institucion_id, estado: "ACTIVO" }),
        });
        if (!res.ok) {
          alert("Error HTTP " + res.status + " al crear carrera. Revisa la consola.");
          console.error("Response:", res);
          return;
        }
        const data = await res.json();
        if (!data.success) { alert(data.error || "Error al crear carrera."); return; }
        const nueva = data.data;
        if (!nueva || !nueva.id) {
          alert("Respuesta inesperada del servidor. Revisa la consola.");
          console.error("Respuesta:", data);
          return;
        }
        catalogos.carreras.push(nueva);
        // Actualizar TODOS los selects de carrera dentro de #unir-table-wrapper que pertenezcan a la misma universidad
        const wrapper = document.getElementById("unir-table-wrapper");
        if (wrapper) {
          wrapper.querySelectorAll(`.carrera-select`).forEach((sel) => {
            const i = Number(sel.dataset.idx);
            if (!resultados[i]) return;
            if (resultados[i].institucionId !== institucion_id) return;
            // Ya tiene la opción?
            if (sel.querySelector(`option[value="${nueva.id}"]`)) return;
            const opt = document.createElement("option");
            opt.value = nueva.id;
            opt.textContent = nueva.nombre;
            sel.appendChild(opt);
            // Recrear Choices.js si existe instancia previa
            const oldInst = choicesInstances.find((c) => c.passedElement && c.passedElement.element === sel);
            if (oldInst) {
              oldInst.destroy();
              choicesInstances.splice(choicesInstances.indexOf(oldInst), 1);
            }
            const newInst = makeChoices(sel);
            if (i === idx && newInst) {
              resultados[i].carreraId = nueva.id;
              newInst.setChoiceByValue(String(nueva.id));
            }
          });
        }
        bootstrap.Modal.getInstance(document.getElementById("modal-agregar-carrera"))?.hide();
      } catch (err) {
        alert("Error: " + err.message);
        console.error(err);
      } finally {
        this.disabled = false;
      }
    });
    }

    resultados.forEach((d, idx) => {
      const prioEl = document.querySelector(`.prio-select[data-idx="${idx}"]`);
      if (prioEl) {
        if (d.prioridad) prioEl.value = d.prioridad;
        makeChoices(prioEl, { searchEnabled: false, placeholder: false });
      }

      const tareaEl = document.querySelector(`.tarea-select[data-idx="${idx}"]`);
      if (tareaEl) {
        tareaEl.addEventListener("change", function () {
          const i = Number(this.dataset.idx);
          const opt = this.options[this.selectedIndex];
          const minutos = opt ? Number(opt.dataset.minutos) : 60;
          if (resultados[i]) {
            resultados[i]._tarea_id = this.value ? Number(this.value) : null;
            resultados[i].duracion = minutos;
          }
        });
        makeChoices(tareaEl);
      }

      const instEl = document.querySelector(`.inst-select[data-idx="${idx}"]`);
      if (instEl) {
        if (d.institucionId) instEl.value = d.institucionId;
        const instChoices = makeChoices(instEl);
        instEl.addEventListener("change", function () {
          const i = Number(this.dataset.idx);
          const val = this.value ? Number(this.value) : null;
          if (resultados[i]) resultados[i].institucionId = val;
          updateCarreraChoices(i, val);
        });
      }

      const carreraEl = document.querySelector(`.carrera-select[data-idx="${idx}"]`);
      if (carreraEl) {
        if (d.carreraId) carreraEl.value = d.carreraId;
        const carreraChoices = makeChoices(carreraEl);
        carreraEl._choicesInstance = carreraChoices;
        carreraEl.addEventListener("change", function () {
          const i = Number(this.dataset.idx);
          if (resultados[i]) resultados[i].carreraId = this.value ? Number(this.value) : null;
        });
      }

      const nivelEl = document.querySelector(`.nivel-select[data-idx="${idx}"]`);
      if (nivelEl) {
        if (d.nivelId) nivelEl.value = d.nivelId;
        makeChoices(nivelEl);
        nivelEl.addEventListener("change", function () {
          const i = Number(this.dataset.idx);
          if (resultados[i]) resultados[i].nivelId = this.value ? Number(this.value) : null;
        });
      }
    });

    stepPreview.classList.remove("d-none");
    stepResult.classList.add("d-none");
  }

  function esc(s) {
    if (!s && s !== 0) return "-";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function trunc(s, max) {
    if (!s) return "";
    return s.length > max ? s.substring(0, max) + "…" : s;
  }

  // ---- Importar (botón dentro del tab Unir, se configura en renderPreview) ----

  function renderResult(data) {
    destroyAllChoices();
    let html = `<div class="alert alert-success">
      <i class="ti ti-check-circle me-1"></i>
      Importación completada: <strong>${data.prospectos}</strong> prospectos y
      <strong>${data.actividades}</strong> actividades creadas.
    </div>`;

    if (data.errores?.length) {
      html += `<div class="alert alert-danger mt-2">
        <strong>${data.errores.length}</strong> errores:
        <ul>${data.errores.map((e) => "<li>" + esc(e.cliente || e.titulo) + ": " + esc(e.error) + "</li>").join("")}</ul>
      </div>`;
    }

    resultContent.innerHTML = html;
    stepPreview.classList.add("d-none");
    stepResult.classList.remove("d-none");
  }

  btnBack.addEventListener("click", () => {
    destroyAllChoices();
    stepPreview.classList.add("d-none");
    stepResult.classList.add("d-none");
  });

  btnReset.addEventListener("click", () => {
    destroyAllChoices();
    fileInput.value = "";
    resultados = [];
    tareas = [];
    catalogos = { instituciones: [], carreras: [], niveles: [] };
    sheetVendedores = {};
    sheetMapping.classList.add("d-none");
    sheetMappingList.innerHTML = "";
    stepPreview.classList.add("d-none");
    stepResult.classList.add("d-none");
    checkForm();
  });
})();