import "dotenv/config";
import prisma from "../src/config/db.js";

const r = await prisma.horario_usuario.deleteMany({
  where: {
    estado: true,
    fecha: new Date("2026-06-29T00:00:00Z"),
  },
});
console.log(`Eliminados ${r.count} bloques en 2026-06-29 (feriado).`);
await prisma.$disconnect();
