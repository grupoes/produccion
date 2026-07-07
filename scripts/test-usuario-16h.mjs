// Test con la hora EXACTA del usuario: meeting a 16:00, NO 15:00.
// En la data del usuario, Act 1 ocupa 23/06 15-19 y la reunión a
// 16-17 parte ese bloque. El chain cascade debe propagar a Act 2.

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

async function runUserScenario16h() {
  console.log("\n=== Escenario USUARIO con meeting 16:00-17:00 ===");
  await cleanup();
  await ensureJornada();

  // Act 1: est=720 (12h), pero reported as 660 por el usuario
  // Mantengo los datos exactos del usuario:
  //   23/06 08-13 (5h) + 23/06 15-19 (4h) + 24/06 08-11 (3h) = 12h
  //   est=660 → over-programmed por 60 min
  const aId = await makeActividad({ est: 660 });
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 15, 19, 240);
  await addBloque(aId, "2026-06-24", 8, 11, 180);

  // Act 2: est=1380, prog=1140, gap=240
  const bId = await makeActividad({ est: 1380 });
  await addBloque(bId, "2026-06-24", 11, 13, 120);
  await addBloque(bId, "2026-06-24", 15, 19, 240);
  await addBloque(bId, "2026-06-25", 8, 13, 300);
  await addBloque(bId, "2026-06-25", 15, 19, 240);
  await addBloque(bId, "2026-06-26", 8, 12, 240);

  // Act 3: est=1200, prog=1200 (complete)
  const cId = await makeActividad({ est: 1200 });
  await addBloque(cId, "2026-06-26", 12, 13, 60);
  await addBloque(cId, "2026-06-26", 15, 19, 240);
  await addBloque(cId, "2026-06-27", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 15, 19, 240);
  await addBloque(cId, "2026-07-01", 8, 9, 60);

  const meetingId = await makeActividad({ est: 60 });

  await showState("Estado INICIAL");

  // Meeting a las 16:00-17:00 (igual que el usuario)
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-23",
    60,
    { horaInicio: 16 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );

  console.log("  plan.fits:", plan.fits);
  console.log("  plan.splits:", plan.splits?.length || 0);
  console.log("  plan.chainCascades:", JSON.stringify(plan.chainCascades || [], null, 2));

  let ok = true;
  ok = assert(plan.fits === true, "placeActivity encontró slot") && ok;
  ok = assert(
    plan.chainCascades && plan.chainCascades.length > 0,
    "se generaron chainCascades",
  ) && ok;
  // Debe haber chain cascade para Act 2 con gap=240
  const ccAct2 = (plan.chainCascades || []).find((cc) => Number(cc.actividad_id) === Number(bId));
  ok = assert(
    ccAct2 != null,
    "hay chain cascade para Act 2",
  ) && ok;
  if (ccAct2) {
    ok = assert(
      ccAct2.recoveredMinutes >= 240,
      `Act 2 recupera >= 240 min (got ${ccAct2.recoveredMinutes})`,
    ) && ok;
  }
  return ok;
}

async function main() {
  let allOk = true;
  try {
    allOk = (await runUserScenario16h()) && allOk;
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
