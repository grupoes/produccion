// Reproduce el estado PRE-meeting del usuario 24 y corre placeActivity.
// Ver qué chainCascades genera (que la producción ignora).

import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 24;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];

async function cleanup() {
  await prisma.horario_usuario.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  await prisma.actividades.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  await prisma.horario_jornada_detalle.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  createdActividades = [];
}

async function ensureJornada() {
  for (const d of [1, 2, 3, 4, 5]) {
    await prisma.horario_jornada_detalle.create({
      data: { usuario_id: TEST_USER_ID, dia_semana: d, hora_inicio: toTime(8), hora_fin: toTime(13), estado: true },
    });
    await prisma.horario_jornada_detalle.create({
      data: { usuario_id: TEST_USER_ID, dia_semana: d, hora_inicio: toTime(15), hora_fin: toTime(19), estado: true },
    });
  }
}

async function makeActividad(est) {
  const a = await prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID, estado: true, estado_progreso: "pendiente",
      prioridad: "MEDIA", tiempo_estimado_minutos: est,
      created_at: new Date(), updated_at: new Date(),
    },
  });
  createdActividades.push(a.id);
  return a.id;
}

async function addBloque(actId, fecha, hiH, hfH, durMin) {
  return prisma.horario_usuario.create({
    data: {
      actividad_id: actId, usuario_id: TEST_USER_ID, fecha: toDate(fecha),
      hora_inicio: toTime(hiH), hora_fin: toTime(hfH), estado: true,
      tipo: "actividad", duracion_minutos: durMin,
    },
  });
}

async function run() {
  await cleanup();
  await ensureJornada();

  // Estado EXACTO del usuario 24 ANTES de la reunión
  const aId = await makeActividad(660);
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 15, 19, 240);
  await addBloque(aId, "2026-06-24", 8, 10, 120);

  const bId = await makeActividad(1200);
  await addBloque(bId, "2026-06-24", 10, 13, 180);
  await addBloque(bId, "2026-06-24", 15, 19, 240);
  await addBloque(bId, "2026-06-25", 8, 13, 300);
  await addBloque(bId, "2026-06-25", 15, 19, 240);
  await addBloque(bId, "2026-06-26", 8, 12, 240);

  const cId = await makeActividad(1200);
  await addBloque(cId, "2026-06-26", 12, 13, 60);
  await addBloque(cId, "2026-06-26", 15, 19, 240);
  await addBloque(cId, "2026-06-27", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 15, 19, 240);
  await addBloque(cId, "2026-07-01", 8, 9, 60);

  const meetingId = await makeActividad(60);

  // placeActivity para la reunión 17:00-18:00
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID, "2026-06-23", 60,
    { horaInicio: 17 * 60, splittable: true, deadline: null, ignorarActividadId: meetingId },
  );

  console.log("=== plan.chainCascades (que producción IGNORA) ===");
  console.log(JSON.stringify(plan.chainCascades, null, 2));
}

try {
  await run();
} catch (e) {
  console.error("ERROR:", e.message, e.stack);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
