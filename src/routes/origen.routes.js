import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.render("origen-contacto/origen-contacto", {
    title: "Origen de Contacto - Panel de Control",
    style:
      "<link href='/assets/plugins/datatables/responsive.bootstrap5.min.css' rel='stylesheet' />\n" +
      "<link href='https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css' rel='stylesheet' />",
    script:
      "<script src='https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js'></script>\n" +
      "<script src='/assets/plugins/datatables/dataTables.min.js'></script>\n" +
      "<script src='/assets/plugins/datatables/dataTables.bootstrap5.min.js'></script>\n" +
      "<script src='/assets/plugins/datatables/dataTables.responsive.min.js'></script>\n" +
      "<script src='/assets/plugins/datatables/responsive.bootstrap5.min.js'></script>\n" +
      "<script src='/js/origen-contacto/index.js'></script>",
  });
});

export default router;
