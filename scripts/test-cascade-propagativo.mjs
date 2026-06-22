// Test end-to-end del cascade propagativo.
// Crea una actividad con bloques en 3 días, ejecuta placeActivity
// con una reunión que cae sobre el bloque del día 1, y verifica
// que el gap dejado por la reunión se absorbe en los días siguientes
// (vía expansión de bloques de la misma actividad O vía overflow a
// huecos libres).

import prisma from "../src/config/db.js";
import schedulerService from "../src/services/scheduler.service.js";

const TEST_USER_ID = 20;
const TEST_FECHA = "2026-06-22";

const toTime = (h, m = 0) => new Date(Date.UTC(1970, 0, 1, h, m, 0));
const toDate = (s) => new Date(`${s}T00:00:00`);

let testActividadId = null;
let testHorarioIds = [];

try {
  // 1) Crear actividad de prueba con 4 bloques:
  //    - 22/06 08:00-13:00 (5h, mañana)
  //    - 22/06 15:00-19:00 (4h, tarde)   <- la reunión parte este
  //    - 23/06 15:00-16:00 (1h)          <- debe expandirse a 15:00-17:00 (+1h gap)
  //    - 24/06 15:00-17:00 (2h)          <- segundo bloque, también absorbido
  const actividad = await prisma.actividades.create({
    data: {
      usuario_id: TEST_USER_ID,
      estado: true,
      estado_progreso: "pendiente",
      prioridad: "MEDIA",
      bloqueada: false,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
  testActividadId = actividad.id;
  console.log(`Actividad de prueba creada: id=${testActividadId}`);

  const bloques = [
    { hi: 8, hf: 13, fecha: "2026-06-22", len: 300 },
    { hi: 15, hf: 19, fecha: "2026-06-22", len: 240 },
    { hi: 15, hf: 16, fecha: "2026-06-23", len: 60 },
    { hi: 15, hf: 17, fecha: "2026-06-24", len: 120 },
  ];
  for (const b of bloques) {
    const created = await prisma.horario_usuario.create({
      data: {
        actividad_id: testActividadId,
        usuario_id: TEST_USER_ID,
        fecha: toDate(b.fecha),
        hora_inicio: toTime(b.hi),
        hora_fin: toTime(b.hf),
        estado: true,
        tipo: "reunion",
        categoria: "test",
        duracion_minutos: b.len,
      },
    });
    testHorarioIds.push(created.id);
    console.log(`  Bloque: id=${created.id} ${b.fecha} ${b.hi}:00-${b.hf}:00`);
  }

  // 2) Ejecutar placeActivity: reunión de 1h a las 16:00-17:00 el 22/06.
  console.log("");
  console.log("=== Ejecutando placeActivity ===");
  console.log("Reunión: 22/06 16:00-17:00 (1h)");
  const plan = await schedulerService.placeActivity(
    TEST_USER_ID,
    TEST_FECHA,
    60,
    { horaInicio: 16 * 60, splittable: true, deadline: null },
  );

  // 3) Verificaciones.
  console.log("");
  console.log("=== Verificaciones ===");
  let ok = true;
  const mySplit = plan.splits.find((s) => s.actividad_id === testActividadId);
  if (!mySplit) {
    console.log("FAIL: no hay split de la actividad de prueba");
    ok = false;
  } else {
    console.log(
      `Split de actividad ${testActividadId}: before=${mySplit.before?.hi}-${mySplit.before?.hf} after=${mySplit.after?.hi}-${mySplit.after?.hf}`,
    );
    const cm = mySplit.cascadeMoves || [];
    console.log(`cascadeMoves (${cm.length}):`);
    cm.forEach((m) =>
      console.log(`  horario_id=${m.horario_id} → ${m.hi}-${m.hf} fecha=${m.fecha}`),
    );

    // Verificar que el gap de 1h se absorbió en los días 23/06 o 24/06.
    // Hay dos formas válidas:
    //   a) cascadeMove: bloque 23/06 15:00-16:00 se expandió a 15:00-17:00.
    //   b) overflow: bloque NUEVO en 23/06 hueco libre (ej. 08:00-09:00).
    // Cualquiera de las dos es válida — la nueva PHASE A absorbe primero
    // en huecos libres, lo cual es preferible a reorganizar otras
    // actividades.
    const cm23 = cm.find(
      (m) => m.horario_id === testHorarioIds[2] && m.fecha === "2026-06-23",
    );
    const overflow23 = (mySplit.overflow || []).filter(
      (o) => o.fecha === "2026-06-23",
    );
    const totalAbsorbed23 =
      (cm23 ? cm23.len - 60 : 0) + overflow23.reduce((acc, o) => acc + o.len, 0);
    if (totalAbsorbed23 >= 60) {
      console.log(
        `OK: gap de 60min absorbido en 23/06 (cascadeMove=${cm23 ? "sí" : "no"}, overflow=${overflow23.length} bloques)`,
      );
    } else {
      console.log(
        `FAIL: gap NO absorbido en 23/06 (esperaba ≥60min, obtuve ${totalAbsorbed23}min)`,
      );
      ok = false;
    }

    if (cm23) {
      console.log(
        `  cascadeMove de A3: ${cm23.hi}-${cm23.hf} (len=${cm23.len})`,
      );
    }
    if (overflow23.length > 0) {
      console.log(
        `  overflow en 23/06: ${overflow23.map((o) => `${o.hi}-${o.hf} (${o.len}min)`).join(", ")}`,
      );
    }

    // Verificar que el bloque 24/06 (1h después del expandido) absorbe el resto del gap si queda algo.
    // Aquí el bloque 23/06 absorbe el 1h completo, así que el 24/06 no se toca.
    const cm24 = cm.find((m) => m.horario_id === testHorarioIds[3]);
    if (cm24) {
      console.log(
        "NOTA: bloque 24/06 sí se reorganizó (gap > 1h).",
      );
    } else {
      console.log(
        "OK: bloque 24/06 no se tocó (gap absorbido en 23/06, sin conflicto).",
      );
    }
  }
  console.log("");
  console.log(ok ? "PASS" : "FAIL");
} catch (e) {
  console.error("ERROR:", e);
} finally {
  if (testHorarioIds.length > 0) {
    await prisma.horario_usuario.deleteMany({
      where: { id: { in: testHorarioIds } },
    });
    console.log(`Limpiados ${testHorarioIds.length} horario_usuario`);
  }
  if (testActividadId) {
    await prisma.actividades.delete({ where: { id: testActividadId } });
    console.log(`Limpiada actividad ${testActividadId}`);
  }
  await prisma.$disconnect();
}