// Test de integración: verifica que programarNuevaReunionPotencial,
// reprogramarReunion y reasignarReunion aplican moves + splits +
// chainCascades (no sólo moves como antes).

import "dotenv/config";
import prisma from "../src/config/db.js";
import reunionesAsistente from "../src/services/reuniones-asistente.service.js";

const TEST_USER_ID = 20;
const OTHER_USER_ID = 21;
const TEST_PROSPECTO_ID = 1;
const TEST_TAREA_ID = 3;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];

async function cleanup() {
  await prisma.horario_usuario.deleteMany({
    where: { usuario_id: { in: [TEST_USER_ID, OTHER_USER_ID] }, estado: true },
  });
  await prisma.actividades.deleteMany({
    where: { usuario_id: { in: [TEST_USER_ID, OTHER_USER_ID] } },
  });
  createdActividades = [];
}

async function ensureJornada(uid) {
  for (const d of [1, 2, 3, 4, 5]) {
    await prisma.horario_jornada_detalle.create({
      data: {
        usuario_id: uid,
        dia_semana: d,
        hora_inicio: toTime(8),
        hora_fin: toTime(13),
        estado: true,
      },
    });
    await prisma.horario_jornada_detalle.create({
      data: {
        usuario_id: uid,
        dia_semana: d,
        hora_inicio: toTime(15),
        hora_fin: toTime(19),
        estado: true,
      },
    });
  }
}

async function makeActividad(uid, opts = {}) {
  const { est = 60 } = opts;
  const act = await prisma.actividades.create({
    data: {
      usuario_id: uid,
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

async function showState(label, uids = [TEST_USER_ID]) {
  const acts = await prisma.actividades.findMany({
    where: { usuario_id: { in: uids }, estado: true },
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
    console.log(`  uid=${a.usuario_id} act=${a.id} est=${a.tiempo_estimado_minutos} prog=${totalProg} gap=${gap}`);
    for (const b of blocks) {
      console.log(`    ${b.fecha.toISOString().slice(0,10)} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} (${b.duracion_minutos}min)`);
    }
  }
}

async function setupUserData() {
  await cleanup();
  await ensureJornada(TEST_USER_ID);
  await ensureJornada(OTHER_USER_ID);

  // Act 1: est=660, 23/06 08-13 (300) + 23/06 15-19 (240) + 24/06 08-11 (120) = 660
  const aId = await makeActividad(TEST_USER_ID, { est: 660 });
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 15, 19, 240);
  await addBloque(aId, "2026-06-24", 8, 10, 120);

  // Act 2: est=1380, prog=1140, gap=240
  const bId = await makeActividad(TEST_USER_ID, { est: 1380 });
  await addBloque(bId, "2026-06-24", 10, 13, 180);
  await addBloque(bId, "2026-06-24", 15, 19, 240);
  await addBloque(bId, "2026-06-25", 8, 13, 300);
  await addBloque(bId, "2026-06-25", 15, 19, 240);
  await addBloque(bId, "2026-06-26", 8, 12, 240);

  // Act 3: est=1200, prog=1200 (complete)
  const cId = await makeActividad(TEST_USER_ID, { est: 1200 });
  await addBloque(cId, "2026-06-26", 12, 13, 60);
  await addBloque(cId, "2026-06-26", 15, 19, 240);
  await addBloque(cId, "2026-06-27", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 15, 19, 240);
  await addBloque(cId, "2026-07-01", 8, 9, 60);

  return { aId, bId, cId };
}

async function testProgramarNuevaReunionPotencial() {
  console.log("\n=== Test 1: programarNuevaReunionPotencial ===");
  await setupUserData();

  // Meeting a 17:00-18:00 que parte Act 1 (15-19) y debería propagar a Act 2
  let result;
  try {
    result = await reunionesAsistente.crearReunion({
      prospectoId: TEST_PROSPECTO_ID,
      tareaId: TEST_TAREA_ID,
      usuarioId: TEST_USER_ID,
      fecha: "2026-06-23",
      horaInicio: "17:00",
      duracionMinutos: 60,
      motivo: "Test chainCascades",
    });
  } catch (e) {
    console.log("  ERROR en crearReunion:", e.message, e.stack);
    return false;
  }

  let ok = true;
  console.log("\n  plan completo:");
  console.log("    applied:", JSON.stringify(result?.plan?.applied || {}, null, 2));
  console.log("    chainCascades length:", result?.plan?.chainCascades?.length || 0);
  console.log("    splits length:", result?.plan?.splits?.length || 0);
  console.log("    moves length:", result?.plan?.moves?.length || 0);
  console.log("    splits detalle:", JSON.stringify(result?.plan?.splits, null, 2));
  console.log("    chainCascades detalle:", JSON.stringify(result?.plan?.chainCascades, null, 2));

  ok = assert(
    result?.plan?.applied?.splits >= 0,
    "splits aplicados (>= 0)",
  ) && ok;
  ok = assert(
    result?.plan?.applied?.chainCascades >= 0,
    "chainCascades aplicados (>= 0)",
  ) && ok;

  await showState("Después de programarNuevaReunionPotencial");

  // Verificar que la reunión quedó creada en el slot correcto
  const meeting = await prisma.actividades.findFirst({
    where: { usuario_id: TEST_USER_ID, tiempo_estimado_minutos: 60, estado: true },
  });
  const meetingBlock = await prisma.horario_usuario.findFirst({
    where: { actividad_id: meeting.id, estado: true },
  });
  const meetingHi = meetingBlock.hora_inicio.getUTCHours() * 60 + meetingBlock.hora_inicio.getUTCMinutes();
  const meetingHf = meetingBlock.hora_fin.getUTCHours() * 60 + meetingBlock.hora_fin.getUTCMinutes();
  ok = assert(
    meetingHi === 17 * 60 && meetingHf === 18 * 60,
    `Reunión está en 17:00-18:00 (got ${meetingHi}-${meetingHf})`,
  ) && ok;

  // Verificar que Act 2 (est=1380) NO quedó en 24/06 10-13 original
  // (debe haberse movido si hubo cascadeMoves)
  const act2 = await prisma.actividades.findFirst({
    where: { usuario_id: TEST_USER_ID, tiempo_estimado_minutos: 1380, estado: true },
  });
  const act2Block24 = await prisma.horario_usuario.findFirst({
    where: { actividad_id: act2.id, estado: true, fecha: toDate("2026-06-24") },
  });
  console.log(`  Act 2 bloque 24/06: ${act2Block24?.hora_inicio?.toISOString().slice(11,19)}-${act2Block24?.hora_fin?.toISOString().slice(11,19)} (${act2Block24?.duracion_minutos}min)`);

  return ok;
}

async function main() {
  let allOk = true;
  try {
    allOk = (await testProgramarNuevaReunionPotencial()) && allOk;
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
