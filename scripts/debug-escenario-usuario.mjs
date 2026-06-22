// Debug: simula el escenario descrito por el usuario.
// 3 actividades en secuencia cronológica. Reunión parte la primera.
// Esperado: la 2da y 3era actividad deben correr/ajustarse si la 1ra pierde tiempo.
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 20;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];
let createdHorarios = [];

async function cleanup() {
  if (createdHorarios.length > 0) {
    await prisma.horario_usuario.deleteMany({
      where: { id: { in: createdHorarios } },
    });
  }
  if (createdActividades.length > 0) {
    await prisma.actividades.deleteMany({
      where: { id: { in: createdActividades } },
    });
  }
  createdActividades = [];
  createdHorarios = [];
}

async function makeActividad(opts = {}) {
  const { bloqueada = false, prioridad = "MEDIA", prospecto = null } = opts;
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

try {
  const a1 = await makeActividad();
  const a2 = await makeActividad();
  const a3 = await makeActividad();

  // A1: 20h distribuida entre viernes 19/06, sábado 20/06, lunes 22/06.
  // vie 8-13, vie 15-19, sab 8-13, lun 8-13, lun 15-16 = 5+4+5+5+1 = 20h
  await makeBloque(a1, "2026-06-19", 8, 13);
  await makeBloque(a1, "2026-06-19", 15, 19);
  await makeBloque(a1, "2026-06-20", 8, 13);
  await makeBloque(a1, "2026-06-22", 8, 13);
  await makeBloque(a1, "2026-06-22", 15, 16);

  // A2: empieza inmediatamente después de A1 (lun 22/06 16-19), continúa mar 23/06, mié 24/06.
  await makeBloque(a2, "2026-06-22", 16, 19);
  await makeBloque(a2, "2026-06-23", 8, 13);
  await makeBloque(a2, "2026-06-23", 15, 19);
  await makeBloque(a2, "2026-06-24", 8, 13);
  await makeBloque(a2, "2026-06-24", 15, 18);

  // A3: empieza donde termina A2 (mié 24/06 18-19), continúa jue 25/06.
  await makeBloque(a3, "2026-06-24", 18, 19);
  await makeBloque(a3, "2026-06-25", 8, 13);

  console.log("=== ANTES ===");
  const ctxBefore = await schedulerService.loadDayContext(TEST_USER_ID, "2026-06-22");
  for (const e of ctxBefore.eventos) {
    console.log(`  ${e.fecha || "?"} actividad=${e.actividad_id} ${e.ini}-${e.fin} (${e.minutos}min)`);
  }

  console.log("\n=== Colocando reunión 19/06 17:00-18:00 (60min) ===");
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-19",
    60,
    { horaInicio: 17 * 60, splittable: true, deadline: null },
  );
  console.log("Plan.fits:", plan.fits, "reason:", plan.reason);
  console.log("splits:", JSON.stringify(plan.splits, null, 2));
  console.log("moves:", JSON.stringify(plan.moves, null, 2));
  console.log("blockedMoves:", plan.blockedMoves);
} catch (e) {
  console.error("ERROR:", e.message, e.stack);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
