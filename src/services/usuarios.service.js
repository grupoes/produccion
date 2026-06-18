import prisma from "../config/db.js";

class UsuariosService {
  async getAll() {
    return await prisma.usuarios.findMany({
      where: { estado: true },
      select: {
        id: true,
        usuario: true,
        estado: true,
        roles: {
          select: { id: true, nombre: true },
        },
        personas: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            numero_documento: true,
            email: true,
            celular: true,
          },
        },
        tipo_jornada: {
          select: { id: true, nombre_jornada: true },
        },
      },
      orderBy: { id: "asc" },
    });
  }

  async getRoles() {
    return await prisma.roles.findMany({
      where: { estado: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
  }

  async getTipoDocumento() {
    return await prisma.tipo_documento.findMany({
      where: { estado: true },
      select: { id: true, nombre: true, abreviatura: true },
      orderBy: { nombre: "asc" },
    });
  }

  async getTipoJornada() {
    return await prisma.tipo_jornada.findMany({
      where: { estado: true },
      select: { id: true, nombre_jornada: true },
      orderBy: { nombre_jornada: "asc" },
    });
  }

  async getTipoDocumentoById(id) {
    if (!id) return null;
    return await prisma.tipo_documento.findUnique({
      where: { id },
      select: { id: true, nombre: true, abreviatura: true },
    });
  }

  async getTipoJornadaById(id) {
    if (!id) return null;
    return await prisma.tipo_jornada.findUnique({
      where: { id },
      select: { id: true, nombre_jornada: true },
    });
  }

  // Nombres de jornada que requieren guardar el detalle de horario.
  // Match case-insensitive.
  isJornadaConHorario(nombre) {
    if (!nombre) return false;
    const n = String(nombre).trim().toLowerCase();
    return n === "full time" || n === "part time";
  }

  // Normaliza "HH:MM" o "HH:MM:SS" a un string "HH:MM:SS" listo para
  // castear a ::time en SQL. Devuelve null si la entrada es inválida.
  toTime(value) {
    if (value == null || value === "") return null;
    const s = String(value).trim();
    const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const h = Math.min(23, Math.max(0, Number(m[1])));
    const mi = Math.min(59, Math.max(0, Number(m[2])));
    const se = m[3] != null ? Math.min(59, Math.max(0, Number(m[3]))) : 0;
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(se).padStart(2, "0")}`;
  }

  async getSchedule(usuarioId) {
    if (!usuarioId) return [];
    // Usamos $queryRaw con to_char para evitar el ciclo JS Date <-> @db.Timetz,
    // que el driver `pg` resuelve en UTC y rompe la hora mostrada.
    // Cast a ::time primero porque to_char no acepta timetz directamente.
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id,
              dia_semana,
              to_char(hora_inicio::time, 'HH24:MI') AS hora_inicio,
              to_char(hora_fin::time,    'HH24:MI') AS hora_fin,
              estado
         FROM horario_jornada_detalle
        WHERE usuario_id = $1
        ORDER BY dia_semana ASC, hora_inicio ASC`,
      usuarioId,
    );
    return rows.map((r) => ({
      id: r.id,
      dia_semana: r.dia_semana,
      hora_inicio: r.hora_inicio ?? "",
      hora_fin: r.hora_fin ?? "",
      estado: r.estado,
    }));
  }

  /**
   * Reemplaza el horario completo de un usuario.
   * items: [{ dia_semana, turno, habilitado, hora_inicio, hora_fin }]
   * - "turno" se ignora: el orden de hora_inicio distingue mañana vs tarde.
   * - Solo se persisten los items con habilitado=true.
   * - Si la jornada NO es Full Time/Part Time, igual limpiamos lo viejo.
   */
  async saveSchedule(usuarioId, items, tx = prisma) {
    if (!usuarioId) return;
    await tx.horario_jornada_detalle.deleteMany({
      where: { usuario_id: usuarioId },
    });
    if (!Array.isArray(items) || items.length === 0) return;

    const rows = items
      .filter((it) => it && it.habilitado)
      .map((it) => ({
        dia_semana: it.dia_semana != null ? Number(it.dia_semana) : null,
        hora_inicio: this.toTime(it.hora_inicio),
        hora_fin: this.toTime(it.hora_fin),
      }))
      .filter((d) => d.dia_semana != null && d.hora_inicio && d.hora_fin);

    if (rows.length === 0) return;

    // INSERT multi-row con cast explícito ::time. Sin cast, el driver
    // envía el timestamp UTC y Postgres lo trunca a la hora UTC.
    const placeholders = rows
      .map(
        (_, i) =>
          `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}::time, $${i * 4 + 4}::time, true)`,
      )
      .join(", ");
    const params = rows.flatMap((r) => [
      usuarioId,
      r.dia_semana,
      r.hora_inicio,
      r.hora_fin,
    ]);

    await tx.$executeRawUnsafe(
      `INSERT INTO horario_jornada_detalle
         (usuario_id, dia_semana, hora_inicio, hora_fin, estado)
       VALUES ${placeholders}`,
      ...params,
    );
  }

  async getById(id) {
    const usuario = await prisma.usuarios.findUnique({
      where: { id },
      select: {
        id: true,
        usuario: true,
        estado: true,
        rol_id: true,
        tipo_jornada_id: true,
        personas: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            numero_documento: true,
            email: true,
            celular: true,
            direccion: true,
            fecha_nacimiento: true,
            tipoDocumento_id: true,
          },
        },
      },
    });
    if (!usuario) return null;
    usuario.horario = await this.getSchedule(id);
    return usuario;
  }

  async create({ usuario, clave, rol_id, tipo_jornada_id, persona, horario }) {
    // Usamos una transacción para asegurar que si algo falla,
    // ni la persona ni el usuario queden guardados a medias.
    return await prisma.$transaction(async (tx) => {
      // 1. Crear la persona primero
      const nuevaPersona = await tx.personas.create({
        data: {
          nombres: persona.nombres,
          apellidos: persona.apellidos,
          numero_documento: persona.numero_documento ?? null,
          email: persona.email ?? null,
          celular: persona.celular ?? null,
          direccion: persona.direccion ?? null,
          fecha_nacimiento: persona.fecha_nacimiento
            ? new Date(persona.fecha_nacimiento)
            : null,
          tipoDocumento_id: persona.tipoDocumento_id
            ? Number(persona.tipoDocumento_id)
            : null,
          estado: true,
        },
      });

      // 2. Crear el usuario vinculando la persona recién creada
      const nuevoUsuario = await tx.usuarios.create({
        data: {
          usuario,
          clave,
          rol_id: rol_id ? Number(rol_id) : null,
          tipo_jornada_id: tipo_jornada_id ? Number(tipo_jornada_id) : null,
          persona_id: nuevaPersona.id,
          estado: true,
        },
      });

      // 3. Guardar el horario si la jornada lo requiere
      const jornada = tipo_jornada_id
        ? await tx.tipo_jornada.findUnique({
            where: { id: Number(tipo_jornada_id) },
            select: { nombre_jornada: true },
          })
        : null;
      if (this.isJornadaConHorario(jornada?.nombre_jornada)) {
        await this.saveSchedule(nuevoUsuario.id, horario, tx);
      } else if (Array.isArray(horario) && horario.length) {
        // Jornada no FT/PT pero llegó un horario: limpiar lo viejo por consistencia
        await this.saveSchedule(nuevoUsuario.id, [], tx);
      }

      return nuevoUsuario;
    });
  }

  async update(id, { usuario, clave, rol_id, tipo_jornada_id, persona, horario }) {
    // Buscamos el usuario para obtener su persona_id actual
    const usuarioActual = await prisma.usuarios.findUnique({
      where: { id },
      select: { persona_id: true },
    });

    if (!usuarioActual) return null;

    return await prisma.$transaction(async (tx) => {
      // 1. Actualizar datos de la persona si tiene persona_id
      if (usuarioActual.persona_id && persona) {
        await tx.personas.update({
          where: { id: usuarioActual.persona_id },
          data: {
            nombres: persona.nombres ?? undefined,
            apellidos: persona.apellidos ?? undefined,
            numero_documento: persona.numero_documento ?? undefined,
            email: persona.email ?? undefined,
            celular: persona.celular ?? undefined,
            direccion: persona.direccion ?? undefined,
            fecha_nacimiento: persona.fecha_nacimiento
              ? new Date(persona.fecha_nacimiento)
              : undefined,
            tipoDocumento_id: persona.tipoDocumento_id
              ? Number(persona.tipoDocumento_id)
              : undefined,
          },
        });
      }

      // 2. Actualizar el usuario
      const dataUsuario = {
        rol_id: rol_id ? Number(rol_id) : undefined,
        tipo_jornada_id: tipo_jornada_id ? Number(tipo_jornada_id) : undefined,
      };

      if (usuario) dataUsuario.usuario = usuario;
      if (clave) dataUsuario.clave = clave;

      const usuarioActualizado = await tx.usuarios.update({
        where: { id },
        data: dataUsuario,
      });

      // 3. Sincronizar horario. Si la jornada destino NO es FT/PT, limpiamos.
      const jornada = tipo_jornada_id
        ? await tx.tipo_jornada.findUnique({
            where: { id: Number(tipo_jornada_id) },
            select: { nombre_jornada: true },
          })
        : null;
      if (this.isJornadaConHorario(jornada?.nombre_jornada)) {
        await this.saveSchedule(id, horario, tx);
      } else {
        await this.saveSchedule(id, [], tx);
      }

      return usuarioActualizado;
    });
  }

  async remove(id) {
    // Eliminación lógica: solo cambiamos estado a false
    return await prisma.usuarios.update({
      where: { id },
      data: { estado: false },
    });
  }
}

export default new UsuariosService();
