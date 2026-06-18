-- ============================================================================
-- Datos de prueba para el auxiliar de producción
-- ============================================================================
-- Genera:
--   * 10 personas de contacto (2 por prospecto, todas distintas)
--   * 5 prospectos ya convertidos (estado_cliente = 'cliente') con tipo
--     cliente PROPIO/PROVEEDOR
--   * 7 actividades asignadas al auxiliar de producción (1-2 por prospecto)
--   * Entradas en horario_usuario para que aparezcan pintadas en el
--     calendario del auxiliar
--   * historial_estados_prospecto con estado 'cliente'
--
-- Cómo correrlo:
--   1. Abrir psql (o el cliente que uses) conectado a la BD
--   2. Pegar TODO este archivo y ejecutarlo
--   3. Al final del archivo hay un "ROLLBACK" comentado. Cambialo por
--      "COMMIT" cuando estés conforme con la salida del SELECT final
--      (ver "Paso 7: resumen").
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Paso 0: localizar al auxiliar de producción y los catálogos necesarios
-- ----------------------------------------------------------------------------
-- Guardamos los IDs en una TEMP table para reusarlos en todos los INSERTs
-- sin tener que copiar/pegar subqueries.
CREATE TEMP TABLE _seed (k TEXT PRIMARY KEY, v INT) ON COMMIT DROP;

