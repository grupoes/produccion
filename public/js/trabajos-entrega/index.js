(function () {
  const esc = (s) => {
    if (s == null) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  const fmtDDMMYYYY = (ymd) => {
    if (!ymd) return "—";
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : String(ymd);
  };
  const badgePrio = (p) => {
    const l = String(p || "").toUpperCase();
    if (l === "ALTA") return '<span class="badge bg-danger">ALTA</span>';
    if (l === "MEDIA") return '<span class="badge bg-warning text-dark">MEDIA</span>';
    if (l === "BAJA") return '<span class="badge bg-secondary">BAJA</span>';
    return "—";
  };
  const badgeEst = (est) => {
    const e = String(est || "").toLowerCase();
    if (e === "completada") return "bg-success";
    if (e === "en_progreso") return "bg-primary";
    if (e === "pendiente") return "bg-secondary";
    if (e === "cancelada") return "bg-danger";
    return "bg-secondary";
  };
  const renderContactos = (cs) => cs && cs.length ? cs.map(c => `<div>${esc(c.nombre || "—")}${c.celular ? ` · ${esc(c.celular)}` : ""}</div>`).join("") : "—";
  const renderActs = (acts) => acts && acts.length ? acts.map(a => `<div class="d-flex align-items-center gap-1"><span class="badge ${badgeEst(a.estado)}">${esc(a.tarea || "—")}</span> <small class="text-muted">${a.minutos_programados || 0}/${a.minutos_estimados || 0} min</small></div>`).join("") : "—";
  const renderDrive = (l) => l ? `<a href="${esc(l)}" target="_blank" rel="noopener" class="link-primary"><i class="ti ti-external-link"></i></a>` : "—";
  const renderTab = (tbodyId, countId, data) => {
    const tbody = document.getElementById(tbodyId);
    document.getElementById(countId).textContent = data.length;
    if (!data.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay trabajos para esta semana.</td></tr>'; return; }
    tbody.innerHTML = data.map((p, i) => `<tr><td>${i+1}</td><td><strong>${esc(p.titulo || "—")}</strong></td><td>${renderContactos(p.contactos)}</td><td>${fmtDDMMYYYY(p.fecha_entrega)}</td><td>${badgePrio(p.prioridad)}</td><td>${renderActs(p.actividades)}</td><td>${p.usuario_venta ? esc(p.usuario_venta.nombre) : "—"}</td><td>${renderDrive(p.link_drive)}</td></tr>`).join("");
  };
  const load = async () => {
    try {
      const fet = async (url) => { const r = await fetch(url, { credentials: "same-origin" }); if (!r.ok) throw new Error(await r.text()); return r.json(); };
      const [j1, j2] = await Promise.all([fet("/api/trabajos-entrega/esta-semana"), fet("/api/trabajos-entrega/proxima-semana")]);
      renderTab("js-tbody-esta", "js-count-esta", j1.data || []);
      renderTab("js-tbody-prox", "js-count-prox", j2.data || []);
    } catch (err) {
      ["js-tbody-esta", "js-tbody-prox"].forEach(id => document.getElementById(id).innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">Error: ${esc(err.message)}</td></tr>`);
    }
  };
  load();
})();