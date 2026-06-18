import prisma from "../config/db.js";

class CarrerasService {
  // Lista carreras. Si viene `institucionId`, filtra por institución.
  // Por defecto trae TODAS (activas e inactivas) para que el admin las
  // vea; si se quiere sólo activas, pasar `soloActivas: true`.
  async getAll({ institucionId = null, soloActivas = false } = {}) {
    const where = {};
    if (institucionId) where.institucion_id = Number(institucionId);
    if (soloActivas) where.estado = true;
    return await prisma.carreras.findMany({
      where,
      orderBy: [{ institucion_id: "asc" }, { nombre: "asc" }],
      include: {
        institucion: {
          select: { id: true, nombre: true },
        },
      },
    });
  }

  async getById(id) {
    const c = await prisma.carreras.findUnique({
      where: { id: Number(id) },
      include: {
        institucion: {
          select: { id: true, nombre: true },
        },
      },
    });
    return c || null;
  }

  async create({ nombre, institucion_id, estado }) {
    if (!nombre || !String(nombre).trim()) {
      const err = new Error("El nombre de la carrera es obligatorio.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    if (!institucion_id) {
      const err = new Error("La institución es obligatoria.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    // Verificar que la institución existe
    const inst = await prisma.institucion.findUnique({
      where: { id: Number(institucion_id) },
      select: { id: true },
    });
    if (!inst) {
      const err = new Error("La institución seleccionada no existe.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    return await prisma.carreras.create({
      data: {
        nombre: String(nombre).trim(),
        institucion_id: Number(institucion_id),
        estado: estado === false ? false : true,
      },
    });
  }

  async update(id, { nombre, institucion_id, estado }) {
    const idNum = Number(id);
    const exists = await prisma.carreras.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!exists) return null;

    if (institucion_id != null) {
      const inst = await prisma.institucion.findUnique({
        where: { id: Number(institucion_id) },
        select: { id: true },
      });
      if (!inst) {
        const err = new Error("La institución seleccionada no existe.");
        err.code = "BAD_REQUEST";
        throw err;
      }
    }

    return await prisma.carreras.update({
      where: { id: idNum },
      data: {
        nombre: nombre != null ? String(nombre).trim() : undefined,
        institucion_id:
          institucion_id != null ? Number(institucion_id) : undefined,
        estado: estado != null ? !!estado : undefined,
      },
    });
  }

  // Baja lógica
  async remove(id) {
    return await prisma.carreras.update({
      where: { id: Number(id) },
      data: { estado: false },
    });
  }
}

export default new CarrerasService();
