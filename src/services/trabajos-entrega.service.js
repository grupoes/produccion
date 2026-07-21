import prisma from "../config/db.js";

class TrabajosEntregaService {
  async listarTrabajosSemana({ semanaOffset = 0, usuarioId } = {}) {
    const hoy = new Date();
    const diaSem = hoy.getDay();
    const diffLunes = diaSem === 0 ? -6 : 1 - diaSem;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() + diffLunes);
    lunes.setHours(0, 0, 0, 0);
    const iniSemana = new Date(lunes);
    iniSemana.setDate(lunes.getDate() + semanaOffset * 7);
    const finSemana = new Date(iniSemana);
    finSemana.setDate(iniSemana.getDate() + 6);
    finSemana.setHours(23, 59, 59, 999);

    const rows = await prisma.prospectos.findMany({
      where: {
        estado_cliente: "cliente",
        estado: true,
        fecha_entrega: {
          gte: iniSemana,
          lte: finSemana,
        },
      },
      select: {
        id: true,
        titulo_prospecto: true,
        fecha_entrega: true,
        link_drive: true,
        prioridad: true,
        usuario_venta_id: true,
        usuarios: {
          select: {
            id: true,
            usuario: true,
            personas: { select: { nombres: true, apellidos: true } },
          },
        },
        actividades: {
          where: { estado: true },
          select: {
            id: true,
            tarea: {
              select: { nombre: true, tipo_tarea_tarea_tipo_tareaTotipo_tarea: { select: { id: true, tipo: true } } },
            },
            estado_progreso: true,
            tiempo_estimado_minutos: true,
            horario_usuario: {
              where: { estado: true },
              select: { duracion_minutos: true },
            },
          },
        },
        prospecto_persona: {
          include: {
            personas: {
              select: { id: true, nombres: true, apellidos: true, celular: true },
            },
          },
        },
      },
      orderBy: { fecha_entrega: "asc" },
    });

    return rows.map((p) => {
      const contactos = (p.prospecto_persona || [])
        .map((pp) => pp.personas)
        .filter(Boolean);
      const totalMinProgramados = p.actividades.reduce(
        (acc, a) =>
          acc +
          (a.horario_usuario || []).reduce(
            (s, h) => s + (Number(h.duracion_minutos) || 0),
            0,
          ),
        0,
      );
      const totalMinEstimados = p.actividades.reduce(
        (acc, a) => acc + (Number(a.tiempo_estimado_minutos) || 0),
        0,
      );
      return {
        id: p.id,
        titulo: p.titulo_prospecto,
        fecha_entrega: p.fecha_entrega
          ? (p.fecha_entrega instanceof Date
              ? `${p.fecha_entrega.getUTCFullYear()}-${String(p.fecha_entrega.getUTCMonth() + 1).padStart(2, "0")}-${String(p.fecha_entrega.getUTCDate()).padStart(2, "0")}`
              : String(p.fecha_entrega).slice(0, 10))
          : null,
        link_drive: p.link_drive,
        prioridad: p.prioridad,
        usuario_venta: p.usuarios
          ? {
              id: p.usuarios.id,
              nombre: [p.usuarios.personas?.nombres, p.usuarios.personas?.apellidos]
                .filter(Boolean)
                .join(" "),
            }
          : null,
        actividades: p.actividades.map((a) => ({
          id: a.id,
          tarea: a.tarea?.nombre || null,
          tipo_tarea: a.tarea?.tipo_tarea_tarea_tipo_tareaTotipo_tarea?.tipo || null,
          estado: a.estado_progreso,
          minutos_estimados: a.tiempo_estimado_minutos,
          minutos_programados: (a.horario_usuario || []).reduce(
            (s, h) => s + (Number(h.duracion_minutos) || 0),
            0,
          ),
        })),
        contactos: contactos.map((c) => ({
          id: c.id,
          nombre: [c.nombres, c.apellidos].filter(Boolean).join(" "),
          celular: c.celular,
        })),
        total_minutos_estimados: totalMinEstimados,
        total_minutos_programados: totalMinProgramados,
        progreso_pct:
          totalMinEstimados > 0
            ? Math.round((totalMinProgramados / totalMinEstimados) * 100)
            : 0,
      };
    });
  }
}

export default new TrabajosEntregaService();