import prisma from "../config/db.js";

class NotificacionesService {
  // Lista las últimas N notificaciones del usuario (para el dropdown).
  async getRecientes(usuarioId, limit = 10) {
    return prisma.notificaciones.findMany({
      where: { usuario_id: Number(usuarioId) },
      orderBy: { id: "desc" },
      take: Math.min(Number(limit) || 10, 50),
      select: {
        id: true,
        titulo: true,
        mensaje: true,
        tipo: true,
        prioridad: true,
        es_leida: true,
        created_at: true,
        remitente_id: true,
      },
    });
  }

  async countNoLeidas(usuarioId) {
    return prisma.notificaciones.count({
      where: { usuario_id: Number(usuarioId), es_leida: false },
    });
  }

  async marcarLeida(notificacionId, usuarioId) {
    // Solo el dueño puede marcarla
    const n = await prisma.notificaciones.findUnique({
      where: { id: Number(notificacionId) },
      select: { id: true, usuario_id: true },
    });
    if (!n || n.usuario_id !== Number(usuarioId)) return null;
    return prisma.notificaciones.update({
      where: { id: Number(notificacionId) },
      data: { es_leida: true, fecha_lectura: new Date() },
      select: { id: true, es_leida: true, fecha_lectura: true },
    });
  }

  async marcarTodasLeidas(usuarioId) {
    const result = await prisma.notificaciones.updateMany({
      where: { usuario_id: Number(usuarioId), es_leida: false },
      data: { es_leida: true, fecha_lectura: new Date() },
    });
    return { count: result.count };
  }
}

export default new NotificacionesService();
