import potencialesClientesService from "../services/potenciales-clientes.service.js";

class PotencialesClientesController {
  async getAll(req, res) {
    try {
      // Filtro de estado_cliente:
      //   - Si no se manda, el default es "potencial cliente" (la URL
      //     se llama "potenciales-clientes", así que ése es el subset
      //     natural que devuelve).
      //   - Si se manda explícitamente "all" o "todos", se devuelven
      //     ambos estados (potencial + cliente).
      //   - Cualquier otro valor se respeta tal cual (ej. "cliente").
      const estadoClienteParam = (req.query.estado_cliente || "")
        .toString()
        .toLowerCase();
      let estadoCliente;
      if (
        estadoClienteParam === "all" ||
        estadoClienteParam === "todos"
      ) {
        estadoCliente = undefined;
      } else if (estadoClienteParam) {
        estadoCliente = estadoClienteParam;
      } else {
        estadoCliente = "potencial cliente";
      }

      const filters = {
        estado_cliente: estadoCliente,
        incluirInactivos: req.query.incluir_inactivos === "1",
      };
      const data = await potencialesClientesService.getAll(filters);
      return res.json({ success: true, data });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.getAll:",
        error,
      );
      return res
        .status(500)
        .json({ error: "Error interno al obtener los potenciales clientes." });
    }
  }

  async getLookups(_req, res) {
    try {
      const data = await potencialesClientesService.getLookups();
      return res.json({ success: true, data });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.getLookups:",
        error,
      );
      return res
        .status(500)
        .json({ error: "Error interno al obtener los catálogos." });
    }
  }

  async getCarrerasByInstitucion(req, res) {
    try {
      const data = await potencialesClientesService.getCarrerasByInstitucion(
        req.query.institucion_id,
      );
      return res.json({ success: true, data });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.getCarrerasByInstitucion:",
        error,
      );
      return res
        .status(500)
        .json({ error: "Error interno al obtener las carreras." });
    }
  }

  async getUsuariosAsignablesPorFecha(req, res) {
    try {
      const data =
        await potencialesClientesService.getUsuariosAsignablesPorFecha(
          req.query.fecha,
        );
      return res.json({ success: true, data });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.getUsuariosAsignablesPorFecha:",
        error,
      );
      return res
        .status(500)
        .json({ error: "Error interno al obtener los usuarios asignables." });
    }
  }

  async getReuniones(_req, res) {
    try {
      const data = await potencialesClientesService.getReuniones();
      return res.json({ success: true, data });
    } catch (error) {
      console.error("Error en PotencialesClientesController.getReuniones:", error);
      return res
        .status(500)
        .json({ error: "Error interno al obtener las reuniones." });
    }
  }

  async addActividad(req, res) {
    try {
      const id = Number(req.params.id);
      const usuarioId = req.session?.user?.id || null;
      const r = await potencialesClientesService.addActividad(
        id,
        req.body,
        usuarioId,
      );

      const io = req.app?.locals?.io;
      if (io && Array.isArray(r.notifications)) {
        for (const n of r.notifications) {
          io.to(`user:${n.usuario_id}`).emit("nueva-notificacion", {
            id: n.id,
            titulo: n.titulo,
            mensaje: n.mensaje,
            tipo: n.tipo,
            prioridad: n.prioridad,
            es_leida: !!n.es_leida,
            created_at: n.created_at,
          });
        }
      }

      return res.status(201).json({
        success: true,
        message: "Actividad agregada correctamente.",
        data: { id: r.id, actividadId: r.actividadId },
      });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.addActividad:",
        error,
      );
      if (error.code === "NOT_FOUND") {
        return res.status(404).json({ error: error.message });
      }
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const data = await potencialesClientesService.getById(id);
      if (!data) {
        return res.status(404).json({ error: "Potencial cliente no encontrado." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.getById:",
        error,
      );
      return res
        .status(500)
        .json({ error: "Error interno al obtener el potencial cliente." });
    }
  }

  async getHistorial(req, res) {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: "id requerido." });
      const data = await potencialesClientesService.getHistorial(id);
      if (data === null) {
        return res
          .status(404)
          .json({ error: "Potencial cliente no encontrado." });
      }
      return res.json({ success: true, data });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.getHistorial:",
        error,
      );
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async create(req, res) {
    try {
      const usuarioId = req.session?.user?.id || null;
      const nuevo = await potencialesClientesService.create(req.body, usuarioId);

      // Emite por socket a cada destinatario, dentro del room `user:<id>`.
      const io = req.app?.locals?.io;
      if (io && Array.isArray(nuevo.notifications)) {
        for (const n of nuevo.notifications) {
          io.to(`user:${n.usuario_id}`).emit("nueva-notificacion", {
            id: n.id,
            titulo: n.titulo,
            mensaje: n.mensaje,
            tipo: n.tipo,
            prioridad: n.prioridad,
            es_leida: !!n.es_leida,
            created_at: n.created_at,
          });
        }
      }

      return res.status(201).json({
        success: true,
        message: "Potencial cliente registrado correctamente.",
        data: { id: nuevo.id },
      });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.create:",
        error,
      );
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const usuarioId = req.session?.user?.id || null;
      const actualizado = await potencialesClientesService.update(
        id,
        req.body,
        usuarioId,
      );
      if (!actualizado) {
        return res.status(404).json({ error: "Potencial cliente no encontrado." });
      }
      return res.json({
        success: true,
        message: "Potencial cliente actualizado correctamente.",
        data: actualizado,
      });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.update:",
        error,
      );
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }

  async convertir(req, res) {
    try {
      const id = Number(req.params.id);
      const usuarioId = req.session?.user?.id || null;
      const r = await potencialesClientesService.convertirACliente(
        id,
        req.body,
        usuarioId,
      );

      const io = req.app?.locals?.io;
      if (io && Array.isArray(r.notifications)) {
        for (const n of r.notifications) {
          io.to(`user:${n.usuario_id}`).emit("nueva-notificacion", {
            id: n.id,
            titulo: n.titulo,
            mensaje: n.mensaje,
            tipo: n.tipo,
            prioridad: n.prioridad,
            es_leida: !!n.es_leida,
            created_at: n.created_at,
          });
        }
      }

      return res.json({
        success: true,
        message: "Convertido a cliente correctamente.",
        data: r,
      });
    } catch (error) {
      console.error(
        "Error en PotencialesClientesController.convertir:",
        error,
      );
      if (error.code === "SLOT_CONFLICT") {
        // 409 con detalle para que el front muestre el plan.
        return res.status(409).json({
          error: error.message,
          conflicts: error.conflicts,
          suggestion: error.suggestion,
        });
      }
      if (error.code === "NOT_FOUND") {
        return res.status(404).json({ error: error.message });
      }
      const status = error.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: error.message });
    }
  }
}

export default new PotencialesClientesController();
