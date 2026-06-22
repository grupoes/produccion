// Debug: trace del push-forward paso a paso.
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
}

async function makeActividad() {
  const act = await prisma.actividades.create({
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
  createdActividades.push(act.id);
  return act.id;
}

async function makeBloque(actividadId, fecha, hi, hf) {
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
      duracion_minutos: (hf - hi) * 60,
    },
  });
  createdHorarios.push(b.id);
  return b.id;
}

try {
  const a1 = await makeActividad();
  const a2 = await makeActividad();
  const f1 = await makeActividad();
  console.log(`a1=${a1} a2=${a2} f1=${f1}`);

  // Limpiar OTROS bloques/actividades del usuario 20 que NO son míos.
  await prisma.horario_usuario.deleteMany({
    where: { usuario_id: TEST_USER_ID, estado: true, actividad_id: { notIn: [a1, a2, f1] } },
  });
  await prisma.actividades.deleteMany({
    where: { usuario_id: TEST_USER_ID, id: { notIn: [a1, a2, f1] } },
  });
  console.log("limpieza de IDs extraños completada");

  // A1 con bloques 22/06 (extensible).
  await makeBloque(a1, "2026-06-19", 8, 13);
  await makeBloque(a1, "2026-06-19", 15, 19);
  await makeBloque(a1, "2026-06-20", 8, 13);
  await makeBloque(a1, "2026-06-22", 8, 13);
  await makeBloque(a1, "2026-06-22", 15, 16);

  // A2: 22/06 16-19 (el que se va a mover).
  await makeBloque(a2, "2026-06-22", 16, 19);
  await makeBloque(a2, "2026-06-23", 8, 13);
  await makeBloque(a2, "2026-06-23", 15, 19);
  await makeBloque(a2, "2026-06-24", 8, 13);
  await makeBloque(a2, "2026-06-24", 15, 18);

  // Fillers.
  await makeBloque(f1, "2026-06-19", 13, 15);
  await makeBloque(f1, "2026-06-20", 8, 13);
  await makeBloque(f1, "2026-06-22", 13, 15);

  // Inspeccionar 22/06 antes del plan.
  const ctx = await schedulerService.loadDayContext(TEST_USER_ID, "2026-06-22");
  console.log("=== Contexto 22/06 ===");
  console.log("bloques de jornada:", ctx.bloques);
  console.log("eventos:", ctx.eventos.map(e => `actividad=${e.actividad_id} ${e.ini}-${e.fin}`));
  console.log("huecos libres:", schedulerService.computeFreeSlots(ctx));

  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    "2026-06-19",
    60,
    { horaInicio: 17 * 60, splittable: true, deadline: null },
  );
  console.log("\n=== Plan ===");
  console.log("splits:", JSON.stringify(plan.splits, null, 2));
} catch (e) {
  console.error("ERROR:", e.message, e.stack);
} finally {
  await cleanup();
  await prisma.$disconnect();
}