import "dotenv/config";
import prisma from "../src/config/db.js";

const UID = 24;
const acts = await prisma.actividades.findMany({
  where: { usuario_id: UID, estado: true },
  orderBy: { id: "asc" },
});
console.log("Actividades:");
for (const a of acts) {
  const blocks = await prisma.horario_usuario.findMany({
    where: { actividad_id: a.id, estado: true },
    orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
  });
  const totalProg = blocks.reduce((acc, b) => acc + b.duracion_minutos, 0);
  console.log(`\n  act=${a.id} est=${a.tiempo_estimado_minutos}prog=${totalProg} gap=${a.tiempo_estimado_minutos - totalProg} prio=${a.prioridad} bloqueada=${a.bloqueada} prospecto_id=${a.prospecto_id}`);
  if (a.prospecto_id) {
    const p = await prisma.prospectos.findUnique({
      where: { id: a.prospecto_id },
      select: { fecha_entrega: true, titulo_prospecto: true },
    });
    console.log(`    prospecto: ${p?.titulo_prospecto} fecha_entrega=${p?.fecha_entrega}`);
  }
  for (const b of blocks) {
    console.log(`    blk=${b.id} ${b.fecha.toISOString().slice(0,10)} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} (${b.duracion_minutos}min) tipo=${b.tipo}`);
  }
}

await prisma.$disconnect();