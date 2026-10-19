import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';

function isInNightSchedule(settings) {
    if (!settings.get_boolean('night-schedule-enabled')) return false;

    const fromH = settings.get_int('night-schedule-from-hour');
    const fromM = settings.get_int('night-schedule-from-minute');
    const toH = settings.get_int('night-schedule-to-hour');
    const toM = settings.get_int('night-schedule-to-minute');

    if (fromH === toH && fromM === toM) return false;

    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const fromMin = fromH * 60 + fromM;
    const toMin = toH * 60 + toM;

    if (fromMin < toMin) {
        return curMin >= fromMin && curMin < toMin;
    } else {
        return curMin >= fromMin || curMin < toMin;
    }
}

// Seconds until the next schedule start/end, or null when no schedule is active.
function secondsUntilScheduleBoundary(settings) {
    if (!settings.get_boolean('night-schedule-enabled')) return null;

    const fromMin = settings.get_int('night-schedule-from-hour') * 60 + settings.get_int('night-schedule-from-minute');
    const toMin = settings.get_int('night-schedule-to-hour') * 60 + settings.get_int('night-schedule-to-minute');
    if (fromMin === toMin) return null;

    const now = new Date();
    const curSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    let delta = (isInNightSchedule(settings) ? toMin : fromMin) * 60 - curSec;
    if (delta <= 0) delta += 86400;
    // +1s so the tick lands just past the boundary minute
    return delta + 1;
}

const AdaptiveToneToggle = GObject.registerClass(
class AdaptiveToneToggle extends QuickMenuToggle {
    _init(extension) {
        super._init({
            title: _('Adaptive Tone'),
            iconName: 'weather-clear-symbolic',
            toggleMode: true,
        });

        this._extension = extension;
        this._settings = extension.getSettings();
        this._colorSettings = new Gio.Settings({ schema_id: 'org.gnome.settings-daemon.plugins.color' });

        // Bind toggle state directly to 'enabled' key
        this._settings.bind('enabled', this, 'checked', Gio.SettingsBindFlags.DEFAULT);

        // Quick Settings Submenu Header
        this.menu.setHeader('weather-clear-symbolic', _('Adaptive Tone'));

        // Submenu Items: Live Screen Temperature & Offset
        this._screenTempItem = new PopupMenu.PopupMenuItem(_('Screen Temperature: -- K'), { reactive: false });
        this.menu.addMenuItem(this._screenTempItem);

        this._offsetItem = new PopupMenu.PopupMenuItem(_('Tone Offset: 0 K'), { reactive: false });
        this.menu.addMenuItem(this._offsetItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Submenu Item: Preferences Action
        const prefsItem = new PopupMenu.PopupMenuItem(_('Adaptive Tone Settings...'));
        prefsItem.connect('activate', () => {
            this._extension.openPreferences();
            Main.panel.closeQuickSettings();
        });
        this.menu.addMenuItem(prefsItem);

        this._bindSignals();
        this._updateState();
    }

    _bindSignals() {
        this._settingsChangedId = this._settings.connect('changed', () => {
            this._updateState();
        });

        this._colorChangedId = this._colorSettings.connect('changed::night-light-temperature', () => {
            this._updateState();
        });

        this._nightLightEnabledId = this._colorSettings.connect('changed::night-light-enabled', () => {
            this._updateState();
        });
    }

    _updateState() {
        const isEnabled = this._settings.get_boolean('enabled');
        const offset = this._settings.get_int('temp-offset');
        const sign = offset > 0 ? '+' : '';

        if (isEnabled) {
            const currentK = this._colorSettings.get_uint('night-light-temperature');
            const inSchedule = isInNightSchedule(this._settings);
            if (!this._colorSettings.get_boolean('night-light-enabled')) {
                // GNOME Night Light was turned off elsewhere; the daemon's temperature writes have no effect
                this.subtitle = _('Night Light Off');
                this.iconName = 'night-light-disabled-symbolic';
                this._screenTempItem.label.text = _('Screen Temperature: Night Light Off');
            } else if (inSchedule) {
                this.subtitle = `${currentK} K (${_('Night Schedule')})`;
                this.iconName = 'night-light-symbolic';
                this._screenTempItem.label.text = _('Screen Temperature: %d K (Night Schedule)').replace('%d', currentK);
            } else {
                this.subtitle = `${currentK} K (${sign}${offset}K)`;
                this.iconName = 'weather-clear-symbolic';
                this._screenTempItem.label.text = _('Screen Temperature: %d K').replace('%d', currentK);
            }
        } else {
            this.subtitle = _('Off');
            this.iconName = 'night-light-disabled-symbolic';
            this._screenTempItem.label.text = _('Screen Temperature: Disabled');
        }

        this._offsetItem.label.text = _('Tone Offset: %s%d K').replace('%s', sign).replace('%d', offset);
    }

    destroy() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._colorChangedId) {
            this._colorSettings.disconnect(this._colorChangedId);
            this._colorChangedId = null;
        }
        if (this._nightLightEnabledId) {
            this._colorSettings.disconnect(this._nightLightEnabledId);
            this._nightLightEnabledId = null;
        }
        super.destroy();
    }
});

