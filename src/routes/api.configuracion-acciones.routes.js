import express from "express";
import configuracionAccionesController from "../controllers/configuracion-acciones.controller.js";

const router = express.Router();

// --- Catálogo de acciones ---
router.get("/acciones", configuracionAccionesController.getAcciones);
router.get("/acciones/:id", configuracionAccionesController.getAccionById);
router.post("/acciones", configuracionAccionesController.createAccion);
router.put("/acciones/:id", configuracionAccionesController.updateAccion);
router.delete("/acciones/:id", configuracionAccionesController.removeAccion);

// --- Matriz submódulos × acciones ---
router.get("/matriz", configuracionAccionesController.getMatriz);
router.post("/matriz", configuracionAccionesController.saveMatriz);

export default router;
