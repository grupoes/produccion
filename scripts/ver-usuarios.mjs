import "dotenv/config";
import prisma from "../src/config/db.js";

const usuarios = await prisma.usuarios.findMany({
  where: {
    actividades: {
      some: { estado: true },
    },
  },
  select: {
    id: true,
    nombre: true,
    apellido: true,
    email: true,
    actividades: {
      where: { estado: true },
      select: {
        id: true,
        tiempo_estimado_minutos: true,
        fecha_inicio: true,
        horario_usuario: {
          where: { estado: true },
          select: { duracion_minutos: true, fecha: true, hora_inicio: true, hora_fin: true },
        },
      },
    },
  },
  orderBy: { id: "asc" },
});

console.log(`Usuarios con actividades activas: ${usuarios.length}`);
for (const u of usuarios) {
  console.log(`\n=== Usuario ${u.id}: ${u.nombre} ${u.apellido} (${u.email}) ===`);
  for (const a of u.actividades) {
    const totalProg = a.horario_usuario.reduce((acc, b) => acc + (b.duracion_minutos || 0), 0);
    const gap = (a.tiempo_estimado_minutos || 0) - totalProg;
    console.log(`  act=${a.id} est=${a.tiempo_estimado_minutos} prog=${totalProg} gap=${gap} fecha_inicio=${a.fecha_inicio?.toISOString().slice(0,10) || "?"}`);
    for (const b of a.horario_usuario) {
      const hi = `${String(b.hora_inicio.getUTCHours()).padStart(2,"0")}:${String(b.hora_inicio.getUTCMinutes()).padStart(2,"0")}`;
      const hf = `${String(b.hora_fin.getUTCHours()).padStart(2,"0")}:${String(b.hora_fin.getUTCMinutes()).padStart(2,"0")}`;
      console.log(`    ${b.fecha.toISOString().slice(0,10)} ${hi}-${hf} (${b.duracion_minutos}min)`);
    }
  }
}

await prisma.$disconnect();
