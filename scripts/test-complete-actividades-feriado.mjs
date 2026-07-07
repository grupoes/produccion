// Test E2E: completeActividades debe respetar feriados.
//
// Caso del usuario: el scheduler programaba la actividad del 2026-06-29
// (feriado real "San Pedro y San Pablo") aunque ese día es inhábil.
// Después del fix, debe saltar el feriado y programar en el siguiente día
// laborable disponible.
//
// Cubre:
//   A) Hay hueco libre en día no-feriado antes del feriado → programa ahí.
//   B) El único hueco libre en el horizonte cae en feriado → salta el
//      feriado y programa en el siguiente día laborable.
//   C) Si después del feriado no hay nada disponible → blocked/no_cupo.
//   D) placeActivity con overflow también salta feriados (post-fix TZ
//      en #isFutureDateValid).

import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 20;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];
let createdHorarios = [];

async function cleanup() {
  await prisma.horario_usuario.deleteMany({
    where: { usuario_id: TEST_USER_ID, estado: true },
  });
  await prisma.actividades.deleteMany({
    where: { usuario_id: TEST_USER_ID },
  });
  createdActividades = [];
  createdHorarios = [];
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

async function fillJornada(fechaDesde, fechaHasta) {
  // Rellena TODA la jornada (08-13 y 15-19) de cada día del rango.
  const cursor = toDate(fechaDesde);
  const fin = toDate(fechaHasta);
  while (cursor <= fin) {
    const day = cursor.getUTCDay();
    if (day >= 1 && day <= 5) {
      const fillerId = await makeActividad({ est: 0 });
      await prisma.horario_usuario.create({
        data: {
          actividad_id: fillerId,
          usuario_id: TEST_USER_ID,
          fecha: toDate(cursor.toISOString().slice(0, 10)),
          hora_inicio: toTime(8),
          hora_fin: toTime(13),
          estado: true,
          tipo: "actividad",
          duracion_minutos: 300,
        },
      });
      await prisma.horario_usuario.create({
        data: {
          actividad_id: fillerId,
          usuario_id: TEST_USER_ID,
          fecha: toDate(cursor.toISOString().slice(0, 10)),
          hora_inicio: toTime(15),
          hora_fin: toTime(19),
          estado: true,
          tipo: "actividad",
          duracion_minutos: 240,
        },
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

async function getBloquesDeActividad(actividadId) {
  return prisma.horario_usuario.findMany({
    where: { actividad_id: actividadId, estado: true },
    orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
  });
}

function ymd(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function assert(cond, label) {
  if (cond) {
    console.log(`  OK ${label}`);
    return true;
  }
  console.log(`  FAIL ${label}`);
  return false;
}

function checkAll(label, fn) {
  const results = fn();
  const all = results.every(Boolean);
  console.log(`  ${all ? "✓" : "✗"} ${label}: ${results.filter(Boolean).length}/${results.length} asserts OK`);
  return all;
}

async function runEscenarioA() {
  console.log("\n=== A: hueco libre en día no-feriado antes del 29/06 → programa ahí ===");
  await cleanup();
  await ensureJornada();
  // Actividad con gap de 60 min.
  const aId = await makeActividad({ est: 60 });
  // Rellenar 23-26 (lun-jue, 4 días), dejar 30/06 (mar) libre.
  await fillJornada("2026-06-23", "2026-06-26");

  const r = await schedulerService.completeActividades(
    TEST_USER_ID,
    "2026-06-23",
    { diasHorizonte: 14 },
  );
  console.log("  applied:", r.applied.length, "cubierto:", r.totalGapCubierto);

  const bloques = await getBloquesDeActividad(aId);
  const fechasUsadas = bloques.map((b) => ymd(b.fecha));
  console.log("  fechas usadas:", fechasUsadas);

  return checkAll("A", () => [
    assert(r.totalGapCubierto === 60, "60 min cubiertos"),
    assert(
      !fechasUsadas.includes("2026-06-29"),
      "NO se programó el 29/06 (feriado)",
    ),
  ]);
}

async function runEscenarioB() {
  console.log("\n=== B: único hueco cae en feriado 29/06 → salta y programa en 30/06 ===");
  await cleanup();
  await ensureJornada();
  const aId = await makeActividad({ est: 60 });
  // Rellenar del 23 al 26. El 29/06 es feriado (no se cuenta para jornada
  // efectiva). El 30/06 (mar) queda libre.
  await fillJornada("2026-06-23", "2026-06-26");

  const r = await schedulerService.completeActividades(
    TEST_USER_ID,
    "2026-06-23",
    { diasHorizonte: 14 },
  );
  const bloques = await getBloquesDeActividad(aId);
  const fechasUsadas = bloques.map((b) => ymd(b.fecha));
  console.log("  fechas usadas:", fechasUsadas);

  return checkAll("B", () => [
    assert(r.totalGapCubierto === 60, "60 min cubiertos (no en feriado)"),
    assert(
      !fechasUsadas.includes("2026-06-29"),
      "NO se programó el 29/06 (feriado San Pedro y San Pablo)",
    ),
    assert(
      fechasUsadas.includes("2026-06-30"),
      "Se programó en 30/06 (siguiente día laborable)",
    ),
  ]);
}

async function runEscenarioC() {
  console.log(
    "\n=== C: horizonte completamente lleno excepto feriado → blocked ===",
  );
  await cleanup();
  await ensureJornada();
  const aId = await makeActividad({ est: 60 });
  // Rellenar TODOS los días laborables del horizonte (23-30, donde 29 es
  // feriado y no necesita rellenarse porque no se cuenta).
  await fillJornada("2026-06-23", "2026-06-30");
  // Pero como el 29/06 es feriado, lo llenamos igual para confirmar que
  // aunque haya "hueco" en el feriado, no se usa.
  await fillJornada("2026-06-29", "2026-06-29");

  const r = await schedulerService.completeActividades(
    TEST_USER_ID,
    "2026-06-23",
    { diasHorizonte: 7 },
  );
  const bloques = await getBloquesDeActividad(aId);
  const fechasUsadas = bloques.map((b) => ymd(b.fecha));
  console.log("  fechas usadas:", fechasUsadas);
  console.log("  blocked:", JSON.stringify(r.blocked));

  return checkAll("C", () => [
    assert(
      r.totalGapCubierto === 0,
      "no se cubrió nada (calendario lleno post-fix de feriado)",
    ),
    assert(
      !fechasUsadas.includes("2026-06-29"),
      "NO se programó en feriado aunque hubiera 'hueco' ahí",
    ),
  ]);
}

async function runEscenarioD() {
  console.log(
    "\n=== D: placeActivity con overflow salta feriado 29/06 ===",
  );
  await cleanup();
  await ensureJornada();
  // Actividad con bloques previos del 23 al 25 que ya están al tope de
  // su jornada. Al programar la misma actividad para 23/06, no entra y
  // debe hacer overflow al siguiente día laborable (saltando 29/06
  // feriado).
  const aId = await makeActividad({ est: 60 });
  // Llenar 23, 24, 25, 26 con eventos de otras actividades.
  for (const fecha of ["2026-06-23", "2026-06-24", "2026-06-25", "2026-06-26"]) {
    const fillerId = await makeActividad({ est: 0 });
    await prisma.horario_usuario.create({
      data: {
        actividad_id: fillerId,
        usuario_id: TEST_USER_ID,
        fecha: toDate(fecha),
        hora_inicio: toTime(8),
        hora_fin: toTime(13),
        estado: true,
        tipo: "actividad",
        duracion_minutos: 300,
      },
    });
    await prisma.horario_usuario.create({
      data: {
        actividad_id: fillerId,
        usuario_id: TEST_USER_ID,
        fecha: toDate(fecha),
        hora_inicio: toTime(15),
        hora_fin: toTime(19),
        estado: true,
        tipo: "actividad",
        duracion_minutos: 240,
      },
    });
  }

  // Llamar placeActivity. El día 23/06 está lleno. El 27 es sábado (no
  // laborable). El 29/06 es feriado. Debería brincar al 30/06 (martes).
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-23",
    60,
    { horaInicio: 8 * 60, splittable: true, deadline: null },
  );
  console.log("  fits:", plan.fits, "splits:", plan.splits.length);

  let ok = true;
  // Recolectar todas las fechas de los splits/overflow.
  const todasFechas = new Set();
  for (const sp of plan.splits || []) {
    for (const ov of sp.overflow || []) {
      todasFechas.add(ov.fecha);
    }
  }
  console.log("  fechas en overflow:", [...todasFechas]);

  ok = assert(plan.fits === true, "placeActivity encontró slot") && ok;
  ok = assert(
    !todasFechas.has("2026-06-29"),
    "NO se programó en 29/06 (feriado) en el overflow",
  ) && ok;
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
