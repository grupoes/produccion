// Test E2E de la validación de fecha (feriado/cumpleaños) al crear
// cliente con actividades. Verifica que:
//   A) Tarea NO-reunión en feriado → BAD_REQUEST
//   B) Tarea NO-reunión en cumple del usuario → BAD_REQUEST
//   C) Tarea REUNIÓN en feriado → BAD_REQUEST (post-fix)
//   D) Tarea REUNIÓN en cumple del usuario → BAD_REQUEST (post-fix)
//   E) Tarea NO-reunión en día normal → OK
//   F) Tarea REUNIÓN en día normal → OK
//   G) Feriado deshabilitado (estado=false) → no bloquea
//   H) Jornada partida: actividad cabe en la suma de bloques → OK
//   I) Jornada partida sin fecha_entrega: actividad NO cabe → BAD_REQUEST
//   J) Un solo bloque largo que cubre toda la actividad → OK
//   K) Con fecha_entrega: actividad cabe sumando varios días → OK
//   L) Con fecha_entrega: actividad NO cabe sumando los días → BAD_REQUEST
//   M) Días feriados en el rango NO cuentan para el cupo

import "dotenv/config";
import prisma from "../src/config/db.js";
import clientesService from "../src/services/clientes.service.js";

const TEST_USER_ID = 20;
const TEST_CELULAR = "999999001";
let createdProspectoIds = [];
let createdActividadIds = [];
let createdFeriadoIds = [];
let backupPersona = null;

async function cleanup() {
  // horario_usuario referencia actividades → borrar antes.
  await prisma.horario_usuario.deleteMany({
    where: { usuario_id: TEST_USER_ID },
  });
  if (createdActividadIds.length) {
    await prisma.actividades.deleteMany({
      where: { id: { in: createdActividadIds } },
    });
  }
  if (createdProspectoIds.length) {
    // Borrar dependencias antes que prospectos.
    await prisma.historial_estados_prospecto.deleteMany({
      where: { prospecto_id: { in: createdProspectoIds } },
    });
    await prisma.prospecto_persona.deleteMany({
      where: { prospecto_id: { in: createdProspectoIds } },
    });
    await prisma.drive_links.deleteMany({
      where: { prospecto_id: { in: createdProspectoIds } },
    });
    await prisma.notificaciones.deleteMany({
      where: { mensaje: { contains: "TEST_VALIDAR_FECHA" } },
    });
    await prisma.prospectos.deleteMany({
      where: { id: { in: createdProspectoIds } },
    });
  }
  if (createdFeriadoIds.length) {
    await prisma.feriados.deleteMany({
      where: { id: { in: createdFeriadoIds } },
    });
  }
  await prisma.horario_jornada_detalle.deleteMany({
    where: { usuario_id: TEST_USER_ID },
  });
  if (backupPersona) {
    await prisma.personas.update({
      where: { id: backupPersona.id },
      data: { fecha_nacimiento: backupPersona.fecha_nacimiento },
    });
  }
  createdActividadIds = [];
  createdProspectoIds = [];
  createdFeriadoIds = [];
  backupPersona = null;
}

async function ensureJornada(opts = {}) {
  const bloques = opts.bloques || [
    [8, 0, 13, 0],
    [15, 0, 19, 0],
  ];
  for (const d of [1, 2, 3, 4, 5]) {
    for (const [hiH, hiM, hfH, hfM] of bloques) {
      await prisma.horario_jornada_detalle.create({
        data: {
          usuario_id: TEST_USER_ID,
          dia_semana: d,
          hora_inicio: new Date(Date.UTC(1970, 0, 1, hiH, hiM)),
          hora_fin: new Date(Date.UTC(1970, 0, 1, hfH, hfM)),
          estado: true,
        },
      });
    }
  }
}

async function setupPersonaBackup() {
  const persona = await prisma.personas.findFirst({
    where: { usuarios: { some: { id: TEST_USER_ID } } },
    select: { id: true, fecha_nacimiento: true },
  });
  backupPersona = persona || null;
}

async function setFechaNacimientoUsuario(mes, dia) {
  const persona = await prisma.personas.findFirst({
    where: { usuarios: { some: { id: TEST_USER_ID } } },
  });
  if (!persona) return;
  await prisma.personas.update({
    where: { id: persona.id },
    data: { fecha_nacimiento: new Date(Date.UTC(1990, mes - 1, dia)) },
  });
}

async function addFeriado(fechaStr, nombre, estado = true) {
  const f = await prisma.feriados.create({
    data: {
      fecha: new Date(`${fechaStr}T00:00:00`),
      nombre,
      estado,
    },
  });
  createdFeriadoIds.push(f.id);
  return f.id;
}

function makePayload(tareaId, fechaAsig, duracionMinutos = 60, fechaEntrega = null) {
  return {
    cliente: {
      titulo_prospecto: "TEST_VALIDAR_FECHA",
      fecha_entrega: fechaEntrega,
      contactos: [
        {
          nombres: "Contacto",
          apellidos: "Test",
          celular: TEST_CELULAR,
        },
      ],
    },
    actividades: [
      {
        tarea_id: tareaId,
        usuario_asignado_id: TEST_USER_ID,
        fecha_asignacion: fechaAsig,
        hora_inicio: "09:00",
        duracion_minutos: duracionMinutos,
      },
    ],
  };
}

