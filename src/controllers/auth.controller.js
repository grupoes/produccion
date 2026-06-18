import authService from "../services/auth.service.js";

class AuthController {
  async login(req, res) {
    try {
      const { usuario, clave } = req.body;

      if (!usuario || !clave) {
        return res
          .status(400)
          .json({ error: "Usuario y clave son obligatorios." });
      }

      const user = await authService.login({ usuario, clave });

      if (!user) {
        return res.status(401).json({ error: "Credenciales inválidas." });
      }

      req.session.user = user;
      req.session.isAuthenticated = true;

      return res.json({
        success: true,
        message: "Inicio de sesión correcto.",
        data: user,
      });
    } catch (error) {
      console.error("AuthController.login error:", error);
      return res.status(500).json({ error: "Error interno en el servidor." });
    }
  }

  async logout(req, res) {
    try {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            console.error("AuthController.logout error:", err);
            return res
              .status(500)
              .json({ error: "No se pudo cerrar la sesión." });
          }

          res.clearCookie("connect.sid");
          return res.json({ success: true, message: "Sesión cerrada." });
        });
      } else {
        return res.json({ success: true, message: "Sesión cerrada." });
      }
    } catch (error) {
      console.error("AuthController.logout error:", error);
      return res.status(500).json({ error: "Error interno en el servidor." });
    }
  }
}

export default new AuthController();
