import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const UID = 24;

// Cleanup first
await prisma.horario_usuario.deleteMany({ where: { usuario_id: UID } });
console.log("cleaned horario_usuario");

// Re-create exact user 24 jornada
await prisma.horario_jornada_detalle.deleteMany({ where: { usuario_id: UID } });
for (const d of [1, 2, 3, 4, 5, 6]) {
  await prisma.horario_jornada_detalle.create({
    data: { usuario_id: UID, dia_semana: d, hora_inicio: new Date(Date.UTC(1970,0,1,8,0)), hora_fin: new Date(Date.UTC(1970,0,1,13,0)), estado: true },
  });
  await prisma.horario_jornada_detalle.create({
    data: { usuario_id: UID, dia_semana: d, hora_inicio: new Date(Date.UTC(1970,0,1,15,0)), hora_fin: new Date(Date.UTC(1970,0,1,19,0)), estado: true },
  });
}

// Delete existing activities 1, 2, 3 and re-create them
await prisma.actividades.deleteMany({ where: { usuario_id: UID, id: { in: [1,2,3] } } });

// Create 3 actividades matching the original data
const a1 = await prisma.actividades.create({
  data: {
    id: 1, usuario_id: UID, estado: true, estado_progreso: "pendiente",
    prioridad: "MEDIA", tiempo_estimado_minutos: 660,
    tarea_id: 1, fecha_inicio: new Date("2026-06-23T00:00:00"),
    hora_inicio: new Date("2026-06-23T13:00:00Z"),
  },
});
const a2 = await prisma.actividades.create({
  data: {
    id: 2, usuario_id: UID, estado: true, estado_progreso: "pendiente",
    prioridad: "MEDIA", tiempo_estimado_minutos: 1200,
    tarea_id: 1, fecha_inicio: new Date("2026-06-24T00:00:00"),
    hora_inicio: new Date("2026-06-24T15:00:00Z"),
  },
});
const a3 = await prisma.actividades.create({
  data: {
    id: 3, usuario_id: UID, estado: true, estado_progreso: "pendiente",
    prioridad: "MEDIA", tiempo_estimado_minutos: 1200,
    tarea_id: 1, fecha_inicio: new Date("2026-06-26T00:00:00"),
    hora_inicio: new Date("2026-06-26T17:00:00Z"),
  },
});
console.log("created activities 1, 2, 3");

// Add initial horario_usuario for each (matching original data)
await prisma.horario_usuario.create({ data: { actividad_id: 1, usuario_id: UID, fecha: new Date("2026-06-23T00:00:00"), hora_inicio: new Date("2026-06-23T13:00:00Z"), hora_fin: new Date("2026-06-23T18:00:00Z"), estado: true, tipo: "actividad", duracion_minutos: 300 } });
await prisma.horario_usuario.create({ data: { actividad_id: 2, usuario_id: UID, fecha: new Date("2026-06-24T00:00:00"), hora_inicio: new Date("2026-06-24T15:00:00Z"), hora_fin: new Date("2026-06-24T18:00:00Z"), estado: true, tipo: "actividad", duracion_minutos: 180 } });
await prisma.horario_usuario.create({ data: { actividad_id: 3, usuario_id: UID, fecha: new Date("2026-06-26T00:00:00"), hora_inicio: new Date("2026-06-26T17:00:00Z"), hora_fin: new Date("2026-06-26T18:00:00Z"), estado: true, tipo: "actividad", duracion_minutos: 60 } });
console.log("created initial blocks");

// Call completeActividades with 14-day horizon
const r = await schedulerService.completeActividades(UID, "2026-06-23", { diasHorizonte: 14 });
console.log("\nResult:");
console.log("  applied:", r.applied.length);
console.log("  blocked:", r.blocked);
for (const a of r.applied) {
  console.log(`  actividad=${a.actividad_id} gap=${a.minutos_agregados}min`);
  for (const b of a.bloques_creados) {
    console.log(`    created: ${b.fecha} ${b.hi}-${b.hf} (${b.len}min)`);
  }
}

// Check what got inserted on 29
const blocks29 = await prisma.horario_usuario.findMany({
  where: { usuario_id: UID, estado: true, fecha: new Date("2026-06-29T00:00:00Z") },
});
console.log(`\nBlocks on 2026-06-29: ${blocks29.length}`);
for (const b of blocks29) {
  console.log(`  act=${b.actividad_id} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)}`);
}

await prisma.$disconnect();
