import "dotenv/config";
import prisma from "../src/config/db.js";
const r = await prisma.horario_usuario.findMany({
  where: { estado: true, fecha: new Date("2026-06-29T00:00:00Z") },
});
console.log(`Bloques en 29/06 ahora: ${r.length}`);
await prisma.$disconnect();
