import feriadosService from "../services/feriados.service.js";

class FeriadosController {
  async getAll(_req, res) {
    try {
      const data = await feriadosService.getAll();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("FeriadosController.getAll error:", error);
      return res.status(500).json({ error: "Error interno al obtener los feriados." });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const data = await feriadosService.getById(id);
      if (!data) {
        return res.status(404).json({ error: "Feriado no encontrado." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error("FeriadosController.getById error:", error);
      return res.status(500).json({ error: "Error interno al obtener el feriado." });
    }
  }

  async create(req, res) {
    try {
      const { fecha, nombre } = req.body;
      const nuevo = await feriadosService.create({ fecha, nombre });
      return res.status(201).json({
        success: true,
        message: "Feriado creado correctamente.",
        data: nuevo,
      });
    } catch (error) {
      console.error("FeriadosController.create error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const { fecha, nombre } = req.body;
      const actualizado = await feriadosService.update(id, { fecha, nombre });
      if (!actualizado) {
        return res.status(404).json({ error: "Feriado no encontrado." });
      }
      return res.json({
        success: true,
        message: "Feriado actualizado correctamente.",
        data: actualizado,
      });
    } catch (error) {
      console.error("FeriadosController.update error:", error);
      return res.status(500).json({ error: "Error interno al actualizar el feriado." });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);
      await feriadosService.remove(id);
      return res.json({
        success: true,
        message: "Feriado desactivado correctamente.",
      });
    } catch (error) {
      console.error("FeriadosController.remove error:", error);
      return res.status(500).json({ error: "Error interno al eliminar el feriado." });
    }
  }

  async generar(req, res) {
    try {
      const { anio } = req.body;
      const resultado = await feriadosService.generarDelAnio(anio);
      const total =
        resultado.insertados.length +
        resultado.reactivados.length +
        resultado.omitidos.length;
      return res.json({
        success: true,
        message: `Proceso terminado. ${resultado.insertados.length} insertados, ${resultado.reactivados.length} reactivados, ${resultado.omitidos.length} ya existían.`,
        data: { ...resultado, total },
      });
    } catch (error) {
      console.error("FeriadosController.generar error:", error);
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }
}

export default new FeriadosController();
