import prisma from "../src/config/db.js";

console.log("=== prospectos (id=3) ===");
const p = await prisma.prospectos.findUnique({
  where: { id: 3 },
  select: {
    id: true,
    titulo_prospecto: true,
    estado_cliente: true,
    prospecto_persona: {
      select: {
        id: true,
        persona_id: true,
        prospecto_id: true,
        personas: {
          select: {
            id: true,
            nombres: true,
            apellidos: true,
            celular: true,
          },
        },
      },
    },
  },
});
console.log(JSON.stringify(p, null, 2));

console.log("\n=== prospecto_persona para prospecto_id=3 (raw count) ===");
const raw = await prisma.$queryRawUnsafe(
  `SELECT pp.id, pp.persona_id, pp.prospecto_id, pe.nombres, pe.apellidos, pe.celular
     FROM prospecto_persona pp
     LEFT JOIN personas pe ON pe.id = pp.persona_id
    WHERE pp.prospecto_id = $1`,
  3,
);
console.log(JSON.stringify(raw, null, 2));

console.log("\n=== actividades del prospecto 3 ===");
const acts = await prisma.actividades.findMany({
  where: { prospecto_id: 3, estado: true },
  select: { id: true, prospecto_id: true, usuario_id: true },
});
console.log(JSON.stringify(acts, null, 2));

await prisma.$disconnect();
