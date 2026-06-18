import clientesProveedoresService from "../services/clientes-proveedores.service.js";

class ClientesProveedoresController {
  async create(req, res) {
    try {
      const usuarioId = req.session?.user?.id || null;
      const r = await clientesProveedoresService.create(req.body, usuarioId);
      return res.status(201).json({
        success: true,
        message: "Cliente de proveedor registrado correctamente.",
        data: r,
      });
    } catch (err) {
      console.error("ClientesProveedoresController.create error:", err);
      const status = err.code === "BAD_REQUEST" ? 400 : 500;
      return res.status(status).json({ error: err.message });
    }
  }
}

export default new ClientesProveedoresController();
