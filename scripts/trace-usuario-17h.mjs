// Trace exacto de lo que produce el algoritmo con los datos del usuario
// y reunión a 17:00-18:00.

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

async function showState(label) {
  const acts = await prisma.actividades.findMany({
    where: { usuario_id: TEST_USER_ID, estado: true },
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
    console.log(`  act=${a.id} est=${a.tiempo_estimado_minutos} prog=${totalProg} gap=${gap}`);
    for (const b of blocks) {
      console.log(`    ${b.fecha.toISOString().slice(0,10)} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)} (${b.duracion_minutos}min)`);
    }
  }
}

async function run() {
  await cleanup();
  await ensureJornada();

  // Datos EXACTOS del usuario (de la base de datos)
  const aId = await makeActividad({ est: 660 });
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 15, 19, 240);
  await addBloque(aId, "2026-06-24", 8, 10, 120);

  const bId = await makeActividad({ est: 1380 });
  await addBloque(bId, "2026-06-24", 10, 13, 180);
  await addBloque(bId, "2026-06-24", 15, 19, 240);
  await addBloque(bId, "2026-06-25", 8, 13, 300);
  await addBloque(bId, "2026-06-25", 15, 19, 240);
  await addBloque(bId, "2026-06-26", 8, 12, 240);

  const cId = await makeActividad({ est: 1200 });
  await addBloque(cId, "2026-06-26", 12, 13, 60);
  await addBloque(cId, "2026-06-26", 15, 19, 240);
  await addBloque(cId, "2026-06-27", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 15, 19, 240);
  await addBloque(cId, "2026-07-01", 8, 9, 60);

  const meetingId = await makeActividad({ est: 60 });

  await showState("INICIAL");

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-23",
    60,
    { horaInicio: 17 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );

  console.log("\n=== plan ===");
  console.log("  fits:", plan.fits);
  console.log("  splits:", JSON.stringify(plan.splits || [], null, 2));
  console.log("  moves:", JSON.stringify(plan.moves || [], null, 2));
  console.log("  chainCascades:", JSON.stringify(plan.chainCascades || [], null, 2));
  console.log("  blockedMoves:", JSON.stringify(plan.blockedMoves || [], null, 2));

  await showState("FINAL (en memoria, no se aplicó a la BD)");
}

try {
  await run();
} catch (e) {
  console.error("ERROR:", e.message, e.stack);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
