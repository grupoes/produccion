import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const UID = 24;

// Cleanup: leave only activities 1, 2, 3 with their horario_usuario
await prisma.horario_usuario.deleteMany({ where: { usuario_id: UID } });
await prisma.actividades.deleteMany({ where: { usuario_id: UID, id: 4 } });
await prisma.prospectos.deleteMany({ where: { id: 2, titulo_prospecto: "TEST_FULL" } });

// Recreate actividad 2 with deadline 2026-06-30
const p = await prisma.prospectos.create({
  data: { id: 2, titulo_prospecto: "TEST_FULL", fecha_entrega: new Date("2026-06-30T00:00:00Z"), estado_cliente: "cliente", estado: true, fecha_contacto: new Date() },
});
await prisma.actividades.update({ where: { id: 2 }, data: { prospecto_id: 2 } });

// Re-create initial horario_usuario matching original state
const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

// Act 1: 23 (08-13, 15-19), 24 (08-10)
await prisma.horario_usuario.create({ data: { actividad_id: 1, usuario_id: UID, fecha: toDate("2026-06-23"), hora_inicio: toTime(8), hora_fin: toTime(13), estado: true, tipo: "actividad", duracion_minutos: 300 } });
await prisma.horario_usuario.create({ data: { actividad_id: 1, usuario_id: UID, fecha: toDate("2026-06-23"), hora_inicio: toTime(15), hora_fin: toTime(19), estado: true, tipo: "actividad", duracion_minutos: 240 } });
await prisma.horario_usuario.create({ data: { actividad_id: 1, usuario_id: UID, fecha: toDate("2026-06-24"), hora_inicio: toTime(8), hora_fin: toTime(10), estado: true, tipo: "actividad", duracion_minutos: 120 } });

// Act 2: 24 (10-13, 15-19), 25 (08-13, 15-19), 26 (08-12)
await prisma.horario_usuario.create({ data: { actividad_id: 2, usuario_id: UID, fecha: toDate("2026-06-24"), hora_inicio: toTime(10), hora_fin: toTime(13), estado: true, tipo: "actividad", duracion_minutos: 180 } });
await prisma.horario_usuario.create({ data: { actividad_id: 2, usuario_id: UID, fecha: toDate("2026-06-24"), hora_inicio: toTime(15), hora_fin: toTime(19), estado: true, tipo: "actividad", duracion_minutos: 240 } });
await prisma.horario_usuario.create({ data: { actividad_id: 2, usuario_id: UID, fecha: toDate("2026-06-25"), hora_inicio: toTime(8), hora_fin: toTime(13), estado: true, tipo: "actividad", duracion_minutos: 300 } });
await prisma.horario_usuario.create({ data: { actividad_id: 2, usuario_id: UID, fecha: toDate("2026-06-25"), hora_inicio: toTime(15), hora_fin: toTime(19), estado: true, tipo: "actividad", duracion_minutos: 240 } });
await prisma.horario_usuario.create({ data: { actividad_id: 2, usuario_id: UID, fecha: toDate("2026-06-26"), hora_inicio: toTime(8), hora_fin: toTime(12), estado: true, tipo: "actividad", duracion_minutos: 240 } });

// Act 3: 26 (12-13, 15-19), 27 (08-13), 30 (08-13, 15-19), 01 (08-09)
await prisma.horario_usuario.create({ data: { actividad_id: 3, usuario_id: UID, fecha: toDate("2026-06-26"), hora_inicio: toTime(12), hora_fin: toTime(13), estado: true, tipo: "actividad", duracion_minutos: 60 } });
await prisma.horario_usuario.create({ data: { actividad_id: 3, usuario_id: UID, fecha: toDate("2026-06-26"), hora_inicio: toTime(15), hora_fin: toTime(19), estado: true, tipo: "actividad", duracion_minutos: 240 } });
await prisma.horario_usuario.create({ data: { actividad_id: 3, usuario_id: UID, fecha: toDate("2026-06-27"), hora_inicio: toTime(8), hora_fin: toTime(13), estado: true, tipo: "actividad", duracion_minutos: 300 } });
await prisma.horario_usuario.create({ data: { actividad_id: 3, usuario_id: UID, fecha: toDate("2026-06-30"), hora_inicio: toTime(8), hora_fin: toTime(13), estado: true, tipo: "actividad", duracion_minutos: 300 } });
await prisma.horario_usuario.create({ data: { actividad_id: 3, usuario_id: UID, fecha: toDate("2026-06-30"), hora_inicio: toTime(15), hora_fin: toTime(19), estado: true, tipo: "actividad", duracion_minutos: 240 } });
await prisma.horario_usuario.create({ data: { actividad_id: 3, usuario_id: UID, fecha: toDate("2026-07-01"), hora_inicio: toTime(8), hora_fin: toTime(9), estado: true, tipo: "actividad", duracion_minutos: 60 } });

console.log("Estado inicial restaurado. Simulando creación de reunión en 23/06 12:00-13:00 (60 min).");

// Simulate scheduling a meeting
const plan = await schedulerService.placeActivity(UID, "2026-06-23", 60, {
  horaInicio: 12 * 60,
  splittable: true,
  deadline: null,
});
console.log(`\nplan.fits=${plan.fits}, reason=${plan.reason}`);
console.log(`moves: ${plan.moves?.length || 0}`);
for (const m of plan.moves || []) console.log(`  move: act=${m.actividad_id} horario_id=${m.horario_id} ${m.fecha} ${m.hi}-${m.hf}`);
console.log(`splits: ${plan.splits?.length || 0}`);
for (const sp of plan.splits || []) {
  console.log(`  split: act=${sp.actividad_id}`);
  if (sp.before) console.log(`    before: ${sp.before.hi}-${sp.before.hf}`);
  if (sp.after) console.log(`    after: ${sp.after.hi}-${sp.after.hf}`);
  if (sp.overflow?.length) for (const o of sp.overflow) console.log(`    overflow: ${o.fecha} ${o.hi}-${o.hf}`);
  if (sp.cascadeMoves?.length) for (const cm of sp.cascadeMoves) console.log(`    cascadeMove: horario_id=${cm.horario_id} ${cm.fecha} ${cm.hi}-${cm.hf}`);
}

// Apply the plan
if (plan.fits) {
  console.log("\n=== Applying plan ===");
  if (plan.moves?.length) await schedulerService.applyMoves(plan.moves, "test");
  if (plan.splits?.length) await schedulerService.applySplits(plan.splits, "test");
}

// Show final state
const blocks = await prisma.horario_usuario.findMany({
  where: { usuario_id: UID, estado: true },
  orderBy: [{ actividad_id: "asc" }, { fecha: "asc" }, { hora_inicio: "asc" }],
});
console.log("\nEstado final:");
let lastAct = 0;
for (const b of blocks) {
  if (b.actividad_id !== lastAct) {
    console.log(`\n  --- Act ${b.actividad_id} ---`);
    lastAct = b.actividad_id;
  }
  console.log(`  ${b.fecha.toISOString().slice(0,10)} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)}`);
}

await prisma.$disconnect();
