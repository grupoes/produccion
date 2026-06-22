// Test E2E del applySplits con push-forward moves.
// Reproduce el escenario EXACTO del usuario:
//   A1: 19/06 8-13, 15-19, 20/06 8-13, 22/06 8-13, 15-16 (21h)
//   A2: 22/06 16-19, 23/06 8-13, 15-19, 24/06 8-13, 15-18
//   Reunión 19/06 17-18.
// Tras aplicar: A2 primer bloque 22/06 16-19 debe quedar en 23/06 16-19.

import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 20;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividadIds = [];
let createdHorarioIds = [];

function assertEq(actual, expected, label) {
  if (actual === expected) {
    console.log(`  OK ${label}: ${actual}`);
    return true;
  }
  console.log(`  FAIL ${label}: esperado ${expected}, obtuve ${actual}`);
  return false;
}

async function makeActividad() {
  const a = await prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID,
      estado: true,
      estado_progreso: "pendiente",
      prioridad: "MEDIA",
      bloqueada: false,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  createdActividadIds.push(a.id);
  return a.id;
}

async function makeBloque(actividadId, fecha, hi, hf, mins) {
  const b = await prisma.horario_usuario.create({
    data: {
      actividad_id: actividadId,
      usuario_id: TEST_USER_ID,
      fecha: toDate(fecha),
      hora_inicio: toTime(hi),
      hora_fin: toTime(hf),
      estado: true,
      tipo: "actividad",
      categoria: "test",
      duracion_minutos: mins,
    },
  });
  createdHorarioIds.push(b.id);
  return b.id;
}

async function fetchBloque(id) {
  const r = await prisma.$queryRawUnsafe(
    `SELECT id, actividad_id,
            TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha,
            TO_CHAR(hora_inicio::time, 'HH24:MI') AS hi,
            TO_CHAR(hora_fin::time, 'HH24:MI') AS hf,
            duracion_minutos
       FROM horario_usuario WHERE id = $1`,
    id,
  );
  return r[0];
}

