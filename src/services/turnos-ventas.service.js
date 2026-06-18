import prisma from "../config/db.js";

// El modelo `asignacion_dias` está marcado con @@ignore en Prisma
// (la tabla no tiene PRIMARY KEY), así que las operaciones sobre esa
// tabla se hacen con SQL crudo. El resto (usuarios, dias) usa Prisma Client.

// Roles que NO se muestran en la matriz de turnos.
// Coincidencia case-insensitive sobre `roles.nombre`.
const ROLES_EXCLUIDOS = ["SUPER ADMIN"];

class TurnosVentasService {
  // -----------------------------------------------------------------
  // Lecturas
  // -----------------------------------------------------------------

  // Auxiliares: todos los usuarios activos excepto los de roles excluidos.
  async getAuxiliares() {
    const rolesExcluidos = await prisma.roles.findMany({
      where: { nombre: { in: ROLES_EXCLUIDOS, mode: "insensitive" } },
      select: { id: true },
    });
    const excluidosIds = rolesExcluidos.map((r) => r.id);

    const usuarios = await prisma.usuarios.findMany({
      where: {
        estado: true,
        ...(excluidosIds.length > 0
          ? { rol_id: { notIn: excluidosIds } }
          : {}),
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        usuario: true,
        personas: {
          select: { id: true, nombres: true, apellidos: true },
        },
        roles: {
          select: { id: true, nombre: true },
        },
      },
    });

    return usuarios.map((u) => ({
      id: u.id,
      usuario: u.usuario,
      nombre: u.personas
        ? [u.personas.nombres, u.personas.apellidos]
            .filter(Boolean)
            .join(" ")
            .trim() || u.usuario
        : u.usuario,
      rol: u.roles ? u.roles.nombre : null,
    }));
  }

  // Días activos (lunes a sábado). Se ordena por id para mantener el
  // orden natural del calendario (1=lunes ... 6=sábado).
  async getDias() {
    return prisma.dias.findMany({
      where: { estado: true },
      orderBy: { id: "asc" },
      select: { id: true, dia: true },
    });
  }

  // Matriz lista para el frontend:
  //   - auxiliares: filas
  //   - dias: columnas
  //   - checks: { "<usuarioId>-<diaId>": true } para que el front pinte
  async getMatriz() {
    const [auxiliares, dias] = await Promise.all([
      this.getAuxiliares(),
      this.getDias(),
    ]);

    const checks = {};
    if (auxiliares.length > 0 && dias.length > 0) {
      const usuarioIds = auxiliares.map((a) => a.id);
      const diaIds = dias.map((d) => d.id);
      // Solo cargamos las filas relevantes (usuarios del rol y dias activos).
      const rows = await prisma.$queryRawUnsafe(
        `SELECT usuario_id, dia_id
         FROM asignacion_dias
         WHERE usuario_id = ANY($1::int[])
           AND dia_id     = ANY($2::int[])`,
        usuarioIds,
        diaIds,
      );
      for (const r of rows) {
        if (r.usuario_id != null && r.dia_id != null) {
          checks[`${r.usuario_id}-${r.dia_id}`] = true;
        }
      }
    }

    return { auxiliares, dias, checks };
  }

  // -----------------------------------------------------------------
  // Escritura
  // -----------------------------------------------------------------

  // Reemplaza las asignaciones de uno o varios auxiliares.
  // payload: [{ usuario_id, dia_ids: [1,2,...] }, ...]
  // Para cada usuario incluido se borran sus asignaciones (en días
  // válidos) y se insertan las nuevas. Si un usuario no viene en
  // `changes`, no se toca.
  async saveMatriz(changes) {
    if (!Array.isArray(changes)) {
      const e = new Error("El formato de cambios es inválido.");
      e.code = "BAD_REQUEST";
      throw e;
    }

    // 1) Normaliza el payload (dedupe por usuario, días numéricos únicos).
    const seen = new Set();
    const clean = [];
    for (const c of changes) {
      if (!c) continue;
      const usuarioId = Number(c.usuario_id);
      if (!usuarioId || Number.isNaN(usuarioId)) continue;
      if (seen.has(usuarioId)) continue;
      seen.add(usuarioId);

      const diaIds = Array.isArray(c.dia_ids)
        ? [...new Set(c.dia_ids.map((d) => Number(d)).filter(Boolean))]
        : [];
      clean.push({ usuario_id: usuarioId, dia_ids: diaIds });
    }

    if (clean.length === 0) return { count: 0 };

    // 2) Valida que los usuarios y días sean válidos.
    const auxiliares = await this.getAuxiliares();
    const dias = await this.getDias();
    const auxIds = new Set(auxiliares.map((a) => a.id));
    const diaIds = new Set(dias.map((d) => d.id));

    for (const c of clean) {
      if (!auxIds.has(c.usuario_id)) {
        const e = new Error(
          `El usuario ${c.usuario_id} no está habilitado para turnos.`,
        );
        e.code = "BAD_REQUEST";
        throw e;
      }
      for (const d of c.dia_ids) {
        if (!diaIds.has(d)) {
          const e = new Error(
            `El día ${d} no es válido (debe ser lunes a sábado).`,
          );
          e.code = "BAD_REQUEST";
          throw e;
        }
      }
    }

    // 3) Reemplazo atómico por usuario.
    return await prisma.$transaction(async (tx) => {
      let inserted = 0;
      const diaIdsArr = [...diaIds];

      for (const c of clean) {
        // Borrar solo lo que corresponde al usuario en los días válidos.
        // (Si hubiera basura con dia_id NULL u otros, no la tocamos.)
        await tx.$executeRawUnsafe(
          `DELETE FROM asignacion_dias
           WHERE usuario_id = $1
             AND dia_id = ANY($2::int[])`,
          c.usuario_id,
          diaIdsArr,
        );

        if (c.dia_ids.length > 0) {
          // Inserción simple en loop para mantener portabilidad y
          // compatibilidad con la tabla sin PK.
          for (const dId of c.dia_ids) {
            await tx.$executeRawUnsafe(
              `INSERT INTO asignacion_dias (usuario_id, dia_id)
               VALUES ($1, $2)`,
              c.usuario_id,
              dId,
            );
            inserted += 1;
          }
        }
      }

      return { count: clean.length, inserted };
    });
  }
}

export default new TurnosVentasService();
