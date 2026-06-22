import prisma from "../src/config/db.js";
const u = await prisma.usuarios.findFirst({ select: { usuario: true, clave: true } });
console.log(u);
await prisma.$disconnect();
