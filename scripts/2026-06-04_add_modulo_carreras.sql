-- ============================================================================
-- 2026-06-04_add_modulo_carreras.sql
--
-- Da de alta el módulo "Carreras" en la tabla `modulos` con la URL
-- /carreras (definida en src/routes/carreras.routes.js) y le asigna
-- permisos a los roles que lo necesitarán.
--
-- Antes de correrlo, revisá:
--   1. ¿En qué `idpadre` querés que quede colgado? (NULL = raíz, o el id
--      de un padre existente, p.ej. el módulo "Universidad").
--   2. ¿Qué roles deben poder verlo? Los IDs de la tabla `roles`. Por
--      defecto quedan los mismos que Universidad (verificá con un SELECT):
--      SUPER ADMIN, ADMIN y JEFE DE PRODUCCIÓN.
--
-- Si ya existe un módulo con la misma URL, este script NO lo duplica.
-- ============================================================================

DO $$
DECLARE
  v_modulo_id   INT;
  v_rol_id      INT;
  v_rol_ids     INT[] := ARRAY[1, 2, 5]; -- editar según necesidad
BEGIN
  -- 1) Insertar (o reutilizar) el módulo.
  SELECT id INTO v_modulo_id
    FROM modulos
   WHERE url = '/carreras'
   LIMIT 1;

  IF v_modulo_id IS NULL THEN
    INSERT INTO modulos (modulo, url, icono, idpadre, orden, estado)
    VALUES ('Carreras', '/carreras', 'school', NULL, 110, true)
    RETURNING id INTO v_modulo_id;

    RAISE NOTICE 'Módulo Carreras creado con id=%', v_modulo_id;
  ELSE
    -- Si ya existía, nos aseguramos de que esté activo.
    UPDATE modulos
       SET estado = true,
           modulo = 'Carreras',
           icono  = COALESCE(icono, 'school')
     WHERE id = v_modulo_id;

    RAISE NOTICE 'Módulo Carreras ya existía (id=%); re-activado.', v_modulo_id;
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
