import "dotenv/config";
import prisma from "../src/config/db.js";
const f = await prisma.feriados.findFirst({
  where: { fecha: { gte: new Date("2026-06-28T00:00:00Z"), lte: new Date("2026-06-30T00:00:00Z") } },
  orderBy: { fecha: "asc" },
});
console.log("Feriado encontrado:", f);
if (f) {
  console.log("fecha instanceof Date:", f.fecha instanceof Date);
  console.log("fecha.toISOString():", f.fecha.toISOString());
  console.log("getUTC:", f.fecha.getUTCDate(), f.fecha.getUTCMonth(), f.fecha.getUTCFullYear());
  console.log("getLocal:", f.fecha.getDate(), f.fecha.getMonth(), f.fecha.getFullYear());
}
await prisma.$disconnect();