async function callCreate(payload) {
  try {
    const r = await clientesService.create(payload);
    if (r?.actividades?.length) {
      for (const a of r.actividades) {
        createdActividadIds.push(a.id);
      }
    }
    if (r?.id) createdProspectoIds.push(r.id);
    return { ok: true, r };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

function assert(cond, label) {
  if (cond) {
    console.log(`  OK ${label}`);
    return true;
  }
  console.log(`  FAIL ${label}`);
  return false;
}

// Suma todos los asserts y devuelve true sólo si todos pasan.
function checkAll(label, fn) {
  const results = fn();
  const all = results.every(Boolean);
  console.log(`  ${all ? "✓" : "✗"} ${label}: ${results.filter(Boolean).length}/${results.length} asserts OK`);
  return all;
}

// Cada escenario devuelve `true` solo si TODAS las assertions pasan.
async function runEscenarioA() {
  console.log("\n=== A: NO-reunión en feriado → BAD_REQUEST ===");
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada();
  await addFeriado("2026-07-04", "Aniversario");
  await setFechaNacimientoUsuario(1, 15);
  const r = await callCreate(makePayload(1, "2026-07-04"));
  return checkAll("A", () => [
    assert(r.ok === false, "create rechazó"),
    assert(r.code === "BAD_REQUEST", `code BAD_REQUEST (got ${r.code})`),
    assert(/feriado/i.test(r.message), `mensaje menciona feriado (got "${r.message}")`),
  ]);
}

async function runEscenarioB() {
  console.log("\n=== B: NO-reunión en cumple → BAD_REQUEST ===");
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada();
  await setFechaNacimientoUsuario(7, 15);
  const r = await callCreate(makePayload(1, "2026-07-15"));
  return checkAll("B", () => [
    assert(r.ok === false, "create rechazó"),
    assert(r.code === "BAD_REQUEST", `code BAD_REQUEST (got ${r.code})`),
    assert(/cumple/i.test(r.message), `mensaje menciona cumple (got "${r.message}")`),
  ]);
}

async function runEscenarioC() {
  console.log("\n=== C: REUNIÓN en feriado → BAD_REQUEST (post-fix) ===");
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada();
  await addFeriado("2026-07-04", "Aniversario");
  await setFechaNacimientoUsuario(1, 15);
  const r = await callCreate(makePayload(3, "2026-07-04"));
  return checkAll("C", () => [
    assert(r.ok === false, "REUNIÓN en feriado rechazada"),
    assert(r.code === "BAD_REQUEST", `code BAD_REQUEST (got ${r.code})`),
    assert(/feriado/i.test(r.message), `mensaje menciona feriado (got "${r.message}")`),
  ]);
}

async function runEscenarioD() {
  console.log("\n=== D: REUNIÓN en cumple → BAD_REQUEST (post-fix) ===");
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada();
  await setFechaNacimientoUsuario(7, 15);
  const r = await callCreate(makePayload(3, "2026-07-15"));
  return checkAll("D", () => [
    assert(r.ok === false, "REUNIÓN en cumple rechazada"),
    assert(r.code === "BAD_REQUEST", `code BAD_REQUEST (got ${r.code})`),
    assert(/cumple/i.test(r.message), `mensaje menciona cumple (got "${r.message}")`),
  ]);
}

async function runEscenarioE() {
  console.log("\n=== E: NO-reunión en día normal → OK ===");
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada();
  await setFechaNacimientoUsuario(1, 15);
  const r = await callCreate(makePayload(1, "2026-07-22"));
  return checkAll("E", () => [assert(r.ok === true, "create aceptó")]);
}

async function runEscenarioF() {
  console.log("\n=== F: REUNIÓN en día normal → OK ===");
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada();
  await setFechaNacimientoUsuario(1, 15);
  const r = await callCreate(makePayload(3, "2026-07-22"));
  return checkAll("F", () => [assert(r.ok === true, "REUNIÓN en día normal aceptada")]);
}

async function runEscenarioG() {
  console.log("\n=== G: feriado deshabilitado (estado=false) no bloquea ===");
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada();
  // Miércoles laborable, feriado desactivado.
  await addFeriado("2026-07-22", "Aniversario Pasado", false);
  await setFechaNacimientoUsuario(1, 15);
  const r = await callCreate(makePayload(1, "2026-07-22"));
  return checkAll("G", () => [assert(r.ok === true, "feriado inactivo no bloquea")]);
}

async function runEscenarioH() {
  console.log(
    "\n=== H: jornada partida 5h+4h=9h, actividad 8h → cabe en la suma → OK ===",
  );
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada(); // 08-13 y 15-19 = 9h total
  await setFechaNacimientoUsuario(1, 15);
  // Miércoles 22/07/2026 (laborable).
  const r = await callCreate(makePayload(1, "2026-07-22", 8 * 60));
  return checkAll("H", () => [
    assert(r.ok === true, "actividad 8h cabe en jornada partida 9h"),
  ]);
}

async function runEscenarioI() {
  console.log(
    "\n=== I: jornada partida 5h+4h=9h, actividad 11h → NO cabe ni en suma → BAD_REQUEST ===",
  );
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada(); // 08-13 y 15-19 = 9h total
  await setFechaNacimientoUsuario(1, 15);
  const r = await callCreate(makePayload(1, "2026-07-22", 11 * 60));
  return checkAll("I", () => [
    assert(r.ok === false, "actividad 11h rechazada (suma 9h insuficiente)"),
    assert(r.code === "BAD_REQUEST", `code BAD_REQUEST (got ${r.code})`),
    assert(
      /suficiente tiempo/i.test(r.message),
      `mensaje menciona falta de tiempo (got "${r.message}")`,
    ),
  ]);
}

async function runEscenarioJ() {
  console.log(
    "\n=== J: un solo bloque 08-19 (11h), actividad 11h → OK ===",
  );
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada({ bloques: [[8, 0, 19, 0]] }); // 11h continuas
  await setFechaNacimientoUsuario(1, 15);
  const r = await callCreate(makePayload(1, "2026-07-22", 11 * 60));
  return checkAll("J", () => [
    assert(r.ok === true, "actividad 11h cabe en bloque 08-19"),
  ]);
}

async function runEscenarioK() {
  console.log(
    "\n=== K: fecha_entrega a 2 días, jornada 9h/día, actividad 11h → OK (9+9=18h) ===",
  );
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada(); // 08-13 y 15-19 = 9h/día laborable
  await setFechaNacimientoUsuario(1, 15);
  // Miércoles 22/07 → viernes 24/07 = 3 días = 27h disponibles.
  // Actividad 11h cabe.
  const r = await callCreate(
    makePayload(1, "2026-07-22", 11 * 60, "2026-07-24"),
  );
  return checkAll("K", () => [
    assert(r.ok === true, "actividad 11h cabe en 3 días de 9h"),
  ]);
}

async function runEscenarioL() {
  console.log(
    "\n=== L: actividad 30h vs fecha_entrega a 2 días → BAD_REQUEST (insuficiente) ===",
  );
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada(); // 9h/día
  await setFechaNacimientoUsuario(1, 15);
  // Rango 22-24/07. El 23/07 es feriado real en BD (Fuerza Aérea del
  // Perú), así que sólo contamos 22 y 24 = 18h = 1080 min.
  const r = await callCreate(
    makePayload(1, "2026-07-22", 30 * 60, "2026-07-24"),
  );
  return checkAll("L", () => [
    assert(r.ok === false, "actividad 30h NO cabe en el rango"),
    assert(r.code === "BAD_REQUEST", `code BAD_REQUEST (got ${r.code})`),
    assert(
      /1080 min/.test(r.message),
      `mensaje refleja 18h disponibles (got "${r.message}")`,
    ),
  ]);
}

async function runEscenarioM() {
  console.log(
    "\n=== M: feriado intermedio en el rango NO suma al cupo ===",
  );
  await cleanup();
  await setupPersonaBackup();
  await ensureJornada(); // 9h/día laborable
  await setFechaNacimientoUsuario(1, 15);
  // El 23/07 ya es feriado real en BD (Fuerza Aérea del Perú). No
  // necesitamos agregar uno — basta con verificar que el cupo disponible
  // refleja los 2 días restantes (22 y 24).
  const r = await callCreate(
    makePayload(1, "2026-07-22", 20 * 60, "2026-07-24"),
  );
  return checkAll("M", () => [
    assert(r.ok === false, "20h NO cabe: feriado intermedio reduce el cupo"),
    assert(
      /1080 min/.test(r.message),
      `mensaje refleja 18h = 1080 min (got "${r.message}")`,
    ),
  ]);
}

async function main() {
  let allOk = true;
  try {
    allOk = (await runEscenarioA()) && allOk;
    allOk = (await runEscenarioB()) && allOk;
    allOk = (await runEscenarioC()) && allOk;
    allOk = (await runEscenarioD()) && allOk;
    allOk = (await runEscenarioE()) && allOk;
    allOk = (await runEscenarioF()) && allOk;
    allOk = (await runEscenarioG()) && allOk;
    allOk = (await runEscenarioH()) && allOk;
    allOk = (await runEscenarioI()) && allOk;
    allOk = (await runEscenarioJ()) && allOk;
    allOk = (await runEscenarioK()) && allOk;
    allOk = (await runEscenarioL()) && allOk;
    allOk = (await runEscenarioM()) && allOk;
    console.log("\n=== RESULTADO FINAL ===");
    console.log(allOk ? "PASS" : "FAIL");
  } catch (e) {
    console.error("ERROR:", e.message, e.stack);
    allOk = false;
  } finally {
    await cleanup();
    await prisma.$disconnect();
    process.exit(allOk ? 0 : 1);
  }
}

main();
