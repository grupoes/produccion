/* global io, Swal, lucide */

(function () {
  "use strict";

  if (!window.AUTH_USER || !window.AUTH_USER.id) return;

  const API = {
    recientes: "/api/notificaciones/recientes",
    noLeidas: "/api/notificaciones/no-leidas",
    marcarLeida: (id) => `/api/notificaciones/${id}/leida`,
    marcarTodas: "/api/notificaciones/leidas",
  };

  const bell = document.getElementById("notif-bell");
  const badge = document.getElementById("notif-count-badge");
  const list = document.getElementById("notif-list");
  const markAll = document.getElementById("notif-mark-all");

  if (!bell || !badge || !list) return;

  let unread = 0;
  let loaded = false;

  // ---- helpers ---------------------------------------------------------
  function setBadge(n) {
    unread = Math.max(0, Number(n) || 0);
    if (unread === 0) {
      badge.classList.add("d-none");
      badge.textContent = "0";
    } else {
      badge.classList.remove("d-none");
      badge.textContent = unread > 99 ? "99+" : String(unread);
    }
  }

  function timeAgo(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 5) return "Justo ahora";
    if (diff < 60) return `Hace ${diff}s`;
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} d`;
    return date.toLocaleDateString();
  }

  function iconByTipo(tipo) {
    const map = {
      INFO: "info",
      EXITO: "check-circle-2",
      ADVERTENCIA: "alert-triangle",
      ERROR: "alert-octagon",
      TAREA: "clipboard-list",
      ASIGNACION: "user-plus",
      PROSPECTO: "user-search",
    };
    return map[(tipo || "").toUpperCase()] || "bell";
  }

  function colorByPrioridad(prioridad) {
    const p = (prioridad || "").toUpperCase();
    if (p === "ALTA" || p === "URGENTE")
      return { bg: "bg-danger-subtle", text: "text-danger" };
    if (p === "MEDIA") return { bg: "bg-warning-subtle", text: "text-warning" };
    if (p === "BAJA") return { bg: "bg-info-subtle", text: "text-info" };
    return { bg: "bg-primary-subtle", text: "text-primary" };
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function buildItem(n) {
    const ico = iconByTipo(n.tipo);
    const { bg, text } = colorByPrioridad(n.prioridad);
    const unreadClass = n.es_leida ? "" : " notif-unread";
    return `
      <div
        class="dropdown-item notification-item py-2 text-wrap${unreadClass}"
        data-id="${n.id}"
        data-leida="${n.es_leida ? "1" : "0"}"
        style="${n.es_leida ? "" : "background-color: rgba(13,110,253,.06);"}"
      >
        <span class="d-flex gap-2 align-items-start">
          <span class="avatar-md flex-shrink-0">
            <span class="avatar-title ${bg} ${text} rounded-circle fs-22">
              <i data-lucide="${ico}" class="fs-xl"></i>
            </span>
          </span>
          <span class="flex-grow-1 text-muted">
            <span class="fw-semibold text-body d-block">${escapeHtml(n.titulo || "Notificación")}</span>
            <span class="d-block">${escapeHtml(n.mensaje || "")}</span>
            <span class="fs-xs text-muted">${timeAgo(n.created_at)}</span>
          </span>
        </span>
      </div>`;
  }

  function renderList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      list.innerHTML = `
        <div id="notif-empty" class="text-center text-muted py-4 fs-sm">
          <i data-lucide="bell-off" class="fs-22 d-block mx-auto mb-1"></i>
          Sin notificaciones por ahora
        </div>`;
    } else {
      list.innerHTML = items.map(buildItem).join("");
    }
    if (window.lucide && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }
  }

  function prependItem(n) {
    const empty = document.getElementById("notif-empty");
    if (empty) empty.remove();

    const wrap = document.createElement("div");
    wrap.innerHTML = buildItem(n).trim();
    const node = wrap.firstChild;
    list.insertBefore(node, list.firstChild);

    // limit visible items to ~10
    const items = list.querySelectorAll(".notification-item");
    if (items.length > 10) items[items.length - 1].remove();

    if (window.lucide && typeof lucide.createIcons === "function") {
      lucide.createIcons();
    }
  }

  // ---- toast (SweetAlert2) ---------------------------------------------
  function showToast(n) {
    if (typeof Swal === "undefined") return;
    const icon =
      (n.tipo || "").toUpperCase() === "ERROR"
        ? "error"
        : (n.tipo || "").toUpperCase() === "ADVERTENCIA"
          ? "warning"
          : (n.tipo || "").toUpperCase() === "EXITO"
            ? "success"
            : "info";
    Swal.fire({
      toast: true,
      position: "top-end",
      icon,
      title: n.titulo || "Nueva notificación",
      text: n.mensaje || "",
      showConfirmButton: false,
      timer: 5000,
      timerProgressBar: true,
    });
  }

  // ---- API calls -------------------------------------------------------
  async function fetchCount() {
    try {
      const r = await fetch(API.noLeidas, { credentials: "same-origin" });
      if (!r.ok) return;
      const j = await r.json();
      if (j && typeof j.count === "number") setBadge(j.count);
    } catch (_) {}
  }

  async function fetchList() {
    try {
      const r = await fetch(API.recientes, { credentials: "same-origin" });
      if (!r.ok) return;
      const j = await r.json();
      const data = (j && j.data) || [];
      renderList(data);
      loaded = true;
    } catch (_) {}
  }

  async function marcarLeida(id) {
    try {
      const r = await fetch(API.marcarLeida(id), {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      return r.ok;
    } catch (_) {
      return false;
    }
  }

  async function marcarTodas() {
    try {
      const r = await fetch(API.marcarTodas, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      return r.ok;
    } catch (_) {
      return false;
    }
  }

  // ---- event wiring ----------------------------------------------------
  bell.addEventListener("click", () => {
    fetchList();
  });

  list.addEventListener("click", async (e) => {
    const item = e.target.closest(".notification-item");
    if (!item) return;
    const id = item.getAttribute("data-id");
    const leida = item.getAttribute("data-leida") === "1";
    if (!id || leida) return;

    const ok = await marcarLeida(id);
    if (ok) {
      item.setAttribute("data-leida", "1");
      item.classList.remove("notif-unread");
      item.style.backgroundColor = "";
      setBadge(unread - 1);
    }
  });

  if (markAll) {
    markAll.addEventListener("click", async (e) => {
      e.preventDefault();
      const ok = await marcarTodas();
      if (ok) {
        setBadge(0);
        list.querySelectorAll(".notification-item").forEach((el) => {
          el.setAttribute("data-leida", "1");
          el.classList.remove("notif-unread");
          el.style.backgroundColor = "";
        });
      }
    });
  }

  // ---- socket.io --------------------------------------------------------
  function setupSocket() {
    if (typeof io !== "function") return;
    const socket = io({
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      // ya autenticado en el handshake vía session
    });

    socket.on("nueva-notificacion", (n) => {
      if (!n) return;
      setBadge(unread + 1);
      showToast(n);
      // si el dropdown ya se abrió alguna vez, mantenlo al día
      if (loaded) prependItem(n);
    });

    socket.on("disconnect", () => {});
    socket.on("connect_error", () => {});
  }

  // ---- init -------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    fetchCount();
    fetchList();
    setupSocket();
  });
})();
