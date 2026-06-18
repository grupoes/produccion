import prisma from "../config/db.js";

class UniversidadService {
  async getAll() {
    return await prisma.institucion.findMany({
      where: { estado: true },
      orderBy: { id: "asc" },
    });
  }

  async getById(id) {
    const inst = await prisma.institucion.findUnique({
      where: { id: Number(id) },
    });
    return inst || null;
  }

  async create({ nombre, abreviatura, sector, tipo }) {
    if (!nombre || !String(nombre).trim()) {
      const err = new Error("El nombre de la institución es obligatorio.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    return await prisma.institucion.create({
      data: {
        nombre: String(nombre).trim(),
        abreviatura: abreviatura ? String(abreviatura).trim() : null,
        sector: sector || null,
        tipo: tipo || null,
        estado: true,
      },
    });
  }

  async update(id, { nombre, abreviatura, sector, tipo }) {
    const idNum = Number(id);
    const exists = await prisma.institucion.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!exists) return null;

    return await prisma.institucion.update({
      where: { id: idNum },
      data: {
        nombre: nombre != null ? String(nombre).trim() : undefined,
        abreviatura:
          abreviatura != null
            ? abreviatura
              ? String(abreviatura).trim()
              : null
            : undefined,
        sector: sector != null ? sector || null : undefined,
        tipo: tipo != null ? tipo || null : undefined,
      },
    });
  }

  // Baja lógica
  async remove(id) {
    return await prisma.institucion.update({
      where: { id: Number(id) },
      data: { estado: false },
    });
  }
}

export default new UniversidadService();
