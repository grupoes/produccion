import express from "express";
import calendarioAsistenteController from "../controllers/calendario-asistente.controller.js";

const router = express.Router();

router.get("/usuarios", calendarioAsistenteController.getUsuarios);
router.get("/reuniones", calendarioAsistenteController.getReuniones);
router.get(
  "/horario-ultimo",
  calendarioAsistenteController.getUltimoHorarioUsuario,
);

export default router;
