import db from "../config/db.js";

class ModulesService {
  // Devuelve los módulos permitidos para un rol (rolId: Int)
  async getModulesByRole(rolId) {
    if (!rolId) return [];

    // Buscar permisos del rol e incluir el módulo asociado
    const permisos = await db.permisos.findMany({
      where: { rol_id: rolId },
      include: { modulos: true },
    });

    console.log(
      `[DEBUG] rol_id=${rolId}, permisos encontrados: ${permisos.length}`,
    );

    // Extraer módulos únicos y con estado true
    const modulesMap = new Map();
    const parentIds = new Set();

    // Primero, agregar todos los módulos con permisos
    permisos.forEach((p) => {
      const m = p.modulos;
      if (m && m.estado) {
        modulesMap.set(m.id, {
          id: m.id,
          nombre: m.modulo,
          url: m.url,
          icono: m.icono,
          idpadre: m.idpadre,
          orden: m.orden,
        });
        // Registrar si este módulo tiene padre
        if (m.idpadre) {
          parentIds.add(m.idpadre);
        }
      }
    });

    console.log(
      `[DEBUG] IDs de módulos padres referenciados:`,
      Array.from(parentIds),
    );

    // Segundo, buscar los módulos padres que se referencian pero no están en permisos
    if (parentIds.size > 0) {
      const parentModules = await db.modulos.findMany({
        where: {
          id: { in: Array.from(parentIds) },
          estado: true,
        },
      });

      console.log(
        `[DEBUG] Módulos padres encontrados en BD: ${parentModules.length}`,
      );

      parentModules.forEach((m) => {
        // Solo agregar si no está ya en el mapa
        if (!modulesMap.has(m.id)) {
          modulesMap.set(m.id, {
            id: m.id,
            nombre: m.modulo,
            url: m.url,
            icono: m.icono,
            idpadre: m.idpadre,
            orden: m.orden,
          });
        }
      });
    }

    // Convertir a array y ordenar por 'orden' si existe
    const modules = Array.from(modulesMap.values()).sort((a, b) => {
      const oa = typeof a.orden === "number" ? a.orden : 0;
      const ob = typeof b.orden === "number" ? b.orden : 0;
      return oa - ob;
    });

    console.log(
      `[DEBUG] Módulos finales devueltos: ${modules.length}`,
      JSON.stringify(modules, null, 2),
    );
    return modules;
  }
}

export default new ModulesService();
