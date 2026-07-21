-- Agrega columna canje_horario_id a horas_extras para relacionar
-- el bloque canjeado (horario_usuario) con las horas extra que lo originaron.
ALTER TABLE horas_extras
  ADD COLUMN canje_horario_id INTEGER REFERENCES horario_usuario(id);
