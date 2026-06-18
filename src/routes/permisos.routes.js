import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.render("permisos/permisos", {
    title: "Permisos - Panel de Control",
    script:
      "<script src='https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js'></script>\n" +
      "<script src='/js/permisos/index.js'></script>",
  });
});

export default router;
