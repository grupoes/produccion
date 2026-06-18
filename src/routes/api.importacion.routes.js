import express from "express";
import multer from "multer";
import importacionService from "../services/importacion.service.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/usuarios", async (req, res) => {
  try {
    const usuarios = await importacionService.getUsuariosAsignables();
    return res.json({ success: true, data: usuarios });
  } catch (err) {
    console.error("GET /api/importacion/usuarios error:", err);
    return res.status(500).json({ error: "Error al obtener usuarios." });
  }
});

router.get("/tareas", async (req, res) => {
  try {
    const tareas = await importacionService.getAllTareas();
    return res.json({ success: true, data: tareas });
  } catch (err) {
    console.error("GET /api/importacion/tareas error:", err);
    return res.status(500).json({ error: "Error al obtener tareas." });
  }
});

router.post("/hojas", upload.single("archivo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes subir un archivo Excel." });
    }
    const sheets = importacionService.getSheetInfo(req.file.buffer);
    return res.json({ success: true, data: sheets });
  } catch (err) {
    console.error("POST /api/importacion/hojas error:", err);
    return res.status(500).json({ error: err.message || "Error al leer el archivo." });
  }
});

router.post("/preview", upload.single("archivo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Debes subir un archivo Excel." });
    }

    let sheetVendedores = null;
    if (req.body.sheet_vendedores) {
      try {
        sheetVendedores = JSON.parse(req.body.sheet_vendedores);
      } catch { /* ignore */ }
    }

    const allRows = importacionService.parseExcelAll(req.file.buffer);
    if (allRows.length === 0) {
      return res.status(400).json({ error: "El archivo Excel está vacío o no tiene datos." });
    }

    const { errores, advertencias, validos } = importacionService.validateRows(allRows, sheetVendedores);
    if (errores.length > 0) {
      return res.status(400).json({ error: "Errores de validación en el archivo.", detalles: errores });
    }

    const catalogos = await importacionService.resolveCatalogos(validos);
    const tareas = await importacionService.getAllTareas();
    const catalogoSelects = await importacionService.getAllCatalogos();

    const resultados = importacionService.resolveRowMatches(validos, catalogos);

    return res.json({
      success: true,
      resultados: resultados.map((r) => ({
        exito: true,
        cliente: r.cliente,
        celular: r.celular,
        descripcion: r.descripcion,
        fila: r.fila,
        prioridad: r.prioridad,
        institucionId: r.institucionId,
        carreraId: r.carreraId,
        nivelId: r.nivelId,
        link_drive: r.link_drive,
        fecha_entrega: r.fecha_entrega,
        jefe_que_lo_valoro: r.jefe_que_lo_valoro,
        auxiliar: r.auxiliar,
        vendedorId: r.vendedorId,
        sheetName: r.sheetName,
      })),
      total: resultados.length,
      tareas,
      catalogos: catalogoSelects,
      advertencias,
    });
  } catch (err) {
    console.error("POST /api/importacion/preview error:", err);
    return res.status(500).json({ error: err.message || "Error al procesar el archivo." });
  }
});

router.post("/import", express.json(), async (req, res) => {
  try {
    const { resultados, usuario_id, fecha_inicio } = req.body;
    if (!Array.isArray(resultados) || resultados.length === 0) {
      return res.status(400).json({ error: "No hay datos para importar." });
    }
    if (!usuario_id) {
      return res.status(400).json({ error: "Debes seleccionar un usuario para la programación." });
    }
    if (!fecha_inicio) {
      return res.status(400).json({ error: "Debes ingresar la fecha y hora de inicio de programación." });
    }

    const resultadosConTarea = [];
    for (const r of resultados) {
      if (!r.exito) {
        resultadosConTarea.push(r);
        continue;
      }
      const tareaId = Number(r._tarea_id);
      if (!tareaId) {
        resultadosConTarea.push({ ...r, exito: false, error: "Tarea no seleccionada." });
        continue;
      }
      const minutos = await importacionService.getMinutosTarea(tareaId);
      resultadosConTarea.push({ ...r, _tarea_id: tareaId, duracion: minutos });
    }

    // Programar actividades desde la fecha/hora indicada
    const programados = await importacionService.programarActividades(resultadosConTarea, Number(usuario_id), fecha_inicio);

    const creados = await importacionService.ejecutarImportacion(programados, Number(usuario_id));

    return res.json({ success: true, ...creados });
  } catch (err) {
    console.error("POST /api/importacion/import error:", err);
    return res.status(500).json({ error: err.message || "Error al importar." });
  }
});

export default router;
