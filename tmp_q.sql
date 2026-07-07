SELECT id, actividad_id, fecha::text, hora_inicio::text, hora_fin::text, duracion_minutos, estado
FROM horario_usuario
WHERE usuario_id = 24 AND estado = true
ORDER BY actividad_id, fecha, hora_inicio;
