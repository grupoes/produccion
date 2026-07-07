import "dotenv/config";
import prisma from "../src/config/db.js";

const blocks = await prisma.horario_usuario.findMany({
  where: { usuario_id: 24, estado: true },
  orderBy: [{ actividad_id: "asc" }, { fecha: "asc" }, { hora_inicio: "asc" }],
});
console.log("Bloques actuales user 24:");
let lastAct = "";
for (const b of blocks) {
  if (String(b.actividad_id) !== lastAct) {
    console.log(`\n  --- Actividad ${b.actividad_id} ---`);
    lastAct = String(b.actividad_id);
  }
  console.log(`  id=${b.id} ${b.fecha.toISOString().slice(0,10)} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} created=${b.created_at.toISOString()} updated=${b.updated_at.toISOString()}`);
}

// Activities
const acts = await prisma.actividades.findMany({
  where: { usuario_id: 24 },
  orderBy: { id: "asc" },
  select: { id: true, tiempo_estimado_minutos: true, hora_inicio: true, fecha_inicio: true, created_at: true, updated_at: true },
});
console.log("\nActividades:");
for (const a of acts) {
  console.log(`  act=${a.id} est=${a.tiempo_estimado_minutos}min created=${a.created_at.toISOString()} updated=${a.updated_at.toISOString()}`);
}

await prisma.$disconnect();
