import express from "express";
import trabajosEntregaController from "../controllers/trabajos-entrega.controller.js";

const router = express.Router();

router.get("/esta-semana", trabajosEntregaController.listarEstaSemana);
router.get("/proxima-semana", trabajosEntregaController.listarProximaSemana);

export default router;