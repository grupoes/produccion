// Test E2E: PHASE B expansion restaurada en #computeOverflow.
//
// Cuando se programa una reunión que parte un bloque de Act 1, la cascada
// debe reorganizar/expandir bloques de OTRAS actividades (Act 2, Act 3)
// para hacer espacio. Sin romper el control de feriados.

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
  const { est = 60, horaInicio = null, fechaInicio = null } = opts;
  const act = await prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID,
      estado: true,
      estado_progreso: "pendiente",
      prioridad: "MEDIA",
      tiempo_estimado_minutos: est,
      fecha_inicio: fechaInicio ? new Date(fechaInicio) : new Date(),
      hora_inicio: horaInicio
        ? new Date(Date.UTC(1970, 0, 1, parseInt(horaInicio.split(":")[0]), parseInt(horaInicio.split(":")[1])))
        : new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  createdActividades.push(act.id);
  return act.id;
}

function assert(cond, label) {
  if (cond) {
    console.log(`  OK ${label}`);
    return true;
  }
  console.log(`  FAIL ${label}`);
  return false;
}

// Escenario: PHASE B debe expandir el bloque de Act 2 cuando el día
// está saturado y no hay huecos libres. Reunión parte Act 1 a 08-13 →
// 08-12 (60 min perdidos). Act 2 tiene bloque 23/06 15-19 (jornada
// completa) que NO puede expandirse por más espacio dentro del día. Sin
// embargo, PHASE B debería al menos intentar reorganizar.
async function runPHASEB() {
  console.log("\n=== PHASE B: cascade intenta reorganizar Act 2 ===");
  await cleanup();
  await ensureJornada();

  // Act 1: bloque 23/06 08-13 (5h) que colisiona con la reunión.
  const aId = await makeActividad({ est: 300 });
  await prisma.horario_usuario.create({
    data: {
      actividad_id: aId,
      usuario_id: TEST_USER_ID,
      fecha: toDate("2026-06-23"),
      hora_inicio: toTime(8),
      hora_fin: toTime(13),
      estado: true,
      tipo: "actividad",
      duracion_minutos: 300,
    },
  });

  // Act 2: bloque 23/06 15-19 (4h, jornada completa). No hay espacio para
  // expandir, así que PHASE B debería rechazarlo por deadline/jornada.
  const bId = await makeActividad({ est: 240 });
  await prisma.horario_usuario.create({
    data: {
      actividad_id: bId,
      usuario_id: TEST_USER_ID,
      fecha: toDate("2026-06-23"),
      hora_inicio: toTime(15),
      hora_fin: toTime(19),
      estado: true,
      tipo: "actividad",
      duracion_minutos: 240,
    },
  });

  // Filler 23/06 13-15 para que el día quede saturado en la franja
  // entre la mañana y la tarde.
  const fillerId = await makeActividad({ est: 120 });
  await prisma.horario_usuario.create({
    data: {
      actividad_id: fillerId,
      usuario_id: TEST_USER_ID,
      fecha: toDate("2026-06-23"),
      hora_inicio: toTime(13),
      hora_fin: toTime(15),
      estado: true,
      tipo: "actividad",
      duracion_minutos: 120,
    },
  });

  const meetingId = await makeActividad({ est: 60, horaInicio: "12:00", fechaInicio: "2026-06-23" });

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-23",
    60,
    { horaInicio: 12 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );

  let ok = true;
  ok = assert(plan.fits === true, "placeActivity encontró slot") && ok;
  ok = assert(
    Array.isArray(plan.splits) && plan.splits.length > 0,
    "se generaron splits (Act 1 se parte por la reunión)",
  ) && ok;
  // En este escenario el cascade debería intentar absorber los 60 min
  // perdidos, ya sea vía overflow (FALLBACK) o vía reorganización. Lo
  // crítico: el calendario NO debe quedar con bloques en 29/06 (feriado).
  return ok;
}

// Escenario: cascade NUNCA programa en feriado (29/06 San Pedro y San Pablo).
async function runFeriado() {
  console.log("\n=== Feriado: cascade salta 29/06 ===");
  await cleanup();
  await ensureJornada();

  // Act 1: 23/06 08-13 (5h).
  const aId = await makeActividad({ est: 300 });
  await prisma.horario_usuario.create({
    data: {
      actividad_id: aId,
      usuario_id: TEST_USER_ID,
      fecha: toDate("2026-06-23"),
      hora_inicio: toTime(8),
      hora_fin: toTime(13),
      estado: true,
      tipo: "actividad",
      duracion_minutos: 300,
    },
  });

  const meetingId = await makeActividad({ est: 60, horaInicio: "12:00", fechaInicio: "2026-06-23" });

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-23",
    60,
    { horaInicio: 12 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );

  // Verificar que ningún bloque (overflow, cascadeMoves, moves) cae en 29/06.
  const todasFechas = new Set();
  for (const s of plan.splits || []) {
    for (const ov of s.overflow || []) todasFechas.add(ov.fecha);
    for (const cm of s.cascadeMoves || []) todasFechas.add(cm.fecha);
  }
  for (const m of plan.moves || []) if (m.fecha) todasFechas.add(m.fecha);

  let ok = true;
  ok = assert(plan.fits === true, "placeActivity encontró slot") && ok;
  ok = assert(
    !todasFechas.has("2026-06-29"),
    "NO se programó en 2026-06-29 (feriado San Pedro y San Pablo)",
  ) && ok;
  return ok;
}

async function main() {
  let allOk = true;
  try {
    allOk = (await runPHASEB()) && allOk;
    allOk = (await runFeriado()) && allOk;
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