import prisma from "../src/config/db.js";
const users = await prisma.usuarios.findMany({ take: 5, select: { id: true, usuario: true, rol_id: true } });
console.log(users);
await prisma.$disconnect();
