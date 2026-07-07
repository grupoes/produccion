import "dotenv/config";
import prisma from "../src/config/db.js";

const blocks = await prisma.horario_usuario.findMany({
  where: {
    fecha: { gte: new Date("2026-06-28T00:00:00Z"), lte: new Date("2026-06-30T23:59:59Z") },
  },
  orderBy: [{ usuario_id: "asc" }, { fecha: "asc" }],
});
console.log(`Total blocks on 28-30/06: ${blocks.length}`);
for (const b of blocks) {
  console.log(`  user=${b.usuario_id} act=${b.actividad_id} ${b.fecha.toISOString().slice(0,10)} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} created=${b.created_at?.toISOString()}`);
}

await prisma.$disconnect();
