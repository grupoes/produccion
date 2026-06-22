import prisma from "../src/config/db.js";
const users = await prisma.usuarios.findMany({
  where: { rol_id: 11, estado: true },
  select: { id: true, usuario: true, clave: true },
});
console.log(JSON.stringify(users, null, 2));
await prisma.$disconnect();
