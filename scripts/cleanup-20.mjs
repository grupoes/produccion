import "dotenv/config";
import prisma from "../src/config/db.js";

const r1 = await prisma.horario_usuario.deleteMany({ where: { usuario_id: 20 } });
const r2 = await prisma.actividades.deleteMany({ where: { usuario_id: 20 } });
const r3 = await prisma.horario_jornada_detalle.deleteMany({ where: { usuario_id: 20 } });
console.log('hu:', r1.count, 'act:', r2.count, 'jornada:', r3.count);
await prisma.$disconnect();
