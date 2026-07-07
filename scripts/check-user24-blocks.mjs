import "dotenv/config";
import prisma from "../src/config/db.js";

const blocks = await prisma.horario_usuario.findMany({
  where: { usuario_id: 24, estado: true },
  orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
});
console.log(`Total blocks for user 24: ${blocks.length}`);
let lastFecha = "";
for (const b of blocks) {
  const f = b.fecha.toISOString().slice(0,10);
  if (f !== lastFecha) { console.log(""); lastFecha = f; }
  console.log(`  ${f} act=${b.actividad_id} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} created=${b.created_at.toISOString()}`);
}

await prisma.$disconnect();
