import * as XLSX from "xlsx";
import prisma from "../config/db.js";
import ActividadEstadoHistorialService from "./actividad-estado-historial.service.js";

const PRIORIDADES = ["ALTA", "MEDIA", "BAJA"];
const ROL_VALORADOR_ID = 10;

const POTENCIAL_COLOR_PALETTE = [
  "#dc3545", "#f59e0b", "#3b82f6",
  "#10b981", "#8b5cf6", "#0ea5e9",
];
const pickRandomColor = () =>
  POTENCIAL_COLOR_PALETTE[Math.floor(Math.random() * POTENCIAL_COLOR_PALETTE.length)];

const norm = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const matchesAny = (name, list) => {
  const n = norm(name);
  return list.some((p) => n.includes(p));
};

const isBirthdayOn = (fechaNacimiento, fechaLocal) => {
  if (!fechaNacimiento) return false;
  const fn = fechaNacimiento instanceof Date ? fechaNacimiento : new Date(fechaNacimiento);
  if (Number.isNaN(fn.getTime())) return false;
  return (
    fn.getUTCDate() === fechaLocal.getDate() &&
    fn.getUTCMonth() === fechaLocal.getMonth()
  );
};

const isSameLocalDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getYmdLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// YMD usando componentes UTC. Necesario porque Prisma devuelve las columnas
// `@db.Date` como Date a medianoche UTC, y `getYmdLocal` extrae la hora local
// del server (p.ej. en GMT-5, midnight UTC del 2026-07-28 sale como 2026-07-27),
// lo que rompe la comparación contra la fecha local que sí queremos chequear.
const getYmdUtc = (d) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

