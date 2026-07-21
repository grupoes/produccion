(function () {
  "use strict";

  const API = "/api/calendario-asistente/permisos";

  let previewData = null;
  let usuariosCache = [];

  // ----- Helpers -----
  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(type, msg) {
    if (typeof window.showToast === "function") {
      window.showToast(type, msg);
    } else {
      alert(msg);
    }
  }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      ...(opts || {}),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const p = await res.json();
        detail = p?.error || "";
      } catch (_) { /* noop */ }
      const err = new Error(detail || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // ----- Cargar usuarios -----
  async function cargarUsuarios() {
    try {
      const json = await fetchJSON("/api/usuarios?all=true");
      const users = Array.isArray(json.data) ? json.data : [];
      usuariosCache = users;

      const opts = users
        .map((u) => {
          const p = u.personas || {};
          const nombre =
            [p.nombres, p.apellidos].filter(Boolean).join(" ") ||
            u.usuario ||
            `ID ${u.id}`;
          return `<option value="${escapeHtml(u.id)}">${escapeHtml(nombre)}</option>`;
        })
        .join("");

      document.getElementById("pu-usuario").innerHTML =
        '<option value="">— Selecciona —</option>' + opts;
      document.getElementById("pu-filtro-usuario").innerHTML =
        '<option value="">Todos los usuarios</option>' + opts;
      document.getElementById("au-usuario").innerHTML =
        '<option value="">— Selecciona —</option>' + opts;
    } catch (e) {
      showToast("error", "Error al cargar usuarios: " + e.message);
    }
  }

  // ----- Vista previa -----
  async function onClickPreview() {
    const usuarioId = document.getElementById("pu-usuario").value;
    const fecha = document.getElementById("pu-fecha").value;
    const horaInicio = document.getElementById("pu-hora-inicio").value;
    const horaFin = document.getElementById("pu-hora-fin").value;

    if (!usuarioId || !fecha || !horaInicio || !horaFin) {
      showToast("warning", "Completa todos los campos requeridos.");
      return;
    }

    const btn = document.getElementById("pu-btn-preview");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Analizando…';

    try {
      const json = await fetchJSON(
        `${API}/preview?usuario_id=${encodeURIComponent(usuarioId)}&fecha=${encodeURIComponent(fecha)}&hora_inicio=${encodeURIComponent(horaInicio)}&hora_fin=${encodeURIComponent(horaFin)}`,
      );
      previewData = json.data;
      renderPreview(previewData);

      const btnCrear = document.getElementById("pu-btn-crear");
      btnCrear.disabled = false;
    } catch (e) {
      showToast("error", "Error en vista previa: " + e.message);
      document.getElementById("pu-preview-result").classList.add("d-none");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-eye me-1"></i>Vista previa';
    }
  }

  function renderPreview(data) {
    const container = document.getElementById("pu-preview-result");
    const content = document.getElementById("pu-preview-content");
    container.classList.remove("d-none");

    const paramsHTML = `
      <p class="mb-2">
        <strong>${escapeHtml(data.fecha)}</strong>
        ${escapeHtml(data.hora_inicio)} – ${escapeHtml(data.hora_fin)}
      </p>`;

    if (data.actividades.length === 0) {
      content.innerHTML =
        paramsHTML +
        '<div class="alert alert-success mb-0"><i class="ti ti-check me-1"></i>No hay actividades en este rango.</div>';
      return;
    }

    const urgentes = data.urgentes || [];
    const movibles = data.actividades.filter(
      (a) => a.prioridad !== "ALTA" && !a.bloqueada,
    );
    const noMovibles = data.no_movibles || [];

    let html = paramsHTML;
    html += `<div class="mb-2"><strong>Total afectadas:</strong> ${data.actividades.length}</div>`;

    if (urgentes.length > 0) {
      html +=
        `<div class="alert alert-warning py-2 px-3 mb-2">
          <i class="ti ti-alert-triangle me-1"></i>
          <strong>${urgentes.length} urgente(s)</strong> — no se moverán
          <ul class="mb-0 mt-1 ps-3">`;
      urgentes.forEach(
        (a) =>
          (html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")}</li>`),
      );
      html += "</ul></div>";
    }

    if (movibles.length > 0) {
      html +=
        `<div class="alert alert-info py-2 px-3 mb-2">
          <i class="ti ti-arrows-shuffle me-1"></i>
          <strong>${movibles.length} reprogramable(s)</strong> — se recolocarán después del permiso
          <ul class="mb-0 mt-1 ps-3">`;
      movibles.forEach(
        (a) =>
          (html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")} (${escapeHtml(a.hora_inicio)}–${escapeHtml(a.hora_fin)})</li>`),
      );
      html += "</ul></div>";
    }

    if (noMovibles.length > 0) {
      html +=
        `<div class="alert alert-danger py-2 px-3 mb-0">
          <i class="ti ti-x me-1"></i>
          <strong>${noMovibles.length} no movible(s)</strong> — exceden fecha de entrega
          <ul class="mb-0 mt-1 ps-3">`;
      noMovibles.forEach(
        (a) =>
          (html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")} (${escapeHtml(a.motivo || "")})</li>`),
      );
      html += "</ul></div>";
    }

    content.innerHTML = html;
  }

  // ----- Crear permiso -----
  async function onClickCrear() {
    const usuarioId = document.getElementById("pu-usuario").value;
    const fecha = document.getElementById("pu-fecha").value;
    const horaInicio = document.getElementById("pu-hora-inicio").value;
    const horaFin = document.getElementById("pu-hora-fin").value;
    const motivo = document.getElementById("pu-motivo").value;

    if (!usuarioId || !fecha || !horaInicio || !horaFin) {
      showToast("warning", "Completa todos los campos requeridos.");
      return;
    }

    if (!confirm("¿Crear permiso y reprogramar actividades automáticamente?")) return;

    const btn = document.getElementById("pu-btn-crear");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creando…';

    try {
      const json = await fetchJSON(API, {
        method: "POST",
        body: JSON.stringify({
          usuario_id: Number(usuarioId),
          fecha,
          hora_inicio: horaInicio,
          hora_fin: horaFin,
          motivo,
        }),
      });
      renderResultado(json.data);
      cargarPermisos();
      // Resetear formulario
      document.getElementById("pu-motivo").value = "";
      document.getElementById("pu-btn-crear").disabled = true;
    } catch (e) {
      showToast("error", "Error al crear permiso: " + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-lock me-1"></i>Crear permiso y reprogramar';
    }
  }

  function renderResultado(data) {
    const container = document.getElementById("pu-crear-result");
    const content = document.getElementById("pu-crear-content");
    container.classList.remove("d-none");

    let html = `<p><strong>${escapeHtml(data.fecha)}</strong> ${escapeHtml(data.hora_inicio)} – ${escapeHtml(data.hora_fin)}</p>`;

    if (data.urgentes && data.urgentes.length > 0) {
      html +=
        `<div class="alert alert-warning py-2 px-3 mb-2">
          <i class="ti ti-alert-triangle me-1"></i>
          <strong>${data.urgentes.length} urgente(s) no movidas</strong>
          <ul class="mb-0 mt-1 ps-3">`;
      data.urgentes.forEach(
        (a) =>
          (html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")}</li>`),
      );
      html += "</ul></div>";
    }

    if (data.reprogramadas && data.reprogramadas.length > 0) {
      html +=
        `<div class="alert alert-success py-2 px-3 mb-2">
          <i class="ti ti-check me-1"></i>
          <strong>${data.reprogramadas.length} reprogramada(s)</strong>
          <ul class="mb-0 mt-1 ps-3">`;
      data.reprogramadas.forEach(
        (a) =>
          (html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")}: ${escapeHtml(a.fecha_origen)} ${escapeHtml(a.hora_origen)} → <strong>${escapeHtml(a.fecha_destino)} ${escapeHtml(a.hora_destino)}</strong></li>`),
      );
      html += "</ul></div>";
    }

    if (data.no_movibles && data.no_movibles.length > 0) {
      html +=
        `<div class="alert alert-danger py-2 px-3 mb-0">
          <i class="ti ti-x me-1"></i>
          <strong>${data.no_movibles.length} no movible(s)</strong>
          <ul class="mb-0 mt-1 ps-3">`;
      data.no_movibles.forEach(
        (a) =>
          (html += `<li>${escapeHtml(a.tarea_nombre || "—")} — ${escapeHtml(a.titulo_prospecto || "—")} (${escapeHtml(a.motivo || "")})</li>`),
      );
      html += "</ul></div>";
    }

    if (!data.urgentes?.length && !data.reprogramadas?.length && !data.no_movibles?.length) {
      html += '<div class="alert alert-success mb-0"><i class="ti ti-check me-1"></i>Permiso creado sin actividades afectadas.</div>';
    }

    content.innerHTML = html;
  }

  // ----- Listar permisos -----
  async function cargarPermisos() {
    const filtroUsuario = document.getElementById("pu-filtro-usuario").value;
    let url = API;
    const params = [];
    if (filtroUsuario) {
      params.push(`usuario_id=${encodeURIComponent(filtroUsuario)}`);
    }
    if (params.length) url += "?" + params.join("&");

    try {
      const json = await fetchJSON(url);
      const permisos = Array.isArray(json.data) ? json.data : [];
      renderPermisos(permisos);
    } catch (e) {
      showToast("error", "Error al cargar permisos: " + e.message);
    }
  }

  function renderPermisos(permisos) {
    const tbody = document.getElementById("pu-tbody");
    const empty = document.getElementById("pu-empty");

    if (permisos.length === 0) {
      tbody.innerHTML = "";
      empty.classList.remove("d-none");
      return;
    }
    empty.classList.add("d-none");

    tbody.innerHTML = permisos
      .map(
        (p) => `
      <tr>
        <td>${escapeHtml(p.usuario_persona || p.usuario_nombre || "—")}</td>
        <td>${escapeHtml(p.fecha || "—")}</td>
        <td>${escapeHtml(p.hora_inicio || "—")}</td>
        <td>${escapeHtml(p.hora_fin || "—")}</td>
        <td>${escapeHtml(p.motivo || "—")}</td>
        <td>
          <button class="btn btn-sm btn-outline-danger pu-btn-eliminar" data-id="${p.id}">
            <i class="ti ti-trash"></i>
          </button>
        </td>
      </tr>`,
      )
      .join("");

    // Bind eliminar
    tbody.querySelectorAll(".pu-btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", () => onClickEliminar(btn.dataset.id));
    });
  }

  // ----- Eliminar permiso -----
  async function onClickEliminar(id) {
    if (!confirm("¿Eliminar este permiso? Se restaurará el horario anterior.")) return;

    try {
      await fetchJSON(`${API}/${id}`, { method: "DELETE" });
      showToast("success", "Permiso eliminado.");
      cargarPermisos();
    } catch (e) {
      showToast("error", "Error al eliminar permiso: " + e.message);
    }
  }

  // ----- Init -----
  document.addEventListener("DOMContentLoaded", function () {
    cargarUsuarios();
    cargarPermisos();

    document.getElementById("pu-btn-preview").addEventListener("click", onClickPreview);
    document.getElementById("pu-btn-crear").addEventListener("click", onClickCrear);
    document.getElementById("pu-filtro-usuario").addEventListener("change", cargarPermisos);

    // Ausencias
    document.getElementById("au-btn-preview").addEventListener("click", onClickPreviewAusencia);
    document.getElementById("au-btn-ejecutar").addEventListener("click", onClickEjecutarAusencia);
  });

  // ======================================================================
  // Ausencias
  // ======================================================================

  let ausenciasPreviewData = [];

  async function onClickPreviewAusencia() {
    const uid = Number(document.getElementById("au-usuario").value);
    const fechaDesde = document.getElementById("au-fecha-desde").value;
    const fechaHasta = document.getElementById("au-fecha-hasta").value;

    if (!uid) { showToast("warning", "Seleccioná un usuario."); return; }
    if (!fechaDesde || !fechaHasta) { showToast("warning", "Completá las fechas."); return; }
    if (fechaDesde > fechaHasta) { showToast("warning", "'Desde' debe ser anterior a 'Hasta'."); return; }

    const btn = document.getElementById("au-btn-preview");
    const statusEl = document.getElementById("au-preview-status");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Analizando…';
    if (statusEl) statusEl.textContent = "Consultando…";

    try {
      const json = await fetchJSON(
        `${API}/ausencias/preview?usuario_id=${uid}&fecha_desde=${encodeURIComponent(fechaDesde)}&fecha_hasta=${encodeURIComponent(fechaHasta)}`,
      );
      ausenciasPreviewData = json.data || [];
      if (statusEl) statusEl.textContent = `${ausenciasPreviewData.length} actividad(es) encontradas.`;
      renderAusenciaPreview(ausenciasPreviewData);
    } catch (e) {
      if (statusEl) statusEl.textContent = "Error";
      showToast("error", "Error en preview: " + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-eye me-1"></i>Vista previa';
    }
  }

  function renderAusenciaPreview(actividades) {
    const wrap = document.getElementById("au-actividades-wrap");
    const tbody = document.getElementById("au-tbody");
    const countEl = document.getElementById("au-actividades-count");
    const warning = document.getElementById("au-urgentes-warning");
    const btnEjecutar = document.getElementById("au-btn-ejecutar");
    if (!wrap || !tbody) return;

    if (!actividades.length) {
      wrap.classList.add("d-none");
      return;
    }

    wrap.classList.remove("d-none");
    if (countEl) countEl.textContent = String(actividades.length);

    const tieneUrgente = actividades.some((a) => a.prioridad === "ALTA" || a.bloqueada);
    warning.classList.toggle("d-none", !tieneUrgente);

    tbody.innerHTML = actividades
      .map((a, i) => {
        const esUrgente = a.prioridad === "ALTA" || a.bloqueada;
        const prioBadge =
          a.prioridad === "ALTA"
            ? '<span class="badge bg-danger-subtle text-danger">ALTA</span>'
            : a.prioridad === "MEDIA"
              ? '<span class="badge bg-warning-subtle text-warning">MEDIA</span>'
              : '<span class="badge bg-secondary-subtle text-secondary">BAJA</span>';
        const bloqueadaTag = a.bloqueada
          ? '<span class="badge bg-dark text-white ms-1">Bloqueada</span>'
          : "";
        return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(a.titulo_prospecto || "—")}</td>
          <td>${escapeHtml(a.tarea_nombre || "—")}</td>
          <td>${escapeHtml(a.fecha)}</td>
          <td>${escapeHtml(a.hora_inicio)}</td>
          <td>${prioBadge}${bloqueadaTag}</td>
          <td>${escapeHtml(a.fecha_entrega || "—")}</td>
          <td>
            <select class="form-select form-select-sm au-accion" data-actividad-id="${a.actividad_id}">
              <option value="reasignar">Reasignar</option>
              <option value="bono"${esUrgente ? " selected" : ""}>Pasar a bono</option>
            </select>
            <div class="au-usuario-destino-wrap" style="margin-top:4px;${esUrgente ? "display:none" : ""}">
              <select class="form-select form-select-sm au-usuario-destino" data-actividad-id="${a.actividad_id}">
                <option value="">Cambiar usuario…</option>
              </select>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    // Poblar selects de usuarios destino
    const destSelects = tbody.querySelectorAll(".au-usuario-destino");
    const selUsuarios = document.getElementById("pu-usuario");
    if (selUsuarios) {
      Array.from(selUsuarios.options).forEach((opt) => {
        if (!opt.value) return;
        const label = opt.textContent.trim();
        destSelects.forEach((sel) => {
          sel.innerHTML += `<option value="${opt.value}">${escapeHtml(label)}</option>`;
        });
      });
    }

    // Show/hide destino cuando cambia acción
    tbody.querySelectorAll(".au-accion").forEach((sel) => {
      sel.addEventListener("change", function () {
        const row = this.closest("tr");
        const wrap = row?.querySelector(".au-usuario-destino-wrap");
        if (wrap) wrap.style.display = this.value === "reasignar" ? "" : "none";
      });
    });

    if (btnEjecutar) btnEjecutar.disabled = false;
  }

  async function onClickEjecutarAusencia() {
    const uid = Number(document.getElementById("au-usuario").value);
    const fechaDesde = document.getElementById("au-fecha-desde").value;
    const fechaHasta = document.getElementById("au-fecha-hasta").value;
    const motivo = document.getElementById("au-motivo").value || "Ausencia";

    if (!uid || !fechaDesde || !fechaHasta) {
      showToast("warning", "Completá todos los campos.");
      return;
    }

    const tbody = document.getElementById("au-tbody");
    const acciones = [];
    tbody?.querySelectorAll(".au-accion").forEach((sel) => {
      const actividadId = Number(sel.dataset.actividadId);
      if (!actividadId) return;
      const accion = sel.value;
      const acc = { actividad_id: actividadId, accion };
      if (accion === "reasignar") {
        const row = sel.closest("tr");
        const destSel = row?.querySelector(".au-usuario-destino");
        const destinoId = Number(destSel?.value || 0);
        if (destinoId) acc.usuario_destino_id = destinoId;
      }
      acciones.push(acc);
    });

    if (!acciones.length) {
      showToast("warning", "No hay actividades para procesar.");
      return;
    }

    if (!confirm(`¿Ejecutar ausencia? Se procesarán ${acciones.length} actividad(es). Las urgentes pasarán a bono. Las reasignadas intentarán ubicarse en el usuario destino.`)) return;

    const btn = document.getElementById("au-btn-ejecutar");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Ejecutando…';

    try {
      const json = await fetchJSON(`${API}/ausencias/ejecutar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario_id: uid,
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta,
          motivo,
          acciones,
        }),
      });
      const data = json.data || {};
      const resultEl = document.getElementById("au-result");
      const partes = [];
      if (data.reasignadas?.length) {
        partes.push(`<span class="text-success fw-semibold">${data.reasignadas.length} reasignada(s)</span>`);
      }
      if (data.bonos?.length) {
        const bonosReales = data.bonos.filter(b => b.tipo !== "bono_auto");
        const bonosAuto = data.bonos.filter(b => b.tipo === "bono_auto");
        if (bonosReales.length) partes.push(`<span class="text-secondary">${bonosReales.length} a bono</span>`);
        if (bonosAuto.length) partes.push(`<span class="text-warning">${bonosAuto.length} pasaron a bono (no caben antes del deadline)</span>`);
      }
      if (data.errores?.length) partes.push(`<span class="text-danger">${data.errores.length} error(es)</span>`);
      const resumen = partes.length ? partes.join(" · ") : "Sin cambios.";
      if (resultEl) {
        resultEl.innerHTML = `
          <div class="alert alert-success py-2 mb-0">
            <i class="ti ti-check me-1"></i> Ausencia ejecutada.
            <br><small>${resumen}</small>
          </div>`;
      }
      showToast("success", "Ausencia ejecutada.");
    } catch (e) {
      const resultEl = document.getElementById("au-result");
      if (resultEl) {
        resultEl.innerHTML = `<div class="alert alert-danger py-2 mb-0">${escapeHtml(e.message || "Error")}</div>`;
      }
      showToast("error", "Error: " + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-play me-1"></i>Ejecutar ausencia';
    }
  }
})();
