import "dotenv/config";
import prisma from "../src/config/db.js";

const feriados = await prisma.feriados.findMany({
  where: { estado: true },
  orderBy: { fecha: "asc" },
});

console.log(`Total feriados activos: ${feriados.length}`);
for (const f of feriados) {
  console.log(`  ${f.fecha.toISOString().slice(0,10)} - ${f.nombre || "?"}`);
}

await prisma.$disconnect();
