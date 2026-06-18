import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.render("registrar-clientes-proveedores/registrar-clientes-proveedores", {
    title: "Registrar Clientes de Proveedor - Panel de Control",
    style:
      "<link href='https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css' rel='stylesheet' />",
    script:
      "<script src='https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js'></script>\n" +
      "<script src='/assets/plugins/choices/choices.min.js'></script>\n" +
      "<script src='/js/registrar-clientes-proveedores/index.js'></script>",
  });
});

export default router;
