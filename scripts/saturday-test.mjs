import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const UID = 24;

// Clean state, Saturday only 08-13 jornada, actividad with gap starting Friday
await prisma.horario_usuario.deleteMany({ where: { usuario_id: UID } });
await prisma.actividades.deleteMany({ where: { usuario_id: UID } });

await prisma.actividades.create({
  data: {
    id: 88, usuario_id: UID, estado: true, estado_progreso: "pendiente",
    prioridad: "MEDIA", tiempo_estimado_minutos: 600,
    tarea_id: 1, fecha_inicio: new Date("2026-06-26T00:00:00"),
    hora_inicio: new Date("2026-06-26T18:00:00Z"),
  },
});

// Saturday jornada only 08-13
await prisma.horario_jornada_detalle.deleteMany({ where: { usuario_id: UID, dia_semana: 6 } });
await prisma.horario_jornada_detalle.create({
  data: { usuario_id: UID, dia_semana: 6, hora_inicio: new Date(Date.UTC(1970,0,1,8,0)), hora_fin: new Date(Date.UTC(1970,0,1,13,0)), estado: true },
});

// Initial block 60 min on Friday
await prisma.horario_usuario.create({
  data: { actividad_id: 88, usuario_id: UID, fecha: new Date("2026-06-26T00:00:00"), hora_inicio: new Date("2026-06-26T18:00:00Z"), hora_fin: new Date("2026-06-26T19:00:00Z"), estado: true, tipo: "actividad", duracion_minutos: 60 },
});

console.log("Setup: gap=540min, sábado solo 08-13");

const r = await schedulerService.completeActividades(UID, "2026-06-26", { diasHorizonte: 14 });
console.log("\nResultado:");
for (const a of r.applied) {
  console.log(`  actividad=${a.actividad_id} gap=${a.minutos_agregados}min`);
  for (const b of a.bloques_creados) console.log(`    created: ${b.fecha} ${b.hi}-${b.hf} (${b.len}min)`);
}
console.log("  blocked:", r.blocked);

const b27 = await prisma.horario_usuario.findMany({ where: { usuario_id: UID, estado: true, fecha: new Date("2026-06-27T00:00:00Z") } });
console.log(`\nBloques en 27/06 (Sábado, jornada 08-13): ${b27.length}`);
for (const b of b27) console.log(`  ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)}`);

const b29 = await prisma.horario_usuario.findMany({ where: { usuario_id: UID, estado: true, fecha: new Date("2026-06-29T00:00:00Z") } });
console.log(`Bloques en 29/06 (FERIADO): ${b29.length}`);

await prisma.$disconnect();
