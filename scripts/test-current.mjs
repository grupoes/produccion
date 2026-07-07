import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const UID = 24;

// Force-create a NEW actividad with gap to fill
await prisma.actividades.deleteMany({ where: { usuario_id: 24, id: 4 } });
await prisma.actividades.create({
  data: {
    id: 4, usuario_id: 24, estado: true, estado_progreso: "pendiente",
    prioridad: "MEDIA", tiempo_estimado_minutos: 480,
    tarea_id: 1, fecha_inicio: new Date("2026-06-23T00:00:00"),
    hora_inicio: new Date("2026-06-23T13:00:00Z"),
  },
});

console.log("Created new actividad 4 with 480min gap");

const r = await schedulerService.completeActividades(UID, "2026-06-23", { diasHorizonte: 14 });
console.log("\nResult:");
for (const a of r.applied) {
  console.log(`  actividad=${a.actividad_id} gap=${a.minutos_agregados}min`);
  for (const b of a.bloques_creados) {
    console.log(`    created: ${b.fecha} ${b.hi}-${b.hf} (${b.len}min)`);
  }
}
console.log("  blocked:", r.blocked);

// Check 29
const blocks29 = await prisma.horario_usuario.findMany({
  where: { usuario_id: 24, estado: true, fecha: new Date("2026-06-29T00:00:00Z") },
});
console.log(`\nBloques en 29/06 DESPUÉS: ${blocks29.length}`);

await prisma.$disconnect();
