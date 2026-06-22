import prisma from "../src/config/db.js";

const all = await prisma.horario_usuario.findMany({
  orderBy: [{ usuario_id: "asc" }, { fecha: "desc" }, { id: "desc" }],
  select: { id: true, usuario_id: true, fecha: true, hora_inicio: true, estado: true },
});
console.log("TODOS los horario_usuario:");
console.log(JSON.stringify(all, null, 2));

const grouped = await prisma.horario_usuario.groupBy({
  by: ["usuario_id", "estado"],
  _count: { id: true },
});
console.log("\ncounts por estado:");
console.log(JSON.stringify(grouped, null, 2));

await prisma.$disconnect();
