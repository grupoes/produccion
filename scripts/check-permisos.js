import db from "../src/config/db.js";

async function checkPermisos() {
  console.log("\n=== VERIFICANDO PERMISOS EN LA BASE DE DATOS ===\n");

  try {
    // 1. Verificar que existe el rol_id=1
    console.log("1. Buscando rol_id=1...");
    const rol = await db.roles.findUnique({
      where: { id: 1 },
    });
    console.log("   Resultado:", JSON.stringify(rol, null, 2));

    // 2. Contar permisos para rol_id=1
    console.log("\n2. Contando permisos para rol_id=1...");
    const countPermisos = await db.permisos.count({
      where: { rol_id: 1 },
    });
    console.log(`   Total de permisos encontrados: ${countPermisos}`);

    // 3. Traer todos los permisos para rol_id=1 CON sus módulos
    console.log(
      "\n3. Obteniendo todos los permisos con módulos para rol_id=1...",
    );
    const permisos = await db.permisos.findMany({
      where: { rol_id: 1 },
      include: {
        modulos: true,
        acciones: true,
      },
    });
    console.log(`   JSON completo (${permisos.length} registros):`);
    console.log(JSON.stringify(permisos, null, 2));

    // 4. Contar módulos con estado=true
    console.log("\n4. Verificando módulos con estado=true...");
    const modulosActivos = await db.modulos.count({
      where: { estado: true },
    });
    console.log(`   Módulos activos en general: ${modulosActivos}`);

    // 5. Mostrar todos los módulos
    console.log("\n5. Todos los módulos en la BD:");
    const todosModulos = await db.modulos.findMany();
    console.log(JSON.stringify(todosModulos, null, 2));
  } catch (error) {
    console.error("ERROR:", error.message);
    console.error(error);
  } finally {
    await db.$disconnect();
  }
}

checkPermisos();
