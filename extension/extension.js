import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';

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
    }

    _updateState() {
        const isEnabled = this._settings.get_boolean('enabled');
        const offset = this._settings.get_int('temp-offset');
        const sign = offset > 0 ? '+' : '';

        if (isEnabled) {
            const currentK = this._colorSettings.get_uint('night-light-temperature');
            this.subtitle = `${currentK} K (${sign}${offset}K)`;
            this.iconName = 'weather-clear-symbolic';
            this._screenTempItem.label.text = _('Screen Temperature: %d K').replace('%d', currentK);
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

        this._showIndicatorChangedId = this._settings.connect('changed::show-indicator', () => {
            this._syncIndicator();
        });
        this._enabledChangedId = this._settings.connect('changed::enabled', () => {
            this._syncIndicator();
        });

        this._syncIndicator();
    }

    _syncIndicator() {
        const show = this._settings.get_boolean('show-indicator');
        const enabled = this._settings.get_boolean('enabled');
        this._indicator.visible = show && enabled;
    }

    destroy() {
        if (this._showIndicatorChangedId) {
            this._settings.disconnect(this._showIndicatorChangedId);
            this._showIndicatorChangedId = null;
        }
        if (this._enabledChangedId) {
            this._settings.disconnect(this._enabledChangedId);
            this._enabledChangedId = null;
        }
        this._toggle.destroy();
        super.destroy();
    }
});

export default class AdaptiveToneExtension extends Extension {
    enable() {
        this.initTranslations();
        this._indicator = new AdaptiveToneIndicator(this);
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
