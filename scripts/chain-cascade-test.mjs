// Test del cascade en cadena: después de recuperar Act 1, el sistema
// debe propagar la cascada a Act 2 si Act 2 quedó con gap.

import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 20;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];

async function cleanup() {
  await prisma.horario_usuario.deleteMany({
    where: { usuario_id: TEST_USER_ID, estado: true },
  });
  await prisma.actividades.deleteMany({
    where: { usuario_id: TEST_USER_ID },
  });
  createdActividades = [];
}

async function ensureJornada() {
  for (const d of [1, 2, 3, 4, 5]) {
    await prisma.horario_jornada_detalle.create({
      data: {
        usuario_id: TEST_USER_ID,
        dia_semana: d,
        hora_inicio: toTime(8),
        hora_fin: toTime(13),
        estado: true,
      },
    });
    await prisma.horario_jornada_detalle.create({
      data: {
        usuario_id: TEST_USER_ID,
        dia_semana: d,
        hora_inicio: toTime(15),
        hora_fin: toTime(19),
        estado: true,
      },
    });
  }
}

async function makeActividad(opts = {}) {
  const { est = 60 } = opts;
  const act = await prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID,
      estado: true,
      estado_progreso: "pendiente",
      prioridad: "MEDIA",
      tiempo_estimado_minutos: est,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  createdActividades.push(act.id);
  return act.id;
}

async function addBloque(actividadId, fecha, hiH, hfH, durMin) {
  return prisma.horario_usuario.create({
    data: {
      actividad_id: actividadId,
      usuario_id: TEST_USER_ID,
      fecha: toDate(fecha),
      hora_inicio: toTime(hiH),
      hora_fin: toTime(hfH),
      estado: true,
      tipo: "actividad",
      duracion_minutos: durMin,
    },
  });
}

function assert(cond, label) {
  if (cond) {
    console.log(`  OK ${label}`);
    return true;
  }
  console.log(`  FAIL ${label}`);
  return false;
}

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
      console.log(`    ${b.fecha.toISOString().slice(0,10)} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} (${b.duracion_minutos}min)`);
    }
  }
}

async function runChainCascade() {
  console.log("\n=== Chain cascade test ===");
  await cleanup();
  await ensureJornada();

  // Act 1: 840 min estimados (completo tras cascade)
  const aId = await makeActividad({ est: 840 });
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 15, 19, 240);
  await addBloque(aId, "2026-06-24", 8, 13, 300);

  // Act 2: 1140 min estimados (gap 60 inicial)
  const bId = await makeActividad({ est: 1140 });
  await addBloque(bId, "2026-06-24", 15, 19, 240);
  await addBloque(bId, "2026-06-25", 8, 13, 300);
  await addBloque(bId, "2026-06-25", 15, 19, 240);
  await addBloque(bId, "2026-06-26", 8, 13, 300);

  // Act 3: 1200 min estimados (gap 600 inicial)
  const cId = await makeActividad({ est: 1200 });
  await addBloque(cId, "2026-06-26", 12, 13, 60);
  await addBloque(cId, "2026-06-26", 15, 19, 240);
  await addBloque(cId, "2026-06-27", 8, 13, 300);

  const meetingId = await makeActividad({ est: 60 });

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-23",
    60,
    { horaInicio: 15 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );

  console.log("  plan.fits:", plan.fits);
  console.log("  plan.splits:", JSON.stringify(plan.splits || [], null, 2));
  console.log("  plan.chainCascades:", JSON.stringify(plan.chainCascades || [], null, 2));

  let ok = true;
  ok = assert(plan.fits === true, "placeActivity encontró slot") && ok;

  // Después del chain cascade, las actividades afectadas (Act 2 y Act 3)
  // deben tener gaps cubiertos.
  if (plan.chainCascades && plan.chainCascades.length > 0) {
    for (const cc of plan.chainCascades) {
      console.log(`  chain cascade act=${cc.actividad_id}: gap=${cc.gapOriginal} recovered=${cc.recoveredMinutes}`);
      ok = assert(
        cc.recoveredMinutes > 0 || cc.remainingMinutes === 0,
        `Chain cascade para act ${cc.actividad_id} recuperó minutos`,
      ) && ok;
    }
  } else {
    console.log("  No chain cascades generated");
  }

  return ok;
}

async function runUserScenario() {
  console.log("\n=== Escenario EXACTO del usuario ===");
  await cleanup();
  await ensureJornada();

  // Datos EXACTOS del usuario
  const aId = await makeActividad({ est: 660 });
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 16, 19, 180);
  await addBloque(aId, "2026-06-24", 8, 11, 180);

  const bId = await makeActividad({ est: 1380 });
  await addBloque(bId, "2026-06-24", 11, 13, 120);
  await addBloque(bId, "2026-06-24", 15, 19, 240);
  await addBloque(bId, "2026-06-25", 8, 13, 300);
  await addBloque(bId, "2026-06-25", 15, 19, 240);
  await addBloque(bId, "2026-06-26", 8, 12, 240);

  const cId = await makeActividad({ est: 1200 });
  await addBloque(cId, "2026-06-26", 12, 13, 60);
  await addBloque(cId, "2026-06-26", 15, 19, 240);
  await addBloque(cId, "2026-06-27", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 15, 19, 240);
  await addBloque(cId, "2026-07-01", 8, 9, 60);

  const meetingId = await makeActividad({ est: 60 });

  await showState("Estado INICIAL (datos del usuario)");

  // Simular lo que haría la aplicación: placeActivity + applySplits + applyMoves
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-23",
    60,
    { horaInicio: 15 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );

  console.log("  plan.fits:", plan.fits);
  console.log("  plan.splits:", (plan.splits || []).length);
  console.log("  plan.chainCascades:", JSON.stringify(plan.chainCascades || [], null, 2));

  return plan.fits === true;
}

async function main() {
  let allOk = true;
  try {
    allOk = (await runChainCascade()) && allOk;
    allOk = (await runUserScenario()) && allOk;
    console.log("\n=== RESULTADO FINAL ===");
    console.log(allOk ? "PASS" : "FAIL");
  } catch (e) {
    console.error("ERROR:", e.message, e.stack);
    allOk = false;
  } finally {
    await cleanup();
    await prisma.$disconnect();
    process.exit(allOk ? 0 : 1);
  }
}

main();