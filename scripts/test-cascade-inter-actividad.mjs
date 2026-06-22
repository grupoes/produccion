// Test E2E del cascade inter-actividad.
//
// Cubre los 4 escenarios del plan:
//   A) Absorción en hueco libre sin tocar otras actividades.
//   B) Cascade empuja a OTRA actividad que cabe en su bloque de jornada.
//   C) Actividad destino ALTA no se mueve.
//   D) Actividad destino fuera de deadline se reporta en blockedMoves.

import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 20;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];
let createdHorarios = [];

async function cleanup() {
  await prisma.horario_usuario.deleteMany({ where: { usuario_id: TEST_USER_ID, estado: true } });
  await prisma.actividades.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  createdActividades = [];
  createdHorarios = [];
}

async function makeActividad(opts = {}) {
  const {
    bloqueada = false,
    prioridad = "MEDIA",
    prospecto = null,
  } = opts;
  const act = await prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID,
      estado: true,
      estado_progreso: "pendiente",
      prioridad,
      bloqueada,
      prospecto_id: prospecto,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  createdActividades.push(act.id);
  return act.id;
}

async function makeBloque(actividadId, fecha, hi, hf, opts = {}) {
  const b = await prisma.horario_usuario.create({
    data: {
      actividad_id: actividadId,
      usuario_id: TEST_USER_ID,
      fecha: toDate(fecha),
      hora_inicio: toTime(hi, opts.hiM || 0),
      hora_fin: toTime(hf, opts.hfM != null ? opts.hfM : 0),
      estado: true,
      tipo: opts.tipo || "actividad",
      categoria: "test",
      duracion_minutos: opts.duracion || (hf - hi) * 60,
    },
  });
  createdHorarios.push(b.id);
  return b.id;
}

async function makeProspecto(fechaEntrega) {
  const p = await prisma.prospectos.create({
    data: {
      estado: true,
      fecha_contacto: toDate("2026-06-01"),
      fecha_entrega: toDate(fechaEntrega),
      titulo_prospecto: "TEST_PROSPECTO_CASCADE",
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  return p.id;
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
  console.log("\n=== Escenario A: absorción en hueco libre sin tocar otras ===");
  await cleanup();
  const aId = await makeActividad();
  const bId = await makeActividad();
  await makeBloque(aId, "2026-06-22", 9, 11);
  await makeBloque(bId, "2026-06-22", 12, 14);

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-22",
    60,
    { horaInicio: 10 * 60 + 30, splittable: true, deadline: null },
  );
  console.log("  Plan.fits:", plan.fits, "splits:", plan.splits.length);
  return plan.fits === true;
}

async function runEscenarioB() {
  console.log("\n=== Escenario B: cascade reorganiza otra actividad ===");
  await cleanup();
  const aId = await makeActividad();
  const bId = await makeActividad();
  const filler1Id = await makeActividad();
  const filler2Id = await makeActividad();
  // A: 09:30-11:30 (parte a 10-11 → before=09:30-10:00, after=11:00-11:30, gap=1h).
  await makeBloque(aId, "2026-06-22", 9, 11, { hiM: 30, hfM: 30 });
  // B: 11:30-13:00 (end of jornada, no expansion room).
  await makeBloque(bId, "2026-06-22", 11, 13, { hiM: 30 });
  // Filler1: 08:00-09:00 (rellena el hueco matutino, fuerza PHASE B).
  await makeBloque(filler1Id, "2026-06-22", 8, 9);
  // Filler2: 15:00-19:00 (rellena el bloque tarde).
  await makeBloque(filler2Id, "2026-06-22", 15, 19);
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-22",
    60,
    { horaInicio: 10 * 60, splittable: true, deadline: null },
  );
  console.log(
    "  Plan.fits:",
    plan.fits,
    "splits:",
    plan.splits.length,
    "cascadeMoves:",
    plan.splits.reduce((acc, sp) => acc + (sp.cascadeMoves || []).length, 0),
  );
  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  // Debe haber un split de A y al menos un cascadeMove de OTRA actividad.
  const splitA = plan.splits.find((s) => s.actividad_id === aId);
  ok = assertEq(!!splitA, true, "split de A existe") && ok;
  const cmInter = (splitA?.cascadeMoves || []).filter(
    (m) => m.actividad_id !== aId,
  );
  ok = assertEq(cmInter.length > 0, true, "cascadeMove de OTRA actividad existe") && ok;
  if (cmInter.length > 0) {
    console.log(`  cascadeMove inter: actividad_id=${cmInter[0].actividad_id} ${cmInter[0].hi}-${cmInter[0].hf}`);
  }
  return ok;
}

async function runEscenarioC() {
  console.log("\n=== Escenario C: actividad destino ALTA no se mueve ===");
  await cleanup();
  const aId = await makeActividad();
  const bId = await makeActividad({ bloqueada: true, prioridad: "ALTA" });
  await makeBloque(aId, "2026-06-22", 9, 11, { hiM: 30, hfM: 30 });
  await makeBloque(bId, "2026-06-22", 11, 13, { hiM: 30 });
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-22",
    60,
    { horaInicio: 10 * 60, splittable: true, deadline: null },
  );
  console.log(
    "  Plan.fits:",
    plan.fits,
    "splits:",
    plan.splits.length,
    "blockedMoves:",
    (plan.blockedMoves || []).length,
  );
  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  // ALTA no debe aparecer como cascadeMove
  const splitA = plan.splits.find((s) => s.actividad_id === aId);
  const cmB = (splitA?.cascadeMoves || []).find(
    (m) => m.actividad_id === bId,
  );
  ok = assertEq(!!cmB, false, "ALTA B no se movió") && ok;
  return ok;
}

