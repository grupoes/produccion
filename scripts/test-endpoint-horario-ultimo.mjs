import prisma from "../src/config/db.js";

// Simula la lógica del endpoint sin necesidad del server HTTP.
async function getUltimoHorarioUsuario(usuarioId) {
  if (usuarioId == null) return { exists: false };
  const last = await prisma.horario_usuario.findFirst({
    where: { usuario_id: Number(usuarioId), estado: true },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
    select: { fecha: true, hora_inicio: true },
  });
  if (!last) return { exists: false };
  const hmsToMin = (s) => {
    if (s instanceof Date && !Number.isNaN(s.getTime())) {
      return s.getUTCHours() * 60 + s.getUTCMinutes();
    }
    return null;
  };
  const minToHHMM = (m) => `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`;
  const fmtLocalDate = (d) => {
    if (!(d instanceof Date)) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
  };
  return {
    exists: true,
    fecha: fmtLocalDate(last.fecha),
    hora_inicio: minToHHMM(hmsToMin(last.hora_inicio)),
  };
}

for (const uid of [20, 1, 999]) {
  const r = await getUltimoHorarioUsuario(uid);
  console.log(`[test] usuario ${uid}:`, r);
}
await prisma.$disconnect();