try {
  // Crear A1 con bloques que incluyan el 22/06 15-16 (extensible).
  const a1 = await makeActividad();
  console.log(`A1 id=${a1}`);

  const a1b1 = await makeBloque(a1, "2026-06-19", 8, 13, 300);
  const a1b2 = await makeBloque(a1, "2026-06-19", 15, 19, 240);
  const a1b3 = await makeBloque(a1, "2026-06-20", 8, 13, 300);
  const a1b4 = await makeBloque(a1, "2026-06-22", 8, 13, 300);
  const a1b5 = await makeBloque(a1, "2026-06-22", 15, 16, 60);

  // Crear A2 con bloque en 22/06 16-19 (que se va a mover).
  const a2 = await makeActividad();
  console.log(`A2 id=${a2}`);

  const a2b1 = await makeBloque(a2, "2026-06-22", 16, 19, 180);
  const a2b2 = await makeBloque(a2, "2026-06-23", 8, 13, 300);
  const a2b3 = await makeBloque(a2, "2026-06-23", 15, 19, 240);
  const a2b4 = await makeBloque(a2, "2026-06-24", 8, 13, 300);
  const a2b5 = await makeBloque(a2, "2026-06-24", 15, 18, 180);

  // Crear filler para llenar huecos libres (fuerza extensión de A1).
  const f1 = await makeActividad();
  await makeBloque(f1, "2026-06-19", 13, 15, 120); // hueco 19/06 13-15
  await makeBloque(f1, "2026-06-20", 8, 13, 300); // sábado
  await makeBloque(f1, "2026-06-22", 13, 15, 120); // hueco 22/06 13-15

  console.log(`A1.bloque_extensible id=${a1b5} 22/06 15:00-16:00`);
  console.log(`A2.bloque_a_mover id=${a2b1} 22/06 16:00-19:00`);

  // Reunión 19/06 17-18 parte A1 15-19.
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-19",
    60,
    { horaInicio: 17 * 60, splittable: true, deadline: null },
  );
  console.log(`\nplan.fits=${plan.fits} splits=${plan.splits?.length}`);

  // Verificar push-forward en el plan.
  const pfMoves = (plan.splits || []).reduce(
    (acc, s) => acc.concat(s.cascadeMoves || []).filter((m) => m.pushForward === true),
    [],
  );
  console.log(`push-forward moves: ${pfMoves.length}`);
  pfMoves.forEach((m) =>
    console.log(`  actividad=${m.actividad_id} horario_id=${m.horario_id} → ${m.hi}-${m.hf} fecha=${m.fecha}`),
  );

  let ok = true;
  const pfA2 = pfMoves.find((m) => Number(m.actividad_id) === a2);
  ok = assertEq(!!pfA2, true, "A2 en push-forward del plan") && ok;
  if (!pfA2) {
    console.log("\nFAIL: no hay push-forward de A2. Plan completo:");
    console.log(JSON.stringify(plan, null, 2));
    process.exit(1);
  }
  // Política: A2 arranca secuencialmente donde A1 terminó
  // (22/06 17:00), aunque se comprima. Mantiene orden cronológico.
  ok = assertEq(pfA2.fecha, "2026-06-22", "A2 mantiene día 22/06 (secuencial)") && ok;
  ok = assertEq(pfA2.hi, "17:00", "A2 arranca 17:00 (donde A1 terminó)") && ok;
  ok = assertEq(pfA2.hf, "19:00", "A2 termina 19:00 (fin de jornada tarde)") && ok;
  ok = assertEq(Number(pfA2.len), 120, "A2 comprimida a 120 min en 22/06") && ok;
  ok = assertEq(pfA2.horario_id, a2b1, "push-forward horario_id correcto") && ok;

  // Aplicar splits.
  console.log("\n=== Aplicando splits ===");
  const result = await schedulerService.applySplits(plan.splits, "test_push_forward");
  console.log("applied:", JSON.stringify(result.applied, null, 2));

  // Verificar BD: A2.bloque_a_mover debe estar en 22/06 17:00-19:00
  // (comprimido en mismo día, orden secuencial).
  console.log("\n=== Verificación BD ===");
  const a2Final = await fetchBloque(a2b1);
  console.log(`A2 bloque ${a2b1}:`, a2Final);
  ok = assertEq(a2Final.fecha, "2026-06-22", "A2.fecha = 2026-06-22") && ok;
  ok = assertEq(a2Final.hi, "17:00", "A2.hi = 17:00") && ok;
  ok = assertEq(a2Final.hf, "19:00", "A2.hf = 19:00") && ok;
  ok = assertEq(Number(a2Final.duracion_minutos), 120, "A2.duracion_minutos = 120") && ok;

  // Verificar A1 bloque extendido 22/06 15-16 → 15-17.
  const a1Final = await fetchBloque(a1b5);
  console.log(`A1 bloque ${a1b5} (debe estar extendido):`, a1Final);
  ok = assertEq(a1Final.hf, "17:00", "A1.bloque 22/06 extendido a 17:00") && ok;

  // Verificar que A2 NO tiene bloques superpuestos en 23/06.
  const allA2 = await prisma.$queryRawUnsafe(
    `SELECT id, fecha,
            TO_CHAR(hora_inicio::time, 'HH24:MI') AS hi,
            TO_CHAR(hora_fin::time, 'HH24:MI') AS hf
       FROM horario_usuario
      WHERE actividad_id = $1 AND estado = true
      ORDER BY fecha, hora_inicio`,
    a2,
  );
  console.log("\nBloques de A2 tras push-forward:");
  for (const b of allA2) {
    console.log(`  ${b.id} ${b.fecha} ${b.hi}-${b.hf}`);
  }
  // Buscar superposiciones dentro del mismo día.
  const porDia = new Map();
  for (const b of allA2) {
    if (!porDia.has(b.fecha)) porDia.set(b.fecha, []);
    porDia.get(b.fecha).push(b);
  }
  let superpos = false;
  for (const [fecha, bls] of porDia) {
    bls.sort((a, b) => a.hi.localeCompare(b.hi));
    for (let i = 1; i < bls.length; i++) {
      if (bls[i].hi < bls[i - 1].hf) {
        console.log(`  SUPERPOSICIÓN en ${fecha}: ${bls[i - 1].hi}-${bls[i - 1].hf} vs ${bls[i].hi}-${bls[i].hf}`);
        superpos = true;
      }
    }
  }
  ok = assertEq(superpos, false, "A2 sin superposiciones") && ok;

  console.log("\n" + (ok ? "PASS" : "FAIL"));
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error("ERROR:", e.message, e.stack);
  process.exit(1);
} finally {
  await prisma.horario_usuario.deleteMany({ where: { usuario_id: TEST_USER_ID, estado: true } });
  await prisma.actividades.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  await prisma.$disconnect();
}