// Test final: simula el escenario EXACTO del usuario 24.
//   - Recrea su estado
//   - Agrega una reunión a las 17:00 vía crearReunion (producción)
//   - Muestra antes/después
//
// Objetivo: confirmar que actividades 2 y 3 SÍ se mueven ahora.

import "dotenv/config";
import prisma from "../src/config/db.js";
import reunionesAsistente from "../src/services/reuniones-asistente.service.js";

const TEST_USER_ID = 24;
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let createdActividades = [];
let createdHorarios = [];

async function cleanup() {
  // NO borrar horario_jornada_detalle: pertenece al usuario de producción.
  // Antes borraba la jornada por accidente; restaurada con
  // scripts/restore-user24-jornada.mjs.
  await prisma.horario_usuario.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  await prisma.actividades.deleteMany({ where: { usuario_id: TEST_USER_ID } });
  createdActividades = [];
  createdHorarios = [];
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

async function addBloque(actId, fecha, hiH, hfH, durMin, tipo = "actividad") {
  const b = await prisma.horario_usuario.create({
    data: {
      actividad_id: actId, usuario_id: TEST_USER_ID, fecha: toDate(fecha),
      hora_inicio: toTime(hiH), hora_fin: toTime(hfH), estado: true,
      tipo, duracion_minutos: durMin,
    },
  });
  createdHorarios.push(b.id);
  return b.id;
}

function fmtHora(d) {
  if (!d) return "--:--";
  return `${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
}

async function showState(label) {
  const acts = await prisma.actividades.findMany({
    where: { usuario_id: TEST_USER_ID, estado: true },
    orderBy: { id: "asc" },
  });
  console.log(`\n========== ${label} ==========`);
  for (const a of acts) {
    const blocks = await prisma.horario_usuario.findMany({
      where: { actividad_id: a.id, estado: true },
      orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
    });
    const totalProg = blocks.reduce((acc, b) => acc + b.duracion_minutos, 0);
    const gap = a.tiempo_estimado_minutos - totalProg;
    const tipo = a.tiempo_estimado_minutos === 60 ? "REUNIÓN" : "TAREA";
    console.log(`  ${tipo} act=${a.id} est=${a.tiempo_estimado_minutos}min prog=${totalProg}min gap=${gap}min`);
    for (const b of blocks) {
      console.log(`    ${b.fecha.toISOString().slice(0,10)} ${fmtHora(b.hora_inicio)}-${fmtHora(b.hora_fin)} (${b.duracion_minutos}min)`);
    }
  }
}

async function run() {
  console.log("===================================================");
  console.log("ESCENARIO REAL: usuario 24, reunión 17:00-18:00");
  console.log("===================================================");

  await cleanup();
  await ensureJornada();

  // Reproducir EXACTAMENTE el estado que el usuario tenía.
  // Act 1: 660 min
  const aId = await makeActividad(660);
  await addBloque(aId, "2026-06-23", 8, 13, 300);
  await addBloque(aId, "2026-06-23", 15, 19, 240);
  await addBloque(aId, "2026-06-24", 8, 10, 120);

  // Act 2: 1200 min
  const bId = await makeActividad(1200);
  await addBloque(bId, "2026-06-24", 10, 13, 180);
  await addBloque(bId, "2026-06-24", 15, 19, 240);
  await addBloque(bId, "2026-06-25", 8, 13, 300);
  await addBloque(bId, "2026-06-25", 15, 19, 240);
  await addBloque(bId, "2026-06-26", 8, 12, 240);

  // Act 3: 1200 min
  const cId = await makeActividad(1200);
  await addBloque(cId, "2026-06-26", 12, 13, 60);
  await addBloque(cId, "2026-06-26", 15, 19, 240);
  await addBloque(cId, "2026-06-27", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 8, 13, 300);
  await addBloque(cId, "2026-06-30", 15, 19, 240);
  await addBloque(cId, "2026-07-01", 8, 9, 60);

  await showState("1) ANTES de agregar la reunión");

  // Necesitamos un prospecto y una tarea válidos para crearReunion
  const prospecto = await prisma.prospectos.findFirst({
    where: { estado: true },
    select: { id: true },
  });
  if (!prospecto) {
    console.log("ERROR: no hay prospectos activos. Abortando.");
    return;
  }
  const tarea = await prisma.tarea.findFirst({
    where: { tipo_tarea: 2 }, // tipo REUNIONES
    select: { id: true },
  });
  if (!tarea) {
    console.log("ERROR: no hay tareas de tipo REUNIONES. Abortando.");
    return;
  }

  console.log(`\n  Usando prospecto_id=${prospecto.id}, tarea_id=${tarea.id}`);
  console.log(`  Agregando reunión a las 17:00-18:00 vía crearReunion (producción)...\n`);

  let result;
  try {
    result = await reunionesAsistente.crearReunion({
      prospectoId: prospecto.id,
      tareaId: tarea.id,
      usuarioId: TEST_USER_ID,
      fecha: "2026-06-23",
      horaInicio: "17:00",
      duracionMinutos: 60,
      motivo: "Test cadena completa",
    });
  } catch (e) {
    console.log("  ERROR en crearReunion:", e.message);
    if (e.details) {
      console.log("  details:", JSON.stringify(e.details, null, 2));
    }
    return;
  }

  console.log("  Resultado crearReunion:");
  console.log(`    reunión creada: act=${result.actividad?.id}`);
  console.log(`    plan.applied: moves=${result.plan?.applied?.moves || 0} splits=${result.plan?.applied?.splits || 0} cascadeMoves=${result.plan?.applied?.cascadeMoves || 0} chainCascades=${result.plan?.applied?.chainCascades || 0} chainOverflow=${result.plan?.applied?.chainOverflow || 0}`);

  await showState("2) DESPUÉS de crear la reunión (con todos los moves/splits/chainCascades aplicados)");

  // Llamar al rebalance post-inserción, como hace programarPrimeraVez en
  // producción. Esto activa chainCascades para llenar los gaps residuales.
  console.log("\n  Llamando rebalanceUsuario (como producción)...");
  const rebalance = await reunionesAsistente.rebalanceUsuario(
    TEST_USER_ID, "2026-06-23",
    { ignorarActividadId: result.actividad.id, motivo: "Test post-meeting" },
  );
  if (rebalance) {
    console.log(`    totalGapInicial=${rebalance.totalGapInicial} totalGapCubierto=${rebalance.totalGapCubierto} applied=${rebalance.applied} blocked=${rebalance.blocked} skipped=${rebalance.skipped}`);
  }

  await showState("3) DESPUÉS del rebalance (estado final)");
}

try {
  await run();
} catch (e) {
  console.error("ERROR:", e.message, e.stack);
} finally {
  await cleanup();
  await prisma.$disconnect();
}
