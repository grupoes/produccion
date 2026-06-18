-- ============================================================================
-- 2026-06-11_add_modulo_importar_actividades.sql
--
-- Da de alta el módulo "Importar Actividades" en la tabla `modulos` con la
-- URL /admin/importar-actividades y le asigna permiso al rol
-- ASISTENTE DE PRODUCCIÓN (id=11, o el que corresponda según tu BD).
--
-- El módulo se cuelga del padre "Dashboard" (o raíz si no existe).
-- ============================================================================

DO $$
DECLARE
  v_modulo_id   INT;
  v_rol_id      INT;
  v_rol_ids     INT[] := ARRAY[11]; -- ASISTENTE DE PRODUCCIÓN
BEGIN
  -- 1) Insertar (o reutilizar) el módulo.
  SELECT id INTO v_modulo_id
    FROM modulos
   WHERE url = '/admin/importar-actividades'
   LIMIT 1;

  IF v_modulo_id IS NULL THEN
    INSERT INTO modulos (modulo, url, icono, idpadre, orden, estado)
    VALUES ('Importar Actividades',
            '/admin/importar-actividades',
            'upload',       -- ícono de Lucide
            NULL,           -- idpadre (NULL = raíz, o el id de Dashboard)
            200,            -- orden (después de los existentes)
            true)
    RETURNING id INTO v_modulo_id;

    RAISE NOTICE 'Módulo Importar Actividades creado con id=%', v_modulo_id;
  ELSE
    UPDATE modulos
       SET estado = true,
           modulo = 'Importar Actividades',
           icono  = COALESCE(icono, 'upload')
     WHERE id = v_modulo_id;
    RAISE NOTICE 'Módulo Importar Actividades ya existía (id=%); re-activado.', v_modulo_id;
  END IF;

  -- 2) Asignar permisos al rol ASISTENTE DE PRODUCCIÓN (idempotente).
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
