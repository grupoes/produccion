import prisma from "../config/db.js";

// Helpers de formateo (idénticos al criterio que usa
// reuniones-asistente.service.js#fmtLocalDate / #minToHHMM). Acá los
// inlineamos para no acoplar este service al de Asistente.
//
// IMPORTANTE: `hora_inicio` es una columna `@db.Timetz(6)` que el código
// de `potenciales-clientes.service.js#toTime` escribe con `Date.UTC(...)`
// (el comentario ahí explica por qué). Para que el round-trip sea
// consistente, al leer un Date de Prisma tenemos que usar `getUTCHours` /
// `getUTCMinutes`, NO `getHours` (que devuelve la hora local del server
// y, en zonas con offset, descuadra el valor: p.ej. 12:00 → 07:00 en
// Perú). El front (potenciales-clientes/index.js#formatHoraIso) ya
// aplica la misma convención.
const hmsToMin = (s) => {
  if (s == null) return null;
  if (s instanceof Date && !Number.isNaN(s.getTime())) {
    return s.getUTCHours() * 60 + s.getUTCMinutes();
  }
  // Acepta "HH:MM[:SS]", "T HH:MM" dentro de un ISO, o "HH:MM:SS+ZZ".
  const str = String(s);
  const mIso = str.match(/T(\d{2}):(\d{2})/);
  if (mIso) return Number(mIso[1]) * 60 + Number(mIso[2]);
  const mHms = str.match(/^(\d{1,2}):(\d{2})/);
  return mHms ? Number(mHms[1]) * 60 + Number(mHms[2]) : null;
};
const minToHHMM = (min) => {
  if (min == null) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const fmtLocalDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    // Para columnas `date` Prisma devuelve un Date a medianoche UTC. Usamos
    // los componentes UTC para evitar off-by-one en zonas negativas.
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

class CalendarioAsistenteService {
  // Lista los usuarios activos excluyendo el `rol_id` indicado (típicamente
  // 1 = admin/root, para que el ASISTENTE no se asigne a sí mismo ni a
  // admins). Devuelve `id`, `usuario` y `nombre_completo` para llenar el
  // `<select>` del header.
  async getUsuariosExcluyendoRol(rolIdExcluir) {
    const where = { estado: true };
    if (rolIdExcluir != null) {
      where.rol_id = { not: Number(rolIdExcluir) };
    }
    const rows = await prisma.usuarios.findMany({
      where,
      orderBy: { id: "asc" },
      select: {
        id: true,
        usuario: true,
        rol_id: true,
        personas: {
          select: { nombres: true, apellidos: true },
        },
        roles: {
          select: { id: true, nombre: true },
        },
      },
    });
    return rows.map((u) => {
      const nom = u.personas?.nombres || "";
      const ape = u.personas?.apellidos || "";
      const nombreCompleto = `${nom} ${ape}`.trim() || u.usuario || `#${u.id}`;
      return {
        id: u.id,
        usuario: u.usuario,
        nombre_completo: nombreCompleto,
        rol: u.roles ? { id: u.roles.id, nombre: u.roles.nombre } : null,
      };
    });
  }

  // Lista TODAS las ACTIVIDADES activas (sin filtrar por tipo de tarea).
  // Antes filtraba por `tipo_tarea` REUNION, pero el calendario del
  // Asistente necesita pintar cualquier actividad del usuario
  // (reuniones, valorador, auxiliares, etc.), no solo las reuniones.
  //
  // Devuelve cada actividad con la info del prospecto, la tarea, fechas
  // y el estado. Se usa tanto para el sidebar como para pintar el
  // calendario del usuario.
  //
  // Parámetros:
  //   - usuarioId: si se pasa, filtra por el usuario asignado (vía
  //     `horario_usuario` si tiene slot, o `actividades.usuario_id` si
  //     no).
  //   - onlySinSlot: si true, devuelve SOLO actividades que NO tengan
  //     una fila activa en `horario_usuario`. Se usa para el sidebar
  //     "pendientes de programar".
  //   - onlyConSlot: si true, devuelve SOLO actividades que SÍ tengan
  //     una fila activa en `horario_usuario`. Se usa para pintar el
  //     calendario del usuario (las "programadas oficialmente").
  //
  //   Si se pasan ambos, prevalece `onlySinSlot`. Si no se pasa
  //   ninguno, devuelve todas (compat con vistas viejas).
  async getActividadesReunion({
    usuarioId,
    onlySinSlot,
    onlyConSlot,
  } = {}) {
    const whereAct = {
      estado: true,
    };

    // Filtro por presencia de horario_usuario:
    //   * onlySinSlot → sidebar de "pendientes de programar"
    //   * onlyConSlot → calendario (las que ya tienen slot)
    // Si se pasan ambos, gana onlySinSlot.
    //
    // IMPORTANTE: el usuario "asignado" vive en `horario_usuario.usuario_id`
    // (es la fuente de verdad del scheduler). En el flujo de importación
    // (y otros) `actividades.usuario_id` queda NULL, así que filtrar por
    // `actividades.usuario_id` se los come. Por eso, cuando hay slot
    // (onlyConSlot) el filtro va sobre la relación `horario_usuario`.
    // Cuando NO hay slot (onlySinSlot) el usuario tiene que estar en
    // `actividades.usuario_id` (es lo único disponible hasta que se
    // programe).
    if (onlySinSlot) {
      whereAct.horario_usuario = { none: { estado: true } };
      if (usuarioId != null) {
        whereAct.usuario_id = Number(usuarioId);
      }
    } else if (onlyConSlot) {
      whereAct.horario_usuario = {
        some: { estado: true, ...(usuarioId != null ? { usuario_id: Number(usuarioId) } : {}) },
      };
    } else if (usuarioId != null) {
      // Modo compat (ningún flag): no aplicamos filtro de usuario para no
      // dejar afuera actividades importadas (cuyo `actividades.usuario_id`
      // es null y su horario_usuario es el único que tiene el dato).
      // Si en el futuro se quiere filtrar acá, revisar este branch.
    }

    const actividades = await prisma.actividades.findMany({
      where: whereAct,
      orderBy: [{ fecha_inicio: "desc" }, { id: "desc" }],
      select: {
        id: true,
        estado_progreso: true,
        prioridad: true,
        estado: true,
        color: true,
        fecha_inicio: true,
        hora_inicio: true,
        tiempo_estimado_minutos: true,
        usuario_id: true,
        prospectos: {
          select: {
            id: true,
            titulo_prospecto: true,
            estado_cliente: true,
            // Universidad sale de carreras.institucion.nombre
            carreras: {
              select: {
                id: true,
                nombre: true,
                institucion: { select: { id: true, nombre: true } },
              },
            },
            nivel_academico: { select: { id: true, nombre: true } },
            // Primer contacto del prospecto (para la card del sidebar).
            prospecto_persona: {
              select: {
                personas: {
                  select: {
                    id: true,
                    nombres: true,
                    apellidos: true,
                    celular: true,
                  },
                },
              },
            },
          },
        },
        tarea: {
          select: {
            id: true,
            nombre: true,
            tipo_tarea_tarea_tipo_tareaTotipo_tarea: {
              select: { id: true, tipo: true, color: true },
            },
          },
        },
        horario_usuario: {
          where: { estado: true },
          select: { id: true },
          take: 1,
        },
      },
      take: 200,
    });

    return actividades.map((a) => {
      const p = a.prospectos || null;
      const contactos = p?.prospecto_persona
        ? p.prospecto_persona
            .map((pp) => pp.personas)
            .filter(Boolean)
            .map((per) => ({
              id: per.id,
              nombres: per.nombres,
              apellidos: per.apellidos,
              celular: per.celular,
              nombre_completo: [per.nombres, per.apellidos]
                .filter(Boolean)
                .join(" ")
                .trim() || null,
            }))
        : [];
      return {
        id: a.id,
        estado_progreso: a.estado_progreso,
        prioridad: a.prioridad,
        estado: a.estado,
        color: a.color || null,
        usuario_id: a.usuario_id,
        tiene_slot: (a.horario_usuario || []).length > 0,
        // Normalizamos a strings simples para que el front no tenga que
        // lidiar con la ambigüedad de JSON.stringify(Date) (que rompe
        // `instanceof Date` y mete líos de timezone). Mismo patrón que
        // reuniones-asistente.service.js#obtenerReunionDetalle.
        fecha_inicio: fmtLocalDate(a.fecha_inicio),
        hora_inicio: minToHHMM(hmsToMin(a.hora_inicio)),
        tiempo_estimado_minutos: a.tiempo_estimado_minutos,
        prospecto: p
          ? {
              id: p.id,
              titulo: p.titulo_prospecto,
              estado_cliente: p.estado_cliente || null,
              universidad: p.carreras?.institucion?.nombre || null,
              carrera: p.carreras?.nombre || null,
              nivel_academico: p.nivel_academico?.nombre || null,
              contactos,
              // Primer contacto plano (atajo cómodo para el sidebar).
              contacto_principal: contactos[0]?.nombre_completo || null,
            }
          : null,
        tarea: a.tarea
          ? {
              id: a.tarea.id,
              nombre: a.tarea.nombre,
              tipo_tarea: a.tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea
                ? {
                    id: a.tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea.id,
                    tipo: a.tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea.tipo,
                    color:
                      a.tarea.tipo_tarea_tarea_tipo_tareaTotipo_tarea.color,
                  }
                : null,
            }
          : null,
      };
    });
  }
}

export default new CalendarioAsistenteService();
