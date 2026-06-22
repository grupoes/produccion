import prisma from "../src/config/db.js";

const rows = await prisma.horario_jornada_detalle.findMany({
  where: { usuario_id: 20, estado: true },
  orderBy: [{ dia_semana: "asc" }, { hora_inicio: "asc" }],
});
console.log("[debug] horario_jornada_detalle user 20:");
console.log(JSON.stringify(rows, null, 2));

// Also check what timezone Postgres thinks it's in
const tz = await prisma.$queryRawUnsafe("SHOW TIME ZONE");
console.log("[debug] pg timezone:", tz);
const now = await prisma.$queryRawUnsafe("SELECT NOW() AT TIME ZONE 'UTC' AS now_utc, NOW() AS now_local, CURRENT_TIMESTAMP AS now_ts");
console.log("[debug] pg now:", now);

await prisma.$disconnect();
