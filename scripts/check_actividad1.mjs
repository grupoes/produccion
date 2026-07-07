import pg from "pg";
import { readFileSync } from "fs";

const envContent = readFileSync(".env", "utf8");
const envLines = envContent.split("\n");
for (const line of envLines) {
  const match = line.match(/^([A-Z_]+)\s*=\s*"?([^"]+)"?/);
  if (match) {
    process.env[match[1]] = match[2];
  }
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

await client.connect();

const res = await client.query(`
  SELECT id, prospecto_id, tarea_id, tiempo_estimado_minutos, hora_inicio::text, fecha_inicio::text
  FROM actividades WHERE id IN (1, 2)
`);
res.rows.forEach(r => console.log(`  Act ${r.id}: p${r.prospecto_id}, tarea=${r.tarea_id}, est=${r.tiempo_estimado_minutos}min, fecha_inicio=${r.fecha_inicio}, hora_inicio=${r.hora_inicio}`));

await client.end();
