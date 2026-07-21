import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
const envRaw = readFileSync(envPath, "utf8");
const match = envRaw.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL no encontrada en .env");
  process.exit(1);
}
const DATABASE_URL = match[1].replace(/^["']|["']$/g, "").trim();

const sql = readFileSync(
  new URL("../prisma/migrations/0001_permisos_usuario/migration.sql", import.meta.url),
  "utf8",
);

const client = new pg.Client({ connectionString: DATABASE_URL });
try {
  await client.connect();

  // Crear tabla si no existe (ignorar error si ya existe)
  try {
    await client.query(sql);
    console.log("Migración permisos_usuario ejecutada correctamente.");
  } catch (e) {
    if (e.message.includes("ya existe")) {
      console.log("Tabla ya existe, continuando...");
    } else {
      throw e;
    }
  }

  // Asegurar tipo TIMETZ para las columnas de hora
  try {
    await client.query(
      `ALTER TABLE permisos_usuario ALTER COLUMN hora_inicio TYPE TIMETZ USING hora_inicio::timetz`,
    );
  } catch (e) {
    console.log("hora_inicio ya es TIMETZ o no se pudo convertir:", e.message);
  }
  try {
    await client.query(
      `ALTER TABLE permisos_usuario ALTER COLUMN hora_fin TYPE TIMETZ USING hora_fin::timetz`,
    );
  } catch (e) {
    console.log("hora_fin ya es TIMETZ o no se pudo convertir:", e.message);
  }
  console.log("Columnas de hora verificadas.");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
