import db from '../config/db.js';

class ExampleService {
  async getExamples() {
    // Prisma crea propiedades automáticas para todas tus tablas (en minúsculas)
    // Por ejemplo, para conectarnos a la tabla "usuarios":
    return await db.usuarios.findMany();
  }
}

export default new ExampleService();
