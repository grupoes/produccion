import "dotenv/config";
import prisma from "../src/config/db.js";

// Simulate the exact query from completeActividades
const startDate = new Date(2026, 5, 23);  // parseLocalDate("2026-06-23")
const endDate = new Date(2026, 6, 7);    // +14 days
console.log("startDate:", startDate.toISOString(), "TZ offset:", startDate.getTimezoneOffset());
console.log("endDate:", endDate.toISOString());

const fRows = await prisma.feriados.findMany({
  where: { estado: true, fecha: { gte: startDate, lte: endDate } },
  select: { fecha: true, nombre: true },
});
console.log("\nFeriados encontrados:", fRows.length);
for (const f of fRows) {
  const d = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
  console.log(`  fecha raw: ${f.fecha.toISOString()}`);
  console.log(`    getUTC: ${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  console.log(`    getLocal: ${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
}

// Test isFeriado logic
const feriadosSet = new Set();
for (const f of fRows) {
  const d = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
  feriadosSet.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
}
console.log("\nferiadosSet:", [...feriadosSet]);

const cursor = new Date(2026, 5, 29); // 2026-06-29 local
const isFeriado = (cursor) =>
  feriadosSet.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`);

console.log(`\ncursor at 2026-06-29 local:`);
console.log(`  getFullYear=${cursor.getFullYear()} getMonth=${cursor.getMonth()} getDate=${cursor.getDate()}`);
console.log(`  key: ${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`);
console.log(`  isFeriado? ${isFeriado(cursor)}`);

await prisma.$disconnect();