-- Auxiliar de producción (case + accent insensitive)
INSERT INTO _seed (k, v)
SELECT 'aux_id', u.id
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id
 WHERE u.estado = true
   AND LOWER(TRANSLATE(r.nombre, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU'))
       LIKE '%auxiliar%produccion%'
 ORDER BY u.id
 LIMIT 1;

-- 3 tareas distintas (las primeras activas)
INSERT INTO _seed (k, v) SELECT 'tarea1_id', id FROM tarea      WHERE estado = true ORDER BY id LIMIT 1 OFFSET 0;
INSERT INTO _seed (k, v) SELECT 'tarea2_id', id FROM tarea      WHERE estado = true ORDER BY id LIMIT 1 OFFSET 1;
INSERT INTO _seed (k, v) SELECT 'tarea3_id', id FROM tarea      WHERE estado = true ORDER BY id LIMIT 1 OFFSET 2;

-- 2 instituciones y 1 carrera de cada una
INSERT INTO _seed (k, v) SELECT 'inst1_id',  id FROM institucion WHERE estado = true ORDER BY id LIMIT 1 OFFSET 0;
INSERT INTO _seed (k, v) SELECT 'inst2_id',  id FROM institucion WHERE estado = true ORDER BY id LIMIT 1 OFFSET 1;
INSERT INTO _seed (k, v) SELECT 'carr1_id',  id FROM carreras    WHERE estado = true AND institucion_id = (SELECT v FROM _seed WHERE k='inst1_id') ORDER BY id LIMIT 1;
INSERT INTO _seed (k, v) SELECT 'carr2_id',  id FROM carreras    WHERE estado = true AND institucion_id = (SELECT v FROM _seed WHERE k='inst2_id') ORDER BY id LIMIT 1;

-- Nivel, origen, 2 proveedores
INSERT INTO _seed (k, v) SELECT 'nivel_id',  id FROM nivel_academico WHERE estado = true ORDER BY id LIMIT 1;
INSERT INTO _seed (k, v) SELECT 'origen_id', id FROM origen          WHERE estado = true ORDER BY id LIMIT 1;
INSERT INTO _seed (k, v) SELECT 'prov1_id',  id FROM proveedor       WHERE estado = true ORDER BY id LIMIT 1 OFFSET 0;
INSERT INTO _seed (k, v) SELECT 'prov2_id',  id FROM proveedor       WHERE estado = true ORDER BY id LIMIT 1 OFFSET 1;

-- Mostrar lo que se encontró (para que lo veas antes de seguir)
SELECT k, v FROM _seed ORDER BY k;

-- Si falta alguno, abortamos. Si no hay tareas/instituciones/etc., el
-- script no debería seguir.
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(k, ', ' ORDER BY k) INTO missing
    FROM _seed
   WHERE v IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan datos en la BD para: %. Abortando.', missing;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Paso 1: 10 personas de contacto (2 por prospecto)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _personas ON COMMIT DROP AS
WITH np AS (
  INSERT INTO personas (nombres, apellidos, celular, email, estado)
  VALUES
    ('Ana Lucía',     'García López',     '987654321', 'ana.garcia@test.com',      true),
    ('Luis Fernando', 'Pérez Vargas',     '987654322', 'luis.perez@test.com',      true),
    ('María Fernanda','Soto Ríos',        '987654323', 'maria.soto@test.com',      true),
    ('Carlos Andrés', 'Mendoza Tito',     '987654324', 'carlos.mendoza@test.com',  true),
    ('Sofía Carolina','Quispe Mamani',    '987654325', 'sofia.quispe@test.com',    true),
    ('Diego Armando', 'Huamán Rojas',     '987654326', 'diego.huaman@test.com',    true),
    ('Valeria Isabel','Castillo Núñez',   '987654327', 'valeria.castillo@test.com',true),
    ('Jorge Luis',    'Salazar Pinto',    '987654328', 'jorge.salazar@test.com',   true),
    ('Camila Andrea', 'Vela Chávez',      '987654329', 'camila.vela@test.com',     true),
    ('Andrés Felipe', 'Lozano Bravo',     '987654330', 'andres.lozano@test.com',   true)
  RETURNING id
)
SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM np;

SELECT '1) personas insertadas' AS paso, count(*) AS total FROM _personas;

-- ----------------------------------------------------------------------------
-- Paso 2: 5 prospectos (todos con estado_cliente='cliente')
-- ----------------------------------------------------------------------------
-- Mezcla tipo_cliente: P1, P3, P5 son PROPIOS (sin proveedor);
-- P2 y P4 son PROVEEDOR.
CREATE TEMP TABLE _prospectos ON COMMIT DROP AS
WITH np AS (
  INSERT INTO prospectos (
    titulo_prospecto, nivel_academico_id, carrera_id,
    fecha_contacto, fecha_entrega, prioridad, contenido,
    link_drive, estado_cliente, proveedor_id,
    origen_id, estado, created_at, updated_at
  )
  SELECT * FROM (VALUES
    -- P1: PROPIO, inst1+carr1, ALTA, 60min
    ('Tesis de Ingeniería Civil - Análisis Estructural'::text,
     (SELECT v FROM _seed WHERE k='nivel_id')::int,
     (SELECT v FROM _seed WHERE k='carr1_id')::int,
     '2026-05-25'::date, '2026-06-30'::date, 'ALTA'::text,
     'Análisis sísmico de edificio de 8 pisos en zona costera.'::text,
     'https://drive.google.com/file/d/abc123'::text,
     'cliente'::text, NULL::int,
     (SELECT v FROM _seed WHERE k='origen_id')::int,
     true, now(), now()),
    -- P2: PROVEEDOR, sin carrera, MEDIA, 60min
    ('Diseño de Marca - Empresa Textil Andina'::text,
     NULL::int, NULL::int,
     '2026-05-26'::date, '2026-07-05'::date, 'MEDIA'::text,
     'Manual de identidad visual + 3 piezas gráficas.'::text,
     'https://drive.google.com/file/d/def456'::text,
     'cliente'::text, (SELECT v FROM _seed WHERE k='prov1_id')::int,
     (SELECT v FROM _seed WHERE k='origen_id')::int,
     true, now(), now()),
    -- P3: PROPIO, inst2+carr2, MEDIA, 120min x 2 actividades
    ('Tesis de Administración - Plan de Negocios Gastronómicos'::text,
     (SELECT v FROM _seed WHERE k='nivel_id')::int,
     (SELECT v FROM _seed WHERE k='carr2_id')::int,
     '2026-05-20'::date, '2026-07-15'::date, 'MEDIA'::text,
     'Estudio de viabilidad para café de especialidad en Lima Moderna.'::text,
     'https://drive.google.com/file/d/ghi789'::text,
     'cliente'::text, NULL::int,
     (SELECT v FROM _seed WHERE k='origen_id')::int,
     true, now(), now()),
    -- P4: PROVEEDOR, sin carrera, BAJA, 60min
    ('Manual de Procesos - Clínica Dental Sonríe'::text,
     NULL::int, NULL::int,
     '2026-05-28'::date, '2026-06-25'::date, 'BAJA'::text,
     'Diagramado de flujo de atención al paciente.'::text,
     'https://drive.google.com/file/d/jkl012'::text,
     'cliente'::text, (SELECT v FROM _seed WHERE k='prov2_id')::int,
     (SELECT v FROM _seed WHERE k='origen_id')::int,
     true, now(), now()),
    -- P5: PROPIO, inst1+carr1, ALTA, 180min x 2 actividades
    ('Investigación de Mercados - Sector Retail'::text,
     (SELECT v FROM _seed WHERE k='nivel_id')::int,
     (SELECT v FROM _seed WHERE k='carr1_id')::int,
     '2026-05-22'::date, '2026-07-20'::date, 'ALTA'::text,
     'Encuestas + análisis de competencia para 3 cadenas.'::text,
     'https://drive.google.com/file/d/mno345'::text,
     'cliente'::text, NULL::int,
     (SELECT v FROM _seed WHERE k='origen_id')::int,
     true, now(), now())
  ) AS t(titulo, nivel, carrera, fc, fe, pri, cont, link, est, prov, ori, est_act, ca, ua)
  RETURNING id
)
SELECT id, row_number() OVER (ORDER BY id) AS rn FROM np;

SELECT '2) prospectos insertados' AS paso, count(*) AS total FROM _prospectos;

-- ----------------------------------------------------------------------------
-- Paso 3: prospecto_persona (vincula cada prospecto con sus 2 contactos)
-- ----------------------------------------------------------------------------
-- p.rn -> usa contactos rn 2*rn-1 y 2*rn
INSERT INTO prospecto_persona (prospecto_id, persona_id)
SELECT p.id, per.id
  FROM _prospectos p
  JOIN _personas  per ON per.rn IN (p.rn * 2 - 1, p.rn * 2);

SELECT '3) prospecto_persona insertados' AS paso, count(*) AS total;

-- ----------------------------------------------------------------------------
-- Paso 4: 7 actividades (1-2 por prospecto) asignadas al auxiliar
-- ----------------------------------------------------------------------------
-- Distribución (respetando el horario del auxiliar 13-18h y 20-24h):
--   P1  -> 2026-06-08 (lun) 13:00-14:00   (tarea1, 60 min, ALTA)
--   P2  -> 2026-06-09 (mar) 13:00-14:00   (tarea1, 60 min, MEDIA)
--   P3a -> 2026-06-10 (mié) 13:00-15:00   (tarea2, 120 min, MEDIA)
--   P3b -> 2026-06-12 (vie) 14:00-16:00   (tarea2, 120 min, MEDIA)
--   P4  -> 2026-06-11 (jue) 13:00-14:00   (tarea1, 60 min, BAJA)
--   P5a -> 2026-06-15 (lun) 13:00-16:00   (tarea3, 180 min, ALTA)
--   P5b -> 2026-06-15 (lun) 20:30-23:30   (tarea3, 180 min, ALTA)
CREATE TEMP TABLE _actividades ON COMMIT DROP AS
WITH
  -- 1) Filas "datos crudos": rn del prospecto, key de tarea, prioridad,
  --    fecha, horas y color. El ID real se resuelve en el JOIN de abajo.
  raw AS (
    SELECT * FROM (VALUES
      (1::int,  'tarea1_id', 'ALTA',  '2026-06-08'::date, '13:00:00'::time, '14:00:00'::time,  60, '#dc3545'),
      (2,       'tarea1_id', 'MEDIA', '2026-06-09'::date, '13:00:00'::time, '14:00:00'::time,  60, '#f59e0b'),
      (3,       'tarea2_id', 'MEDIA', '2026-06-10'::date, '13:00:00'::time, '15:00:00'::time, 120, '#f59e0b'),
      (3,       'tarea2_id', 'MEDIA', '2026-06-12'::date, '14:00:00'::time, '16:00:00'::time, 120, '#f59e0b'),
      (4,       'tarea1_id', 'BAJA',  '2026-06-11'::date, '13:00:00'::time, '14:00:00'::time,  60, '#3b82f6'),
      (5,       'tarea3_id', 'ALTA',  '2026-06-15'::date, '13:00:00'::time, '16:00:00'::time, 180, '#dc3545'),
      (5,       'tarea3_id', 'ALTA',  '2026-06-15'::date, '20:30:00'::time, '23:30:00'::time, 180, '#dc3545')
    ) AS v(rn, tarea_key, prio, fecha, hi, hf, minutos, color)
  ),
  na AS (
    INSERT INTO actividades (
      prospecto_id, tarea_id, usuario_id, prioridad,
      estado_progreso, estado,
      fecha_inicio, hora_inicio, tiempo_estimado_minutos,
      color, created_at, updated_at
    )
    SELECT
      p.id,
      t.v,
      a.v,
      r.prio,
      'pendiente',
      true,
      r.fecha,
      r.hi,
      r.minutos,
      r.color,
      now(),
      now()
    FROM raw r
    JOIN _prospectos p ON p.rn = r.rn
    JOIN _seed     t ON t.k = r.tarea_key
    JOIN _seed     a ON a.k = 'aux_id'
    RETURNING id
  )
SELECT id, row_number() OVER (ORDER BY id) AS rn FROM na;

SELECT '4) actividades insertadas' AS paso, count(*) AS total FROM _actividades;

-- ----------------------------------------------------------------------------
-- Paso 5: horario_usuario (lo que pinta el calendario del auxiliar)
-- ----------------------------------------------------------------------------
-- Una fila por actividad, en el mismo bloque horario.
INSERT INTO horario_usuario (
  actividad_id, usuario_id, fecha, hora_inicio, hora_fin,
  estado, tipo, categoria, duracion_minutos,
  created_at, updated_at
)
SELECT
  a.id,
  (SELECT v FROM _seed WHERE k='aux_id'),
  sub.fecha,
  sub.hi,
  sub.hf,
  true,
  'actividad',
  'potencial_cliente',
  sub.minutos,
  now(),
  now()
FROM (VALUES
  (1, '2026-06-08'::date, '13:00:00'::time, '14:00:00'::time,  60),
  (2, '2026-06-09'::date, '13:00:00'::time, '14:00:00'::time,  60),
  (3, '2026-06-10'::date, '13:00:00'::time, '15:00:00'::time, 120),
  (4, '2026-06-12'::date, '14:00:00'::time, '16:00:00'::time, 120),
  (5, '2026-06-11'::date, '13:00:00'::time, '14:00:00'::time,  60),
  (6, '2026-06-15'::date, '13:00:00'::time, '16:00:00'::time, 180),
  (7, '2026-06-15'::date, '20:30:00'::time, '23:30:00'::time, 180)
) AS sub(act_rn, fecha, hi, hf, minutos)
JOIN _actividades a ON a.rn = sub.act_rn;

SELECT '5) horario_usuario insertados' AS paso, count(*) AS total
  FROM horario_usuario
 WHERE fecha BETWEEN '2026-06-08' AND '2026-06-15'
   AND usuario_id = (SELECT v FROM _seed WHERE k='aux_id');

-- ----------------------------------------------------------------------------
-- Paso 6: historial_estados_prospecto
-- ----------------------------------------------------------------------------
-- Dejamos un estado 'cliente' activo (fecha_fin = NULL) para cada uno,
-- con la fecha de contacto del prospecto como fecha_inicio.
INSERT INTO historial_estados_prospecto (
  prospecto_id, estado, usuario_id, comentario, fecha_inicio, fecha_fin
)
SELECT
  p.id,
  'cliente',
  (SELECT v FROM _seed WHERE k='aux_id'),
  'Cliente confirmado. Asignado al auxiliar de producción.',
  pr.fecha_contacto,
  NULL
FROM _prospectos p
JOIN prospectos pr ON pr.id = p.id;

SELECT '6) historial_estados_prospecto insertados' AS paso, count(*) AS total
  FROM historial_estados_prospecto
 WHERE estado = 'cliente'
   AND prospecto_id IN (SELECT id FROM _prospectos);

-- ----------------------------------------------------------------------------
-- Paso 7: resumen para que veas qué se generó
-- ----------------------------------------------------------------------------
SELECT
  p.id                                                       AS prospecto_id,
  p.titulo_prospecto,
  p.estado_cliente,
  CASE WHEN p.proveedor_id IS NULL THEN 'PROPIO' ELSE 'PROVEEDOR' END AS tipo_cliente,
  p.prioridad,
  p.fecha_contacto,
  (SELECT count(*) FROM actividades  a WHERE a.prospecto_id = p.id) AS n_actividades,
  (SELECT count(*) FROM prospecto_persona pp WHERE pp.prospecto_id = p.id) AS n_contactos
FROM prospectos p
WHERE p.id IN (SELECT id FROM _prospectos)
ORDER BY p.id;

-- Actividades y su bloque en el calendario
SELECT
  a.id            AS actividad_id,
  a.prospecto_id,
  t.nombre        AS tarea,
  a.prioridad,
  a.fecha_inicio,
  a.hora_inicio::text AS hi,
  a.tiempo_estimado_minutos AS min,
  hu.hora_fin::text AS hf,
  hu.duracion_minutos AS hu_min
FROM actividades a
JOIN tarea t ON t.id = a.tarea_id
LEFT JOIN horario_usuario hu
  ON hu.actividad_id = a.id
 AND hu.usuario_id   = (SELECT v FROM _seed WHERE k='aux_id')
WHERE a.prospecto_id IN (SELECT id FROM _prospectos)
ORDER BY a.prospecto_id, a.fecha_inicio, a.hora_inicio;

-- ============================================================================
-- ÚLTIMA LÍNEA: cambiar ROLLBACK por COMMIT cuando estés conforme
-- ============================================================================
ROLLBACK;
-- COMMIT;
