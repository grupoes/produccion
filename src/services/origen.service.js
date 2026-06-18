import prisma from "../config/db.js";

class OrigenService {
  async getAll() {
    return await prisma.origen.findMany({
      where: { estado: true },
      orderBy: { id: "asc" },
    });
  }

  async getById(id) {
    const o = await prisma.origen.findUnique({
      where: { id: Number(id) },
    });
    return o || null;
  }

  async create({ nombre, descripcion }) {
    if (!nombre || !String(nombre).trim()) {
      const err = new Error("El nombre del origen es obligatorio.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    return await prisma.origen.create({
      data: {
        nombre: String(nombre).trim(),
        descripcion: descripcion ? String(descripcion).trim() : null,
        estado: true,
      },
    });
  }

  async update(id, { nombre, descripcion }) {
    const idNum = Number(id);
    const exists = await prisma.origen.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!exists) return null;

    return await prisma.origen.update({
      where: { id: idNum },
      data: {
        nombre: nombre != null ? String(nombre).trim() : undefined,
        descripcion:
          descripcion != null
            ? descripcion
              ? String(descripcion).trim()
              : null
            : undefined,
      },
    });
  }

  // Baja lógica
  async remove(id) {
    return await prisma.origen.update({
      where: { id: Number(id) },
      data: { estado: false },
    });
  }
}

export default new OrigenService();
