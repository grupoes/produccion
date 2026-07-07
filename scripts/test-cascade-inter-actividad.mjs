// Test E2E del cascade inter-actividad (post-refactor).
//
// Reglas de diseño actuales:
//   - PHASE B reorganiza bloques de OTRAS actividades SÓLO si chocan
//     entre sí (mover el bloque posterior a continuación del anterior).
//     NO expande ni "absorbe" el gap de la actividad partida.
//   - El gap de la actividad partida va al cascade propagativo
//     (#computeOverflow) que crea bloques NUEVOS en días futuros
//     respetando ALTA, deadline y horizon.
//   - ALTA nunca se mueve.
//   - Deadline se valida y, si se excede, se reporta en interBlocked.
//
// Cubre:
//   A) Absorción en hueco libre sin tocar otras actividades.
//   B) Sin choque real: gap de A va al cascade propagativo (overflow).
//   C) Actividad destino ALTA no se mueve (sigue vigente).
//   D) Si la actividad destino tiene deadline en el pasado, no se mueve
//      a un día posterior (sigue vigente, validamos el comportamiento
//      del overflow/plan).

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

async function ensureJornada() {
  for (const d of [1, 2, 3, 4, 5]) {
    const exists = await prisma.horario_jornada_detalle.findFirst({
      where: { usuario_id: TEST_USER_ID, dia_semana: d, estado: true },
    });
    if (!exists) {
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
  await ensureJornada();
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
  console.log("\n=== Escenario B: gap va al cascade propagativo ===");
  await cleanup();
  await ensureJornada();
  const aId = await makeActividad();
  const bId = await makeActividad();
  // A: 09:30-11:30 (parte a 10-11 → before=09:30-10:00, after=11:00-11:30, gap=1h).
  await makeBloque(aId, "2026-06-22", 9, 11, { hiM: 30, hfM: 30 });
  // B: 11:30-13:00 (no choca con A's after: 11:00-11:30).
  await makeBloque(bId, "2026-06-22", 11, 13, { hiM: 30 });
  // Rellenar 22/06 totalmente para forzar overflow a día siguiente.
  const filler1Id = await makeActividad();
  await makeBloque(filler1Id, "2026-06-22", 8, 9);
  await makeBloque(filler1Id, "2026-06-22", 15, 19);

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-22",
    60,
    { horaInicio: 10 * 60, splittable: true, deadline: null },
  );
  console.log("  Plan.fits:", plan.fits, "splits:", plan.splits.length);

  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  const splitA = plan.splits.find((s) => s.actividad_id === aId);
  ok = assertEq(!!splitA, true, "split de A existe") && ok;
  // Bajo el diseño actual: B no se mueve (no hay choque) y el gap de A
  // va al overflow. Verificamos que NO se haya emitido un cascadeMove
  // para B (es decir, no se reorganizó).
  const cmB = (splitA?.cascadeMoves || []).find(
    (m) => m.actividad_id === bId,
  );
  ok = assertEq(!!cmB, false, "B NO se reorganiza (no hay choque real)") && ok;
  return ok;
}

async function runEscenarioC() {
  console.log("\n=== Escenario C: ALTA en el calendario se preserva ===");
  await cleanup();
  await ensureJornada();
  const aId = await makeActividad();
  const altaId = await makeActividad({ bloqueada: true, prioridad: "ALTA" });
  await makeBloque(aId, "2026-06-22", 9, 11, { hiM: 30, hfM: 30 });
  // ALTA: 11:30-13:00 (en posición fija).
  await makeBloque(altaId, "2026-06-22", 11, 13, { hiM: 30 });
  // Filler para forzar el flujo por computeOverflow.
  const filler1Id = await makeActividad();
  await makeBloque(filler1Id, "2026-06-22", 8, 9);
  await makeBloque(filler1Id, "2026-06-22", 15, 19);

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
  );
  // Verificamos que el bloque ALTA sigue intacto en BD.
  const altaBloque = await prisma.horario_usuario.findFirst({
    where: { actividad_id: altaId, estado: true },
  });
  const altaInicio = altaBloque?.hora_inicio;
  const iniStr = altaInicio
    ? `${String(altaInicio.getUTCHours()).padStart(2, "0")}:${String(altaInicio.getUTCMinutes()).padStart(2, "0")}`
    : null;
  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  // El bloque ALTA está en 11:30 → debería seguir en 11:30.
  ok = assertEq(iniStr, "11:30", "ALTA intacta en 11:30") && ok;
  return ok;
}

async function runEscenarioD() {
  console.log("\n=== Escenario D: cascade respeta deadline del overflow ===");
  await cleanup();
  await ensureJornada();
  const aId = await makeActividad();
  // Prospecto con deadline HOY (mismo día).
  const pId = await makeProspecto("2026-06-22");
  const aDeadline = await makeActividad({ prospecto: pId });
  await makeBloque(aId, "2026-06-22", 9, 11, { hiM: 30, hfM: 30 });
  // Bloque que ocupa el hueco matutino y fuerza el overflow.
  await makeBloque(aDeadline, "2026-06-22", 8, 9);
  // Rellenar tarde.
  const filler1Id = await makeActividad();
  await makeBloque(filler1Id, "2026-06-22", 15, 19);

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
  );
  // La actividad A (sin deadline) debería partirse y el gap ir al
  // overflow. La actividad con deadline (pId) NO debería tener su bloque
  // movido después del deadline (que es HOY).
  const aDeadlineBloque = await prisma.horario_usuario.findFirst({
    where: { actividad_id: aDeadline, estado: true },
  });
  let ok = true;
  ok = assertEq(plan.fits, true, "fits") && ok;
  // El bloque de la actividad con deadline sigue en 2026-06-22 (no se
  // movió a otro día).
  const fechaStr = aDeadlineBloque?.fecha
    ? `${aDeadlineBloque.fecha.getUTCFullYear()}-${String(aDeadlineBloque.fecha.getUTCMonth() + 1).padStart(2, "0")}-${String(aDeadlineBloque.fecha.getUTCDate()).padStart(2, "0")}`
    : null;
  ok = assertEq(fechaStr, "2026-06-22", "bloque con deadline sigue en 2026-06-22") && ok;
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
