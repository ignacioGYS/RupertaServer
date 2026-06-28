#!/bin/bash
set -e

cd "$(dirname "$0")"

echo ">> Actualizando código..."
git pull origin main

echo ">> Instalando dependencias..."
npm install

echo ">> Compilando frontend..."
npm run build

echo ">> Reiniciando app..."
if pm2 describe ruperta-monitor > /dev/null 2>&1; then
  pm2 restart ruperta-monitor
else
  pm2 start server/server.js --name ruperta-monitor
fi

pm2 save
echo ">> Deploy completado. App en http://$(hostname -I | awk '{print $1}'):${PORT:-3001}"
