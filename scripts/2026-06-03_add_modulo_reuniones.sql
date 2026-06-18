-- ============================================================================
-- 2026-06-03_add_modulo_reuniones.sql
--
-- Da de alta el módulo "Reuniones" en la tabla `modulos` con la URL
-- /reuniones (definida en src/routes/reuniones.routes.js) y le asigna
-- permisos a los roles que lo necesitarán.
--
-- Antes de correrlo, revisá:
--   1. ¿En qué `idpadre` querés que quede colgado? (NULL = raíz, o el id
--      de un padre existente, p.ej. el módulo "Potenciales Clientes").
--   2. ¿Qué roles deben poder verlo? Los IDs de la tabla `roles`. Por
--      defecto quedan: SUPER ADMIN, ADMIN, JEFE DE PRODUCCIÓN, JEFA DE
--      VENTAS y ASISTENTE DE PRODUCCIÓN (ids 1, 2, 5, 6 y 11
--      respectivamente, pero verificá con un SELECT).
--
-- Si ya existe un módulo con la misma URL, este script NO lo duplica.
-- ============================================================================

DO $$
DECLARE
  v_modulo_id   INT;
  v_rol_id      INT;
  v_rol_ids     INT[] := ARRAY[1, 2, 5, 6, 11]; -- editar según necesidad
BEGIN
  -- 1) Insertar (o reutilizar) el módulo.
  SELECT id INTO v_modulo_id
    FROM modulos
   WHERE url = '/reuniones'
   LIMIT 1;

  IF v_modulo_id IS NULL THEN
    INSERT INTO modulos (modulo, url, icono, idpadre, orden, estado)
    VALUES ('Reuniones', '/reuniones', 'calendar-event', NULL, 100, true)
    RETURNING id INTO v_modulo_id;

    RAISE NOTICE 'Módulo Reuniones creado con id=%', v_modulo_id;
  ELSE
    -- Si ya existía, nos aseguramos de que esté activo.
    UPDATE modulos
       SET estado = true,
           modulo = 'Reuniones',
           icono  = COALESCE(icono, 'calendar-event')
     WHERE id = v_modulo_id;

    RAISE NOTICE 'Módulo Reuniones ya existía (id=%); re-activado.', v_modulo_id;
  END IF;

  -- 2) Asignar permisos a cada rol de la lista (idempotente).
  FOREACH v_rol_id IN ARRAY v_rol_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM permisos
       WHERE modulo_id = v_modulo_id
         AND rol_id    = v_rol_id
         AND accion_id IS NULL
    ) THEN
      INSERT INTO permisos (modulo_id, rol_id, accion_id)
      VALUES (v_modulo_id, v_rol_id, NULL);
    END IF;
  END LOOP;
END $$;
