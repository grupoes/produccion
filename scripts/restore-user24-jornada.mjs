// Restaura la jornada del usuario 24 que mis scripts de prueba borraron.
import "dotenv/config";
import prisma from "../src/config/db.js";

const TEST_USER_ID = 24;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));

async function main() {
  // Limpieza previa por si hay basura
  await prisma.horario_jornada_detalle.deleteMany({ where: { usuario_id: TEST_USER_ID } });

  // L-V con dos bloques (mañana 8-13 + tarde 15-19), patrón estándar
  for (const d of [1, 2, 3, 4, 5]) {
    await prisma.horario_jornada_detalle.create({
      data: { usuario_id: TEST_USER_ID, dia_semana: d, hora_inicio: toTime(8), hora_fin: toTime(13), estado: true },
    });
    await prisma.horario_jornada_detalle.create({
      data: { usuario_id: TEST_USER_ID, dia_semana: d, hora_inicio: toTime(15), hora_fin: toTime(19), estado: true },
    });
  }

  const rows = await prisma.horario_jornada_detalle.findMany({
    where: { usuario_id: TEST_USER_ID },
    orderBy: [{ dia_semana: "asc" }, { hora_inicio: "asc" }],
  });
  console.log(`✓ Restauradas ${rows.length} filas de jornada para usuario ${TEST_USER_ID}:`);
  for (const r of rows) {
    console.log(`  dia=${r.dia_semana} ${r.hora_inicio.toISOString().slice(11,19)}-${r.hora_fin.toISOString().slice(11,19)}`);
  }
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
