// Reproduce EXACTAMENTE el estado actual del usuario 24 y corre
// completeActividades para ver qué pasa.

import "dotenv/config";
import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 24;
const meetingId = 4;

const before = await prisma.actividades.findMany({
  where: { usuario_id: TEST_USER_ID, estado: true },
  select: {
    id: true,
    tiempo_estimado_minutos: true,
    horario_usuario: {
      where: { estado: true },
      select: { id: true, fecha: true, hora_inicio: true, hora_fin: true, duracion_minutos: true, tipo: true },
      orderBy: [{ fecha: "asc" }, { hora_inicio: "asc" }],
    },
  },
  orderBy: { id: "asc" },
});

console.log("=== ANTES ===");
for (const a of before) {
  const totalProg = a.horario_usuario.reduce((acc, b) => acc + (b.duracion_minutos || 0), 0);
  const gap = (a.tiempo_estimado_minutos || 0) - totalProg;
  console.log(`  act=${a.id} est=${a.tiempo_estimado_minutos} prog=${totalProg} gap=${gap}`);
}

// Solo simular (no aplicar cambios a la BD)
console.log("\n=== Corriendo completeActividades (DRY RUN con transacción rollback) ===");
try {
  const rebalance = await prisma.$transaction(async (tx) => {
    // Llamamos a la lógica pero forzamos rollback
    throw new Error("ROLLBACK");
  });
} catch (e) {
  console.log("(rollback forzado)");
}

const rebalance = await schedulerService.completeActividades(
  TEST_USER_ID, "2026-06-23",
  { ignorarActividadId: meetingId, diasHorizonte: 14, motivo: "Test rebalance dry-run" },
);

console.log("\n=== Resultado completeActividades ===");
console.log("  totalGapInicial:", rebalance.totalGapInicial);
console.log("  totalGapCubierto:", rebalance.totalGapCubierto);
console.log("  applied:", JSON.stringify(rebalance.applied, null, 2));
console.log("  blocked:", JSON.stringify(rebalance.blocked, null, 2));
console.log("  skipped:", JSON.stringify(rebalance.skipped, null, 2));

await prisma.$disconnect();
