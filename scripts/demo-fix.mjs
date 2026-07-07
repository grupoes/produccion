import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const UID = 24;

// NO cleanup: use the user's CURRENT data.
// Just simulate: call completeActividades again with the same startDate.
console.log("=== BEFORE (current state of horario_usuario for user 24) ===");
const before = await prisma.horario_usuario.findMany({
  where: { usuario_id: 24, estado: true },
  orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
});
let on29Before = 0;
for (const b of before) {
  const is29 = b.fecha.toISOString().slice(0,10) === "2026-06-29";
  if (is29) on29Before++;
  console.log(`  ${b.fecha.toISOString().slice(0,10)} act=${b.actividad_id} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} ${is29 ? "⚠ FERIADO" : ""}`);
}
console.log(`\nBloques en 29/06 ANTES: ${on29Before}`);

// Calcular gaps actuales
const acts = await prisma.actividades.findMany({
  where: { usuario_id: 24, estado: true, estado_progreso: { notIn: ["completada", "cancelada"] } },
});
console.log("\nActividades activas:");
for (const a of acts) {
  const prog = await prisma.horario_usuario.aggregate({
    where: { actividad_id: a.id, estado: true },
    _sum: { duracion_minutos: true },
  });
  const total = prog._sum.duracion_minutos || 0;
  const gap = (a.tiempo_estimado_minutos || 0) - total;
  console.log(`  act=${a.id} est=${a.tiempo_estimado_minutos}min prog=${total}min gap=${gap}min`);
}

await prisma.$disconnect();
