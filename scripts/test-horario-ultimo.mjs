// Test E2E de `getUltimoHorarioUsuario` (calendario-asistente.service.js).
//
// Cubre los casos del ajuste por jornada:
//   A) Última actividad termina a las 13:00 dentro de jornada 08-13 + 15-19
//      → debe sugerir 15:00 (inicio del bloque de tarde).
//   B) Última actividad termina a las 11:00 (aún dentro del bloque de
//      mañana) → debe sugerir 11:00 (la nueva arranca justo después).
//   C) Última actividad termina a las 18:30 (dentro del bloque de
//      tarde, sin más bloques después) → debe sugerir 18:30.
//   D) Sin jornada configurada para ese día → devuelve hora_fin literal.
//   E) Sin bloques para el usuario → exists:false.

import prisma from "../src/config/db.js";
import calendarioAsistenteService from "../src/services/calendario-asistente.service.js";

const TEST_USER_ID = 20;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];
let createdHorarios = [];
let createdProspectos = [];
let createdJornadaIds = [];

async function cleanup() {
  await prisma.horario_usuario.deleteMany({
    where: { usuario_id: TEST_USER_ID, estado: true },
  });
  await prisma.actividades.deleteMany({
    where: { usuario_id: TEST_USER_ID },
  });
  if (createdProspectos.length) {
    await prisma.prospectos.deleteMany({
      where: { id: { in: createdProspectos } },
    });
  }
  // IMPORTANTE: borrar TODAS las jornadas del TEST_USER_ID, no sólo las
  // que este test creó. Otros tests (complete-actividades, cascade)
  // también crean jornadas para el mismo uid 20 y ensucian este.
  await prisma.horario_jornada_detalle.deleteMany({
    where: { usuario_id: TEST_USER_ID },
  });
  createdActividades = [];
  createdHorarios = [];
  createdProspectos = [];
  createdJornadaIds = [];
}

async function setJornada(diaSemana, bloques) {
  for (const [iniH, iniM, finH, finM] of bloques) {
    const r = await prisma.horario_jornada_detalle.create({
      data: {
        usuario_id: TEST_USER_ID,
        dia_semana: diaSemana,
        hora_inicio: toTime(iniH, iniM || 0),
        hora_fin: toTime(finH, finM || 0),
        estado: true,
      },
    });
    createdJornadaIds.push(r.id);
  }
}

async function makeActividad() {
  const act = await prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID,
      estado: true,
      estado_progreso: "pendiente",
      prioridad: "MEDIA",
      tiempo_estimado_minutos: 60,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  createdActividades.push(act.id);
  return act.id;
}

async function makeBloque(actividadId, fecha, hi, hf, opts = {}) {
  const hiM = opts.hiM || 0;
  const hfM = opts.hfM || 0;
  const b = await prisma.horario_usuario.create({
    data: {
      actividad_id: actividadId,
      usuario_id: TEST_USER_ID,
      fecha: toDate(fecha),
      hora_inicio: toTime(hi, hiM),
      hora_fin: toTime(hf, hfM),
      estado: true,
      tipo: "actividad",
      duracion_minutos: (hf - hi) * 60 + (hfM - hiM),
    },
  });
  createdHorarios.push(b.id);
  return b.id;
}

function assertEq(actual, expected, label) {
  if (actual === expected) {
    console.log(`  OK ${label}: ${actual}`);
    return true;
  }
  console.log(`  FAIL ${label}: esperado ${expected}, obtuve ${actual}`);
  return false;
}

async function runEscenarioA() {
  console.log("\n=== Escenario A: 13:00 → sugiere 15:00 ===");
  await cleanup();
  // Jornada lunes (1): 08-13 y 15-19.
  await setJornada(1, [[8, 0, 13, 0], [15, 0, 19, 0]]);
  // Última actividad: lunes 2026-06-22 de 12:00 a 13:00.
  const aId = await makeActividad();
  await makeBloque(aId, "2026-06-22", 12, 13);

  const r = await calendarioAsistenteService.getUltimoHorarioUsuario(
    TEST_USER_ID,
  );
  console.log("  →", JSON.stringify(r));

  let ok = true;
  ok = assertEq(r.exists, true, "exists") && ok;
  ok = assertEq(r.fecha, "2026-06-22", "fecha") && ok;
  ok = assertEq(r.hora_fin, "15:00", "hora_fin sugiere 15:00 (siguiente bloque de jornada)") && ok;
  return ok;
}

