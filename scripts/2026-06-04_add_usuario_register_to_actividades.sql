-- ============================================================================
-- 2026-06-04_add_usuario_register_to_actividades.sql
-- ============================================================================
-- Agrega la columna `usuario_register` a la tabla `actividades`.
--
-- Semántica:
--   `usuario_register` = id del usuario de la sesión que REGISTRÓ la
--   actividad. Es decir, el usuario que hizo el POST al crear el
--   potencial o al agregar una nueva actividad. NO es el usuario al
--   que se le ASIGNÓ la tarea (eso sigue siendo `usuario_id`).
--
-- Por qué existe un campo nuevo si ya tenemos `historial_estados_prospecto`
-- con "Actividad agregada" → usuario_id:
--   * El historial vive en el PROSPECTO, no en la actividad.
--   * Cuando se edita un prospecto y se agrega OTRA actividad, el
--     historial del prospecto no necesariamente refleja al usuario
--     que la acaba de crear (es un evento del prospecto, no de la
--     actividad).
--   * Tener el id en la propia `actividades` permite mapear quién
--     creó CADA actividad de forma directa con un solo SELECT.
--
-- Nullable: una actividad legacy puede no tener este dato.
-- Idempotente: si la columna ya existe, el bloque no hace nada.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'actividades'
       AND column_name = 'usuario_register'
  ) THEN
    ALTER TABLE actividades ADD COLUMN usuario_register INTEGER;
    RAISE NOTICE 'Columna usuario_register agregada a actividades.';
  ELSE
    RAISE NOTICE 'Columna usuario_register ya existía; no-op.';
  END IF;
END $$;

-- Backfill opcional: si querés que las actividades existentes hereden
-- el `usuario_id` como `usuario_register` (mejor que NULL), descomentar:
--
-- UPDATE actividades
--    SET usuario_register = usuario_id
--  WHERE usuario_register IS NULL
--    AND usuario_id IS NOT NULL;
--
-- (Dejado comentado a propósito: el campo "registrado por" no es
-- necesariamente el mismo que "asignado a"; backfillear ciegamente
-- falsea la auditoría. Si querés hacerlo, hacerlo a mano y con un
-- WHERE que discrimine, por ejemplo created_at > X.)

-- Resumen
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'actividades'
   AND column_name = 'usuario_register';

-- ============================================================================
-- Cambiá ROLLBACK por COMMIT cuando estés conforme
-- ============================================================================
ROLLBACK;
-- COMMIT;
