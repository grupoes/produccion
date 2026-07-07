import "dotenv/config";
import prisma from "../src/config/db.js";

const acts = await prisma.actividades.findMany({
  where: { estado: true },
  select: {
    id: true,
    usuario_id: true,
    tiempo_estimado_minutos: true,
    tarea_id: true,
    tarea: { select: { nombre: true } },
    horario_usuario: {
      where: { estado: true },
      select: { id: true, fecha: true, hora_inicio: true, hora_fin: true, duracion_minutos: true, tipo: true },
    },
  },
  orderBy: [{ usuario_id: "asc" }, { id: "asc" }],
});

console.log(`Total: ${acts.length} actividades activas`);
let lastUid = null;
for (const a of acts) {
  if (a.usuario_id !== lastUid) {
    lastUid = a.usuario_id;
    console.log(`\n=== Usuario ${a.usuario_id} ===`);
  }
  const totalProg = a.horario_usuario.reduce((acc, b) => acc + (b.duracion_minutos || 0), 0);
  const gap = (a.tiempo_estimado_minutos || 0) - totalProg;
  console.log(`  act=${a.id} [${a.tarea?.nombre || "?"}] est=${a.tiempo_estimado_minutos} prog=${totalProg} gap=${gap}`);
  for (const b of a.horario_usuario) {
    const hi = `${String(b.hora_inicio.getUTCHours()).padStart(2,"0")}:${String(b.hora_inicio.getUTCMinutes()).padStart(2,"0")}`;
    const hf = `${String(b.hora_fin.getUTCHours()).padStart(2,"0")}:${String(b.hora_fin.getUTCMinutes()).padStart(2,"0")}`;
    console.log(`    ${b.fecha.toISOString().slice(0,10)} ${hi}-${hf} (${b.duracion_minutos}min, tipo=${b.tipo})`);
  }
}

await prisma.$disconnect();
