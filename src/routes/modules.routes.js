import express from "express";
import modulesController from "../controllers/modules.controller.js";

const router = express.Router();

// GET /api/modules?rol_id=3
router.get("/", modulesController.getModules);

export default router;
