import "dotenv/config";
import prisma from "../src/config/db.js";

const acts = await prisma.actividades.findMany({
  where: { estado: true },
  include: {
    personas: { select: { nombre: true, apellido: true, email: true } },
    tarea: { select: { nombre: true } },
    horario_usuario: {
      where: { estado: true },
      select: { fecha: true, hora_inicio: true, hora_fin: true, duracion_minutos: true },
    },
  },
  orderBy: { id: "asc" },
});

console.log(`Total actividades activas: ${acts.length}`);
const byUser = new Map();
for (const a of acts) {
  const uid = a.usuario_id;
  if (!byUser.has(uid)) byUser.set(uid, []);
  byUser.get(uid).push(a);
}

for (const [uid, list] of byUser) {
  const u = list[0].personas;
  console.log(`\n=== Usuario ${uid}: ${u?.nombre} ${u?.apellido} (${u?.email}) ===`);
  for (const a of list) {
    const totalProg = a.horario_usuario.reduce((acc, b) => acc + (b.duracion_minutos || 0), 0);
    const gap = (a.tiempo_estimado_minutos || 0) - totalProg;
    console.log(`  act=${a.id} [${a.tarea?.nombre || "?"}] est=${a.tiempo_estimado_minutos} prog=${totalProg} gap=${gap}`);
    for (const b of a.horario_usuario) {
      const hi = `${String(b.hora_inicio.getUTCHours()).padStart(2,"0")}:${String(b.hora_inicio.getUTCMinutes()).padStart(2,"0")}`;
      const hf = `${String(b.hora_fin.getUTCHours()).padStart(2,"0")}:${String(b.hora_fin.getUTCMinutes()).padStart(2,"0")}`;
      console.log(`    ${b.fecha.toISOString().slice(0,10)} ${hi}-${hf} (${b.duracion_minutos}min)`);
    }
  }
}

await prisma.$disconnect();
