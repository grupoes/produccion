/* global $, Swal */
$(function () {
  const API = "/api/turnos-ventas";

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

  // ===================================================================
  // Estado de la matriz
  // ===================================================================
  // original / current: Map<usuarioId, Set<diaId>>
  const state = {
    auxiliares: [],
    dias: [],
    original: new Map(),
    current: new Map(),
  };

  async function loadMatriz() {
    const $body = $("#turnos-body");
    $body.html(`<div class="text-center text-muted py-5">
      <span class="spinner-border spinner-border-sm me-2"></span> Cargando matriz…
    </div>`);
    try {
      const res = await fetch(`${API}/matriz`);
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error || "Error al cargar la matriz.");

      const { auxiliares, dias, checks } = json.data;
      state.auxiliares = auxiliares || [];
      state.dias = dias || [];

      state.original = new Map();
      state.current = new Map();
      state.auxiliares.forEach((u) => {
        const set = new Set();
        state.dias.forEach((d) => {
          if (checks[`${u.id}-${d.id}`]) set.add(d.id);
        });
        state.original.set(u.id, new Set(set));
        state.current.set(u.id, new Set(set));
      });

      render();
      updateDirty();
    } catch (err) {
      $body.html(
        `<div class="alert alert-danger mb-0">${escapeHtml(err.message || "Error al cargar la matriz.")}</div>`,
      );
    }
  }

  function render() {
    const $body = $("#turnos-body");
    const { auxiliares, dias, current } = state;

    if (dias.length === 0) {
      $body.html(`<div class="alert alert-info mb-0">
        No hay días configurados (lunes a sábado).
      </div>`);
      return;
    }
    if (auxiliares.length === 0) {
      $body.html(`<div class="alert alert-info mb-0">
        No hay usuarios activos disponibles para asignar turnos.
      </div>`);
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="table table-bordered align-middle mb-0">
          <thead class="thead-sm text-uppercase fs-xxs">
            <tr>
              <th style="min-width: 240px;">Auxiliar</th>`;

    dias.forEach((d) => {
      html += `<th class="text-center" style="min-width: 110px;">
        <div class="d-flex flex-column align-items-center gap-1">
          <span>${escapeHtml(d.dia)}</span>
          <button type="button" class="btn btn-sm btn-link p-0 js-col-toggle" data-dia="${d.id}" title="Marcar/Desmarcar toda la columna">
            <i class="ti ti-checks"></i>
          </button>
        </div>
      </th>`;
    });
    html += `</tr></thead><tbody>`;

    auxiliares.forEach((u) => {
      const set = current.get(u.id) || new Set();
      html += `<tr>
        <td>
          <div class="d-flex align-items-center gap-2">
            <i class="ti ti-user-circle text-muted fs-4"></i>
            <div class="d-flex flex-column">
              <span class="fw-medium">${escapeHtml(u.nombre)}</span>
              <small class="text-muted">${escapeHtml(u.usuario)}${u.rol ? ' &middot; <span class="text-uppercase">' + escapeHtml(u.rol) + "</span>" : ""}</small>
            </div>
            <span class="badge bg-light text-muted ms-auto js-row-count" data-usuario="${u.id}">
              ${set.size}/${dias.length}
            </span>
            <button type="button" class="btn btn-sm btn-link p-0 js-row-toggle" data-usuario="${u.id}" title="Marcar/Desmarcar toda la fila">
              <i class="ti ti-checks"></i>
            </button>
          </div>
        </td>`;
      dias.forEach((d) => {
        const checked = set.has(d.id);
        html += `<td class="text-center">
          <div class="form-check d-inline-block">
            <input type="checkbox" class="form-check-input js-cell"
              data-usuario="${u.id}" data-dia="${d.id}" ${checked ? "checked" : ""} />
          </div>
        </td>`;
      });
      html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    $body.html(html);
  }

  function updateDirty() {
    const { original, current, auxiliares } = state;
    let dirty = 0;
    auxiliares.forEach((u) => {
      if (
        !setEqual(
          original.get(u.id) || new Set(),
          current.get(u.id) || new Set(),
        )
      ) {
        dirty++;
      }
    });
    $("#turnos-dirty")
      .toggle(dirty > 0)
      .text(`${dirty} cambio${dirty === 1 ? "" : "s"} sin guardar`);
    $("#btn-save-turnos").prop("disabled", dirty === 0);
  }

  // ===================================================================
  // Eventos
  // ===================================================================

  $("#turnos-body").on("change", ".js-cell", function () {
    const $c = $(this);
    const usuarioId = Number($c.data("usuario"));
    const diaId = Number($c.data("dia"));
    const set = state.current.get(usuarioId) || new Set();
    if ($c.is(":checked")) set.add(diaId);
    else set.delete(diaId);
    state.current.set(usuarioId, set);
    $(`.js-row-count[data-usuario="${usuarioId}"]`).text(
      `${set.size}/${state.dias.length}`,
    );
    updateDirty();
  });

  // Marcar/desmarcar toda la fila (todos los días para un auxiliar).
  $("#turnos-body").on("click", ".js-row-toggle", function () {
    const usuarioId = Number($(this).data("usuario"));
    const set = state.current.get(usuarioId) || new Set();
    const total = state.dias.length;
    const allOn = set.size === total;
    const next = new Set();
    if (!allOn) state.dias.forEach((d) => next.add(d.id));
    state.current.set(usuarioId, next);
    $(`#turnos-body .js-cell[data-usuario="${usuarioId}"]`).prop(
      "checked",
      !allOn,
    );
    $(`.js-row-count[data-usuario="${usuarioId}"]`).text(
      `${!allOn ? total : 0}/${total}`,
    );
    updateDirty();
  });

  // Marcar/desmarcar toda la columna (un día para todos los auxiliares).
  $("#turnos-body").on("click", ".js-col-toggle", function () {
    const diaId = Number($(this).data("dia"));
    const { auxiliares, current, dias } = state;
    let allOn = 0;
    auxiliares.forEach((u) => {
      if ((current.get(u.id) || new Set()).has(diaId)) allOn++;
    });
    const turnOn = allOn < auxiliares.length;
    auxiliares.forEach((u) => {
      const set = current.get(u.id) || new Set();
      if (turnOn) set.add(diaId);
      else set.delete(diaId);
      current.set(u.id, set);
      $(
        `#turnos-body .js-cell[data-usuario="${u.id}"][data-dia="${diaId}"]`,
      ).prop("checked", turnOn);
      $(`.js-row-count[data-usuario="${u.id}"]`).text(
        `${set.size}/${dias.length}`,
      );
    });
    updateDirty();
  });

  $("#btn-save-turnos").on("click", async function () {
    const { original, current, auxiliares } = state;
    const changes = [];
    auxiliares.forEach((u) => {
      const o = original.get(u.id) || new Set();
      const c = current.get(u.id) || new Set();
      if (!setEqual(o, c)) {
        changes.push({ usuario_id: u.id, dia_ids: [...c] });
      }
    });
    if (changes.length === 0) {
      showToast("No hay cambios para guardar.", "info");
      return;
    }
    try {
      $(this)
        .prop("disabled", true)
        .html('<span class="spinner-border spinner-border-sm me-1"></span>Guardando...');
      const res = await fetch(`${API}/matriz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes }),
      });
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error || "Error al guardar.");
      showToast(json.message || "Asignaciones guardadas.");
      await loadMatriz();
    } catch (err) {
      showToast(err.message || "Error al guardar.", "error");
    } finally {
      $("#btn-save-turnos")
        .prop("disabled", false)
        .html(
          '<i class="ti ti-device-floppy align-middle me-1"></i> Guardar cambios',
        );
    }
  });

  // ===================================================================
  // Init
  // ===================================================================
  loadMatriz();
});
