import prisma from "../src/config/db.js";

const args = process.argv.slice(2);
const uid = Number(args[0] || 20);
console.log(`[debug] usuario_id = ${uid}`);

const rows = await prisma.horario_usuario.findMany({
  where: { usuario_id: uid, estado: true },
  orderBy: [{ fecha: "desc" }, { id: "desc" }],
  take: 5,
  select: { id: true, fecha: true, hora_inicio: true, hora_fin: true, duracion_minutos: true, actividad_id: true, estado: true },
});
console.log("[debug] rows:", JSON.stringify(rows, null, 2));

const last = await prisma.horario_usuario.findFirst({
  where: { usuario_id: uid, estado: true },
  orderBy: [{ fecha: "desc" }, { id: "desc" }],
  select: { id: true, fecha: true, hora_inicio: true },
});
console.log("[debug] last row (raw):", last);
if (last && last.hora_inicio) {
  const d = last.hora_inicio;
  console.log("[debug] last.hora_inicio instanceof Date:", d instanceof Date);
  console.log("[debug] last.hora_inicio getUTCHours/getHours:", d.getUTCHours(), "/", d.getHours());
  console.log("[debug] last.hora_inicio getUTCMinutes/getMinutes:", d.getUTCMinutes(), "/", d.getMinutes());
  console.log("[debug] last.hora_inicio.toISOString():", d.toISOString());
}

await prisma.$disconnect();
