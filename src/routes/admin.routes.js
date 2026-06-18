import express from "express";
const router = express.Router();

function isAuxiliarProduccion(rol) {
  if (!rol || !rol.nombre) return false;
  // Normalizamos: minúsculas + sin acentos, para que "PRODUCCIÓN" matchee "produccion".
  const n = String(rol.nombre)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return n.includes("auxiliar") && n.includes("produccion");
}

const normRol = (rol) =>
  String(rol?.nombre || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const isAsistenteProduccion = (rol) =>
  normRol(rol).includes("asistente") && normRol(rol).includes("produccion");

// VALORADOR (rol.id === 10) → vista Kanban + Calendario.
const ROL_VALORADOR_ID = 10;

// ASISTENTE DE PRODUCCIÓN (rol.id === 11) → vista Calendario.
const ROL_ASISTENTE_PROD_ID = 11;

router.get("/", (req, res) => {
  const user = req.session?.user || {};
  const rol = user.rol || {};

  if (Number(rol.id) === ROL_VALORADOR_ID) {
    return res.render("home/dashboard-kanban", {
      title: "Mis tareas - Grupo ES",
      // FullCalendar (calendario) y SortableJS (drag&drop) vía CDN.
      script:
        '<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js"></script>\n' +
        '<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js"></script>\n' +
        '<script src="/assets/plugins/fullcalendar/index.global.min.js?v=' +
        Date.now() +
        '"></script>\n' +
        '<script src="/js/home/kanban.js?v=' +
        Date.now() +
        '"></script>',
    });
  }

  if (Number(rol.id) === ROL_ASISTENTE_PROD_ID) {
    return res.render("calendar/index", {
      title: "Calendario - Asistente de Producción",
      isAsistenteProduccion: true,
      // `?v=` con timestamp de boot evita que el navegador sirva una versión
      // cacheada vieja del bundle cuando estamos iterando sobre el front.
      script:
        '<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js"></script>\n' +
        '<script src="/assets/plugins/fullcalendar/index.global.min.js?v=' +
        Date.now() +
        '"></script>\n' +
        '<script src="/js/calendar/index.js?v=' +
        Date.now() +
        '"></script>',
    });
  }

  if (isAuxiliarProduccion(rol)) {
    return res.render("home/dashboard-auxiliar", {
      title: "Mis actividades - Grupo ES",
      isAuxiliarProduccion: true,
      // El script se inyecta al final del body por el layout.
      script:
        '<script src="/assets/plugins/fullcalendar/index.global.min.js"></script>',
    });
  }

  res.render("home/dashboard", { title: "Dashboard - Panel de Control" });
});

// Ruta de importación masiva de actividades (solo ASISTENTE DE PRODUCCIÓN)
router.get("/importar-actividades", (req, res) => {
  const user = req.session?.user || {};
  const rol = user.rol || {};

  if (!isAsistenteProduccion(rol) && Number(rol.id) !== ROL_ASISTENTE_PROD_ID) {
    return res.status(403).send("Acceso denegado. Solo ASISTENTE DE PRODUCCIÓN.");
  }

  res.render("admin/importar-actividades", {
    title: "Importar Actividades - Grupo ES",
    layout: "layout",
  });
});

export default router;
