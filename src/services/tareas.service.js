import prisma from "../config/db.js";

class TareasService {
  // Lista de tareas activas con sus roles asociados (primaria/complementaria)
  // y el tipo de tarea. `tareas_roles` no tiene relación Prisma, por eso se
  // consulta por separado.
  async getAll() {
    const tareas = await prisma.tarea.findMany({
      where: { estado: true },
      orderBy: { id: "asc" },
      include: {
        tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
          select: { id: true, tipo: true, color: true },
        },
      },
    });

    if (tareas.length === 0) return [];

    const tareaIds = tareas.map((t) => t.id);
    // No filtramos por `estado` aquí: queremos mostrar todas las relaciones
    // de la tarea (incluso si la fila quedó como `false` por un proceso externo
    // o por datos viejos). El filtro de "tarea activa" ya se aplicó arriba.
    const relaciones = await prisma.tareas_roles.findMany({
      where: { tarea_id: { in: tareaIds } },
    });
    const rolIds = [...new Set(relaciones.map((r) => r.rol_id).filter(Boolean))];
    const roles = rolIds.length
      ? await prisma.roles.findMany({
          where: { id: { in: rolIds } },
          select: { id: true, nombre: true },
        })
      : [];
    const rolById = new Map(roles.map((r) => [r.id, r]));

    // Agrupa roles por tarea y separa primaria / complementaria
    const byTarea = new Map();
    relaciones.forEach((r) => {
      if (r.tarea_id == null) return;
      if (!byTarea.has(r.tarea_id)) byTarea.set(r.tarea_id, []);
      byTarea.get(r.tarea_id).push({
        rol_id: r.rol_id,
        rol_nombre: rolById.get(r.rol_id)?.nombre ?? null,
        prioridad: r.prioridad, // 1 = primaria, 0 = complementaria
      });
    });

