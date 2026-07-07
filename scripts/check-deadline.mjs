import "dotenv/config";
import prisma from "../src/config/db.js";

const a2 = await prisma.actividades.findUnique({
  where: { id: 2 },
  select: { id: true, tiempo_estimado_minutos: true, prospecto_id: true, prospectos: { select: { fecha_entrega: true } } },
});
console.log("Actividad 2:", a2);
if (a2?.prospectos?.fecha_entrega) {
  const f = a2.prospectos.fecha_entrega;
  console.log(`  fecha_entrega: ${f.toISOString()}`);
  console.log(`  fecha_entrega.getUTCDate: ${f.getUTCDate()}`);
}
await prisma.$disconnect();
