// Servicio para consultar datos de persona/empresa por número de documento
// contra facturalahoy.com.
//
// Endpoints:
//   DNI: GET {base}/persona/{numero}/{token}/completa
//   RUC: GET {base}/empresa/{numero}/{token}/completa
//
// Respuesta esperada (DNI):
//   { "respuesta": "ok", "encontrado": true, "api": true,
//     "data": { "nombres", "ap_paterno", "ap_materno", "dni",
//               "sexo", "fecha_nacimiento" (DD/MM/YYYY) } }
class ReniecService {
  constructor() {
    this.baseUrl = (process.env.RENIEC_API_URL || "").replace(/\/+$/, "");
    this.token = process.env.RENIEC_API_TOKEN || "";
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.token && this.token !== "your_token_here");
  }

  pathFor(abreviatura) {
    const a = (abreviatura || "").toUpperCase();
    return a === "RUC" ? "empresa" : "persona";
  }

  async fetchByDocument({ abreviatura, numero_documento }) {
    if (!this.isConfigured()) {
      const err = new Error(
        "El servicio de búsqueda de documentos no está configurado (RENIEC_API_URL/RENIEC_API_TOKEN).",
      );
      err.code = "NOT_CONFIGURED";
      throw err;
    }
    if (!numero_documento) {
      const err = new Error("Debe ingresar un número de documento.");
      err.code = "BAD_REQUEST";
      throw err;
    }

    const path = this.pathFor(abreviatura);
    const url = `${this.baseUrl}/${path}/${encodeURIComponent(numero_documento)}/${encodeURIComponent(this.token)}/completa`;

    // [DEBUG] Log temporal para diagnosticar respuesta vacía
    console.log("[RENIEC] GET", url);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Consulta Datos",
      },
    });

    const rawText = await res.text();
    console.log("[RENIEC] status:", res.status, "rawText:", rawText);

    let body = null;
    try {
      body = JSON.parse(rawText);
    } catch (_) {
      body = null;
    }

    if (!res.ok) {
      const msg = body?.mensaje || `Error consultando documento (HTTP ${res.status})`;
      const err = new Error(msg);
      err.code = "UPSTREAM_ERROR";
      err.status = res.status;
      throw err;
    }
    if (!body) {
      const err = new Error("La API externa devolvió una respuesta vacía o no es JSON.");
      err.code = "EMPTY_RESPONSE";
      err.rawText = rawText;
      throw err;
    }

    // La API responde 200 incluso cuando no encuentra, usando "respuesta":"error"
    if (!body || body.respuesta !== "ok" || body.encontrado === false) {
      const err = new Error(body?.mensaje || "No se encontró información para el documento.");
      err.code = "NOT_FOUND";
      err.raw = body;
      throw err;
    }

    return this.normalize(body, abreviatura);
  }

  /**
   * Normaliza la respuesta a un esquema común para el front-end.
   * Prueba varios paths porque el proveedor a veces cambia la estructura.
   */
  normalize(raw, abreviatura) {
    // Distintos lugares donde el proveedor puede poner los datos
    const data =
      raw?.data?.data ||
      raw?.data ||
      raw?.result ||
      raw?.persona ||
      raw?.empresa ||
      raw ||
      {};
    const inner = typeof data === "object" ? data : {};

    const nombres = (inner.nombres || inner.nombre || "").trim();
    const apellidoPaterno = (
      inner.ap_paterno ||
      inner.apellido_paterno ||
      inner.paterno ||
      ""
    ).trim();
    const apellidoMaterno = (
      inner.ap_materno ||
      inner.apellido_materno ||
      inner.materno ||
      ""
    ).trim();
    const apellidos = (inner.apellidos || [apellidoPaterno, apellidoMaterno].filter(Boolean).join(" ")).trim();
    const numero_documento = (
      inner.dni ||
      inner.ruc ||
      inner.numero_documento ||
      inner.numero ||
      ""
    )
      .toString()
      .trim();
    const direccion = (inner.direccion || inner.domicilio?.direccion || "").trim();
    const sexo = (inner.sexo || "").trim();
    const fecha_nacimiento = this.parseDate(inner.fecha_nacimiento);

    return {
      abreviatura: (abreviatura || "").toUpperCase(),
      numero_documento,
      nombres,
      apellido_paterno: apellidoPaterno,
      apellido_materno: apellidoMaterno,
      apellidos,
      direccion,
      sexo,
      fecha_nacimiento,
      raw: inner,
    };
  }

  /**
   * Convierte la fecha devuelta por la API (DD/MM/YYYY) a formato ISO YYYY-MM-DD
   * que es el que acepta <input type="date"> y la columna Prisma @db.Date.
   */
  parseDate(value) {
    if (!value) return "";
    const str = String(value).trim();
    const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const [, d, mo, y] = m;
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
    return "";
  }
}

export default new ReniecService();
