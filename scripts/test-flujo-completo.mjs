// Simula el flujo EXACTO de producción:
// 1) placeActivity para la reunión
// 2) applyMoves + applySplits
// 3) rebalanceUsuario (completeActividades)

import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 20;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

async function cleanup() {
  await prisma.horario_usuario.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  await prisma.actividades.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  await prisma.horario_jornada_detalle.deleteMany({ where: { usuario_id: TEST_USER_ID } });
}

async function ensureJornada() {
  for (const d of [1, 2, 3, 4, 5]) {
    await prisma.horario_jornada_detalle.create({
      data: { usuario_id: TEST_USER_ID, dia_semana: d, hora_inicio: toTime(8), hora_fin: toTime(13), estado: true },
    });
    await prisma.horario_jornada_detalle.create({
      data: { usuario_id: TEST_USER_ID, dia_semana: d, hora_inicio: toTime(15), hora_fin: toTime(19), estado: true },
    });
  }
}

async function makeActividad(est) {
  return prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID, estado: true, estado_progreso: "pendiente",
      prioridad: "MEDIA", tiempo_estimado_minutos: est,
      created_at: new Date(), updated_at: new Date(),
    },
  });
}

async function addBloque(actId, fecha, hiH, hfH, durMin) {
  return prisma.horario_usuario.create({
    data: {
      actividad_id: actId, usuario_id: TEST_USER_ID, fecha: toDate(fecha),
      hora_inicio: toTime(hiH), hora_fin: toTime(hfH), estado: true,
      tipo: "actividad", duracion_minutos: durMin,
    },
  });
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

async function run() {
  await cleanup();
  await ensureJornada();

  const aId = (await makeActividad(660)).id;
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 15, 19, 240);
  await addBloque(aId, "2026-06-24", 8, 10, 120);

  const bId = (await makeActividad(1380)).id;
  await addBloque(bId, "2026-06-24", 10, 13, 180);
  await addBloque(bId, "2026-06-24", 15, 19, 240);
  await addBloque(bId, "2026-06-25", 8, 13, 300);
  await addBloque(bId, "2026-06-25", 15, 19, 240);
  await addBloque(bId, "2026-06-26", 8, 12, 240);

  const cId = (await makeActividad(1200)).id;
  await addBloque(cId, "2026-06-26", 12, 13, 60);
  await addBloque(cId, "2026-06-26", 15, 19, 240);
  await addBloque(cId, "2026-06-27", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 15, 19, 240);
  await addBloque(cId, "2026-07-01", 8, 9, 60);

  const meetingId = (await makeActividad(60)).id;

  await showState("INICIAL");

  // 1) placeActivity para la reunión
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID, "2026-06-23", 60,
    { horaInicio: 17 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );
  console.log("\n=== placeActivity ===");
  console.log("  fits:", plan.fits);
  console.log("  reason:", plan.reason);
  console.log("  splits:", (plan.splits || []).length);
  console.log("  chainCascades (NO se aplican en prod):", (plan.chainCascades || []).length);

  // 2) applyMoves + applySplits (producción)
  if (plan.moves?.length) {
    await schedulerService.applyMoves(plan.moves, "Test reunión");
  }
  if (plan.splits?.length) {
    await schedulerService.applySplits(plan.splits, "Test reunión");
  }
  // Crear el slot de la reunión
  await prisma.horario_usuario.create({
    data: {
      actividad_id: meetingId, usuario_id: TEST_USER_ID, fecha: toDate("2026-06-23"),
      hora_inicio: toTime(17), hora_fin: toTime(18), estado: true,
      tipo: "reunion", duracion_minutos: 60,
    },
  });

  await showState("DESPUÉS de placeActivity + applyMoves/Splits (sin chain cascade)");

  // 3) rebalanceUsuario = completeActividades
  const rebalance = await schedulerService.completeActividades(
    TEST_USER_ID, "2026-06-23",
    { ignorarActividadId: meetingId, diasHorizonte: 14 },
  );
  console.log("\n=== completeActividades ===");
  console.log("  totalGapInicial:", rebalance.totalGapInicial);
  console.log("  totalGapCubierto:", rebalance.totalGapCubierto);
  console.log("  applied:", (rebalance.applied || []).length);
  console.log("  blocked:", (rebalance.blocked || []).length);
  console.log("  skipped:", (rebalance.skipped || []).map(s => `${s.actividad_id}:${s.motivo}`).join(", "));

  await showState("DESPUÉS de completeActividades");
}

try {
  await run();
} catch (e) {
  console.error("ERROR:", e.message, e.stack);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
