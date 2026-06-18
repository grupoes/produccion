import db from "../config/db.js";

class TasksService {
  // Obtener actividades (tareas) pendientes de un usuario por semana
  async getWeeklyTasksByUser(usuarioId) {
    if (!usuarioId) return {};

    // Obtener el día actual y la semana
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calcular inicio de semana (lunes)
    const startOfWeek = new Date(today);
    startOfWeek.setDate(
      today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1),
    );

    // Calcular fin de semana (domingo)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    console.log(
      `[TASKS SERVICE] Usuario: ${usuarioId}, Semana: ${startOfWeek} a ${endOfWeek}`,
    );

    try {
      // Traer todas las actividades de la semana para este usuario
      const actividades = await db.actividades.findMany({
        where: {
          usuario_id: usuarioId,
          fecha_inicio: {
            gte: startOfWeek,
            lte: endOfWeek,
          },
          estado: true, // Solo actividades activas
        },
        include: {
          tarea: true,
          prospectos: true,
        },
        orderBy: [{ fecha_inicio: "asc" }, { hora_inicio: "asc" }],
      });

      console.log(
        `[TASKS SERVICE] Actividades encontradas: ${actividades.length}`,
      );

      // Agrupar por día
      const tasksByDay = {};
      const daysOfWeek = [
        "Lunes",
        "Martes",
        "Miércoles",
        "Jueves",
        "Viernes",
        "Sábado",
        "Domingo",
      ];

      // Inicializar todos los días de la semana
      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        const dateKey = this.formatDate(date);
        const dayName = daysOfWeek[date.getDay() === 0 ? 6 : date.getDay() - 1];

        tasksByDay[dateKey] = {
          date: date,
          day: dayName,
          dateFormatted: this.formatDateDisplay(date),
          tasks: [],
          isToday: this.isSameDay(date, today),
        };
      }

      // Distribuir actividades en los días correspondientes
      actividades.forEach((act) => {
        const dateKey = this.formatDate(act.fecha_inicio);
        if (tasksByDay[dateKey]) {
          tasksByDay[dateKey].tasks.push({
            id: act.id,
            title: act.name_tarea || `Tarea ${act.id}`,
            tiempo: act.tiempo_estimado_minutos,
            tipo: act.tipo,
            categoria: act.categoria,
            prioridad: act.prioridad,
            color: act.color,
            estado_progreso: act.estado_progreso,
            prospecto: act.prospectos?.titulo_prospecto,
          });
        }
      });

      return tasksByDay;
    } catch (error) {
      console.error("[TASKS SERVICE] Error:", error);
      throw error;
    }
  }

  // Obtener resumen de tareas para el día actual
  async getTodayTasksSummary(usuarioId) {
    if (!usuarioId)
      return { total: 0, completadas: 0, pendientes: 0, tareas: [] };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    try {
      const tareas = await db.actividades.findMany({
        where: {
          usuario_id: usuarioId,
          fecha_inicio: {
            gte: today,
            lt: tomorrow,
          },
          estado: true,
        },
        orderBy: [{ hora_inicio: "asc" }],
      });

      const completadas = tareas.filter(
        (t) => t.estado_progreso === "completada",
      ).length;
      const pendientes = tareas.length - completadas;

      return {
        total: tareas.length,
        completadas,
        pendientes,
        tareas: tareas.map((t) => ({
          id: t.id,
          title: t.name_tarea,
          tiempo: t.tiempo_estimado_minutos,
          prioridad: t.prioridad,
          estado: t.estado_progreso,
        })),
      };
    } catch (error) {
      console.error("[TASKS SERVICE] Error en getTodayTasksSummary:", error);
      throw error;
    }
  }

  // Helper: Formatear fecha para key
  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Helper: Formatear fecha para display
  formatDateDisplay(date) {
    const options = { month: "numeric", day: "numeric" };
    return date.toLocaleDateString("es-ES", options);
  }

  // Helper: Comparar si dos fechas son el mismo día
  isSameDay(date1, date2) {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }
}

export default new TasksService();