    return tareas.map((t) => {
      const rolesTarea = byTarea.get(t.id) || [];
      return {
        id: t.id,
        nombre: t.nombre,
        horas_estimadas: t.horas_estimadas,
        estado: t.estado,
        tipo_tarea: t.tipo_tarea_tarea_tipo_tareaTotipo_tarea
          ? {
              id: t.tipo_tarea_tarea_tipo_tareaTotipo_tarea.id,
              tipo: t.tipo_tarea_tarea_tipo_tareaTotipo_tarea.tipo,
              color: t.tipo_tarea_tarea_tipo_tareaTotipo_tarea.color,
            }
          : null,
        aplica_en_ventas: t.aplica_en_ventas ?? true,
        aplica_en_proyecto: t.aplica_en_proyecto ?? true,
        roles: rolesTarea,
        roles_primaria: rolesTarea
          .filter((r) => Number(r.prioridad) === 1)
          .map((r) => r.rol_nombre)
          .filter(Boolean),
        roles_complementaria: rolesTarea
          .filter((r) => Number(r.prioridad) === 0)
          .map((r) => r.rol_nombre)
          .filter(Boolean),
      };
    });
  }

  async getRoles() {
    return await prisma.roles.findMany({
      where: { estado: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  }

  async getTipoTarea() {
    return await prisma.tipo_tarea.findMany({
      where: { estado: true },
      select: { id: true, tipo: true, color: true },
      orderBy: { tipo: "asc" },
    });
  }

  // Devuelve una tarea + sus roles con prioridad, listo para el form de edición.
  // roles: [{ rol_id, prioridad }, ...] sin agrupar, para repoblar el form.
  async getById(id) {
    const tarea = await prisma.tarea.findUnique({
      where: { id: Number(id) },
      include: {
        tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
          select: { id: true, tipo: true, color: true },
        },
      },
    });
    if (!tarea) return null;

    // Igual que en getAll: no filtramos por `estado` para que las
    // relaciones existentes (incluso con estado=false/null) se carguen
    // al editar. Quitar y volver a crear es la forma de "borrar" una relación.
    const relaciones = await prisma.tareas_roles.findMany({
      where: { tarea_id: Number(id) },
      select: { rol_id: true, prioridad: true },
    });

    return {
      id: tarea.id,
      nombre: tarea.nombre,
      horas_estimadas: tarea.horas_estimadas,
      estado: tarea.estado,
      tipo_tarea_id: tarea.tipo_tarea,
      tipo_tarea: tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea
        ? {
            id: tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea.id,
            tipo: tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea.tipo,
            color: tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea.color,
          }
        : null,
      aplica_en_ventas: tarea.aplica_en_ventas ?? true,
      aplica_en_proyecto: tarea.aplica_en_proyecto ?? true,
      roles: relaciones.map((r) => ({
        rol_id: r.rol_id,
        prioridad: Number(r.prioridad), // 1 o 0
      })),
    };
  }

  /**
   * Crea una tarea junto con sus relaciones en tareas_roles.
   * payload: { nombre, horas_estimadas, tipo_tarea_id, aplica_en_ventas, aplica_en_proyecto, roles: [...] }
   */
  async create({
    nombre,
    horas_estimadas,
    tipo_tarea_id,
    aplica_en_ventas,
    aplica_en_proyecto,
    roles,
  }) {
    if (!nombre || !String(nombre).trim()) {
      const err = new Error("El nombre de la tarea es obligatorio.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    return await prisma.$transaction(async (tx) => {
      const nuevaTarea = await tx.tarea.create({
        data: {
          nombre: String(nombre).trim(),
          horas_estimadas:
            horas_estimadas != null && horas_estimadas !== ""
              ? Number(horas_estimadas)
              : null,
          tipo_tarea: tipo_tarea_id ? Number(tipo_tarea_id) : null,
          aplica_en_ventas:
            aplica_en_ventas == null ? true : Boolean(aplica_en_ventas),
          aplica_en_proyecto:
            aplica_en_proyecto == null ? true : Boolean(aplica_en_proyecto),
          estado: true,
        },
      });

      await this.syncTareasRoles(tx, nuevaTarea.id, roles);
      return nuevaTarea;
    });
  }

  async update(
    id,
    {
      nombre,
      horas_estimadas,
      tipo_tarea_id,
      aplica_en_ventas,
      aplica_en_proyecto,
      roles,
    },
  ) {
    const idNum = Number(id);
    const exists = await prisma.tarea.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!exists) return null;

    return await prisma.$transaction(async (tx) => {
      await tx.tarea.update({
        where: { id: idNum },
        data: {
          nombre: nombre != null ? String(nombre).trim() : undefined,
          horas_estimadas:
            horas_estimadas != null && horas_estimadas !== ""
              ? Number(horas_estimadas)
              : undefined,
          tipo_tarea:
            tipo_tarea_id != null
              ? tipo_tarea_id
                ? Number(tipo_tarea_id)
                : null
              : undefined,
          aplica_en_ventas:
            aplica_en_ventas == null ? undefined : Boolean(aplica_en_ventas),
          aplica_en_proyecto:
            aplica_en_proyecto == null ? undefined : Boolean(aplica_en_proyecto),
        },
      });

      await this.syncTareasRoles(tx, idNum, roles);
      return { id: idNum };
    });
  }

  // Reemplaza TODAS las relaciones tareas_roles de una tarea.
  // roles: [{ rol_id, prioridad }, ...]
  // - Deduplica por rol_id; si un rol aparece varias veces gana la última.
  // - Borra todas las filas anteriores (incluso estado=false) y recrea.
  async syncTareasRoles(tx, tareaId, roles) {
    await tx.tareas_roles.deleteMany({ where: { tarea_id: tareaId } });

    if (!Array.isArray(roles) || roles.length === 0) return;

    const seen = new Set();
    const data = [];
    roles.forEach((r) => {
      if (!r) return;
      const rolId = Number(r.rol_id);
      if (!rolId || Number.isNaN(rolId)) return;
      if (seen.has(rolId)) return;
      seen.add(rolId);
      data.push({
        tarea_id: tareaId,
        rol_id: rolId,
        prioridad:
          r.prioridad === 1 || r.prioridad === "1" || r.prioridad === true
            ? 1
            : 0,
        estado: true,
      });
    });

    if (data.length) {
      await tx.tareas_roles.createMany({ data });
    }
  }

  // Baja lógica: marca la tarea y sus relaciones como estado=false
  async remove(id) {
    const idNum = Number(id);
    return await prisma.$transaction(async (tx) => {
      await tx.tarea.update({
        where: { id: idNum },
        data: { estado: false },
      });
      await tx.tareas_roles.updateMany({
        where: { tarea_id: idNum },
        data: { estado: false },
      });
      return { id: idNum };
    });
  }
}

export default new TareasService();
