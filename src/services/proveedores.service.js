import prisma from "../config/db.js";

class ProveedoresService {
  async getAll() {
    return await prisma.proveedor.findMany({
      where: { estado: true },
      orderBy: { id: "asc" },
    });
  }

  async getById(id) {
    const p = await prisma.proveedor.findUnique({
      where: { id: Number(id) },
    });
    return p || null;
  }

  async create({ nombre }) {
    if (!nombre || !String(nombre).trim()) {
      const err = new Error("El nombre del proveedor es obligatorio.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    return await prisma.proveedor.create({
      data: {
        nombre: String(nombre).trim(),
        estado: true,
      },
    });
  }

  async update(id, { nombre }) {
    const idNum = Number(id);
    const exists = await prisma.proveedor.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!exists) return null;

    return await prisma.proveedor.update({
      where: { id: idNum },
      data: {
        nombre: nombre != null ? String(nombre).trim() : undefined,
      },
    });
  }

  // Baja lógica
  async remove(id) {
    return await prisma.proveedor.update({
      where: { id: Number(id) },
      data: { estado: false },
    });
  }
}

export default new ProveedoresService();
