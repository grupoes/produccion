-- ============================================================================
-- Migración: campos para "Iniciar / Terminar" y bloqueada por prioridad
-- ============================================================================
-- Agrega a `actividades`:
--   fecha_inicio_real   Date?         -- cuï¿½ndo el auxiliar dio "Iniciar"
--   hora_inicio_real    Timetz?
--   fecha_termino_real  Date?
--   hora_termino_real   Timetz?
--   pausa_minutos       Int default 0 -- para v2 (botï¿½n pausar)
--   bloqueada           Bool default false
--                                       true si prioridad='ALTA' y por lo
--                                       tanto el scheduler no la mueve.
--   motivo_reprograma   Varchar(255)   -- comentario al mover
--
-- Idempotente: usa IF NOT EXISTS para que se pueda correr mï¿½ltiples veces
-- sin romper. Estï¿½ envuelto en una transacciï¿½n con ROLLBACK por defecto.
-- ============================================================================

BEGIN;

-- fecha_inicio_real
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'actividades' AND column_name = 'fecha_inicio_real'
  ) THEN
    ALTER TABLE actividades ADD COLUMN fecha_inicio_real DATE;
  END IF;
END $$;

-- hora_inicio_real
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'actividades' AND column_name = 'hora_inicio_real'
  ) THEN
    ALTER TABLE actividades ADD COLUMN hora_inicio_real TIMETZ;
  END IF;
END $$;

-- fecha_termino_real
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'actividades' AND column_name = 'fecha_termino_real'
  ) THEN
    ALTER TABLE actividades ADD COLUMN fecha_termino_real DATE;
  END IF;
END $$;

-- hora_termino_real
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'actividades' AND column_name = 'hora_termino_real'
  ) THEN
    ALTER TABLE actividades ADD COLUMN hora_termino_real TIMETZ;
  END IF;
END $$;

-- pausa_minutos (default 0 para que las queries no devuelvan NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'actividades' AND column_name = 'pausa_minutos'
  ) THEN
    ALTER TABLE actividades ADD COLUMN pausa_minutos INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- bloqueada (default false)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'actividades' AND column_name = 'bloqueada'
  ) THEN
    ALTER TABLE actividades ADD COLUMN bloqueada BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- motivo_reprograma
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'actividades' AND column_name = 'motivo_reprograma'
  ) THEN
    ALTER TABLE actividades ADD COLUMN motivo_reprograma VARCHAR(255);
  END IF;
END $$;

-- Backfill: marcar como bloqueadas las actividades ya existentes con
-- prioridad ALTA. Es idempotente: solo toca filas con bloqueada=false
-- y prioridad='ALTA'.
UPDATE actividades
   SET bloqueada = true
 WHERE bloqueada = false
   AND UPPER(prioridad) = 'ALTA'
   AND estado = true;

-- Resumen
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'actividades'
   AND column_name IN (
     'fecha_inicio_real','hora_inicio_real',
     'fecha_termino_real','hora_termino_real',
     'pausa_minutos','bloqueada','motivo_reprograma'
   )
 ORDER BY column_name;

-- ============================================================================
-- Cambiá ROLLBACK por COMMIT cuando estés conforme
-- ============================================================================
ROLLBACK;
-- COMMIT;
