CREATE TABLE IF NOT EXISTS permisos_usuario (
    id SERIAL PRIMARY KEY,
    usuario_id INT,
    fecha DATE,
    hora_inicio TIMETZ,
    hora_fin TIMETZ,
    motivo VARCHAR(255),
    estado BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permisos_usuario_usuario_id ON permisos_usuario (usuario_id);
CREATE INDEX IF NOT EXISTS idx_permisos_usuario_fecha ON permisos_usuario (fecha);

ALTER TABLE permisos_usuario
    ADD CONSTRAINT fk_permiso_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION;
