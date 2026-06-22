import prisma from "../src/config/db.js";

const users = await prisma.horario_usuario.findMany({
  where: { estado: true },
  distinct: ["usuario_id"],
  select: { usuario_id: true },
});
console.log("users con horario_usuario:", users.map(u => u.usuario_id));

const u = await prisma.horario_usuario.groupBy({
  by: ["usuario_id"],
  where: { estado: true },
  _count: { id: true },
});
console.log("counts:", u);

await prisma.$disconnect();
