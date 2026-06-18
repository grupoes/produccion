import prisma from "../config/db.js";

class FeriadosService {
  async getAll() {
    const rows = await prisma.feriados.findMany({
      where: { estado: true },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
    });
    // Devolvemos la fecha como string "YYYY-MM-DD" para que (a) el orden
    // sea inequívoco (lexicográfico = cronológico) y (b) no haya líos
    // de timezone al serializar el Date a JSON.
    return rows.map((r) => ({
      id: r.id,
      fecha: this.formatDate(r.fecha),
      nombre: r.nombre,
      estado: r.estado,
    }));
  }

  async getById(id) {
    const f = await prisma.feriados.findUnique({
      where: { id: Number(id) },
    });
    if (!f) return null;
    return {
      id: f.id,
      fecha: this.formatDate(f.fecha),
      nombre: f.nombre,
      estado: f.estado,
    };
  }

  async create({ fecha, nombre }) {
    if (!fecha) {
      const err = new Error("La fecha es obligatoria.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    if (!nombre || !String(nombre).trim()) {
      const err = new Error("El nombre es obligatorio.");
      err.code = "BAD_REQUEST";
      throw err;
    }
    const created = await prisma.feriados.create({
      data: {
        fecha: this.toDate(fecha),
        nombre: String(nombre).trim(),
        estado: true,
      },
    });
    return {
      id: created.id,
      fecha: this.formatDate(created.fecha),
      nombre: created.nombre,
      estado: created.estado,
    };
  }

  async update(id, { fecha, nombre }) {
    const idNum = Number(id);
    const exists = await prisma.feriados.findUnique({
      where: { id: idNum },
      select: { id: true },
    });
    if (!exists) return null;

    const updated = await prisma.feriados.update({
      where: { id: idNum },
      data: {
        fecha: fecha != null ? this.toDate(fecha) : undefined,
        nombre: nombre != null ? String(nombre).trim() : undefined,
      },
    });
    return {
      id: updated.id,
      fecha: this.formatDate(updated.fecha),
      nombre: updated.nombre,
      estado: updated.estado,
    };
  }

  // Baja lógica
  async remove(id) {
    return await prisma.feriados.update({
      where: { id: Number(id) },
      data: { estado: false },
    });
  }

  // ---- Helpers internos ----------------------------------------------

  // Acepta "YYYY-MM-DD" o un Date. Devuelve un Date **a medianoche UTC** del
  // día indicado. Usamos UTC para que el valor sea el mismo independientemente
  // de la zona horaria del servidor, y para que Prisma lo escriba en la
  // columna @db.Date sin correrse un día.
  toDate(value) {
    if (value instanceof Date) return value;
    const s = String(value);
    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return new Date(s);
    return new Date(Date.UTC(y, m - 1, d));
  }

  // Formato "YYYY-MM-DD" a partir de un Date que Prisma devuelve de @db.Date.
  // Usamos los getters **UTC** (getUTCFullYear / getUTCMonth / getUTCDate)
  // para no perder/restaurar un día según la zona local del server.
  formatDate(date) {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Formato "DD/MM/YYYY" para mostrar en la UI.
  formatDateDisplay(date) {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "";
    const day = String(d.getDate()).padStart(2, "0");
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${m}/${d.getFullYear()}`;
  }

  // Cómputus (algoritmo anónimo gregoriano) → fecha de Pascua para un año.
  // Devuelve un Date en hora local.
  calcularPascua(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 1..12
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  // Resta días a un Date (sin mutar) y devuelve uno nuevo. Trabaja en UTC
  // para que restar 1 día a "2026-04-05" dé "2026-04-04" sin importar la zona.
  restarDias(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - days);
    return d;
  }

  // Feriados fijos de Perú (mismo día/mes cada año).
  // Usamos Date.UTC para que el día/mes no se recorra por timezone.
  feriadosFijos(year) {
    return [
      { fecha: new Date(Date.UTC(year, 0, 1)), nombre: "Año Nuevo" },
      { fecha: new Date(Date.UTC(year, 4, 1)), nombre: "Día del Trabajo" },
      { fecha: new Date(Date.UTC(year, 5, 7)), nombre: "Día de la Bandera" },
      { fecha: new Date(Date.UTC(year, 5, 23)), nombre: "Día de San Juan" },
      {
        fecha: new Date(Date.UTC(year, 6, 28)),
        nombre: "Fiestas Patrias (Independencia)",
      },
      { fecha: new Date(Date.UTC(year, 6, 29)), nombre: "Fiestas Patrias" },
      { fecha: new Date(Date.UTC(year, 7, 30)), nombre: "Santa Rosa de Lima" },
      {
        fecha: new Date(Date.UTC(year, 9, 8)),
        nombre: "Combate de Angamos",
      },
      {
        fecha: new Date(Date.UTC(year, 10, 1)),
        nombre: "Todos los Santos",
      },
      {
        fecha: new Date(Date.UTC(year, 11, 8)),
        nombre: "Inmaculada Concepción",
      },
      {
        fecha: new Date(Date.UTC(year, 11, 9)),
        nombre: "Batalla de Ayacucho",
      },
      { fecha: new Date(Date.UTC(year, 11, 25)), nombre: "Navidad" },
    ];
  }

  // Feriados móviles de Perú (calculados desde Pascua).
  feriadosMoviles(year) {
    const pascua = this.calcularPascua(year);
    return [
      { fecha: this.restarDias(pascua, 3), nombre: "Jueves Santo" },
      { fecha: this.restarDias(pascua, 2), nombre: "Viernes Santo" },
    ];
  }

  // Genera los feriados de un año.
  // Devuelve { insertados, reactivados, omitidos }.
  // Reglas:
  //  - Si ya existe fila con misma fecha + nombre y estado=true → omitir.
  //  - Si existe con estado=false → reactivar (estado=true, actualizar nombre).
  //  - Si no existe → crear.
  async generarDelAnio(year) {
    const anio = Number(year);
    if (!Number.isInteger(anio) || anio < 1900 || anio > 2200) {
      const err = new Error("Año inválido. Usa un valor entre 1900 y 2200.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    const candidatos = [
      ...this.feriadosFijos(anio),
      ...this.feriadosMoviles(anio),
    ];

    const resultado = { insertados: [], reactivados: [], omitidos: [] };

    for (const c of candidatos) {
      const fechaStr = this.formatDate(c.fecha);
      // Buscamos por la fecha exacta Y por ±1 día para tolerar filas
      // existentes que pudieron haber quedado recorridas por un bug
      // anterior de timezone (al insertarse como local y leerse como UTC).
      const dayBefore = this.restarDias(c.fecha, 1);
      const dayAfter = new Date(c.fecha);
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
      const existente = await prisma.feriados.findFirst({
        where: {
          OR: [
            { fecha: c.fecha },
            { fecha: dayBefore },
            { fecha: dayAfter },
          ],
        },
      });

      if (!existente) {
        const nuevo = await prisma.feriados.create({
          data: {
            fecha: c.fecha,
            nombre: c.nombre,
            estado: true,
          },
        });
        resultado.insertados.push({
          id: nuevo.id,
          fecha: fechaStr,
          nombre: c.nombre,
        });
        continue;
      }

      if (existente.estado === true) {
        // Ya existe activo. Si la fecha guardada está recorrida por el bug
        // anterior, la corregimos a la canónica. Si la fecha ya está bien,
        // omitimos (no pisamos nombres que el usuario haya renombrado).
        const fechaExistenteStr = this.formatDate(existente.fecha);
        if (fechaExistenteStr !== fechaStr) {
          const corregido = await prisma.feriados.update({
            where: { id: existente.id },
            data: { fecha: c.fecha, nombre: c.nombre },
          });
          resultado.reactivados.push({
            id: corregido.id,
            fecha: fechaStr,
            nombre: corregido.nombre,
            corregido: true,
          });
        } else {
          resultado.omitidos.push({
            id: existente.id,
            fecha: fechaStr,
            nombre: existente.nombre,
          });
        }
        continue;
      }

      // Existe pero está inactivo → reactivar (y corregir fecha si estaba recorrida)
      const fechaExistenteStr = this.formatDate(existente.fecha);
      const dataUpdate = { nombre: c.nombre, estado: true };
      if (fechaExistenteStr !== fechaStr) {
        dataUpdate.fecha = c.fecha;
      }
      const reactivado = await prisma.feriados.update({
        where: { id: existente.id },
        data: dataUpdate,
      });
      resultado.reactivados.push({
        id: reactivado.id,
        fecha: fechaStr,
        nombre: reactivado.nombre,
        corregido: fechaExistenteStr !== fechaStr,
      });
    }

    return resultado;
  }
}

export default new FeriadosService();
