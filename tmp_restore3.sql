UPDATE horario_usuario SET estado = false, updated_at = now() WHERE usuario_id = 24;
INSERT INTO horario_usuario (usuario_id, actividad_id, fecha, hora_inicio, hora_fin, duracion_minutos, estado, tipo, categoria, created_at, updated_at)
VALUES
  (24, 1, '2026-06-25', '08:00:00-05', '13:00:00-05', 300, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 1, '2026-06-25', '15:00:00-05', '19:00:00-05', 240, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 1, '2026-06-26', '08:00:00-05', '10:00:00-05', 120, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 2, '2026-06-26', '10:00:00-05', '13:00:00-05', 180, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 2, '2026-06-26', '15:00:00-05', '19:00:00-05', 240, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 2, '2026-06-27', '08:00:00-05', '13:00:00-05', 300, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 2, '2026-06-30', '08:00:00-05', '13:00:00-05', 300, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 2, '2026-06-30', '15:00:00-05', '18:00:00-05', 180, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 3, '2026-06-30', '18:00:00-05', '19:00:00-05', 60,  true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 3, '2026-07-01', '08:00:00-05', '13:00:00-05', 300, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 3, '2026-07-01', '15:00:00-05', '19:00:00-05', 240, true, 'actividad', 'potencial_cliente', now(), now()),
  (24, 3, '2026-07-02', '08:00:00-05', '09:00:00-05', 60,  true, 'actividad', 'potencial_cliente', now(), now());
