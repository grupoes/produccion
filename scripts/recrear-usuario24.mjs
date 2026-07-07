// Recrea EXACTAMENTE el estado del usuario 24 que el usuario tenía.
// Después aplica chainCascades para llenar el gap.

import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 24;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

async function cleanup() {
  // NO borrar horario_jornada_detalle: pertenece al usuario de producción
  // y mis tests previos borraron accidentalmente la jornada del usuario 24.
  await prisma.horario_usuario.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  await prisma.actividades.deleteMany({ where: { usuario_id: TEST_USER_ID } });
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

async function addBloque(actId, fecha, hiH, hfH, durMin, tipo = "actividad") {
  return prisma.horario_usuario.create({
    data: {
      actividad_id: actId, usuario_id: TEST_USER_ID, fecha: toDate(fecha),
      hora_inicio: toTime(hiH), hora_fin: toTime(hfH), estado: true,
      tipo, duracion_minutos: durMin,
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
      const hi = `${String(b.hora_inicio.getUTCHours()).padStart(2,"0")}:${String(b.hora_inicio.getUTCMinutes()).padStart(2,"0")}`;
      const hf = `${String(b.hora_fin.getUTCHours()).padStart(2,"0")}:${String(b.hora_fin.getUTCMinutes()).padStart(2,"0")}`;
      console.log(`    ${b.fecha.toISOString().slice(0,10)} ${hi}-${hf} (${b.duracion_minutos}min, tipo=${b.tipo})`);
    }
  }
}

async function run() {
  await cleanup();
  await ensureJornada();

  // Crear el estado PRE-meeting
  const aId = (await makeActividad(660)).id;
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 15, 19, 240);
  await addBloque(aId, "2026-06-24", 8, 10, 120);

  const bId = (await makeActividad(1200)).id;
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

  await showState("PRE-MEETING");

  // Programar la reunión a las 17:00
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID, "2026-06-23", 60,
    { horaInicio: 17 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );
  console.log("\nplaceActivity fits:", plan.fits, "reason:", plan.reason);
  console.log("splits:", plan.splits?.length || 0);
  console.log("chainCascades:", plan.chainCascades?.length || 0);

  // Aplicar moves + splits + chainCascades (como debe ser producción)
  if (plan.moves?.length) await schedulerService.applyMoves(plan.moves, "Test meeting");
  if (plan.splits?.length) await schedulerService.applySplits(plan.splits, "Test meeting");
  if (plan.chainCascades?.length) {
    const ccRes = await schedulerService.applyChainCascades(plan.chainCascades, "Test meeting");
    console.log("chainCascades aplicadas:", ccRes);
  }
  await addBloque(meetingId, "2026-06-23", 17, 18, 60, "reunion");

  await showState("DESPUÉS de placeActivity + applyMoves + applySplits + applyChainCascades");

  // También llamar completeActividades por si queda algo
  const rebalance = await schedulerService.completeActividades(
    TEST_USER_ID, "2026-06-23",
    { ignorarActividadId: meetingId, diasHorizonte: 14 },
  );
  console.log("\ncompleteActividades: totalGapInicial=", rebalance.totalGapInicial, "totalGapCubierto=", rebalance.totalGapCubierto);

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
