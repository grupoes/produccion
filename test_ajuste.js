import { PrismaClient } from '@prisma/client';
import reunionesService from './src/services/reuniones-asistente.service.js';

const prisma = new PrismaClient();

async function printSchedule() {
  const acts = await prisma.$queryRawUnsafe(`
    SELECT hu.actividad_id, hu.fecha, hu.hora_inicio, hu.hora_fin, hu.estado
    FROM horario_usuario hu
    WHERE hu.fecha >= '2026-07-06' AND hu.fecha <= '2026-07-14'
    ORDER BY hu.fecha, hu.hora_inicio
  `);
  
  for (const r of acts) {
    const d = new Date(r.fecha).toISOString().slice(0, 10);
    const ini = r.hora_inicio; // string from timetz or Date
    const fin = r.hora_fin;
    console.log(`${r.actividad_id}\t"${d}"\t"${ini}"\t"${fin}"\t${r.estado}`);
  }
}

async function main() {
  console.log('--- Antes del ajuste ---');
  await printSchedule();
  
  console.log('\n--- Ajustando actividad 4 (asumiendo que existe y es la de julio 7) a 120 minutos ---');
  try {
    const res = await reunionesService.ajustarDuracion({ actividadId: 4, nuevaDuracionMinutos: 120 });
    console.log('Resultado ajuste:', res);
  } catch (e) {
    console.error('Error al ajustar:', e);
  }
  
  console.log('\n--- Después del ajuste ---');
  await printSchedule();
}

main().catch(console.error).finally(() => prisma.$disconnect());
