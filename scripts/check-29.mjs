import "dotenv/config";
import prisma from "../src/config/db.js";

const blocks = await prisma.horario_usuario.findMany({
  where: {
    usuario_id: 24,
    estado: true,
    fecha: new Date("2026-06-29T00:00:00Z"),
  },
  select: { id: true, actividad_id: true, hora_inicio: true, hora_fin: true, created_at: true, updated_at: true },
});
console.log(`Blocks user 24 on 2026-06-29: ${blocks.length}`);
for (const b of blocks) {
  console.log(`  id=${b.id} act=${b.actividad_id} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} created=${b.created_at.toISOString()} updated=${b.updated_at.toISOString()}`);
}
await prisma.$disconnect();
