#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== Pullando cambios ==="
git pull

echo "=== Deteniendo contenedor viejo ==="
docker compose down 2>/dev/null || true
docker rm produccion 2>/dev/null || true

echo "=== Construyendo imagen ==="
docker compose build

echo "=== Iniciando contenedor ==="
docker compose up -d

echo "=== Limpiando imágenes no usadas ==="
docker image prune -f

echo "=== Deploy completado ==="
