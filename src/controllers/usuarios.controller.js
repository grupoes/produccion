import usuariosService from "../services/usuarios.service.js";
import reniecService from "../services/reniec.service.js";

class UsuariosController {
  async getAll(req, res) {
    try {
      const usuarios = await usuariosService.getAll();
      return res.json({ success: true, data: usuarios });
    } catch (error) {
      console.error("UsuariosController.getAll error:", error);
      return res.status(500).json({ error: "Error interno al obtener los usuarios." });
    }
  }

  async getLookups(req, res) {
    try {
      const [roles, tipoDocumento, tipoJornada] = await Promise.all([
        usuariosService.getRoles(),
        usuariosService.getTipoDocumento(),
        usuariosService.getTipoJornada(),
      ]);

      return res.json({
        success: true,
        data: { roles, tipoDocumento, tipoJornada },
      });
    } catch (error) {
      console.error("UsuariosController.getLookups error:", error);
      return res.status(500).json({ error: "Error interno al obtener catálogos." });
    }
  }

  async searchByDocument(req, res) {
    try {
      const { tipoDocumento_id, numero_documento } = req.query;

      if (!numero_documento) {
        return res.status(400).json({ error: "Debe ingresar un número de documento." });
      }

      const tipoDocumento = await usuariosService.getTipoDocumentoById(
        Number(tipoDocumento_id) || 0,
      );
      const abreviatura = tipoDocumento?.abreviatura || "DNI";

      const data = await reniecService.fetchByDocument({
        abreviatura,
        numero_documento,
      });

      return res.json({ success: true, data });
    } catch (error) {
      console.error("UsuariosController.searchByDocument error:", error);
      const status =
        error.code === "NOT_CONFIGURED"
          ? 503
          : error.code === "BAD_REQUEST"
            ? 400
            : 502;
      return res.status(status).json({ error: error.message });
    }
  }

  async getById(req, res) {
    try {
      const id = Number(req.params.id);
      const usuario = await usuariosService.getById(id);

      if (!usuario) {
        return res.status(404).json({ error: "Usuario no encontrado." });
      }

      return res.json({ success: true, data: usuario });
    } catch (error) {
      console.error("UsuariosController.getById error:", error);
      return res.status(500).json({ error: "Error interno al obtener el usuario." });
    }
  }

  async create(req, res) {
    try {
      const { usuario, clave, rol_id, tipo_jornada_id, persona } = req.body;

      if (!usuario || !clave) {
        return res.status(400).json({ error: "El usuario y la clave son obligatorios." });
      }

      if (!persona || !persona.nombres) {
        return res.status(400).json({ error: "El nombre de la persona es obligatorio." });
      }

      const { horario } = req.body;

      const nuevoUsuario = await usuariosService.create({
        usuario,
        clave,
        rol_id,
        tipo_jornada_id,
        persona,
        horario,
      });

      return res.status(201).json({
        success: true,
        message: "Usuario creado correctamente.",
        data: nuevoUsuario,
      });
    } catch (error) {
      console.error("UsuariosController.create error:", error);
      return res.status(500).json({ error: "Error interno al crear el usuario." });
    }
  }

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const { usuario, clave, rol_id, tipo_jornada_id, persona, horario } = req.body;

      const actualizado = await usuariosService.update(id, {
        usuario,
        clave,
        rol_id,
        tipo_jornada_id,
        persona,
        horario,
      });

      if (!actualizado) {
        return res.status(404).json({ error: "Usuario no encontrado." });
      }

      return res.json({
        success: true,
        message: "Usuario actualizado correctamente.",
        data: actualizado,
      });
    } catch (error) {
      console.error("UsuariosController.update error:", error);
      return res.status(500).json({ error: "Error interno al actualizar el usuario." });
    }
  }

  async remove(req, res) {
    try {
      const id = Number(req.params.id);

      // No permitir que un usuario se elimine a sí mismo
      if (req.session?.user?.id === id) {
        return res.status(400).json({ error: "No puedes desactivar tu propio usuario." });
      }

      await usuariosService.remove(id);

      return res.json({
        success: true,
        message: "Usuario desactivado correctamente.",
      });
    } catch (error) {
      console.error("UsuariosController.remove error:", error);
      return res.status(500).json({ error: "Error interno al eliminar el usuario." });
    }
  }
}

export default new UsuariosController();