// Parsea "YYYY-MM-DD" como fecha LOCAL (no UTC) para no caer en off-by-one
// en servidores al oeste de UTC.
const parseLocalYmd = (s) => {
  if (s == null) return null;
  if (s instanceof Date) return s;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toMinFromHms = (s) => {
  if (s == null) return null;
  if (s instanceof Date) return s.getHours() * 60 + s.getMinutes();
  const m = String(s).match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

const minutosToHms = (m) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(h)}:${p(mm)}:00`;
};

const toTime = (s) => {
  if (s == null || s === "") return null;
  if (s instanceof Date) return s;
  const m = String(s).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(1970, 0, 1, Number(m[1]), Number(m[2]), Number(m[3] || 0)));
};

const DAY_ID_BY_GETDAY = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };

class ImportacionService {

  async getAllTareas() {
    return prisma.tarea.findMany({
      where: { estado: true },
      select: { id: true, nombre: true, horas_estimadas: true },
      orderBy: { nombre: "asc" },
    });
  }

  getSheetInfo(buffer) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    return wb.SheetNames.map((name) => ({
      name,
      rowCount: XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }).length,
    }));
  }

  parseExcelAll(buffer) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const all = [];
    wb.SheetNames.forEach((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
      rows.forEach((row, i) => {
        all.push({ sheetName, row, fila: i + 2 });
      });
    });
    return all;
  }

  parseExcel(buffer) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    return rows;
  }

  validateRows(rows, sheetVendedores) {
    const errores = [];
    const advertencias = [];
    const validos = [];
    rows.forEach((item) => {
      const row = item.row;
      const fila = item.fila;
      const vendedorId = sheetVendedores ? (sheetVendedores[item.sheetName] ? Number(sheetVendedores[item.sheetName]) : null) : null;
      const cliente = String(row.CLIENTE || "").trim();
      const celular = String(row.CELULAR || "").trim();
      const descripcion = String(row.DESCRIPCION || "").trim();
      const prioridad = String(row.PRIORIDAD || "").trim().toUpperCase();

      if (!cliente) errores.push(`Fila ${fila}: CLIENTE es requerido.`);
      if (!celular) advertencias.push(`Fila ${fila}: CELULAR vacío. Se creará el prospecto sin teléfono de contacto.`);

      if (prioridad && !PRIORIDADES.includes(prioridad)) {
        errores.push(`Fila ${fila}: PRIORIDAD debe ser ALTA, MEDIA o BAJA.`);
      }

      validos.push({ cliente, celular, descripcion, prioridad, row, fila, vendedorId, sheetName: item.sheetName });
    });
    return { errores, advertencias, validos };
  }

  async resolveCatalogos(rows) {
    const nombresInstituciones = [...new Set(rows.map((r) => String(r.row.UNIVERSIDAD || "").trim()).filter(Boolean).map(norm))];
    const nombresNiveles = [...new Set(rows.map((r) => String(r.row.NIVEL || "").trim()).filter(Boolean).map(norm))];

    const [todasInstituciones, todasCarreras, todosNiveles] = await Promise.all([
      prisma.institucion.findMany({ where: { estado: true }, select: { id: true, nombre: true, abreviatura: true } }),
      prisma.carreras.findMany({ where: { estado: true }, select: { id: true, nombre: true, institucion_id: true } }),
      prisma.nivel_academico.findMany({ where: { estado: true }, select: { id: true, nombre: true } }),
    ]);

    const findInstitucion = (name) => {
      const n = norm(name);
      if (!n) return null;
      const exact = todasInstituciones.find(
        (item) => norm(item.nombre) === n || norm(item.abreviatura || "") === n
      );
      if (exact) return exact.id;
      const contains = todasInstituciones.find(
        (item) => norm(item.nombre).includes(n) || norm(item.abreviatura || "").includes(n)
      );
      if (contains) return contains.id;
      return todasInstituciones.find((item) => n.includes(norm(item.nombre)))?.id || null;
    };
    const findNivel = (name) => {
      const n = norm(name);
      if (!n) return null;
      const exact = todosNiveles.find((item) => norm(item.nombre) === n);
      if (exact) return exact.id;
      const contains = todosNiveles.find((item) => norm(item.nombre).includes(n));
      if (contains) return contains.id;
      return todosNiveles.find((item) => n.includes(norm(item.nombre)))?.id || null;
    };

    const instMap = {};
    for (const n of nombresInstituciones) { instMap[n] = findInstitucion(n); }

    const nivelMap = {};
    for (const n of nombresNiveles) { nivelMap[n] = findNivel(n); }

    return { instMap, nivelMap, todasCarreras };
  }

  resolveRowMatches(rows, catalogos) {
    return rows.map((row) => {
      const institucionId = row.row.UNIVERSIDAD ? catalogos.instMap[norm(String(row.row.UNIVERSIDAD).trim())] : null;
      const carreraRow = String(row.row.CARRERA || "").trim();
      let carreraId = null;
      if (carreraRow) {
        const n = norm(carreraRow);
        const buscarEn = institucionId
          ? catalogos.todasCarreras.filter((c) => c.institucion_id === institucionId)
          : catalogos.todasCarreras;
        let c = buscarEn.find((item) => norm(item.nombre) === n);
        if (!c) c = buscarEn.find((item) => norm(item.nombre).includes(n));
        if (!c) c = buscarEn.find((item) => n.includes(norm(item.nombre)));
        if (c) carreraId = c.id;
      }
      const nivelId = row.row.NIVEL ? catalogos.nivelMap[norm(String(row.row.NIVEL).trim())] : null;

      return {
        exito: true,
        cliente: row.cliente,
        celular: row.celular,
        descripcion: row.descripcion,
        fila: row.fila,
        prioridad: row.prioridad || "MEDIA",
        institucionId,
        carreraId,
        nivelId,
        link_drive: String(row.row["LINK - CARPETA"] || "").trim() || null,
        fecha_entrega: row.row["FECHA DE ENTREGA"] != null
          ? this.#serialToDate(row.row["FECHA DE ENTREGA"])
          : null,
        jefe_que_lo_valoro: (() => {
          const raw = String(row.row["JEFE QUE LO VALORO"] || "").trim();
          return raw ? raw.toUpperCase() : null;
        })(),
        auxiliar: String(row.row["AUXILIAR"] || "").trim() || null,
        contenido: [row.descripcion, row.row["JEFE QUE LO VALORO"] ? `Jefe que lo valoró: ${String(row.row["JEFE QUE LO VALORO"]).trim().toUpperCase()}` : null].filter(Boolean).join("\n"),
        vendedorId: row.vendedorId,
        sheetName: row.sheetName,
        row,
      };
    });
  }

  async getAllCatalogos() {
    const [instituciones, carreras, niveles] = await Promise.all([
      prisma.institucion.findMany({ where: { estado: true }, select: { id: true, nombre: true, abreviatura: true }, orderBy: { nombre: "asc" } }),
      prisma.carreras.findMany({ where: { estado: true }, select: { id: true, nombre: true, institucion_id: true }, orderBy: { nombre: "asc" } }),
      prisma.nivel_academico.findMany({ where: { estado: true }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    ]);
    return { instituciones, carreras, niveles };
  }

  async programarActividades(resultados, usuarioId, fechaInicio) {
    const usuario = await prisma.usuarios.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        personas: { select: { fecha_nacimiento: true } },
        tipo_jornada: { select: { nombre_jornada: true } },
      },
    });
    if (!usuario) throw Object.assign(new Error("Usuario no encontrado."), { code: "BAD_REQUEST" });
    if (!usuario.tipo_jornada?.nombre_jornada || !matchesAny(usuario.tipo_jornada.nombre_jornada, ["full time", "part time"])) {
      throw Object.assign(new Error("El usuario debe tener jornada full time o part time."), { code: "BAD_REQUEST" });
    }

    const feriados = await prisma.feriados.findMany({
      where: { estado: true },
      select: { fecha: true, nombre: true },
    });

    const startDate = new Date(fechaInicio);
    const programados = [];
    const scheduled = [];

    for (const r of resultados) {
      const minutosEst = r.duracion || 60;
      const slot = await this.#findNextSlot(usuarioId, minutosEst, feriados, programados, startDate, usuario.personas?.fecha_nacimiento);
      if (!slot) {
        scheduled.push({ ...r, exito: false, error: "No hay slot disponible en los próximos 30 días." });
        continue;
      }
      programados.push({ fechaLocal: slot.fechaLocal, ini: slot.ini, fin: slot.fin });
      scheduled.push({
        ...r,
        fecha_asignacion: getYmdLocal(slot.fechaLocal),
        hora_inicio: minutosToHms(slot.ini).slice(0, 5),
        hora_fin: minutosToHms(slot.fin).slice(0, 5),
      });
    }
    return scheduled;
  }

  async ejecutarImportacion(resultados, usuarioRegisterId = null) {
    const creados = { prospectos: 0, actividades: 0, errores: [] };

    for (const r of resultados) {
      if (!r.exito) {
        creados.errores.push({ cliente: r.cliente, error: r.error });
        continue;
      }
      if (!r._tarea_id) {
        creados.errores.push({ cliente: r.cliente, error: "No se seleccionó una tarea." });
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const nombresApellidos = this.#splitNombre(r.cliente);
          const trunc = (s, max) => s ? String(s).trim().substring(0, max) : null;

          const persona = await tx.personas.create({
            data: {
              nombres: trunc(nombresApellidos.nombres, 50),
              apellidos: trunc(nombresApellidos.apellidos, 50),
              celular: trunc(r.celular, 15),
              estado: true,
            },
          });

          const fechaEntrega = r.fecha_entrega
            ? (() => {
                const m = String(r.fecha_entrega).match(/^(\d{4})-(\d{2})-(\d{2})/);
                return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
              })()
            : null;

          const fechaAsig = parseLocalYmd(r.fecha_asignacion);

          const prospecto = await tx.prospectos.create({
            data: {
              titulo_prospecto: r.cliente,
              ...(r.carreraId ? { carreras: { connect: { id: r.carreraId } } } : {}),
              ...(r.nivelId ? { nivel_academico: { connect: { id: r.nivelId } } } : {}),
              fecha_entrega: fechaEntrega,
              prioridad: r.prioridad,
              contenido: r.contenido,
              link_drive: r.link_drive,
              estado_cliente: "cliente",
              fecha_contacto: new Date(),
              estado: true,
            },
          });

          await tx.prospecto_persona.create({
            data: { prospecto_id: prospecto.id, persona_id: persona.id },
          });

          if (r.link_drive) {
            await tx.drive_links.create({
              data: {
                prospecto_id: prospecto.id,
                link_drive: r.link_drive,
                created_at: new Date(),
              },
            });
          }

          const actividad = await tx.actividades.create({
            data: {
              prospecto_id: prospecto.id,
              tarea_id: r._tarea_id,
              usuario_id: usuarioRegisterId,
              usuario_register: r.vendedorId ? Number(r.vendedorId) : null,
              prioridad: r.prioridad || null,
              estado_progreso: "pendiente",
              estado: true,
              fecha_inicio: fechaAsig,
              hora_inicio: toTime(r.hora_inicio),
              tiempo_estimado_minutos: r.duracion,
              color: pickRandomColor(),
              created_at: new Date(),
              updated_at: new Date(),
            },
          });

          await ActividadEstadoHistorialService.transicion(
            tx, actividad.id, "pendiente", new Date(),
            { creadaEn: actividad.created_at },
          );

          const isValorador = await this.#isUserValorador(tx, usuarioRegisterId);
          if (!isValorador) {
            await tx.horario_usuario.create({
              data: {
                actividad_id: actividad.id,
                usuario_id: usuarioRegisterId,
                fecha: fechaAsig,
                hora_inicio: toTime(r.hora_inicio),
                hora_fin: toTime(r.hora_fin),
                estado: true,
                tipo: "actividad",
                categoria: "cliente",
                duracion_minutos: r.duracion,
                created_at: new Date(),
                updated_at: new Date(),
              },
            });
          }

          await tx.historial_estados_prospecto.create({
            data: {
              prospecto_id: prospecto.id,
              estado: "registrado",
              usuario_id: usuarioRegisterId ? Number(usuarioRegisterId) : null,
              comentario: "Importado masivamente desde Excel.",
              fecha_inicio: new Date(),
              fecha_fin: null,
            },
          });
        });

        creados.prospectos++;
        creados.actividades++;
      } catch (err) {
        creados.errores.push({ cliente: r.cliente, error: err.message });
      }
    }

    return creados;
  }

  #serialToDate(serial) {
    if (serial == null) return null;
    if (typeof serial === "number") {
      const utcDays = Math.floor(serial - 25569);
      const utcValue = utcDays * 86400;
      const d = new Date(utcValue * 1000);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }
    const m = String(serial).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? serial : null;
  }

  #splitNombre(fullName) {
    if (!fullName || !fullName.trim()) return { nombres: null, apellidos: null };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { nombres: parts[0], apellidos: null };
    if (parts.length === 2) return { nombres: parts[0], apellidos: parts[1] };
    if (parts.length === 3) return { nombres: parts[0] + " " + parts[1], apellidos: parts[2] };
    const mid = Math.ceil(parts.length / 2);
    return { nombres: parts.slice(0, mid).join(" "), apellidos: parts.slice(mid).join(" ") };
  }

  async #getMinutosEstimados(tareaId) {
    const t = await prisma.tarea.findUnique({
      where: { id: tareaId },
      select: { horas_estimadas: true },
    });
    return (t?.horas_estimadas) ? Number(t.horas_estimadas) : 60;
  }

  async getMinutosTarea(tareaId) {
    return this.#getMinutosEstimados(tareaId);
  }

  async #findNextSlot(usuarioId, minutosEst, feriados, programados, fechaInicio = null, fechaNacimiento = null) {
    const hoy = fechaInicio || new Date();
    for (let i = 0; i < 30; i++) {
      const fecha = new Date(hoy);
      fecha.setDate(hoy.getDate() + i);
      const diaId = DAY_ID_BY_GETDAY[fecha.getDay()] || null;
      if (!diaId) continue;

      const ymd = getYmdLocal(fecha);
      const esFeriado = feriados.some((f) => {
        const fd = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
        return getYmdUtc(fd) === ymd;
      });
      if (esFeriado) continue;

      if (fechaNacimiento && isBirthdayOn(fechaNacimiento, fecha)) continue;

      const bloquesRows = await prisma.$queryRawUnsafe(
        `SELECT to_char(hora_inicio::time, 'HH24:MI:SS') AS hi,
                to_char(hora_fin::time,    'HH24:MI:SS') AS hf
           FROM horario_jornada_detalle
          WHERE usuario_id = $1
            AND dia_semana = $2
            AND estado = true
            AND hora_inicio IS NOT NULL
            AND hora_fin IS NOT NULL
          ORDER BY hora_inicio ASC`,
        usuarioId, diaId,
      );
      if (bloquesRows.length === 0) continue;

      const bloquesMin = bloquesRows
        .map((b) => ({ ini: toMinFromHms(b.hi), fin: toMinFromHms(b.hf) }))
        .filter((b) => b.ini != null && b.fin != null);

      const ocupadosEnFecha = programados
        .filter((p) => isSameLocalDay(p.fechaLocal, fecha))
        .sort((a, b) => a.ini - b.ini);

      const rowsOcupados = await prisma.$queryRawUnsafe(
        `SELECT to_char(hora_inicio::time, 'HH24:MI:SS') AS hi,
                to_char(hora_fin::time,    'HH24:MI:SS') AS hf
           FROM horario_usuario
          WHERE usuario_id = $1
            AND fecha = $2::date
            AND estado = true
            AND hora_inicio IS NOT NULL
            AND hora_fin IS NOT NULL`,
        usuarioId, ymd,
      );
      const ocupadosBD = (Array.isArray(rowsOcupados) ? rowsOcupados : [])
        .map((r) => ({ ini: toMinFromHms(r.hi), fin: toMinFromHms(r.hf) }))
        .filter((a) => a.ini != null && a.fin != null)
        .sort((a, b) => a.ini - b.ini);

      const ocupados = [...ocupadosBD, ...ocupadosEnFecha].sort((a, b) => a.ini - b.ini);

      const now = new Date();
      const isToday = isSameLocalDay(fecha, now);
      const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

      for (const block of bloquesMin) {
        let cursor = isToday ? Math.max(block.ini, nowMin) : block.ini;
        if (cursor >= block.fin) continue;

        for (const a of ocupados) {
          if (a.fin <= cursor) continue;
          if (a.ini >= block.fin) break;
          if (a.ini >= cursor) {
            if (a.ini - cursor >= minutosEst) {
              return { fechaLocal: fecha, ini: cursor, fin: cursor + minutosEst };
            }
            cursor = a.fin;
          } else {
            cursor = Math.max(cursor, a.fin);
          }
          if (cursor >= block.fin) break;
        }

        if (cursor < block.fin && block.fin - cursor >= minutosEst) {
          return { fechaLocal: fecha, ini: cursor, fin: cursor + minutosEst };
        }
      }
    }
    return null;
  }

  async #isUserValorador(tx, usuarioId) {
    if (!usuarioId) return false;
    const u = await tx.usuarios.findUnique({
      where: { id: Number(usuarioId) },
      select: { rol_id: true, roles: { select: { nombre: true } } },
    });
    if (!u) return false;
    if (Number(u.rol_id) === ROL_VALORADOR_ID) return true;
    return matchesAny(u.roles?.nombre, ["valorador"]);
  }

  async getUsuariosAsignables() {
    const roles = await prisma.roles.findMany({
      where: { estado: true },
      select: { id: true, nombre: true },
    });
    const rolSuperId = roles.find((r) => matchesAny(r.nombre, ["super admin"]))?.id;
    const whereUsuarios = {
      estado: true,
      ...(rolSuperId ? { rol_id: { not: rolSuperId } } : {}),
    };
    return prisma.usuarios.findMany({
      where: whereUsuarios,
      orderBy: { id: "asc" },
      select: {
        id: true,
        usuario: true,
        personas: { select: { nombres: true, apellidos: true } },
        roles: { select: { id: true, nombre: true } },
      },
    });
  }
}

export default new ImportacionService();
