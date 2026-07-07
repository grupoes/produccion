import "dotenv/config";
import prisma from "../src/config/db.js";

const acts = await prisma.actividades.findMany({
  where: { usuario_id: 20, estado: true },
  include: { tarea: { select: { nombre: true, tipo_tarea: true } } },
  orderBy: { id: "asc" },
});

console.log(`Actividades del usuario 20: ${acts.length}`);
for (const a of acts) {
  const blocks = await prisma.horario_usuario.findMany({
    where: { actividad_id: a.id, estado: true },
    orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
  });
  const totalProg = blocks.reduce((acc, b) => acc + b.duracion_minutos, 0);
  const gap = a.tiempo_estimado_minutos - totalProg;
  const tipoTarea = a.tarea?.nombre || `tipo ${a.tarea?.tipo_tarea || "?"}`;
  console.log(`\n  act=${a.id} [${tipoTarea}] est=${a.tiempo_estimado_minutos} prog=${totalProg} gap=${gap}`);
  for (const b of blocks) {
    const hi = `${String(b.hora_inicio.getUTCHours()).padStart(2,"0")}:${String(b.hora_inicio.getUTCMinutes()).padStart(2,"0")}`;
    const hf = `${String(b.hora_fin.getUTCHours()).padStart(2,"0")}:${String(b.hora_fin.getUTCMinutes()).padStart(2,"0")}`;
    console.log(`    ${b.fecha.toISOString().slice(0,10)} ${hi}-${hf} (${b.duracion_minutos}min, tipo=${b.tipo})`);
  }
}

await prisma.$disconnect();