async function runEscenarioB() {
  console.log("\n=== Escenario B: 11:00 (dentro de bloque) → 11:00 ===");
  await cleanup();
  await setJornada(1, [[8, 0, 13, 0], [15, 0, 19, 0]]);
  // Última actividad: lunes 10:00-11:00 (aún dentro del bloque de mañana).
  const aId = await makeActividad();
  await makeBloque(aId, "2026-06-22", 10, 11);

  const r = await calendarioAsistenteService.getUltimoHorarioUsuario(
    TEST_USER_ID,
  );
  console.log("  →", JSON.stringify(r));

  let ok = true;
  ok = assertEq(r.hora_fin, "11:00", "hora_fin se mantiene en 11:00") && ok;
  return ok;
}

async function runEscenarioC() {
  console.log("\n=== Escenario C: 18:30 (último bloque del día) → 18:30 ===");
  await cleanup();
  await setJornada(1, [[8, 0, 13, 0], [15, 0, 19, 0]]);
  // Última actividad: lunes 17:00-18:30 (dentro del bloque de tarde).
  const aId = await makeActividad();
  await makeBloque(aId, "2026-06-22", 17, 18, { hiM: 30, hfM: 30 });

  const r = await calendarioAsistenteService.getUltimoHorarioUsuario(
    TEST_USER_ID,
  );
  console.log("  →", JSON.stringify(r));

  let ok = true;
  ok = assertEq(r.hora_fin, "18:30", "hora_fin se mantiene en 18:30") && ok;
  return ok;
}

async function runEscenarioD() {
  console.log("\n=== Escenario D: sin jornada → hora_fin literal ===");
  await cleanup();
  // NO configuramos jornada.
  const aId = await makeActividad();
  await makeBloque(aId, "2026-06-22", 12, 13);

  const r = await calendarioAsistenteService.getUltimoHorarioUsuario(
    TEST_USER_ID,
  );
  console.log("  →", JSON.stringify(r));

  let ok = true;
  ok = assertEq(r.hora_fin, "13:00", "hora_fin literal sin jornada") && ok;
  return ok;
}

async function runEscenarioE() {
  console.log("\n=== Escenario E: usuario sin bloques → exists:false ===");
  await cleanup();
  // NO creamos actividad ni horario.

  const r = await calendarioAsistenteService.getUltimoHorarioUsuario(
    TEST_USER_ID,
  );
  console.log("  →", JSON.stringify(r));

  let ok = true;
  ok = assertEq(r.exists, false, "exists=false") && ok;
  ok = assertEq(r.fecha, null, "fecha=null") && ok;
  ok = assertEq(r.hora_fin, null, "hora_fin=null") && ok;
  return ok;
}

async function runEscenarioF() {
  console.log("\n=== Escenario F: turno único 09-18 → 17:00 se queda en 17:00 ===");
  await cleanup();
  // Turno único (sin mañana/tarde partido).
  await setJornada(1, [[9, 0, 18, 0]]);
  const aId = await makeActividad();
  await makeBloque(aId, "2026-06-22", 16, 17);

  const r = await calendarioAsistenteService.getUltimoHorarioUsuario(
    TEST_USER_ID,
  );
  console.log("  →", JSON.stringify(r));

  let ok = true;
  ok = assertEq(r.hora_fin, "17:00", "17:00 → 17:00 (no hay siguiente bloque)") && ok;
  return ok;
}

async function main() {
  let allOk = true;
  try {
    allOk = (await runEscenarioA()) && allOk;
    allOk = (await runEscenarioB()) && allOk;
    allOk = (await runEscenarioC()) && allOk;
    allOk = (await runEscenarioD()) && allOk;
    allOk = (await runEscenarioE()) && allOk;
    allOk = (await runEscenarioF()) && allOk;
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
