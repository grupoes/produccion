import "dotenv/config";
import prisma from "../src/config/db.js";

// Check ALL horario_jornada_detalle for user 1
const allJornadas = await prisma.horario_jornada_detalle.findMany({
  where: { usuario_id: 1 },
  orderBy: [{ dia_semana: "asc" }, { hora_inicio: "asc" }],
});
console.log("ALL Jornadas user 1 (any estado):");
for (const j of allJornadas) {
  console.log(`  dia=${j.dia_semana} estado=${j.estado} ${j.hora_inicio.toISOString().slice(11,19)}-${j.hora_fin.toISOString().slice(11,19)}`);
}

// Check actividades created today (2026-06-23) for user 1
const acts = await prisma.actividades.findMany({
  where: {
    usuario_id: 1,
    created_at: { gte: new Date("2026-06-23T20:00:00Z") },  // 15:00 Lima
  },
  orderBy: { id: "asc" },
  select: { id: true, tiempo_estimado_minutos: true, fecha_inicio: true, hora_inicio: true, created_at: true },
});
console.log("\nActividades created today for user 1:");
for (const a of acts) {
  console.log(`  act=${a.id} est=${a.tiempo_estimado_minutos}min fecha_ini=${a.fecha_inicio?.toISOString().slice(0,10)} hora=${a.hora_inicio?.toISOString().slice(11,19)} created=${a.created_at?.toISOString()}`);
}

await prisma.$disconnect();
