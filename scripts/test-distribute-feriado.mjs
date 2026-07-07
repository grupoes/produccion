import "dotenv/config";
import prisma from "../src/config/db.js";
import potencialesClientesService from "../src/services/potenciales-clientes.service.js";

const UID = 24;

// Ensure user 24 has Sat jornada 08-13 only (user's actual config)
await prisma.horario_jornada_detalle.deleteMany({ where: { usuario_id: UID, dia_semana: 6 } });
await prisma.horario_jornada_detalle.create({
  data: { usuario_id: UID, dia_semana: 6, hora_inicio: new Date(Date.UTC(1970,0,1,8,0)), hora_fin: new Date(Date.UTC(1970,0,1,13,0)), estado: true },
});

// Cleanup
await prisma.horario_usuario.deleteMany({ where: { usuario_id: UID } });
await prisma.actividades.deleteMany({ where: { usuario_id: UID, id: 200 } });

// Crear actividad 200 con 1200 min (20h) starting 26/06 12:00
await prisma.actividades.create({
  data: {
    id: 200, usuario_id: UID, estado: true, estado_progreso: "pendiente",
    prioridad: "MEDIA", tiempo_estimado_minutos: 1200,
    tarea_id: 1, fecha_inicio: new Date("2026-06-26T00:00:00"),
    hora_inicio: new Date("2026-06-26T17:00:00Z"),
  },
});

console.log("Setup: act 200, 1200min, fecha_inicio 26/06 12:00");

// Llamar distributeAcrossJornada directamente
await prisma.$transaction(async (tx) => {
  const segments = await potencialesClientesService["#distributeAcrossJornada"] || null;
  // Method is private, use createHorarioUsuarioSiNoEsValorador instead
  const horaInicio = new Date("2026-06-26T17:00:00Z"); // 12:00 local
  const r = await potencialesClientesService.createHorarioUsuarioSiNoEsValorador(tx, {
    usuarioId: UID,
    actividadId: 200,
    fecha: new Date(2026, 5, 26),
    horaInicio,
    horaFin: new Date(horaInicio.getTime() + 1200 * 60_000),
    duracionMinutos: 1200,
    tipo: "actividad",
    categoria: "potencial_cliente",
  });
  console.log("\nResultado createHorarioUsuarioSiNoEsValorador:");
  if (Array.isArray(r)) {
    for (const s of r) console.log(`  ${s.fecha?.toISOString?.()?.slice(0,10) || s.fecha} ${s.hora_inicio?.toISOString?.()?.slice(11,19)}-${s.hora_fin?.toISOString?.()?.slice(11,19)} dur=${s.duracion_minutos}`);
  } else if (r) {
    console.log(`  1 row: ${r.fecha?.toISOString?.()?.slice(0,10)} ${r.hora_inicio?.toISOString?.()?.slice(11,19)}-${r.hora_fin?.toISOString?.()?.slice(11,19)}`);
  }
});

// Verificar
const all = await prisma.horario_usuario.findMany({
  where: { usuario_id: UID, estado: true },
  orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
});
console.log("\nBloques creados:");
let on29 = 0;
for (const b of all) {
  const f = b.fecha.toISOString().slice(0,10);
  if (f === "2026-06-29") on29++;
  console.log(`  ${f} ${b.hora_inicio.toISOString().slice(11,19)}-${b.hora_fin.toISOString().slice(11,19)}`);
}
console.log(`\nBloques en 29/06 (FERIADO): ${on29}`);

await prisma.$disconnect();