async function runEscenarioD() {
  console.log("\n=== Escenario D: actividad destino fuera de deadline ===");
  await cleanup();
  const aId = await makeActividad();
  // Crear prospecto con deadline EN EL PASADO (ayer).
  const pId = await makeProspecto("2026-06-19");
  // B es el primer bloque del día, así PHASE B lo procesa primero.
  const bId = await makeActividad({ prospecto: pId });
  // A: 09:30-11:30 (parte a 10-11 → gap=1h).
  await makeBloque(aId, "2026-06-22", 9, 11, { hiM: 30, hfM: 30 });
  // B: 08:00-09:00 (BEFORE A en orden cronológico; PHASE B lo procesa primero).
  await makeBloque(bId, "2026-06-22", 8, 9);
  // Rellenar huecos para forzar PHASE B (sino PHASE A absorbe el gap).
  const filler1Id = await makeActividad();
  const filler2Id = await makeActividad();
  // Filler1: 11:30-13:00 (rellena hueco tras A).
  await makeBloque(filler1Id, "2026-06-22", 11, 13);
  // Filler2: 15:00-19:00 (rellena bloque tarde).
  await makeBloque(filler2Id, "2026-06-22", 15, 19);
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-22",
    60,
    { horaInicio: 10 * 60, splittable: true, deadline: null },
  );
  console.log(
    "  Plan.fits:",
    plan.fits,
    "splits:",
    plan.splits.length,
    "blockedMoves:",
    (plan.blockedMoves || []).length,
  );
  console.log("  blockedMoves detail:", JSON.stringify(plan.blockedMoves));
  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  // B con deadline 2026-06-19 (en el pasado). PHASE B intenta absorber
  // el gap expandiendo B (08:00-09:00) hacia 08:00-10:00, pero el move
  // queda en 2026-06-22 > 2026-06-19 → excede deadline → bloqueado.
  const blockedDeadline = (plan.blockedMoves || []).filter(
    (b) => b.motivo === "deadline",
  );
  ok = assertEq(blockedDeadline.length > 0, true, "hay blockedMoves con motivo deadline") && ok;
  return ok;
}

async function main() {
  let allOk = true;
  try {
    allOk = (await runEscenarioA()) && allOk;
    allOk = (await runEscenarioB()) && allOk;
    allOk = (await runEscenarioC()) && allOk;
    allOk = (await runEscenarioD()) && allOk;
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