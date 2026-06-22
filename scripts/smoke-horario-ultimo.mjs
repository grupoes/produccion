// Smoke test que simula el flujo end-to-end del helper.
import calendarioAsistenteService from "../src/services/calendario-asistente.service.js";

for (const uid of [20, 1, 999, null]) {
  const r = await calendarioAsistenteService.getUltimoHorarioUsuario(uid);
  console.log(`usuario ${uid}:`, r);
}
process.exit(0);
