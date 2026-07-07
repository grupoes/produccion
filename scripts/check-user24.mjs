import "dotenv/config";
import prisma from "../src/config/db.js";

const jornadas = await prisma.horario_jornada_detalle.findMany({
  where: { usuario_id: 24 },
  orderBy: [{ dia_semana: "asc" }, { hora_inicio: "asc" }],
});
console.log("Jornadas user 24:");
for (const j of jornadas) {
  console.log(`  dia=${j.dia_semana} estado=${j.estado} ${j.hora_inicio.toISOString().slice(11,19)}-${j.hora_fin.toISOString().slice(11,19)}`);
}

const acts = await prisma.actividades.findMany({
  where: { usuario_id: 24 },
  orderBy: { id: "asc" },
  select: { id: true, tiempo_estimado_minutos: true, fecha_inicio: true, hora_inicio: true },
});
console.log("\nActividades user 24:");
for (const a of acts) {
  console.log(`  act=${a.id} est=${a.tiempo_estimado_minutos}min fecha_ini=${a.fecha_inicio?.toISOString().slice(0,10)} hora=${a.hora_inicio?.toISOString().slice(11,19)}`);
}

await prisma.$disconnect();
