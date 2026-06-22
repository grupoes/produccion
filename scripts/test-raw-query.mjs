import prisma from "../src/config/db.js";

const last = await prisma.horario_usuario.findFirst({
  where: { usuario_id: 20, estado: true },
  orderBy: [{ fecha: "desc" }, { id: "desc" }],
  select: { id: true, fecha: true, hora_inicio: true, actividad_id: true },
});
console.log("[test] findFirst result:", last);

// Test raw SQL
const raw = await prisma.$queryRawUnsafe(
  `SELECT id, fecha::text, hora_inicio::text, actividad_id
     FROM horario_usuario
    WHERE usuario_id = $1 AND estado = true
    ORDER BY fecha DESC, id DESC
    LIMIT 1`,
  20
);
console.log("[test] raw query result:", raw);

await prisma.$disconnect();
