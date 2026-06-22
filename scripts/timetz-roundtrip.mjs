import prisma from "../src/config/db.js";

// Insert a known time, read it back, observe the round-trip.
const dateUTC = new Date(Date.UTC(1970, 0, 1, 10, 0, 0)); // 10:00 UTC
console.log("[test] JS Date to send:", dateUTC.toISOString());
console.log("[test] Bogota local:", dateUTC.toLocaleString("en-US", { timeZone: "America/Bogota" }));

// Use a fresh actividad+slot to avoid touching user 20's data.
const usuario = await prisma.usuarios.findFirst({ where: { rol_id: 1 }, select: { id: true } });
const tarea = await prisma.tarea.findFirst({ select: { id: true } });
const prospecto = await prisma.prospectos.findFirst({ select: { id: true } });
if (!usuario || !tarea || !prospecto) throw new Error("missing seed data");

const actividad = await prisma.actividades.create({
  data: {
    prospecto_id: prospecto.id,
    tarea_id: tarea.id,
    usuario_id: usuario.id,
    estado_progreso: "pendiente",
    estado: true,
    fecha_inicio: new Date("2026-06-18"),
    hora_inicio: dateUTC,
    tiempo_estimado_minutos: 30,
    created_at: new Date(),
    updated_at: new Date(),
  },
});

const hu = await prisma.horario_usuario.create({
  data: {
    actividad_id: actividad.id,
    usuario_id: usuario.id,
    fecha: new Date("2026-06-18"),
    hora_inicio: dateUTC,
    hora_fin: new Date(Date.UTC(1970, 0, 1, 11, 0, 0)),
    duracion_minutos: 60,
    estado: true,
    tipo: "actividad",
    created_at: new Date(),
    updated_at: new Date(),
  },
});

console.log("[test] inserted id:", hu.id, "hora_inicio sent:", dateUTC.toISOString());

const raw = await prisma.$queryRawUnsafe(
  `SELECT hora_inicio::text AS hi, hora_fin::text AS hf FROM horario_usuario WHERE id = $1`,
  hu.id
);
console.log("[test] raw from DB:", raw);

const read = await prisma.horario_usuario.findUnique({
  where: { id: hu.id },
  select: { hora_inicio: true, hora_fin: true },
});
console.log("[test] JS read hora_inicio:", read.hora_inicio.toISOString());
console.log("[test] JS read hora_inicio getUTCHours:", read.hora_inicio.getUTCHours());
console.log("[test] JS read hora_inicio getHours:", read.hora_inicio.getHours());

// Cleanup.
await prisma.horario_usuario.delete({ where: { id: hu.id } });
await prisma.actividades.delete({ where: { id: actividad.id } });

await prisma.$disconnect();
