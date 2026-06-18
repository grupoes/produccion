import prisma from "../config/db.js";

class ModulosService {
  // Normaliza el idpadre enviado por el cliente:
  //   - 0, "", null, undefined  → null  (módulo padre)
  //   - otro número             → number
  static normalizeIdpadre(value) {
    if (value == null || value === "" || value === 0 || value === "0") {
      return null;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  static isPadre(modulo) {
    return modulo == null || modulo.idpadre == null || modulo.idpadre === 0;
  }

  async getAll() {
    const rows = await prisma.modulos.findMany({
      where: { estado: true },
      orderBy: [
        { idpadre: "asc" },
        { orden: "asc" },
        { id: "asc" },
      ],
    });

    // Armamos un map id→modulo para resolver el nombre del padre en una sola pasada
    const byId = new Map(rows.map((r) => [r.id, r]));

    return rows.map((r) => ({
      id: r.id,
      modulo: r.modulo,
      url: r.url,
      icono: r.icono,
      idpadre: r.idpadre, // null o número
      orden: r.orden,
      estado: r.estado,
      es_padre: ModulosService.isPadre(r),
      padre: !ModulosService.isPadre(r) && byId.get(r.idpadre)
        ? { id: byId.get(r.idpadre).id, nombre: byId.get(r.idpadre).modulo }
        : null,
    }));
  }

  // Devuelve los módulos activos para alimentar el <select> de "módulo padre".
  // Considera padre a todo módulo con idpadre = NULL o 0.
  // Excluye el módulo en edición (cuando se pasa excludeId) para evitar que
  // un módulo sea su propio padre.
  async getPadres(excludeId = null) {
    const where = {
      estado: true,
      OR: [{ idpadre: null }, { idpadre: 0 }],
    };
    if (excludeId != null) where.id = { not: Number(excludeId) };
    return await prisma.modulos.findMany({
      where,
      orderBy: { modulo: "asc" },
      select: { id: true, modulo: true },
    });
  }

  async getById(id) {
    const r = await prisma.modulos.findUnique({
      where: { id: Number(id) },
    });
    if (!r) return null;
    return {
      id: r.id,
      modulo: r.modulo,
      url: r.url,
      icono: r.icono,
      idpadre: r.idpadre, // null si es padre, número si es hijo
      orden: r.orden,
      estado: r.estado,
      es_padre: ModulosService.isPadre(r),
    };
  }

  async create({ modulo, url, icono, idpadre, orden }) {
    if (!modulo || !String(modulo).trim()) {
      const err = new Error("El nombre del módulo es obligatorio.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    const idpadreNorm = ModulosService.normalizeIdpadre(idpadre);

    // Si es hijo, validar que el padre exista
    if (idpadreNorm != null) {
      const padre = await prisma.modulos.findUnique({
        where: { id: idpadreNorm },
        select: { id: true },
      });
      if (!padre) {
        const err = new Error("El módulo padre seleccionado no existe.");
        err.code = "BAD_REQUEST";
        throw err;
      }
    }

    return await prisma.modulos.create({
      data: {
        modulo: String(modulo).trim(),
        url: url ? String(url).trim() : null,
        icono: icono ? String(icono).trim() : null,
        idpadre: idpadreNorm,
        orden: orden != null && orden !== "" ? Number(orden) : null,
        estado: true,
      },
    });
  }

  async update(id, { modulo, url, icono, idpadre, orden }) {
    const idNum = Number(id);
    const exists = await prisma.modulos.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!exists) return null;

    const data = {};
    if (modulo != null) data.modulo = String(modulo).trim();
    if (url != null) data.url = url ? String(url).trim() : null;
    if (icono != null) data.icono = icono ? String(icono).trim() : null;
    if (orden !== undefined) {
      data.orden = orden != null && orden !== "" ? Number(orden) : null;
    }
    if (idpadre !== undefined) {
      const idpadreNorm = ModulosService.normalizeIdpadre(idpadre);
      if (idpadreNorm === idNum) {
        const err = new Error("Un módulo no puede ser su propio padre.");
        err.code = "BAD_REQUEST";
        throw err;
      }
      if (idpadreNorm != null) {
        const padre = await prisma.modulos.findUnique({
          where: { id: idpadreNorm },
          select: { id: true },
        });
        if (!padre) {
          const err = new Error("El módulo padre seleccionado no existe.");
          err.code = "BAD_REQUEST";
          throw err;
        }
      }
      data.idpadre = idpadreNorm;
    }

    return await prisma.modulos.update({
      where: { id: idNum },
      data,
    });
  }

  // Baja lógica
  async remove(id) {
    return await prisma.modulos.update({
      where: { id: Number(id) },
      data: { estado: false },
    });
  }
}

export default new ModulosService();
