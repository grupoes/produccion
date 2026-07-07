import "dotenv/config";
import prisma from "../src/config/db.js";

const j = await prisma.horario_jornada_detalle.findMany({
  where: { usuario_id: 24 },
  orderBy: [{ dia_semana: "asc" }, { hora_inicio: "asc" }],
});
console.log("User 24 jornada (current state):");
for (const r of j) {
  console.log(`  dia=${r.dia_semana} estado=${r.estado} ${r.hora_inicio.toISOString().slice(11,19)}-${r.hora_fin.toISOString().slice(11,19)}`);
}

// Check for any orphan blocks on Sat (27) and Mon (29)
const blocks = await prisma.horario_usuario.findMany({
  where: { usuario_id: 24, estado: true },
  orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
});
console.log("\nAll horario_usuario for user 24:");
for (const b of blocks) {
  console.log(`  ${b.fecha.toISOString().slice(0,10)} act=${b.actividad_id} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} created=${b.created_at.toISOString()}`);
}
await prisma.$disconnect();
