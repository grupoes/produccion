/* global $, bootstrap, Swal */
$(function () {
  // Mismo backend que potenciales-clientes, pero con filtro de estado.
  const API = "/api/potenciales-clientes?estado_cliente=cliente";

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

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(d) {
    if (!d) return '<span class="text-muted small">—</span>';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime()))
      return '<span class="text-muted small">—</span>';
    return dt.toLocaleDateString("es-PE");
  }

  function formatDateTime(d) {
    if (!d) return "—";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleString("es-PE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function prioridadBadge(p) {
    if (!p) return '<span class="text-muted small">—</span>';
    const variant =
      p === "ALTA" ? "bg-danger" : p === "MEDIA" ? "bg-warning" : "bg-secondary";
    return `<span class="badge ${variant}">${escapeHtml(p)}</span>`;
  }

  // ---- Render de celdas ------------------------------------------------

  function renderContactosCell(contactos) {
    if (!contactos || !contactos.length) {
      return '<span class="text-muted small">—</span>';
    }
    const items = contactos
      .map((c) => {
        const nombre = [c.nombres, c.apellidos]
          .filter(Boolean)
          .map((s) => escapeHtml(s))
          .join(" ");
        return `<div class="small">
          <i class="ti ti-user-circle me-1 text-muted"></i>${nombre || "—"}
          <span class="text-muted ms-1">${escapeHtml(c.celular || "")}</span>
        </div>`;
      })
      .join("");
    return `<div>${items}</div>`;
  }

  function renderUniCarreraCell(carrera) {
    if (!carrera) return '<span class="text-muted small">—</span>';
    const uni = carrera.institucion
      ? `<div class="small text-muted">${escapeHtml(carrera.institucion.nombre || "")}</div>`
      : "";
    return `<div>${escapeHtml(carrera.nombre || "—")}${uni}</div>`;
  }

  function renderTipoCell(proveedor) {
    if (proveedor) {
      return `<span class="badge bg-info-subtle text-info">
        <i class="ti ti-building me-1"></i>${escapeHtml(proveedor.nombre)}
      </span>`;
    }
    return `<span class="badge bg-primary-subtle text-primary">
      <i class="ti ti-user me-1"></i>Propio
    </span>`;
  }

  // ---- Modal de detalle -----------------------------------------------

  const detalleModalEl = document.getElementById("cliente-detalle-modal");
  const detalleModal = new bootstrap.Modal(detalleModalEl);
  const $detalleBody = $("#js-cli-detalle-body");

  async function openDetalle(id) {
    $detalleBody.html(
      '<div class="text-center text-muted py-4">Cargando…</div>',
    );
    detalleModal.show();
    try {
      const res = await fetch(`/api/potenciales-clientes/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success)
        throw new Error(json.error || "Error al cargar el cliente.");
      const p = json.data;
      if (!p) throw new Error("Cliente no encontrado.");

      const contactosHtml = (p.contactos || [])
        .map((c) => {
          const nombre = [c.nombres, c.apellidos]
            .filter(Boolean)
            .map((s) => escapeHtml(s))
            .join(" ");
          return `<li class="list-group-item d-flex justify-content-between align-items-center">
            <div><i class="ti ti-user-circle me-1 text-muted"></i>${nombre || "—"}</div>
            <span class="text-muted small">${escapeHtml(c.celular || "")}</span>
          </li>`;
        })
        .join("");

      const historialHtml = (p.historial || [])
        .map((h) => {
          const color =
            {
              registrado: "bg-success",
              actualizado: "bg-info",
              asignado: "bg-primary",
              completado: "bg-success",
              perdido: "bg-danger",
              cancelado: "bg-secondary",
              cliente: "bg-primary",
            }[(h.estado || "").toLowerCase()] || "bg-secondary";
          const usuario = h.usuario?.nombre || h.usuario?.usuario || "Sistema";
          return `<li class="list-group-item">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="badge ${color}">${escapeHtml(h.estado || "—")}</span>
              ${h.activo ? '<span class="badge bg-warning-subtle text-warning">Vigente</span>' : ""}
              <span class="small text-muted">${escapeHtml(formatDateTime(h.fecha_inicio))}${
                h.fecha_fin
                  ? ` → ${escapeHtml(formatDateTime(h.fecha_fin))}`
                  : " (en curso)"
              }</span>
            </div>
            ${h.comentario ? `<div class="small mt-1">${escapeHtml(h.comentario)}</div>` : ""}
            <div class="small text-muted mt-1"><i class="ti ti-user me-1"></i>${escapeHtml(usuario)}</div>
          </li>`;
        })
        .join("");

      $detalleBody.html(`
        <div class="d-flex align-items-start justify-content-between flex-wrap gap-2 mb-3">
          <div>
            <h5 class="mb-1">${escapeHtml(p.titulo_prospecto || "Sin título")}</h5>
            <div class="text-muted small">Cliente #${p.id} · Estado: <span class="badge bg-primary-subtle text-primary">${escapeHtml(p.estado_cliente || "cliente")}</span></div>
          </div>
          <div class="d-flex gap-2 align-items-center">
            ${prioridadBadge(p.prioridad)}
          </div>
        </div>

        <div class="row g-3">
          <div class="col-md-6">
            <div class="small text-muted text-uppercase fw-semibold">Universidad / Carrera</div>
            <div>${escapeHtml(p.carrera?.nombre || "—")}</div>
            <div class="small text-muted">${escapeHtml(p.carrera?.institucion?.nombre || "")}</div>
          </div>
          <div class="col-md-6">
            <div class="small text-muted text-uppercase fw-semibold">Nivel académico</div>
            <div>${escapeHtml(p.nivel_academico?.nombre || "—")}</div>
          </div>
          <div class="col-md-6">
            <div class="small text-muted text-uppercase fw-semibold">Fecha de entrega</div>
            <div>${formatDate(p.fecha_entrega)}</div>
          </div>
          <div class="col-md-6">
            <div class="small text-muted text-uppercase fw-semibold">Tipo</div>
            <div>${renderTipoCell(p.proveedor)}</div>
          </div>
          <div class="col-md-12">
            <div class="small text-muted text-uppercase fw-semibold">Tarea</div>
            <div>${escapeHtml(p.actividad?.tarea?.nombre || "—")}</div>
          </div>
          ${
            p.link_drive
              ? `<div class="col-md-12">
                  <div class="small text-muted text-uppercase fw-semibold">Link Drive</div>
                  <a href="${escapeHtml(p.link_drive)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.link_drive)}</a>
                </div>`
              : ""
          }
          ${
            p.contenido
              ? `<div class="col-md-12">
                  <div class="small text-muted text-uppercase fw-semibold">Observaciones</div>
                  <div class="text-muted">${escapeHtml(p.contenido)}</div>
                </div>`
              : ""
          }
        </div>

        <hr class="my-3" />

        <h6 class="text-uppercase text-muted fs-xxs fw-semibold mb-2">Contactos</h6>
        ${
          contactosHtml
            ? `<ul class="list-group list-group-flush mb-3">${contactosHtml}</ul>`
            : '<div class="text-muted small">Sin contactos.</div>'
        }

        <h6 class="text-uppercase text-muted fs-xxs fw-semibold mb-2">Historial</h6>
        ${
          historialHtml
            ? `<ul class="list-group list-group-flush">${historialHtml}</ul>`
            : '<div class="text-muted small">Sin movimientos.</div>'
        }
      `);
    } catch (err) {
      $detalleBody.html(
        `<div class="alert alert-danger mb-0">${escapeHtml(err.message || "Error")}</div>`,
      );
    }
  }

  // ---- DataTable -------------------------------------------------------

  const table = $("#table-clientes").DataTable({
    language: window.DATATABLES_ES_CONFIG,
    ajax: {
      url: API,
      dataSrc: (json) => {
        const data = json.data || [];
        $("#clientes-count").text(data.length);
        return data;
      },
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
      {
        data: "titulo_prospecto",
        defaultContent: '<span class="text-muted">—</span>',
      },
      {
        data: "contactos",
        orderable: false,
        searchable: false,
        render: (d) => renderContactosCell(d),
      },
      {
        data: "carrera",
        orderable: false,
        searchable: false,
        render: (d) => renderUniCarreraCell(d),
      },
      {
        data: "actividad",
        defaultContent: '<span class="text-muted small">—</span>',
        render: (a) =>
          a && a.tarea
            ? escapeHtml(a.tarea.nombre)
            : '<span class="text-muted small">—</span>',
      },
      {
        data: "proveedor",
        orderable: false,
        searchable: false,
        render: (d) => renderTipoCell(d),
      },
      {
        data: "prioridad",
        render: (d) => prioridadBadge(d),
      },
      {
        data: "fecha_entrega",
        render: (d) => formatDate(d),
      },
      {
        data: null,
        orderable: false,
        searchable: false,
        className: "text-center",
        render: (_d, _t, row) =>
          `<i class="ti ti-eye fs-4 text-primary btn-ver" style="cursor: pointer;" title="Ver detalle" data-id="${row.id}"></i>`,
      },
    ],
  });

  // ---- Eventos ---------------------------------------------------------

  $("#table-clientes").on("click", ".btn-ver", function () {
    openDetalle(Number($(this).data("id")));
  });
});
