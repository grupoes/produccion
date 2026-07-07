// Aplica chainCascades al estado actual del usuario 24 (que tiene gap=60).

import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 24;
const meetingId = 4;

async function showState(label) {
  const acts = await prisma.actividades.findMany({
    where: { usuario_id: TEST_USER_ID, estado: true },
    orderBy: { id: "asc" },
  });
  console.log(`\n--- ${label} ---`);
  for (const a of acts) {
    const blocks = await prisma.horario_usuario.findMany({
      where: { actividad_id: a.id, estado: true },
      orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
    });
    const totalProg = blocks.reduce((acc, b) => acc + b.duracion_minutos, 0);
    const gap = a.tiempo_estimado_minutos - totalProg;
    console.log(`  act=${a.id} est=${a.tiempo_estimado_minutos} prog=${totalProg} gap=${gap}`);
    for (const b of blocks) {
      const hi = `${String(b.hora_inicio.getUTCHours()).padStart(2,"0")}:${String(b.hora_inicio.getUTCMinutes()).padStart(2,"0")}`;
      const hf = `${String(b.hora_fin.getUTCHours()).padStart(2,"0")}:${String(b.hora_fin.getUTCMinutes()).padStart(2,"0")}`;
      console.log(`    ${b.fecha.toISOString().slice(0,10)} ${hi}-${hf} (${b.duracion_minutos}min, tipo=${b.tipo})`);
    }
  }
}

async function run() {
  await showState("ACTUAL (con gap)");

  // Recrear los chainCascades programando la reunión de nuevo (simulando lo
  // que debió haber pasado al programar).
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID, "2026-06-23", 60,
    { horaInicio: 17 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );
  console.log("\n=== plan.chainCascades generados AHORA ===");
  console.log(JSON.stringify(plan.chainCascades, null, 2));

  // Aplicar los chainCascades
  if (plan.chainCascades && plan.chainCascades.length > 0) {
    const res = await schedulerService.applyChainCascades(
      plan.chainCascades,
      "Test chain cascade fill",
    );
    console.log("applyChainCascades result:", res);
  }

  await showState("DESPUÉS de applyChainCascades");
}

try {
  await run();
} catch (e) {
  console.error("ERROR:", e.message, e.stack);
} finally {
  await prisma.$disconnect();
}
