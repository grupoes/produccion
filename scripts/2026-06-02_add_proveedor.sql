-- Crea el catálogo `proveedor` y agrega la FK nullable `proveedor_id`
-- a la tabla `prospectos`.
-- Sin BEGIN/COMMIT para que cada statement se ejecute independiente y
-- sepas exactamente cuál falla si algo truena.

-- 1) Tabla catálogo proveedor
CREATE TABLE IF NOT EXISTS public.proveedor (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(150),
  estado BOOLEAN
);
SELECT '1) tabla proveedor OK' AS paso;

-- 2) Columna proveedor_id (nullable) en prospectos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'prospectos'
       AND column_name  = 'proveedor_id'
  ) THEN
    ALTER TABLE public.prospectos
      ADD COLUMN proveedor_id INTEGER;
  END IF;
END $$;
SELECT '2) columna proveedor_id OK' AS paso;

-- 3) Elimina cualquier FK previa que apunte a proveedor en prospectos
--    (así evitamos choques de nombre si quedó una previa rara).
DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage cu
        ON cu.constraint_name = tc.constraint_name
     WHERE tc.table_schema   = 'public'
       AND tc.table_name     = 'prospectos'
       AND tc.constraint_type = 'FOREIGN KEY'
       AND cu.column_name     = 'proveedor_id'
  LOOP
    EXECUTE format('ALTER TABLE public.prospectos DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;
SELECT '3) FK previa sobre proveedor_id eliminada (si existía)' AS paso;

-- 4) Crea la FK limpia
ALTER TABLE public.prospectos
  ADD CONSTRAINT fk_prospecto_proveedor
  FOREIGN KEY (proveedor_id) REFERENCES public.proveedor(id)
  ON DELETE NO ACTION
  ON UPDATE NO ACTION;
SELECT '4) FK fk_prospecto_proveedor creada' AS paso;

-- 5) Asegura nullable explícito
ALTER TABLE public.prospectos
  ALTER COLUMN proveedor_id DROP NOT NULL;
SELECT '5) columna proveedor_id nullable OK' AS paso;
