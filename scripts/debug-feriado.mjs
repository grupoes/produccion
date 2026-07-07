import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const UID = 24;

// Verify current state
const f = await prisma.feriados.findFirst({
  where: { estado: true, fecha: { gte: new Date("2026-06-27T00:00:00Z"), lte: new Date("2026-07-11T00:00:00Z") } },
  orderBy: { fecha: "asc" },
});
console.log("Feriado 29 en BD:", f ? `${f.fecha.toISOString().slice(0,10)} estado=${f.estado}` : "NO EXISTE");

// Add a debug version of isFeriado
const startDate = new Date(2026, 5, 27);
const endDate = new Date(2026, 6, 11);
const fRows = await prisma.feriados.findMany({
  where: { estado: true, fecha: { gte: startDate, lte: endDate } },
  select: { fecha: true },
});
console.log("\nFeriados encontrados en el rango:", fRows.length);
for (const x of fRows) {
  console.log(`  raw: ${x.fecha.toISOString()}`);
}

const feriadosSet = new Set();
for (const x of fRows) {
  const d = x.fecha instanceof Date ? x.fecha : new Date(x.fecha);
  feriadosSet.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
}
console.log("feriadosSet:", [...feriadosSet]);

const cursor29 = new Date(2026, 5, 29);
const lookupKey = `${cursor29.getFullYear()}-${cursor29.getMonth()}-${cursor29.getDate()}`;
console.log(`\ncursor at 2026-06-29 local: lookupKey="${lookupKey}"`);
console.log(`  isFeriado? ${feriadosSet.has(lookupKey)}`);

// Now manually call completeActividades
const r = await schedulerService.completeActividades(UID, "2026-06-27", { diasHorizonte: 14 });
console.log("\ncompleteActividades result:");
for (const a of r.applied) {
  console.log(`  actividad=${a.actividad_id} gap=${a.minutos_agregados}min`);
  for (const b of a.bloques_creados) console.log(`    ${b.fecha} ${b.hi}-${b.hf}`);
}

await prisma.$disconnect();
