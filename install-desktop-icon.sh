#!/bin/bash
# Script de instalación del ícono de escritorio de RupertaMonitor
# Ejecutar desde el directorio del proyecto: bash install-desktop-icon.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Defaults
SSH_HOST="192.168.1.63"
PORT="3001"

if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r key val; do
    [[ "$key" =~ ^[[:space:]]*# ]] && continue
    [[ -z "$key" ]] && continue
    key="${key// /}"
    val="${val%%#*}"
    val="${val%"${val##*[![:space:]]}"}"
    case "$key" in
      SSH_HOST) SSH_HOST="$val" ;;
      PORT) PORT="$val" ;;
    esac
  done < "$ENV_FILE"
fi

APP_URL="http://${SSH_HOST}:${PORT}"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Escritorio")"
DESKTOP_FILE="$DESKTOP_DIR/RupertaMonitor.desktop"
APPS_DIR="$HOME/.local/share/applications"

echo "Instalando icono de escritorio para RupertaMonitor..."
echo "   URL: $APP_URL"

cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=RupertaMonitor
Comment=Panel de control del servidor Ruperta - $APP_URL
Exec=xdg-open $APP_URL
Icon=network-server
Terminal=false
Categories=Network;System;Monitor;
Keywords=servidor;server;monitor;ruperta;
StartupNotify=false
EOF

chmod +x "$DESKTOP_FILE"

if command -v gio &>/dev/null; then
  gio set "$DESKTOP_FILE" metadata::trusted true 2>/dev/null || true
fi

mkdir -p "$APPS_DIR"
cp "$DESKTOP_FILE" "$APPS_DIR/RupertaMonitor.desktop"
if command -v update-desktop-database &>/dev/null; then
  update-desktop-database "$APPS_DIR" 2>/dev/null || true
fi

echo ""
echo "Listo! Icono instalado en:"
echo "   - $DESKTOP_FILE  (escritorio)"
echo "   - $APPS_DIR/RupertaMonitor.desktop  (menu de apps)"
echo ""
echo "Si el icono aparece como 'sin confianza' en GNOME, clic derecho -> 'Permitir ejecutar'"
