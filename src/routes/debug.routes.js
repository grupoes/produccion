import express from "express";
import modulesService from "../services/modules.service.js";

const router = express.Router();

// Endpoint temporal de diagnóstico
router.get("/permisos/:rolId", async (req, res) => {
  try {
    const { rolId } = req.params;
    console.log(`\n[DEBUG ENDPOINT] GET /api/debug/permisos/${rolId}`);

    const modules = await modulesService.getModulesByRole(parseInt(rolId));

    res.json({
      success: true,
      rolId: parseInt(rolId),
      modulosCount: modules.length,
      modules,
      requestTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[DEBUG ENDPOINT] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint para verificar usuario autenticado
router.get("/user", (req, res) => {
  console.log(`\n[DEBUG ENDPOINT] GET /api/debug/user`);
  console.log(`Session user:`, req.session?.user);
  console.log(`Session modules:`, req.app.locals.modules || res.locals.modules);

  res.json({
    success: true,
    session: {
      user: req.session?.user || null,
      isAuthenticated: !!req.session?.isAuthenticated,
    },
    modules: res.locals?.modules || [],
    timestamp: new Date().toISOString(),
  });
});

export default router;
