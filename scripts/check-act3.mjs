import "dotenv/config";
import prisma from "../src/config/db.js";

const blocks = await prisma.horario_usuario.findMany({
  where: { usuario_id: 24, actividad_id: 3, estado: true },
  orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
});
console.log(`Blocks for user 24, actividad 3:`);
let totalMin = 0;
for (const b of blocks) {
  const hi = b.hora_inicio.getUTCHours() * 60 + b.hora_inicio.getUTCMinutes();
  const hf = b.hora_fin.getUTCHours() * 60 + b.hora_fin.getUTCMinutes();
  const len = hf - hi;
  totalMin += len;
  console.log(`  ${b.fecha.toISOString().slice(0,10)} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} (${len}min) created=${b.created_at.toISOString()}`);
}
console.log(`Total: ${totalMin} min`);

const act = await prisma.actividades.findUnique({
  where: { id: 3 },
  select: { tiempo_estimado_minutos: true, hora_inicio: true, fecha_inicio: true, created_at: true },
});
console.log(`\nActividad 3: est=${act.tiempo_estimado_minutos}min, hora_ini=${act.hora_inicio?.toISOString().slice(11,19)}, fecha_ini=${act.fecha_inicio?.toISOString().slice(0,10)}, created=${act.created_at.toISOString()}`);

await prisma.$disconnect();
