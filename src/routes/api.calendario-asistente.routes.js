import express from "express";
import calendarioAsistenteController from "../controllers/calendario-asistente.controller.js";

const router = express.Router();

router.get("/usuarios", calendarioAsistenteController.getUsuarios);
router.get("/reuniones", calendarioAsistenteController.getReuniones);
router.get(
  "/horario-ultimo",
  calendarioAsistenteController.getUltimoHorarioUsuario,
);
router.get(
  "/usuario-ocupa-fecha",
  calendarioAsistenteController.getUsuarioOcupaFecha,
);

router.get(
  "/horas-extras/resumen",
  calendarioAsistenteController.getResumenHorasExtras,
);

router.get(
  "/horas-extras/canje-detail",
  calendarioAsistenteController.getCanjeDetail,
);

router.post(
  "/horas-extras/canjear",
  calendarioAsistenteController.canjearHorasExtras,
);

router.post(
  "/horas-extras/pagar",
  calendarioAsistenteController.pagarHorasExtras,
);

export default router;
