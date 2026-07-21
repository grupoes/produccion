import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.render("trabajos-entrega/index", {
    title: "Trabajos por entregar",
    style: "<link href='https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css' rel='stylesheet' />",
    script:
      "<script src='https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js'></script>\n" +
      "<script src='/js/trabajos-entrega/index.js'></script>",
  });
});

export default router;