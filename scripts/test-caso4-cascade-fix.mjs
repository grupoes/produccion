// Test E2E: Caso 4 (OverlapRight) con cascadeTarget. Cuando la reunión
// desplaza un bloque de Act 1 (de [15:00-19:00] a [16:00-19:00]), Act 1
// pierde 60 min. El cascade debe recuperarlos expandiendo Act 1 en otro
// día (25/06 08-10 → 08-11).

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

// Escenario del usuario: Act 1 con bloques 23/06 08-13, 23/06 15-19,
// 24/06 08-13, 24/06 15-19, 25/06 08-10 (1140 min). Reunión a las
// 15:00 del 23/06 desplaza el bloque 15-19 a 16-19 (60 min perdidos).
// El cascade debe recuperar los 60 min vía cascadeMoves (e.g.,
// expandiendo Act 1 25/06 08-10 → 08-11 o similar).
async function runCasoUsuario() {
  console.log("\n=== Caso 4 con cascadeTarget: Act 1 recupera 60 min ===");
  await cleanup();
  await ensureJornada();

  // Act 1: est=1200, bloques 23/06 08-13 + 23/06 15-19 + 24/06 08-13
  // + 24/06 15-19 + 25/06 08-10 = 300+240+300+240+120 = 1200 min (full).
  const aId = await makeActividad({ est: 1200 });
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 15, 19, 240);
  await addBloque(aId, "2026-06-24", 8, 13, 300);
  await addBloque(aId, "2026-06-24", 15, 19, 240);
  await addBloque(aId, "2026-06-25", 8, 10, 120);

  // Act 2: est=180 (3h), bloque en 25/06 10-13 (3h, llena el espacio
  // después de Act 1).
  const bId = await makeActividad({ est: 180 });
  await addBloque(bId, "2026-06-25", 10, 13, 180);

  // Crear meeting (actividad de tipo reunión) en 23/06 15:00.
  const meetingId = await makeActividad({ est: 60 });

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-23",
    60,
    { horaInicio: 15 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );

  console.log("  plan.fits:", plan.fits);
  if (plan.splits) {
    for (const s of plan.splits) {
      console.log(`    split act=${s.actividad_id} cascade=${s.cascadeMoves?.length || 0} overflow=${s.overflow?.length || 0} cascadeTarget=${s.cascadeTarget || 0}`);
      for (const cm of s.cascadeMoves || []) console.log("      cascadeMove:", cm);
      for (const ov of s.overflow || []) console.log("      overflow:", ov);
    }
  }

  let ok = true;
  ok = assert(plan.fits === true, "placeActivity encontró slot") && ok;

  // El split para Act 1 debe tener cascadeMoves que la expandan en 25/06
  // u otro día, recuperando los 60 min perdidos.
  const splitAct1 = (plan.splits || []).find((s) => Number(s.actividad_id) === Number(aId));
  ok = assert(
    splitAct1 != null,
    "se generó split para Act 1",
  ) && ok;
  // El cascade RECUPERA los 60 min perdidos. cascadeTarget se elimina
  // después de procesarse (línea ~2537 en scheduler.service.js), así
  // que validamos el efecto: la suma de overflow de Act 1 (los nuevos
  // bloques que se le agregan) debe >= 60 min para recuperar lo
  // perdido por la reunión.
  const totalOverflowAct1 = (splitAct1?.overflow || [])
    .filter((o) => Number(o.actividad_id || splitAct1.actividad_id) === Number(splitAct1.actividad_id))
    .reduce((acc, o) => acc + (o.len || 0), 0);
  ok = assert(
    totalOverflowAct1 >= 60,
    `overflow de Act 1 >= 60 min para recuperar lo perdido (got ${totalOverflowAct1})`,
  ) && ok;
  ok = assert(
    (splitAct1?.cascadeMoves?.length || 0) > 0,
    "se generaron cascadeMoves para Act 1 (movimientos inter-actividad)",
  ) && ok;
  ok = assert(
    (splitAct1?.overflow?.length || 0) > 0,
    "se generaron overflow para Act 1 (slots de recuperación)",
  ) && ok;
  return ok;
}

async function main() {
  let allOk = true;
  try {
    allOk = (await runCasoUsuario()) && allOk;
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