const AdaptiveToneIndicator = GObject.registerClass(
class AdaptiveToneIndicator extends SystemIndicator {
    _init(extension) {
        super._init();

        this._settings = extension.getSettings();

        // Add top-bar indicator icon (optional / hidden by default if user only wants quick settings)
        this._indicator = this._addIndicator();
        this._indicator.icon_name = 'weather-clear-symbolic';

        // Add Quick Settings menu toggle
        this._toggle = new AdaptiveToneToggle(extension);
        this.quickSettingsItems.push(this._toggle);

        this._boundaryTimerId = null;
        this._settingsChangedId = this._settings.connect('changed', () => {
            this._syncIndicator();
        });

        this._syncIndicator();
    }

    _syncIndicator() {
        const show = this._settings.get_boolean('show-indicator');
        const enabled = this._settings.get_boolean('enabled');
        this._indicator.visible = show && enabled;
        if (show && enabled) {
            this._indicator.icon_name = isInNightSchedule(this._settings) ? 'night-light-symbolic' : 'weather-clear-symbolic';
        }
        this._scheduleBoundaryRefresh();
    }

    // The daemon's write at a schedule boundary emits no 'changed' when the temperature is
    // identical, so refresh the labels/icon ourselves with a one-shot timer per boundary.
    _scheduleBoundaryRefresh() {
        if (this._boundaryTimerId) {
            GLib.source_remove(this._boundaryTimerId);
            this._boundaryTimerId = null;
        }
        const secs = secondsUntilScheduleBoundary(this._settings);
        if (secs === null) return;

        this._boundaryTimerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, secs, () => {
            this._boundaryTimerId = null;
            this._toggle._updateState();
            this._syncIndicator();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._boundaryTimerId) {
            GLib.source_remove(this._boundaryTimerId);
            this._boundaryTimerId = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._toggle.destroy();
        super.destroy();
    }
});

/**
 * PSR (Panel Self Refresh) Global Color Transition Refresh Controller
 *
 * Background:
 * On laptops with Intel PSR2 (Selective Fetch) and static screens,
 * changing Night Light temperature only updates the hardware CTM/LUT without
 * generating compositor damage. Consequently, PSR2 only selectively updates
 * small moving areas (e.g. blinking text cursor), causing partial screen yellowing.
 *
 * Mechanism (4-step 1.2s Transition Pulse):
 * GNOME's Night Light smoothly interpolates hardware LUT over ~1.2s.
 * When night-light-temperature changes, this controller pulses 4 times
 * at 300ms intervals (t = 300ms, 600ms, 900ms, 1200ms).
 * Each pulse toggles an invisible full-screen St.Widget (opacity 0 <-> 1/255)
 * and calls global.stage.queue_redraw(). This forces Mutter KMS to emit full-frame
 * damage clips, smoothly applying the color temperature across the entire panel.
 *
 * Zero-Wakeup & Stability Guarantee:
 * - D-Bus traffic: 0 (Pure in-process Clutter / Mutter calls)
 * - Timer self-destructs after 4 ticks (GLib.SOURCE_REMOVE). Zero steady-state wakeups.
 */
class PsrRefreshController {
    constructor() {
        this._colorSettings = new Gio.Settings({ schema_id: 'org.gnome.settings-daemon.plugins.color' });
        this._timerId = null;
        this._stepCount = 0;
        this._maxSteps = 4;
        this._intervalMs = 300;

        // Create invisible full-screen actor to guarantee Mutter KMS Full Damage
        this._fullDamageActor = new St.Widget({
            name: 'adaptivetone-psr-refresher',
            reactive: false,
            opacity: 0,
            visible: false,
            x: 0,
            y: 0,
        });
        this._updateActorSize();
        global.stage.add_child(this._fullDamageActor);

        // Keep actor size in sync with stage in case of resolution / scaling changes
        this._sizeChangedId = global.stage.connect('notify::size', () => {
            this._updateActorSize();
        });

        // Listen for color temperature shifts
        this._colorChangedId = this._colorSettings.connect('changed::night-light-temperature', () => {
            this._startTransitionPulse();
        });
    }

    _updateActorSize() {
        if (this._fullDamageActor && global.stage) {
            this._fullDamageActor.set_size(global.stage.width, global.stage.height);
        }
    }

    _startTransitionPulse() {
        // Reset any existing pulse (debounce)
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }

        this._fullDamageActor.show();
        this._stepCount = 0;
        // Trigger immediate 1st frame redraw
        this._triggerFullRefresh();

        this._timerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this._intervalMs, () => {
            this._stepCount++;
            this._triggerFullRefresh();

            if (this._stepCount >= this._maxSteps) {
                this._timerId = null;
                if (this._fullDamageActor) {
                    this._fullDamageActor.opacity = 0;
                    this._fullDamageActor.hide();
                }
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _triggerFullRefresh() {
        if (!this._fullDamageActor) return;
        // Micro-toggle opacity between 0 and 1 (1/255 is imperceptible to human eye)
        // to force Mutter DRM to emit full-screen damage clips.
        this._fullDamageActor.opacity = (this._fullDamageActor.opacity === 0) ? 1 : 0;
        global.stage.queue_redraw();
    }

    destroy() {
        if (this._timerId) {
            GLib.source_remove(this._timerId);
            this._timerId = null;
        }
        if (this._colorChangedId) {
            this._colorSettings.disconnect(this._colorChangedId);
            this._colorChangedId = null;
        }
        if (this._sizeChangedId) {
            global.stage.disconnect(this._sizeChangedId);
            this._sizeChangedId = null;
        }
        if (this._fullDamageActor) {
            global.stage.remove_child(this._fullDamageActor);
            this._fullDamageActor.destroy();
            this._fullDamageActor = null;
        }
        this._colorSettings = null;
    }
}

export default class AdaptiveToneExtension extends Extension {
    enable() {
        this.initTranslations();
        this._indicator = new AdaptiveToneIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        // Initialize PSR Global Color Transition Refresh Controller (Intel PSR2 Selective Fetch fix)
        this._psrRefresher = new PsrRefreshController();
    }

    disable() {
        if (this._psrRefresher) {
            this._psrRefresher.destroy();
            this._psrRefresher = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
