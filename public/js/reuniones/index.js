/* global $, moment */
$(function () {
  const API_BASE = "/api/potenciales-clientes";

  // ---- Helpers ---------------------------------------------------------

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Devuelve "HH:MM" a partir de un Date Timetz. Prisma lo envía como
  // string ISO ("1970-01-01T18:00:00.000Z") o como Date. La columna
  // @db.Timetz guarda la hora en UTC desde el fix de toTime con
  // Date.UTC, por eso usamos getUTCHours / getUTCMinutes para
  // extraer la hora original (no la local del navegador).
  function formatHora(d) {
    if (!d) return "";
    if (typeof d === "string") {
      // 1) String ISO completo.
      if (/^\d{4}-\d{2}-\d{2}T/.test(d)) {
        const dt = new Date(d);
        if (!Number.isNaN(dt.getTime())) {
          const hh = String(dt.getUTCHours()).padStart(2, "0");
          const mm = String(dt.getUTCMinutes()).padStart(2, "0");
          return `${hh}:${mm}`;
        }
      }
      // 2) String HH:MM[:SS] ya formateado.
      const m = d.match(/^(\d{1,2}):(\d{2})/);
      return m ? `${m[1].padStart(2, "0")}:${m[2]}` : d;
    }
    // 3) Date → UTC por la misma razón que el caso ISO.
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const hh = String(dt.getUTCHours()).padStart(2, "0");
    const mm = String(dt.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function formatFecha(d) {
    if (!d) return "—";
    // 1) String ISO ("YYYY-MM-DDTHH:MM:SS.sssZ") o "YYYY-MM-DD":
    //    extraemos los primeros 10 chars para evitar el off-by-one
    //    de timezone al parsear a Date (la columna es @db.Date y no
    //    tiene componente horario relevante). Salida: DD/MM/YYYY.
    if (typeof d === "string") {
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
      return d;
    }
    // 2) Date
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("es-PE");
  }

  function linkDriveHtml(url) {
    if (!url) return '<span class="text-muted small">—</span>';
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="text-primary">
      <i class="ti ti-link me-1"></i> Abrir
    </a>`;
  }

  function tipoClienteBadge(t) {
    if (!t) return '<span class="text-muted small">—</span>';
    const v = String(t).toLowerCase();
    const variant =
      v === "cliente" ? "bg-success" : "bg-warning text-dark";
    return `<span class="badge ${variant}">${escapeHtml(t)}</span>`;
  }

  // ---- Tabla -----------------------------------------------------------

  function initTable() {
    const $tbl = $("#table-reuniones");
    if (!$tbl.length || !$.fn.DataTable) return;

    $("#table-reuniones").DataTable({
      language: window.DATATABLES_ES_CONFIG,
      ajax: {
        url: `${API_BASE}/reuniones`,
        dataSrc: "data",
        error: (xhr) => {
          console.error("Error cargando reuniones:", xhr);
        },
      },
      order: [[1, "desc"]],
      columns: [
        { data: "id", className: "text-muted small" },
        {
          data: "fecha",
          render: (d) => formatFecha(d),
        },
        {
          data: "hora",
          render: (d) =>
            d
              ? `<span class="font-monospace">${escapeHtml(formatHora(d))}</span>`
              : '<span class="text-muted small">—</span>',
        },
        { data: "detalle" },
        { data: "nombre_cliente" },
        {
          data: "celular",
          render: (d) =>
            d
              ? `<a href="tel:${escapeHtml(d)}" class="text-decoration-none">${escapeHtml(d)}</a>`
              : '<span class="text-muted small">—</span>',
        },
        {
          data: "nivel_academico",
          render: (d) => d || '<span class="text-muted small">—</span>',
        },
        {
          data: "carrera",
          render: (d) => d || '<span class="text-muted small">—</span>',
        },
        {
          data: "universidad",
          render: (d) => d || '<span class="text-muted small">—</span>',
        },
        {
          data: "link_drive",
          render: (d) => linkDriveHtml(d),
        },
        {
          data: "asistente_administrativa",
          render: (d, _t, row) => {
            if (!d) return '<span class="text-muted small">—</span>';
            const rol = row?.asistente_rol
              ? ` <span class="text-muted small">· ${escapeHtml(row.asistente_rol)}</span>`
              : "";
            return `${escapeHtml(d)}${rol}`;
          },
        },
        {
          data: "tipo_cliente",
          render: (d) => tipoClienteBadge(d),
        },
      ],
    });
  }

  // ---- Init ------------------------------------------------------------

  $(initTable);
});
