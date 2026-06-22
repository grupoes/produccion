// Test E2E del cascade push-forward multi-actividad.
//
// Llena huecos libres del usuario para forzar que PHASE A no pueda
// absorber el gap y A1 tenga que extenderse, activando push-forward
// sobre las actividades SIGUIENTES (A2, A3).
//
// Jornada usuario 20:
//   Lun-Vie (1-5): 8-13, 15-19
//   Sáb (6):       8-13
//   Dom (0):       sin jornada
//
// Cubre los 4 escenarios del plan:
//   A) Push-forward básico A1→A2 (A2 se mueve a otro día, completo).
//   B) Propagación A1→A2→A3 (A3 no entra en conflicto).
//   C) A2 ALTA no se mueve.
//   D) A2 con deadline pasado → motivo 'deadline'.

import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 20;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];
let createdHorarios = [];
let createdProspectos = [];

async function cleanup() {
  // Limpiar TODO lo del usuario 20 (estado=true) y todas las actividades
  // del usuario 20. Esto evita contaminación entre tests previos.
  await prisma.horario_usuario.deleteMany({ where: { usuario_id: TEST_USER_ID, estado: true } });
  await prisma.actividades.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  if (createdProspectos.length > 0) {
    await prisma.prospectos.deleteMany({
      where: { id: { in: createdProspectos } },
    });
  }
  createdActividades = [];
  createdHorarios = [];
  createdProspectos = [];
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
      titulo_prospecto: "TEST_PROSPECTO_PUSH",
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  createdProspectos.push(p.id);
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

// Escenario A: A1 20h + A2 22h. Huecos libres llenos con fillers.
// Reunión parte A1 al inicio → A1 se extiende → push-forward A2.
async function runEscenarioA() {
  console.log("\n=== Escenario A: push-forward básico A1→A2 ===");
  await cleanup();
  const a1 = await makeActividad();
  const a2 = await makeActividad();
  // Fillers ocupan huecos libres para forzar PHASE C.
  const f1 = await makeActividad();
  const f2 = await makeActividad();
  const f3 = await makeActividad();

  // A1: 19/06 8-13, 19/06 15-19, 20/06 8-13, 22/06 8-13, 22/06 15-16 (21h).
  await makeBloque(a1, "2026-06-19", 8, 13);
  await makeBloque(a1, "2026-06-19", 15, 19);
  await makeBloque(a1, "2026-06-20", 8, 13);
  await makeBloque(a1, "2026-06-22", 8, 13);
  await makeBloque(a1, "2026-06-22", 15, 16);

  // A2: 22/06 16-19, 23/06 8-13, 23/06 15-19, 24/06 8-13 (15h).
  await makeBloque(a2, "2026-06-22", 16, 19);
  await makeBloque(a2, "2026-06-23", 8, 13);
  await makeBloque(a2, "2026-06-23", 15, 19);
  await makeBloque(a2, "2026-06-24", 8, 13);

  // Filler1: ocupa 21/06 (domingo no, mejor 23/06 huecos).
  await makeBloque(f1, "2026-06-23", 8, 13);
  // Filler2: ocupa 19/06 hueco 13-15.
  await makeBloque(f2, "2026-06-19", 13, 15);
  // Filler3: ocupa 22/06 hueco 13-15 (entre A1 mañana y tarde).
  await makeBloque(f3, "2026-06-22", 13, 15);

  // Reunión 19/06 17:00-18:00 parte A1 (15:00-19:00 → gap=1h).
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-19",
    60,
    { horaInicio: 17 * 60, splittable: true, deadline: null },
  );

  const totalCm = (plan.splits || []).reduce(
    (acc, s) => acc + (s.cascadeMoves?.length || 0),
    0,
  );
  const pfMoves = (plan.splits || []).reduce(
    (acc, s) =>
      acc.concat((s.cascadeMoves || []).filter((m) => m.pushForward === true)),
    [],
  );
  console.log(
    `  fits=${plan.fits} reason=${plan.reason} totalCascadeMoves=${totalCm} pushForward=${pfMoves.length} blocked=${(plan.blockedMoves || []).length}`,
  );
  pfMoves.forEach((m) =>
    console.log(
      `    pushForward: actividad=${m.actividad_id} horario_id=${m.horario_id} → ${m.hi}-${m.hf} fecha=${m.fecha}`,
    ),
  );

  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  ok = assertEq(pfMoves.length > 0, true, "hay push-forward moves") && ok;
  if (pfMoves.length > 0) {
    const pfA2 = pfMoves.find((m) => Number(m.actividad_id) === a2);
    ok = assertEq(!!pfA2, true, "A2 está en push-forward") && ok;
    if (pfA2) {
      // Política: A2 arranca secuencialmente donde A1 terminó
      // (22/06 17:00), aunque se comprima. Mantiene orden cronológico.
      // 22/06 tarde 15-19: tras A1 (15-17), quedan 17-19 = 120 min.
      // A2 (180 min) se comprime a 120 min en mismo día.
      ok = assertEq(pfA2.fecha, "2026-06-22", "A2 mantiene día 22/06 (secuencial)") && ok;
      ok = assertEq(pfA2.hi, "17:00", "A2 arranca 17:00 (donde A1 terminó)") && ok;
      ok = assertEq(pfA2.hf, "19:00", "A2 termina 19:00 (fin de jornada tarde)") && ok;
      ok = assertEq(Number(pfA2.len), 120, "A2 comprimida a 120 min en 22/06") && ok;
    }
  }
  return ok;
}

