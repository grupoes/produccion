// Test E2E de `completeActividades` (scheduler.service.js).
//
// Cubre:
//   A) Actividad NO-reunión con gap pre-existente → completa el gap.
//   B) Actividad ALTA → se omite, queda en blocked/skipped.
//   C) Actividad con deadline próximo → respeta fecha_entrega.
//   D) Sin huecos libres en el horizonte → reporta blocked/no_cupo.

import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";
import reunionesAsistenteService from "../src/services/reuniones-asistente.service.js";

const TEST_USER_ID = 20;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];
let createdHorarios = [];
let createdProspectos = [];

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
  createdActividades = [];
  createdHorarios = [];
  createdProspectos = [];
}

async function makeActividad(opts = {}) {
  const {
    bloqueada = false,
    prioridad = "MEDIA",
    prospecto = null,
    est = 120,
  } = opts;
  const act = await prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID,
      estado: true,
      estado_progreso: "pendiente",
      prioridad,
      bloqueada,
      prospecto_id: prospecto,
      tiempo_estimado_minutos: est,
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
      titulo_prospecto: "TEST_PROSPECTO_COMPLETE",
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  createdProspectos.push(p.id);
  return p.id;
}

async function ensureJornada() {
  // jornada Lun-Vie 08:00-13:00 y 15:00-19:00
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

async function getSumaDuracion(actividadId) {
  const rows = await prisma.horario_usuario.findMany({
    where: { actividad_id: actividadId, estado: true },
    select: { duracion_minutos: true },
  });
  return rows.reduce((acc, r) => acc + (Number(r.duracion_minutos) || 0), 0);
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
  console.log("\n=== Escenario A: completa gap pre-existente ===");
  await cleanup();
  await ensureJornada();
  const aId = await makeActividad({ est: 120 });
  // Sólo 60 min programados → gap = 60.
  await makeBloque(aId, "2026-06-22", 9, 10);

  const r = await schedulerService.completeActividades(
    TEST_USER_ID,
    "2026-06-22",
    {},
  );
  console.log(
    "  applied:",
    r.applied.length,
    "skipped:",
    r.skipped.length,
    "blocked:",
    r.blocked.length,
  );
  console.log("  totalGapInicial:", r.totalGapInicial, "cubierto:", r.totalGapCubierto);

  let ok = true;
  ok = assertEq(r.totalGapInicial, 60, "gap inicial") && ok;
  ok = assertEq(r.totalGapCubierto, 60, "gap cubierto") && ok;
  ok = assertEq(r.applied.length, 1, "1 actividad aplicada") && ok;
  const nuevaSuma = await getSumaDuracion(aId);
  ok = assertEq(nuevaSuma, 120, "suma duración final") && ok;
  return ok;
}

async function runEscenarioB() {
  console.log("\n=== Escenario B: ALTA no se completa ===");
  await cleanup();
  await ensureJornada();
  const altaId = await makeActividad({
    est: 120,
    bloqueada: true,
    prioridad: "ALTA",
  });
  await makeBloque(altaId, "2026-06-22", 9, 10); // 60 min → gap = 60

  const r = await schedulerService.completeActividades(
    TEST_USER_ID,
    "2026-06-22",
    {},
  );
  console.log(
    "  applied:",
    r.applied.length,
    "skipped:",
    r.skipped.length,
    "blocked:",
    r.blocked.length,
  );

  let ok = true;
  ok = assertEq(r.applied.length, 0, "nada aplicado a ALTA") && ok;
  ok =
    assertEq(
      (r.skipped || []).some((s) => s.motivo === "alta"),
      true,
      "ALTA registrada en skipped",
    ) && ok;
  const nuevaSuma = await getSumaDuracion(altaId);
  ok = assertEq(nuevaSuma, 60, "ALTA sigue en 60") && ok;
  return ok;
}

async function runEscenarioC() {
  console.log("\n=== Escenario C: respeta fecha_entrega ===");
  await cleanup();
  await ensureJornada();
  // Prospecto con deadline 2026-06-23 (mañana). Sólo huecos hasta esa fecha.
  const pId = await makeProspecto("2026-06-23");
  const aId = await makeActividad({ est: 480, prospecto: pId }); // 8h
  // Sólo 60 min programados → gap = 420 (7h).
  await makeBloque(aId, "2026-06-22", 9, 10);

  const r = await schedulerService.completeActividades(
    TEST_USER_ID,
    "2026-06-22",
    { diasHorizonte: 14 },
  );
  console.log(
    "  applied:",
    r.applied.length,
    "blocked:",
    r.blocked.length,
    "inicial:",
    r.totalGapInicial,
    "cubierto:",
    r.totalGapCubierto,
  );

  let ok = true;
  // El horizonte es 14 días pero el deadline es 23/06 → 22+1 día = 23/06.
  // Jornada 22/06: 08-13 (5h) y 15-19 (4h). 22/06 ya tiene 09-10 ocupado
  // → libre 08-09 (1h) + 10-13 (3h) + 15-19 (4h) = 8h disponibles.
  // 23/06 (martes, deadline): 08-13 (5h) + 15-19 (4h) = 9h.
  // Total: hasta 17h pero gap es 7h → debería cubrir todo.
  ok = assertEq(r.totalGapCubierto, 420, "todo el gap cubierto antes del deadline") && ok;
  ok = assertEq(r.blocked.length, 0, "sin blocked por deadline") && ok;

  // Verificar que ningún bloque quedó después de 23/06.
  const bloques = await prisma.horario_usuario.findMany({
    where: { actividad_id: aId, estado: true },
    orderBy: { fecha: "asc" },
  });
  const fueraDePlazo = bloques.filter(
    (b) => b.fecha > toDate("2026-06-23"),
  );
  ok = assertEq(fueraDePlazo.length, 0, "sin bloques después del deadline") && ok;
  return ok;
}

async function runEscenarioD() {
  console.log("\n=== Escenario D: sin cupos en horizonte → blocked ===");
  await cleanup();
  await ensureJornada();
  const aId = await makeActividad({ est: 600 }); // 10h
  // Bloque inicial en un día ANTERIOR al rango de búsqueda para no
  // poder expandirlo. Crea el gap de 540 min sin bloque propio en el
  // rango horizonte.
  await makeBloque(aId, "2026-06-19", 8, 9);
  // Rellenar TODOS los días del horizonte (22 + 3 días = 22..25).
  for (const fecha of ["2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25"]) {
    const dummyId = await makeActividad({ est: 0 });
    await makeBloque(dummyId, fecha, 8, 13);
    await makeBloque(dummyId, fecha, 15, 19);
  }

  const r = await schedulerService.completeActividades(
    TEST_USER_ID,
    "2026-06-22",
    { diasHorizonte: 3 },
  );
  console.log(
    "  applied:",
    r.applied.length,
    "blocked:",
    r.blocked.length,
    "cubierto:",
    r.totalGapCubierto,
  );
  console.log("  blocked detail:", JSON.stringify(r.blocked));

  let ok = true;
  ok = assertEq(r.totalGapCubierto, 0, "no se cubrió nada (calendario lleno)") && ok;
  ok =
    assertEq(
      r.blocked.length > 0,
      true,
      "actividad en blocked por falta de cupo",
    ) && ok;
  if (r.blocked.length > 0) {
    ok =
      assertEq(
        ["no_cupo_en_horizonte", "deadline"].includes(r.blocked[0].motivo),
        true,
        "motivo no_cupo_en_horizonte o deadline",
      ) && ok;
  }
  return ok;
}

async function runEscenarioE() {
  console.log("\n=== Escenario E: integración vía rebalanceUsuario ===");
  await cleanup();
  await ensureJornada();
  // Actividad NO-reunión con gap pre-existente (est=120, prog=60).
  const aId = await makeActividad({ est: 120 });
  await makeBloque(aId, "2026-06-22", 9, 10);

  // Simula lo que programarPrimeraVez hace al final: llamar a
  // `rebalanceUsuario` con el uid y la fecha de la reunión. Ignoramos
  // el id de actividad porque acá no estamos creando una reunión real,
  // sólo probando el wiring.
  const r = await reunionesAsistenteService.rebalanceUsuario(
    TEST_USER_ID,
    "2026-06-22",
    { motivo: "Test integración" },
  );
  console.log(
    "  applied:",
    (r?.applied || []).length,
    "cubierto:",
    r?.totalGapCubierto,
  );

  let ok = true;
  ok = assertEq(r != null, true, "rebalanceUsuario devuelve algo") && ok;
  ok = assertEq(r.totalGapCubierto, 60, "60 min cubiertos vía rebalanceUsuario") && ok;
  const nuevaSuma = await getSumaDuracion(aId);
  ok = assertEq(nuevaSuma, 120, "BD refleja 120 min") && ok;
  return ok;
}

async function runEscenarioF() {
  console.log(
    "\n=== Escenario F: E2E programarPrimeraVez dispara rebalance ===",
  );
  await cleanup();
  await ensureJornada();
  // Actividad NO-reunión con gap pre-existente (est=120, prog=60).
  const aId = await makeActividad({ est: 120 });
  await makeBloque(aId, "2026-06-22", 9, 10);
  // Actividad REUNIÓN (tarea tipo REUNION, id=3).
  const reunionRow = await prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID,
      estado: true,
      estado_progreso: "pendiente",
      prioridad: "MEDIA",
      tarea_id: 3,
      tiempo_estimado_minutos: 60,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  const reunionId = reunionRow.id;
  createdActividades.push(reunionId);

  // Llamar a programarPrimeraVez con la reunión.
  console.log("  reunionId:", reunionId, typeof reunionId);
  const r = await reunionesAsistenteService.programarPrimeraVez({
    actividadId: Number(reunionId),
    usuarioId: TEST_USER_ID,
    fecha: "2026-06-22",
    horaInicio: "16:00",
    duracionMinutos: 60,
    motivo: "Test E2E rebalance",
  });
  console.log(
    "  programarPrimeraVez.fits:",
    r.actividad?.id,
    "rebalance:",
    r.rebalance
      ? `applied=${r.rebalance.applied} cubierto=${r.rebalance.totalGapCubierto}`
      : null,
  );

  let ok = true;
  ok = assertEq(r.actividad != null, true, "programarPrimeraVez OK") && ok;
  ok =
    assertEq(
      r.rebalance != null,
      true,
      "rebalance se ejecutó tras programar la reunión",
    ) && ok;
  ok =
    assertEq(
      r.rebalance?.totalGapCubierto,
      60,
      "60 min cubiertos vía programarPrimeraVez",
    ) && ok;
  const nuevaSuma = await getSumaDuracion(aId);
  ok = assertEq(nuevaSuma, 120, "BD refleja 120 min en actividad gap") && ok;
  return ok;
}

async function runEscenarioG() {
  console.log(
    "\n=== Escenario G: bloque al final de jornada se EXPANDE, no se duplica ===",
  );
  await cleanup();
  await ensureJornada();
  // Caso del usuario: Act con bloque hu-8 = 08:00-12:00 (240 min), dentro
  // de jornada 08:00-13:00. La actividad debería tener est=300 (5h).
  const aId = await makeActividad({ est: 300 });
  await makeBloque(aId, "2026-06-22", 8, 12); // gap = 60 min

  const r = await schedulerService.completeActividades(
    TEST_USER_ID,
    "2026-06-22",
    {},
  );
  console.log(
    "  applied:",
    r.applied.length,
    "bloques_creados:",
    r.applied.reduce((acc, a) => acc + a.bloques_creados.length, 0),
    "bloques_expandidos:",
    r.applied.reduce((acc, a) => acc + a.bloques_expandidos.length, 0),
  );

  let ok = true;
  ok = assertEq(r.totalGapCubierto, 60, "60 min cubiertos") && ok;
  ok =
    assertEq(
      r.applied.reduce((acc, a) => acc + a.bloques_creados.length, 0),
      0,
      "NO se crearon bloques nuevos (se expandió el existente)",
    ) && ok;
  ok =
    assertEq(
      r.applied.reduce((acc, a) => acc + a.bloques_expandidos.length, 0),
      1,
      "1 bloque expandido",
    ) && ok;
  const nuevaSuma = await getSumaDuracion(aId);
  ok = assertEq(nuevaSuma, 300, "BD refleja 300 min (60 min agregados)") && ok;

  // Verificar que sigue habiendo UNA SOLA fila en BD para este día.
  const bloques = await prisma.horario_usuario.findMany({
    where: { actividad_id: aId, estado: true },
  });
  const bloquesEnElDia = bloques.filter((b) => {
    const f = b.fecha;
    return (
      f.getUTCFullYear() === 2026 &&
      f.getUTCMonth() === 5 &&
      f.getUTCDate() === 22
    );
  });
  ok = assertEq(bloquesEnElDia.length, 1, "1 sola fila en BD (no se duplicó)") && ok;
  if (bloquesEnElDia.length === 1) {
    const b = bloquesEnElDia[0];
    const hi = `${String(b.hora_inicio.getUTCHours()).padStart(2, "0")}:${String(b.hora_inicio.getUTCMinutes()).padStart(2, "0")}`;
    const hf = `${String(b.hora_fin.getUTCHours()).padStart(2, "0")}:${String(b.hora_fin.getUTCMinutes()).padStart(2, "0")}`;
    ok = assertEq(hi, "08:00", "hora_inicio sigue en 08:00") && ok;
    ok = assertEq(hf, "13:00", "hora_fin se expandió a 13:00") && ok;
    ok = assertEq(b.duracion_minutos, 300, "duracion_minutos = 300") && ok;
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
    allOk = (await runEscenarioE()) && allOk;
    allOk = (await runEscenarioF()) && allOk;
    allOk = (await runEscenarioG()) && allOk;
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
