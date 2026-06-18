import db from "../config/db.js";

class AuthService {
  async login(credentials) {
    const { usuario, clave } = credentials;

    // Busca el usuario por nombre de usuario o por email de la persona
    const user = await db.usuarios.findFirst({
      where: {
        OR: [{ usuario }, { personas: { email: usuario } }],
      },
      include: {
        personas: true,
        roles: true,
      },
    });

    if (!user) return null;

    // En producción usa hash como bcrypt; aquí se compara texto plano según el esquema actual
    if (user.clave !== clave) return null;

    return {
      id: user.id,
      usuario: user.usuario,
      estado: user.estado,
      persona: user.personas
        ? {
            id: user.personas.id,
            nombres: user.personas.nombres,
            apellidos: user.personas.apellidos,
            email: user.personas.email,
          }
        : null,
      rol: user.roles
        ? {
            id: user.roles.id,
            nombre: user.roles.nombre,
          }
        : null,
    };
  }
}

export default new AuthService();
