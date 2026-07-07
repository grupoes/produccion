import prisma from "../src/config/db.js";

const blocks = await prisma.$queryRawUnsafe(`
  SELECT hu.id, hu.actividad_id, hu.fecha::text, hu.hora_inicio::text, hu.hora_fin::text,
         hu.duracion_minutos, hu.tipo, hu.categoria, hu.usuario_id,
         a.tiempo_estimado_minutos, a.estado as act_estado, a.bloqueada, a.estado_progreso,
         a.prioridad, p.id as prospecto_id, p.fecha_entrega::text
    FROM horario_usuario hu
    LEFT JOIN actividades a ON a.id = hu.actividad_id
    LEFT JOIN prospectos p ON p.id = a.prospecto_id
   WHERE hu.usuario_id = 24 AND hu.estado = true
   ORDER BY hu.actividad_id, hu.fecha, hu.hora_inicio
`);
console.log(JSON.stringify(blocks, null, 2));

console.log("\n=== TOTALES POR ACTIVIDAD ===");
const totals = await prisma.$queryRawUnsafe(`
  SELECT a.id, a.tiempo_estimado_minutos::int as est, a.estado, a.bloqueada, a.prioridad,
         COALESCE(SUM(hu.duracion_minutos), 0)::int as total
    FROM actividades a
    LEFT JOIN horario_usuario hu ON hu.actividad_id = a.id AND hu.estado = true
   WHERE a.usuario_id = 24
   GROUP BY a.id, a.tiempo_estimado_minutos, a.estado, a.bloqueada, a.prioridad
   ORDER BY a.id
`);
console.log(JSON.stringify(totals, null, 2));

await prisma.$disconnect();