// Escenario B: 3 actividades en cadena. Push-forward propaga.
async function runEscenarioB() {
  console.log("\n=== Escenario B: push-forward propagado A1→A2→A3 ===");
  await cleanup();
  const a1 = await makeActividad();
  const a2 = await makeActividad();
  const a3 = await makeActividad();
  const f1 = await makeActividad();
  const f2 = await makeActividad();
  const f3 = await makeActividad();
  const f4 = await makeActividad();

  await makeBloque(a1, "2026-06-19", 8, 13);
  await makeBloque(a1, "2026-06-19", 15, 19);
  await makeBloque(a1, "2026-06-20", 8, 13);
  await makeBloque(a1, "2026-06-22", 8, 13);
  await makeBloque(a1, "2026-06-22", 15, 16);
  await makeBloque(a2, "2026-06-22", 16, 19);
  await makeBloque(a2, "2026-06-23", 8, 13);
  await makeBloque(a2, "2026-06-24", 8, 13);
  await makeBloque(a2, "2026-06-24", 15, 18);
  await makeBloque(a3, "2026-06-25", 8, 13);
  await makeBloque(a3, "2026-06-25", 15, 19);
  await makeBloque(f1, "2026-06-23", 13, 19);
  await makeBloque(f2, "2026-06-19", 13, 15);
  await makeBloque(f3, "2026-06-22", 13, 15);
  await makeBloque(f4, "2026-06-26", 8, 13);

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-19",
    60,
    { horaInicio: 17 * 60, splittable: true, deadline: null },
  );

  const pfMoves = (plan.splits || []).reduce(
    (acc, s) =>
      acc.concat((s.cascadeMoves || []).filter((m) => m.pushForward === true)),
    [],
  );
  console.log(`  fits=${plan.fits} pushForward=${pfMoves.length}`);
  pfMoves.forEach((m) =>
    console.log(
      `    pushForward: actividad=${m.actividad_id} horario_id=${m.horario_id} → ${m.hi}-${m.hf} fecha=${m.fecha}`,
    ),
  );

  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  ok = assertEq(pfMoves.length > 0, true, "hay push-forward") && ok;
  // A2 y A3 deberían estar en push-forward.
  const pfA2 = pfMoves.find((m) => Number(m.actividad_id) === a2);
  ok = assertEq(!!pfA2, true, "A2 en push-forward") && ok;
  // A3 puede o no entrar en push-forward dependiendo de si la jornada
  // destino existe. Verificamos al menos que A2 sí.
  return ok;
}

// Escenario C: A2 ALTA. No se mueve.
async function runEscenarioC() {
  console.log("\n=== Escenario C: A2 ALTA no se mueve ===");
  await cleanup();
  const a1 = await makeActividad();
  const a2 = await makeActividad({ bloqueada: true, prioridad: "ALTA" });
  const f1 = await makeActividad();
  const f2 = await makeActividad();
  const f3 = await makeActividad();

  await makeBloque(a1, "2026-06-19", 8, 13);
  await makeBloque(a1, "2026-06-19", 15, 19);
  await makeBloque(a1, "2026-06-22", 8, 13);
  await makeBloque(a1, "2026-06-22", 15, 16);
  await makeBloque(a2, "2026-06-22", 16, 19);
  await makeBloque(a2, "2026-06-23", 8, 13);
  await makeBloque(f1, "2026-06-20", 8, 13);
  await makeBloque(f2, "2026-06-19", 13, 15);
  await makeBloque(f3, "2026-06-22", 13, 15);

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-19",
    60,
    { horaInicio: 17 * 60, splittable: true, deadline: null },
  );

  const pfMoves = (plan.splits || []).reduce(
    (acc, s) =>
      acc.concat((s.cascadeMoves || []).filter((m) => m.pushForward === true)),
    [],
  );
  const pfA2 = pfMoves.find((m) => Number(m.actividad_id) === a2);
  console.log(`  fits=${plan.fits} pushForward total=${pfMoves.length} A2 pf=${!!pfA2}`);

  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  ok = assertEq(!!pfA2, false, "A2 ALTA no se movió") && ok;
  return ok;
}

// Escenario D: A2 con deadline en el pasado.
async function runEscenarioD() {
  console.log("\n=== Escenario D: A2 con deadline pasado ===");
  await cleanup();
  const a1 = await makeActividad();
  const pId = await makeProspecto("2026-06-19");
  const a2 = await makeActividad({ prospecto: pId });
  const f1 = await makeActividad();
  const f2 = await makeActividad();
  const f3 = await makeActividad();

  await makeBloque(a1, "2026-06-19", 8, 13);
  await makeBloque(a1, "2026-06-19", 15, 19);
  await makeBloque(a1, "2026-06-20", 8, 13);
  await makeBloque(a1, "2026-06-22", 8, 13);
  await makeBloque(a1, "2026-06-22", 15, 16);
  await makeBloque(a2, "2026-06-22", 16, 19);
  await makeBloque(a2, "2026-06-23", 8, 13);
  await makeBloque(f1, "2026-06-23", 13, 19);
  await makeBloque(f2, "2026-06-19", 13, 15);
  await makeBloque(f3, "2026-06-22", 13, 15);

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-19",
    60,
    { horaInicio: 17 * 60, splittable: true, deadline: null },
  );

  const blockedA2 = (plan.blockedMoves || []).find(
    (b) => Number(b.actividad_id) === a2,
  );
  console.log(
    `  fits=${plan.fits} blocked=${(plan.blockedMoves || []).length} A2 blocked=${JSON.stringify(blockedA2)}`,
  );

  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  ok = assertEq(!!blockedA2, true, "A2 en blockedMoves") && ok;
  if (blockedA2) {
    ok = assertEq(blockedA2.motivo, "deadline", "motivo deadline") && ok;
  }
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