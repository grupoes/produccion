import "dotenv/config";
import prisma from "../src/config/db.js";
async function main() {
  const u = await prisma.usuarios.findUnique({
    where: { id: 24 },
    select: { id: true, estado: true, rol_id: true, personas: { select: { nombres: true, apellidos: true } } },
  });
  console.log("Usuario 24:", u);
  const j = await prisma.horario_jornada_detalle.findMany({
    where: { usuario_id: 24 },
    orderBy: [{ dia_semana: "asc" }, { hora_inicio: "asc" }],
  });
  console.log(`Jornadas registradas: ${j.length}`);
  for (const x of j) console.log(`  dia=${x.dia_semana} ${x.hora_inicio.toISOString().slice(11,19)}-${x.hora_fin.toISOString().slice(11,19)} estado=${x.estado}`);
  const acts = await prisma.actividades.findMany({ where: { usuario_id: 24, estado: true } });
  console.log(`Actividades activas: ${acts.length}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
