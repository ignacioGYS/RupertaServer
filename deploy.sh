#!/bin/bash
set -e

cd "$(dirname "$0")"

echo ">> Actualizando código..."
git pull origin main

echo ">> Reconstruyendo y actualizando contenedores (App y Base de Datos)..."
docker compose build
docker compose up -d
echo ">> Deploy completado. App en http://$(hostname -I | awk '{print $1}'):${PORT:-3001}"
