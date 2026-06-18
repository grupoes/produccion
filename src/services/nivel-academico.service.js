import prisma from "../config/db.js";

class NivelAcademicoService {
  async getAll() {
    return await prisma.nivel_academico.findMany({
      where: { estado: true },
      orderBy: { id: "asc" },
    });
  }

  async getById(id) {
    const n = await prisma.nivel_academico.findUnique({
      where: { id: Number(id) },
    });
    return n || null;
  }

  async create({ nombre, descripcion }) {
    if (!nombre || !String(nombre).trim()) {
      const err = new Error("El nombre del nivel académico es obligatorio.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    return await prisma.nivel_academico.create({
      data: {
        nombre: String(nombre).trim(),
        descripcion: descripcion ? String(descripcion).trim() : null,
        estado: true,
      },
    });
  }

  async update(id, { nombre, descripcion }) {
    const idNum = Number(id);
    const exists = await prisma.nivel_academico.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!exists) return null;

    return await prisma.nivel_academico.update({
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
    return await prisma.nivel_academico.update({
      where: { id: Number(id) },
      data: { estado: false },
    });
  }
}

export default new NivelAcademicoService();
