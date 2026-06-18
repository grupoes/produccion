import db from "../src/config/db.js";

async function main() {
  const rolId = 1;
  console.log(`Buscando permisos para rol_id=${rolId} ...`);

  const permisos = await db.permisos.findMany({
    where: { rol_id: rolId },
    include: { modulos: true },
  });

  console.log(JSON.stringify(permisos, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Error ejecutando consulta:", e);
    process.exit(1);
  });
