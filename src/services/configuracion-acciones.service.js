import prisma from "../config/db.js";

class ConfiguracionAccionesService {
  // ===========================================================
  // Catálogo de acciones
  // ===========================================================

  async getAcciones() {
    return prisma.acciones.findMany({
      orderBy: { id: "asc" },
      select: { id: true, nombre_accion: true, descripcion: true, estado: true },
    });
  }

  async getAccionById(id) {
    return prisma.acciones.findUnique({
      where: { id: Number(id) },
      select: { id: true, nombre_accion: true, descripcion: true, estado: true },
    });
  }

  async createAccion({ nombre_accion, descripcion, estado }) {
    if (!nombre_accion || !String(nombre_accion).trim()) {
      const e = new Error("El nombre de la acción es obligatorio.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    return prisma.acciones.create({
      data: {
        nombre_accion: String(nombre_accion).trim(),
        descripcion: descripcion ? String(descripcion).trim() : null,
        estado: estado !== false,
      },
    });
  }

  async updateAccion(id, { nombre_accion, descripcion, estado }) {
    const idNum = Number(id);
    const exists = await prisma.acciones.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!exists) return null;

    const data = {};
    if (nombre_accion != null) data.nombre_accion = String(nombre_accion).trim();
    if (descripcion !== undefined) {
      data.descripcion = descripcion ? String(descripcion).trim() : null;
    }
    if (estado !== undefined) data.estado = !!estado;

    return prisma.acciones.update({ where: { id: idNum }, data });
  }

  async removeAccion(id) {
    return prisma.acciones.update({
      where: { id: Number(id) },
      data: { estado: false },
    });
  }

  // ===========================================================
  // Matriz submódulos × acciones
  // ===========================================================

  // Devuelve los submódulos agrupados por padre, las acciones activas
  // y las asignaciones actuales (un set "moduloId-accionId" para
  // que el front sepa qué checkboxes pintar marcados).
  async getMatriz() {
    const [modulos, acciones, relaciones] = await Promise.all([
      prisma.modulos.findMany({
        where: { estado: true },
        orderBy: [{ idpadre: "asc" }, { orden: "asc" }, { id: "asc" }],
      }),
      prisma.acciones.findMany({
        where: { estado: true },
        orderBy: { id: "asc" },
        select: { id: true, nombre_accion: true, descripcion: true },
      }),
      prisma.acciones_modulos.findMany({
        where: {
          modulos: { is: { estado: true } },
          acciones: { is: { estado: true } },
        },
        select: { modulo_id: true, accion_id: true },
      }),
    ]);

    // Solo submódulos (idpadre no nulo y no 0)
    const submodulos = modulos
      .filter((m) => m.idpadre != null && m.idpadre !== 0)
      .map((m) => ({
        id: m.id,
        nombre: m.modulo,
        url: m.url,
        idpadre: m.idpadre,
        orden: m.orden,
      }));

    const padres = modulos
      .filter((m) => m.idpadre == null || m.idpadre === 0)
      .map((m) => ({ id: m.id, nombre: m.modulo, icono: m.icono }));

    const checks = {};
    relaciones.forEach((r) => {
      if (r.modulo_id != null && r.accion_id != null) {
        checks[`${r.modulo_id}-${r.accion_id}`] = true;
      }
    });

    return {
      padres,
      submodulos,
      acciones,
      checks,
    };
  }

  // Reemplaza las asignaciones de uno o varios submódulos.
  // changes: [{ modulo_id, accion_ids: [1, 2, 3] }, ...]
  async saveMatriz(changes) {
    if (!Array.isArray(changes)) {
      const e = new Error("El formato de cambios es inválido.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    // Filtra y normaliza
    const clean = [];
    const seenModulo = new Set();
    for (const c of changes) {
      if (!c) continue;
      const moduloId = Number(c.modulo_id);
      if (!moduloId || Number.isNaN(moduloId)) continue;
      if (seenModulo.has(moduloId)) continue;
      seenModulo.add(moduloId);

      const accIds = Array.isArray(c.accion_ids)
        ? [...new Set(c.accion_ids.map((a) => Number(a)).filter(Boolean))]
        : [];

      clean.push({ modulo_id: moduloId, accion_ids: accIds });
    }

    return await prisma.$transaction(async (tx) => {
      for (const c of clean) {
        // Verifica que el submódulo existe y está activo
        const mod = await tx.modulos.findUnique({
          where: { id: c.modulo_id },
          select: { id: true, estado: true },
        });
        if (!mod || !mod.estado) {
          const e = new Error(
            `El submódulo ${c.modulo_id} no existe o está inactivo.`,
          );
          e.code = "BAD_REQUEST";
          throw e;
        }

        // Reemplaza todas las relaciones
        await tx.acciones_modulos.deleteMany({
          where: { modulo_id: c.modulo_id },
        });

        if (c.accion_ids.length > 0) {
          // Verifica que las acciones existan y estén activas
          const accs = await tx.acciones.findMany({
            where: { id: { in: c.accion_ids }, estado: true },
            select: { id: true },
          });
          if (accs.length !== c.accion_ids.length) {
            const e = new Error(
              `Alguna acción enviada para el submódulo ${c.modulo_id} no existe o está inactiva.`,
            );
            e.code = "BAD_REQUEST";
            throw e;
          }

          await tx.acciones_modulos.createMany({
            data: c.accion_ids.map((aid) => ({
              modulo_id: c.modulo_id,
              accion_id: aid,
            })),
          });
        }
      }

      return { count: clean.length };
    });
  }
}

export default new ConfiguracionAccionesService();
