#!/bin/bash
#
# GNOME Adaptive Tone Installer (v3.2.0 with GNOME Shell Extension & GUI Preferences)
# Tested and verified on Samsung Galaxy Book4 Pro 16" (NT960XGK) / Ubuntu 26.04+
#
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
step()  { echo -e "${BLUE}[STEP]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXTENSION_UUID="adaptivetone@hajun.github.io"
OLD_EXTENSION_UUID="truetone@hajun.github.io"

echo "================================================================="
echo "  GNOME Adaptive Tone Installer v3.2 (Extension + Preferences)   "
echo "================================================================="
echo ""

# 1. Check for Hardware CCT Sensor
step "1/8: Checking hardware ambient color temperature (CCT) sensor..."
SENSOR_FOUND=false
for dev in /sys/bus/iio/devices/iio:device*; do
    if [[ -f "$dev/in_colortemp_raw" ]]; then
        SENSOR_FOUND=true
        info "Found hardware CCT sensor: $dev"
        RAW_K=$(cat "$dev/in_colortemp_raw" 2>/dev/null || echo "0")
        info "Current ambient reading: ~$(( RAW_K / 1000 )) K"
        break
    fi
done

if [[ "$SENSOR_FOUND" != "true" ]]; then
    warn "No hardware color temperature sensor (/sys/bus/iio/devices/iio:device*/in_colortemp_raw) detected."
    warn "This device may not have an ambient CCT sensor, or the kernel driver is not loaded."
    read -rp "Continue installation anyway? [y/N] " ans
    [[ "$ans" =~ ^[Yy]$ ]] || exit 0
fi

# 2. Check dependencies
step "2/8: Checking system dependencies..."
for cmd in python3 glib-compile-schemas gnome-extensions; do
    if ! command -v "$cmd" &>/dev/null; then
        error "Required command '$cmd' is not installed."
    fi
done

# 3. Clean up legacy True Tone installations if present
step "3/8: Cleaning up legacy True Tone services and extensions..."
systemctl --user stop gnome-truetone.service 2>/dev/null || true
systemctl --user disable gnome-truetone.service 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/gnome-truetone.service"
rm -rf "$HOME/.local/share/gnome-shell/extensions/$OLD_EXTENSION_UUID"
rm -f "$HOME/.local/share/glib-2.0/schemas/org.gnome.shell.extensions.truetone.gschema.xml"
rm -f "$HOME/.local/share/applications/gnome-truetone-prefs.desktop"

# 4. Create target directories
step "4/8: Preparing directories..."
BIN_DIR="$HOME/.local/bin"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
EXTENSIONS_DIR="$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
SCHEMAS_USER_DIR="$HOME/.local/share/glib-2.0/schemas"
APPS_DIR="$HOME/.local/share/applications"

mkdir -p "$BIN_DIR" "$SYSTEMD_USER_DIR" "$EXTENSIONS_DIR/schemas" "$SCHEMAS_USER_DIR" "$APPS_DIR"

# 5. Install GNOME Shell Extension, Locales & GSettings Schemas
step "5/8: Installing GNOME Shell Extension, Locales & GSettings schemas..."
python3 "$SCRIPT_DIR/tools/build_locale.py"

cp "$SCRIPT_DIR/extension/metadata.json" "$EXTENSIONS_DIR/"
cp "$SCRIPT_DIR/extension/extension.js" "$EXTENSIONS_DIR/"
cp "$SCRIPT_DIR/extension/prefs.js" "$EXTENSIONS_DIR/"
cp "$SCRIPT_DIR/extension/stylesheet.css" "$EXTENSIONS_DIR/"
cp "$SCRIPT_DIR/extension/schemas/org.gnome.shell.extensions.adaptivetone.gschema.xml" "$EXTENSIONS_DIR/schemas/"
cp "$SCRIPT_DIR/extension/schemas/org.gnome.shell.extensions.adaptivetone.gschema.xml" "$SCHEMAS_USER_DIR/"

mkdir -p "$EXTENSIONS_DIR/locale/ko/LC_MESSAGES" "$HOME/.local/share/locale/ko/LC_MESSAGES"
cp -r "$SCRIPT_DIR/extension/locale/"* "$EXTENSIONS_DIR/locale/"
cp -r "$SCRIPT_DIR/extension/locale/"* "$HOME/.local/share/locale/"

glib-compile-schemas "$EXTENSIONS_DIR/schemas/"
glib-compile-schemas "$SCHEMAS_USER_DIR/"
info "GSettings schemas & Gettext locales compiled and installed."

# 6. Install Daemon binary & Systemd unit
step "6/8: Installing Adaptive Tone daemon & systemd user service..."
cp "$SCRIPT_DIR/gnome-adaptive-tone" "$BIN_DIR/gnome-adaptive-tone"
chmod +x "$BIN_DIR/gnome-adaptive-tone"
# Backward compatibility symlink
ln -sf "$BIN_DIR/gnome-adaptive-tone" "$BIN_DIR/gnome-truetone"

cp "$SCRIPT_DIR/gnome-adaptive-tone.service" "$SYSTEMD_USER_DIR/gnome-adaptive-tone.service"
systemctl --user daemon-reload
systemctl --user enable --now gnome-adaptive-tone.service
info "Systemd service enabled and started."

# 7. Install Desktop App Launcher
step "7/8: Installing GUI Preferences launcher..."
cp "$SCRIPT_DIR/gnome-adaptive-tone-prefs.desktop" "$APPS_DIR/"
if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$APPS_DIR" 2>/dev/null || true
fi

# 8. Enable GNOME Shell Extension
step "8/8: Enabling GNOME Shell Extension..."
python3 -c "
import gi
gi.require_version('Gio', '2.0')
from gi.repository import Gio
try:
    settings = Gio.Settings(schema_id='org.gnome.shell')
    if settings.get_boolean('disable-user-extensions'):
        settings.set_boolean('disable-user-extensions', False)
        print('[INFO] Enabled global user extensions master switch (disable-user-extensions = false).')
    exts = list(settings.get_strv('enabled-extensions'))
    if '$EXTENSION_UUID' not in exts:
        exts.append('$EXTENSION_UUID')
        settings.set_strv('enabled-extensions', exts)
        print('[INFO] Added $EXTENSION_UUID to org.gnome.shell enabled-extensions.')
    if '$OLD_EXTENSION_UUID' in exts:
        exts.remove('$OLD_EXTENSION_UUID')
        settings.set_strv('enabled-extensions', exts)
        print('[INFO] Removed legacy $OLD_EXTENSION_UUID from enabled-extensions.')
except Exception as e:
    print('[WARN] Could not update enabled-extensions:', e)
"
gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
info "Extension '$EXTENSION_UUID' registered and enabled."

echo ""
info "================================================================="
info " SUCCESS! GNOME Adaptive Tone v3.2 is installed and running."
info "================================================================="
echo "Useful features & commands:"
echo "  • Open Settings GUI   : gnome-adaptive-tone --settings (or search 'Adaptive Tone' in App Grid)"
echo "  • Quick Settings Tile : Toggle Adaptive Tone & view live status from GNOME Panel"
echo "  • Check Status        : gnome-adaptive-tone --status"
echo "  • Monitor in Console  : gnome-adaptive-tone --test"
echo "  • Restart Service     : systemctl --user restart gnome-adaptive-tone.service"
echo "  • Completely Remove   : ./uninstall.sh"
echo ""
