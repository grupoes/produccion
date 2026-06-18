import prisma from "../config/db.js";

class PermisosService {
  // Roles activos para el selector
  async getRoles() {
    return await prisma.roles.findMany({
      where: { estado: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  }

  async getRolById(id) {
    return await prisma.roles.findUnique({
      where: { id: Number(id) },
      select: { id: true, nombre: true, estado: true },
    });
  }

  async createRol({ nombre }) {
    const nom = (nombre || "").trim();
    if (!nom) {
      const e = new Error("El nombre del rol es obligatorio.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (nom.length > 50) {
      const e = new Error("El nombre del rol no puede superar 50 caracteres.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const duplicado = await prisma.roles.findFirst({
      where: { nombre: { equals: nom, mode: "insensitive" } },
      select: { id: true, estado: true },
    });
    if (duplicado) {
      const e = new Error(
        duplicado.estado
          ? "Ya existe un rol con ese nombre."
          : "Existe un rol inactivo con ese nombre. Reactívalo o usa otro nombre.",
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    return prisma.roles.create({
      data: { nombre: nom, estado: true },
      select: { id: true, nombre: true, estado: true },
    });
  }

  async updateRol(id, { nombre }) {
    const idNum = Number(id);
    const existing = await prisma.roles.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!existing) return null;

    const nom = (nombre || "").trim();
    if (!nom) {
      const e = new Error("El nombre del rol es obligatorio.");
      e.code = "BAD_REQUEST";
      throw e;
    }
    if (nom.length > 50) {
      const e = new Error("El nombre del rol no puede superar 50 caracteres.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    const duplicado = await prisma.roles.findFirst({
      where: {
        nombre: { equals: nom, mode: "insensitive" },
        NOT: { id: idNum },
      },
      select: { id: true },
    });
    if (duplicado) {
      const e = new Error("Ya existe otro rol con ese nombre.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    return prisma.roles.update({
      where: { id: idNum },
      data: { nombre: nom },
      select: { id: true, nombre: true, estado: true },
    });
  }

  // Baja lógica. Si el rol tiene usuarios activos asignados, no permitimos
  // eliminarlo para no dejar usuarios sin rol válido.
  async removeRol(id) {
    const idNum = Number(id);
    const rol = await prisma.roles.findUnique({
      where: { id: idNum },
      select: { id: true, estado: true },
    });
    if (!rol) return null;

    const usuariosActivos = await prisma.usuarios.count({
      where: { rol_id: idNum, estado: true },
    });
    if (usuariosActivos > 0) {
      const e = new Error(
        `No se puede eliminar el rol: tiene ${usuariosActivos} usuario(s) activo(s) asignado(s).`,
      );
      e.code = "BAD_REQUEST";
      throw e;
    }

    return prisma.roles.update({
      where: { id: idNum },
      data: { estado: false },
      select: { id: true, nombre: true, estado: true },
    });
  }

  // Módulos activos agrupados por padre, con las acciones vinculadas
  // (vía acciones_modulos) que aplican a cada uno.
  async getModulosConAcciones() {
    const modulos = await prisma.modulos.findMany({
      where: { estado: true },
      orderBy: [{ idpadre: "asc" }, { orden: "asc" }, { id: "asc" }],
      include: {
        acciones_modulos: {
          include: {
            acciones: { select: { id: true, nombre_accion: true, descripcion: true, estado: true } },
          },
        },
      },
    });

    const padres = modulos.filter((m) => !m.idpadre);
    const hijos = modulos.filter((m) => m.idpadre);

    return {
      padres: padres.map((p) => ({
        id: p.id,
        nombre: p.modulo,
        icono: p.icono,
        url: p.url,
        hijos: hijos
          .filter((h) => h.idpadre === p.id)
          .map((h) => this.mapModulo(h)),
      })),
      // Módulos sueltos (sin padre) que no aparecieron como "padre" en la tabla
      sueltos: hijos
        .filter((h) => !padres.some((p) => p.id === h.idpadre))
        .map((h) => this.mapModulo(h)),
    };
  }

  mapModulo(m) {
    return {
      id: m.id,
      nombre: m.modulo,
      url: m.url,
      acciones: (m.acciones_modulos || [])
        .filter((am) => am.acciones && am.acciones.estado)
        .map((am) => ({
          id: am.acciones.id,
          nombre: am.acciones.nombre_accion,
          descripcion: am.acciones.descripcion,
        })),
    };
  }

  // Devuelve los permisos de un rol y un set "moduloId-accionId" listo
  // para que el front pinte los checkboxes.
  async getPermisosPorRol(rolId) {
    const rol = await prisma.roles.findUnique({
      where: { id: Number(rolId) },
      select: { id: true, nombre: true },
    });
    if (!rol) return null;

    const permisos = await prisma.permisos.findMany({
      where: { rol_id: Number(rolId) },
      select: { modulo_id: true, accion_id: true },
    });

    const checks = {};
    permisos.forEach((p) => {
      if (p.modulo_id != null && p.accion_id != null) {
        checks[`${p.modulo_id}-${p.accion_id}`] = true;
      }
    });

    return { rol, checks, items: permisos };
  }

  // Reemplaza TODOS los permisos de un rol por la lista recibida.
  // items: [{ modulo_id, accion_id }, ...]
  async savePermisosPorRol(rolId, items) {
    const rolIdNum = Number(rolId);
    if (!rolIdNum) {
      const err = new Error("rolId inválido.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    // Limpia duplicados y filtra nulos
    const set = new Set();
    const clean = [];
    (Array.isArray(items) ? items : []).forEach((it) => {
      if (!it) return;
      const m = Number(it.modulo_id);
      const a = Number(it.accion_id);
      if (!m || !a) return;
      const key = `${m}-${a}`;
      if (set.has(key)) return;
      set.add(key);
      clean.push({ modulo_id: m, accion_id: a });
    });

    return await prisma.$transaction(async (tx) => {
      await tx.permisos.deleteMany({ where: { rol_id: rolIdNum } });
      if (clean.length === 0) return { count: 0 };
      const result = await tx.permisos.createMany({
        data: clean.map((p) => ({
          rol_id: rolIdNum,
          modulo_id: p.modulo_id,
          accion_id: p.accion_id,
        })),
      });
      return { count: result.count };
    });
  }
}

export default new PermisosService();
