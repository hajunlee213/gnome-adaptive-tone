#!/bin/bash
#
# Uninstaller for GNOME Adaptive Tone (and legacy True Tone)
#
set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $*"; }
step() { echo -e "${BLUE}[STEP]${NC} $*"; }

EXTENSION_UUID="adaptivetone@hajun.github.io"
OLD_EXTENSION_UUID="truetone@hajun.github.io"

echo "================================================================="
echo "             GNOME Adaptive Tone Uninstaller                     "
echo "================================================================="

# 1. Restore GNOME Night Light settings
step "Restoring original GNOME color settings..."
if [[ -x "$HOME/.local/bin/gnome-adaptive-tone" ]]; then
    "$HOME/.local/bin/gnome-adaptive-tone" --restore 2>/dev/null || true
elif [[ -x "./gnome-adaptive-tone" ]]; then
    ./gnome-adaptive-tone --restore 2>/dev/null || true
elif [[ -x "$HOME/.local/bin/gnome-truetone" ]]; then
    "$HOME/.local/bin/gnome-truetone" --restore 2>/dev/null || true
fi

# 2. Disable and stop systemd services
step "Stopping and disabling systemd services..."
systemctl --user stop gnome-adaptive-tone.service 2>/dev/null || true
systemctl --user disable gnome-adaptive-tone.service 2>/dev/null || true
systemctl --user stop gnome-truetone.service 2>/dev/null || true
systemctl --user disable gnome-truetone.service 2>/dev/null || true

# 3. Disable GNOME Shell Extensions
step "Disabling GNOME Shell Extensions..."
gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || true
gnome-extensions disable "$OLD_EXTENSION_UUID" 2>/dev/null || true

# 4. Remove installed files
step "Removing installed files and extensions..."
rm -f "$HOME/.local/bin/gnome-adaptive-tone"
rm -f "$HOME/.local/bin/gnome-truetone"
rm -f "$HOME/.config/systemd/user/gnome-adaptive-tone.service"
rm -f "$HOME/.config/systemd/user/gnome-truetone.service"
rm -rf "$HOME/.local/share/gnome-shell/extensions/$EXTENSION_UUID"
rm -rf "$HOME/.local/share/gnome-shell/extensions/$OLD_EXTENSION_UUID"
rm -f "$HOME/.local/share/glib-2.0/schemas/org.gnome.shell.extensions.adaptivetone.gschema.xml"
rm -f "$HOME/.local/share/glib-2.0/schemas/org.gnome.shell.extensions.truetone.gschema.xml"
rm -f "$HOME/.local/share/applications/gnome-adaptive-tone-prefs.desktop"
rm -f "$HOME/.local/share/applications/gnome-truetone-prefs.desktop"
rm -rf "$HOME/.config/gnome-adaptive-tone"
rm -rf "$HOME/.config/gnome-truetone"

# Recompile user schemas
if command -v glib-compile-schemas &>/dev/null && [[ -d "$HOME/.local/share/glib-2.0/schemas" ]]; then
    glib-compile-schemas "$HOME/.local/share/glib-2.0/schemas" 2>/dev/null || true
fi

systemctl --user daemon-reload

info "================================================================="
info " GNOME Adaptive Tone has been completely and cleanly uninstalled."
info "================================================================="
