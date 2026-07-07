import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const UID = 24;

// Show current state
const acts = await prisma.actividades.findMany({
  where: { usuario_id: UID, estado: true },
  orderBy: { id: "asc" },
  select: { id: true, tiempo_estimado_minutos: true },
});
console.log("Actividades antes:");
for (const a of acts) {
  const prog = await prisma.horario_usuario.aggregate({
    where: { actividad_id: a.id, estado: true },
    _sum: { duracion_minutos: true },
  });
  const total = prog._sum.duracion_minutos || 0;
  console.log(`  act=${a.id} est=${a.tiempo_estimado_minutos} prog=${total} gap=${a.tiempo_estimado_minutos - total}`);
}

console.log("\n=== Llamando completeActividades(UID, '2026-06-23', {diasHorizonte:14}) ===");
const r = await schedulerService.completeActividades(UID, "2026-06-23", { diasHorizonte: 14 });
console.log("\nResultado:");
for (const a of r.applied) {
  console.log(`  act=${a.actividad_id} +${a.minutos_agregados}min`);
  for (const b of a.bloques_creados) console.log(`    +${b.fecha} ${b.hi}-${b.hf} (${b.len}min)`);
}
console.log("  blocked:", r.blocked);
console.log("  totalGapCubierto:", r.totalGapCubierto);

await prisma.$disconnect();
