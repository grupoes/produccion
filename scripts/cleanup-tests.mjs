import "dotenv/config";
import prisma from "../src/config/db.js";

await prisma.horario_usuario.deleteMany({ where: { usuario_id: 24 } });
await prisma.actividades.deleteMany({ where: { id: { in: [88, 99] } } });

// Restore original Saturday jornada (only 08-13, like user's actual config)
await prisma.horario_jornada_detalle.deleteMany({ where: { usuario_id: 24, dia_semana: 6 } });
await prisma.horario_jornada_detalle.create({
  data: { usuario_id: 24, dia_semana: 6, hora_inicio: new Date(Date.UTC(1970,0,1,8,0)), hora_fin: new Date(Date.UTC(1970,0,1,13,0)), estado: true },
});

// Re-add the original 3 activities
await prisma.actividades.deleteMany({ where: { usuario_id: 24, id: { in: [1, 2, 3] } } });
await prisma.actividades.create({ data: { id: 1, usuario_id: 24, estado: true, estado_progreso: "pendiente", prioridad: "MEDIA", tiempo_estimado_minutos: 660, tarea_id: 1, fecha_inicio: new Date("2026-06-23T00:00:00"), hora_inicio: new Date("2026-06-23T13:00:00Z") } });
await prisma.actividades.create({ data: { id: 2, usuario_id: 24, estado: true, estado_progreso: "pendiente", prioridad: "MEDIA", tiempo_estimado_minutos: 1200, tarea_id: 1, fecha_inicio: new Date("2026-06-24T00:00:00"), hora_inicio: new Date("2026-06-24T15:00:00Z") } });
await prisma.actividades.create({ data: { id: 3, usuario_id: 24, estado: true, estado_progreso: "pendiente", prioridad: "MEDIA", tiempo_estimado_minutos: 1200, tarea_id: 1, fecha_inicio: new Date("2026-06-26T00:00:00"), hora_inicio: new Date("2026-06-26T17:00:00Z") } });

console.log("Cleanup done. User 24 restored to clean state.");
const b29 = await prisma.horario_usuario.findMany({ where: { usuario_id: 24, estado: true, fecha: new Date("2026-06-29T00:00:00Z") } });
console.log(`Bloques en 29/06: ${b29.length}`);
await prisma.$disconnect();
