// Aplica los movimientos del algoritmo a la BD y muestra el estado final.

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

function hhmmToMin(s) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

async function applyPlan(plan) {
  // Aplicar splits (reemplazan bloques)
  for (const sp of plan.splits || []) {
    if (sp.horario_id) {
      await prisma.horario_usuario.update({
        where: { id: sp.horario_id },
        data: { estado: false, updated_at: new Date() },
      });
    }
    if (sp.before) {
      await prisma.horario_usuario.create({
        data: {
          actividad_id: sp.actividad_id,
          usuario_id: TEST_USER_ID,
          fecha: toDate(sp.before.fecha),
          hora_inicio: toTime(parseInt(sp.before.hi.split(":")[0]), parseInt(sp.before.hi.split(":")[1] || 0)),
          hora_fin: toTime(parseInt(sp.before.hf.split(":")[0]), parseInt(sp.before.hf.split(":")[1] || 0)),
          estado: true,
          tipo: "actividad",
          duracion_minutos: sp.before.len,
        },
      });
    }
    if (sp.after) {
      await prisma.horario_usuario.create({
        data: {
          actividad_id: sp.actividad_id,
          usuario_id: TEST_USER_ID,
          fecha: toDate(sp.after.fecha),
          hora_inicio: toTime(parseInt(sp.after.hi.split(":")[0]), parseInt(sp.after.hi.split(":")[1] || 0)),
          hora_fin: toTime(parseInt(sp.after.hf.split(":")[0]), parseInt(sp.after.hf.split(":")[1] || 0)),
          estado: true,
          tipo: "actividad",
          duracion_minutos: sp.after.len,
        },
      });
    }
  }

  // Aplicar cascadeMoves de splits
  for (const sp of plan.splits || []) {
    for (const cm of sp.cascadeMoves || []) {
      await prisma.horario_usuario.update({
        where: { id: cm.horario_id },
        data: {
          hora_inicio: toTime(parseInt(cm.hi.split(":")[0]), parseInt(cm.hi.split(":")[1] || 0)),
          hora_fin: toTime(parseInt(cm.hf.split(":")[0]), parseInt(cm.hf.split(":")[1] || 0)),
          fecha: toDate(cm.fecha),
          duracion_minutos: cm.len,
          updated_at: new Date(),
        },
      });
    }
  }

  // Aplicar chainCascades
  for (const cc of plan.chainCascades || []) {
    for (const cm of cc.cascadeMoves || []) {
      await prisma.horario_usuario.update({
        where: { id: cm.horario_id },
        data: {
          hora_inicio: toTime(parseInt(cm.hi.split(":")[0]), parseInt(cm.hi.split(":")[1] || 0)),
          hora_fin: toTime(parseInt(cm.hf.split(":")[0]), parseInt(cm.hf.split(":")[1] || 0)),
          fecha: toDate(cm.fecha),
          duracion_minutos: cm.len,
          updated_at: new Date(),
        },
      });
    }
    for (const ov of cc.overflow || []) {
      await prisma.horario_usuario.create({
        data: {
          actividad_id: cc.actividad_id,
          usuario_id: TEST_USER_ID,
          fecha: toDate(ov.fecha),
          hora_inicio: toTime(parseInt(ov.hi.split(":")[0]), parseInt(ov.hi.split(":")[1] || 0)),
          hora_fin: toTime(parseInt(ov.hf.split(":")[0]), parseInt(ov.hf.split(":")[1] || 0)),
          estado: true,
          tipo: "actividad",
          duracion_minutos: ov.len,
        },
      });
    }
  }
}

async function run() {
  await cleanup();
  await ensureJornada();

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

  console.log("\n=== Aplicando plan a la BD ===");
  await applyPlan(plan);

  await showState("FINAL (en BD)");
}

try {
  await run();
} catch (e) {
  console.error("ERROR:", e.message, e.stack);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
