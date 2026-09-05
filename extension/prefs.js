import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DEFAULTS = {
    'enabled': true,
    'temp-offset': 0,
    'display-min': 3800,
    'display-max': 6500,
    'ambient-min': 2500,
    'ambient-max': 7000,
    'update-threshold': 100,
    'glitch-threshold': 500,
    'glitch-confirm-sec': 0.8,
    'min-lux-threshold': 5.0,
    'occlusion-hold-sec': 3.0,
    'resume-delay-sec': 2.0,
    'enable-polling': false,
    'poll-interval': 10,
    'show-indicator': false,
};

export default class AdaptiveTonePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        this.initTranslations();

        window.set_default_size(680, 720);
        window.set_search_enabled(true);

        const settings = this.getSettings();

        // -------------------------------------------------------------
        // Header Bar: "Reset All to Defaults" Action Button
        // -------------------------------------------------------------
        const resetAllBtn = new Gtk.Button({
            icon_name: 'view-refresh-symbolic',
            tooltip_text: _('Reset All to Defaults'),
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });

        resetAllBtn.connect('clicked', () => {
            for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
                if (typeof defaultVal === 'boolean') {
                    settings.set_boolean(key, defaultVal);
                } else if (Number.isInteger(defaultVal)) {
                    settings.set_int(key, defaultVal);
                } else if (typeof defaultVal === 'number') {
                    settings.set_double(key, defaultVal);
                }
            }
        });

        // =============================================================
        // Helper: Create Reset Button for Individual Row
        // =============================================================
        const createResetButton = (key, defaultVal, formatFn = (v) => `${v}`) => {
            const btn = new Gtk.Button({
                icon_name: 'edit-undo-symbolic',
                tooltip_text: _('Reset to default (Default: %s)').replace('%s', formatFn(defaultVal)),
                valign: Gtk.Align.CENTER,
                css_classes: ['flat', 'circular'],
            });

            const updateState = () => {
                let currentVal;
                if (typeof defaultVal === 'boolean') {
                    currentVal = settings.get_boolean(key);
                } else if (Number.isInteger(defaultVal)) {
                    currentVal = settings.get_int(key);
                } else {
                    currentVal = settings.get_double(key);
                }

                const isDefault = Math.abs(currentVal - defaultVal) < 0.001;
                btn.set_sensitive(!isDefault);
                btn.set_opacity(isDefault ? 0.35 : 1.0);
            };

            btn.connect('clicked', () => {
                if (typeof defaultVal === 'boolean') {
                    settings.set_boolean(key, defaultVal);
                } else if (Number.isInteger(defaultVal)) {
                    settings.set_int(key, defaultVal);
                } else {
                    settings.set_double(key, defaultVal);
                }
                updateState();
            });

            settings.connect(`changed::${key}`, updateState);
            updateState();
            return btn;
        };

        // =============================================================
        // PAGE 1: Display & Color Tone (화면 및 색감)
        // =============================================================
        const displayPage = new Adw.PreferencesPage({
            title: _('Display & Color Tone'),
            icon_name: 'display-symbolic',
        });
        window.add(displayPage);

        // Group 1: General Control
        const masterGroup = new Adw.PreferencesGroup({
            title: _('General Control'),
            description: _('Adaptive Tone operation state and top panel appearance'),
        });
        displayPage.add(masterGroup);

        // Switch: Master Enable
        const enableRow = new Adw.SwitchRow({
            title: _('Adaptive Tone Active'),
            subtitle: _('Automatic ambient color temperature matching'),
        });
        settings.bind('enabled', enableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        enableRow.add_suffix(createResetButton('enabled', DEFAULTS['enabled'], (v) => v ? _('On') : _('Off')));
        masterGroup.add(enableRow);

        // Switch: Panel Indicator
        const indicatorRow = new Adw.SwitchRow({
            title: _('Show Panel Indicator'),
            subtitle: _('Display status icon in GNOME top panel'),
        });
        settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        indicatorRow.add_suffix(createResetButton('show-indicator', DEFAULTS['show-indicator'], (v) => v ? _('On') : _('Off')));
        masterGroup.add(indicatorRow);

        // Group 2: Display White Point & Tone
        const toneGroup = new Adw.PreferencesGroup({
            title: _('White-Point & Tone Fine-Tuning'),
            description: _('Configure display color temperature bounds and comfort level.'),
        });
        displayPage.add(toneGroup);

        // Offset SpinRow
        const offsetRow = new Adw.SpinRow({
            title: _('Color Temperature Offset'),
            subtitle: _('+ for crisp cooler white, - for comfortable warmer white'),
            adjustment: new Gtk.Adjustment({
                lower: -1000,
                upper: 1000,
                step_increment: 25,
                page_increment: 100,
            }),
            climb_rate: 10,
        });
        settings.bind('temp-offset', offsetRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        offsetRow.add_suffix(createResetButton('temp-offset', DEFAULTS['temp-offset'], (v) => `${v > 0 ? '+' : ''}${v} K`));
        toneGroup.add(offsetRow);

        // Display Min SpinRow
        const displayMinRow = new Adw.SpinRow({
            title: _('Minimum Display Temperature (Warmest)'),
            subtitle: _('Prevents display from becoming oversaturated yellow under warm indoor lighting'),
            adjustment: new Gtk.Adjustment({
                lower: 2500,
                upper: 5000,
                step_increment: 50,
                page_increment: 200,
            }),
            climb_rate: 10,
        });
        settings.bind('display-min', displayMinRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        displayMinRow.add_suffix(createResetButton('display-min', DEFAULTS['display-min'], (v) => `${v} K`));
        toneGroup.add(displayMinRow);

        // Display Max SpinRow
        const displayMaxRow = new Adw.SpinRow({
            title: _('Maximum Display Temperature (Coolest)'),
            subtitle: _('Standard cool white-point under bright daylight'),
            adjustment: new Gtk.Adjustment({
                lower: 5000,
                upper: 9000,
                step_increment: 50,
                page_increment: 200,
            }),
            climb_rate: 10,
        });
        settings.bind('display-max', displayMaxRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        displayMaxRow.add_suffix(createResetButton('display-max', DEFAULTS['display-max'], (v) => `${v} K`));
        toneGroup.add(displayMaxRow);

        // =============================================================
        // PAGE 2: Sensor & Dynamics (센서 및 알고리즘)
        // =============================================================
        const sensorPage = new Adw.PreferencesPage({
            title: _('Sensor & Dynamics'),
            icon_name: 'preferences-other-symbolic',
        });
        window.add(sensorPage);

        // Group 3: Ambient Sensor Range & Curve
        const curveGroup = new Adw.PreferencesGroup({
            title: _('Sensor Bounds & Transfer Curve'),
            description: _('Hardware CCT sensor input bounds and SmoothStep mapping parameters.'),
        });
        sensorPage.add(curveGroup);

        // Ambient Min SpinRow
        const ambientMinRow = new Adw.SpinRow({
            title: _('Minimum Ambient Temperature'),
            subtitle: _('Lower bound for SmoothStep curve mapping'),
            adjustment: new Gtk.Adjustment({
                lower: 1000,
                upper: 4000,
                step_increment: 50,
                page_increment: 200,
            }),
            climb_rate: 10,
        });
        settings.bind('ambient-min', ambientMinRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        ambientMinRow.add_suffix(createResetButton('ambient-min', DEFAULTS['ambient-min'], (v) => `${v} K`));
        curveGroup.add(ambientMinRow);

        // Ambient Max SpinRow
        const ambientMaxRow = new Adw.SpinRow({
            title: _('Maximum Ambient Temperature'),
            subtitle: _('Upper bound for SmoothStep curve mapping'),
            adjustment: new Gtk.Adjustment({
                lower: 5000,
                upper: 12000,
                step_increment: 50,
                page_increment: 200,
            }),
            climb_rate: 10,
        });
        settings.bind('ambient-max', ambientMaxRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        ambientMaxRow.add_suffix(createResetButton('ambient-max', DEFAULTS['ambient-max'], (v) => `${v} K`));
        curveGroup.add(ambientMaxRow);

        // Update Threshold (Hysteresis) SpinRow
        const thresholdRow = new Adw.SpinRow({
            title: _('Hysteresis Threshold'),
            subtitle: _('Minimum change required to update display and prevent micro-flickering'),
            adjustment: new Gtk.Adjustment({
                lower: 10,
                upper: 400,
                step_increment: 10,
                page_increment: 50,
            }),
            climb_rate: 10,
        });
        settings.bind('update-threshold', thresholdRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        thresholdRow.add_suffix(createResetButton('update-threshold', DEFAULTS['update-threshold'], (v) => `${v} K`));
        curveGroup.add(thresholdRow);

        // Group 4: Glitch, Occlusion & Suspend Protection
        const protectGroup = new Adw.PreferencesGroup({
            title: _('Glitch, Occlusion & Suspend Protection'),
            description: _('Filters transient sensor spikes and prevents unwanted shifts when covered or waking.'),
        });
        sensorPage.add(protectGroup);

        // Glitch Jump Threshold SpinRow
        const glitchThresholdRow = new Adw.SpinRow({
            title: _('Glitch Jump Threshold'),
            subtitle: _('Minimum ambient step jump to hold for confirmation'),
            adjustment: new Gtk.Adjustment({
                lower: 200,
                upper: 1500,
                step_increment: 50,
                page_increment: 100,
            }),
            climb_rate: 10,
        });
        settings.bind('glitch-threshold', glitchThresholdRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        glitchThresholdRow.add_suffix(createResetButton('glitch-threshold', DEFAULTS['glitch-threshold'], (v) => `${v} K`));
        protectGroup.add(glitchThresholdRow);

        // Glitch Confirmation Window SpinRow
        const glitchConfirmRow = new Adw.SpinRow({
            title: _('Glitch Confirmation Window'),
            subtitle: _('Observation duration before confirming large ambient jumps'),
            adjustment: new Gtk.Adjustment({
                lower: 0.2,
                upper: 3.0,
                step_increment: 0.1,
                page_increment: 0.5,
            }),
            digits: 1,
            climb_rate: 1,
        });
        settings.bind('glitch-confirm-sec', glitchConfirmRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        glitchConfirmRow.add_suffix(createResetButton('glitch-confirm-sec', DEFAULTS['glitch-confirm-sec'], (v) => `${v.toFixed(1)} ${_('s')}`));
        protectGroup.add(glitchConfirmRow);

        // Min Lux Threshold SpinRow
        const luxRow = new Adw.SpinRow({
            title: _('Occlusion Lux Threshold'),
            subtitle: _('Illuminance threshold below which occlusion guard is activated'),
            adjustment: new Gtk.Adjustment({
                lower: 0.1,
                upper: 30.0,
                step_increment: 0.5,
                page_increment: 2.0,
            }),
            digits: 1,
            climb_rate: 1,
        });
        settings.bind('min-lux-threshold', luxRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        luxRow.add_suffix(createResetButton('min-lux-threshold', DEFAULTS['min-lux-threshold'], (v) => `${v.toFixed(1)} lx`));
        protectGroup.add(luxRow);

        // Occlusion Hold Duration SpinRow
        const holdRow = new Adw.SpinRow({
            title: _('Occlusion Hold Duration'),
            subtitle: _('Duration to maintain current white-point during transient occlusion'),
            adjustment: new Gtk.Adjustment({
                lower: 0.5,
                upper: 10.0,
                step_increment: 0.5,
                page_increment: 1.0,
            }),
            digits: 1,
            climb_rate: 1,
        });
        settings.bind('occlusion-hold-sec', holdRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        holdRow.add_suffix(createResetButton('occlusion-hold-sec', DEFAULTS['occlusion-hold-sec'], (v) => `${v.toFixed(1)} ${_('s')}`));
        protectGroup.add(holdRow);

        // Resume Delay SpinRow
        const resumeRow = new Adw.SpinRow({
            title: _('Resume Stabilization Delay'),
            subtitle: _('Wait duration for sensor and display stabilization after wake'),
            adjustment: new Gtk.Adjustment({
                lower: 0.5,
                upper: 5.0,
                step_increment: 0.5,
                page_increment: 1.0,
            }),
            digits: 1,
            climb_rate: 1,
        });
        settings.bind('resume-delay-sec', resumeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        resumeRow.add_suffix(createResetButton('resume-delay-sec', DEFAULTS['resume-delay-sec'], (v) => `${v.toFixed(1)} ${_('s')}`));
        protectGroup.add(resumeRow);

        // Group 5: Fallback Polling
        const pollingGroup = new Adw.PreferencesGroup({
            title: _('Fallback Polling'),
            description: _('Pure event-driven by default; optional periodic timer fallback can be enabled.'),
        });
        sensorPage.add(pollingGroup);

        // Polling Enable Switch
        const pollEnableRow = new Adw.SwitchRow({
            title: _('Enable Fallback Polling'),
            subtitle: _('Periodically verify sensor in addition to D-Bus events'),
        });
        settings.bind('enable-polling', pollEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        pollEnableRow.add_suffix(createResetButton('enable-polling', DEFAULTS['enable-polling'], (v) => v ? _('On') : _('Off')));
        pollingGroup.add(pollEnableRow);

        // Polling Interval SpinRow
        const intervalRow = new Adw.SpinRow({
            title: _('Polling Interval'),
            subtitle: _('Interval in seconds between periodic checks when polling is enabled'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 60,
                step_increment: 1,
                page_increment: 5,
            }),
            climb_rate: 1,
        });
        settings.bind('poll-interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        intervalRow.add_suffix(createResetButton('poll-interval', DEFAULTS['poll-interval'], (v) => `${v} ${_('s')}`));
        pollingGroup.add(intervalRow);

        // =============================================================
        // PAGE 3: About & Maintenance (정보 및 복원)
        // =============================================================
        const aboutPage = new Adw.PreferencesPage({
            title: _('About & Maintenance'),
            icon_name: 'help-about-symbolic',
        });
        window.add(aboutPage);

        const resetGroup = new Adw.PreferencesGroup({
            title: _('Reset & Service Management'),
            description: _('Restore factory defaults or inspect daemon status.'),
        });
        aboutPage.add(resetGroup);

        const resetAllActionRow = new Adw.ActionRow({
            title: _('Restore All Default Settings'),
            subtitle: _('Reset all temperature bounds, offsets, and dynamics to factory defaults.'),
        });
        const resetBtnInRow = new Gtk.Button({
            label: _('Reset All'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetBtnInRow.connect('clicked', () => {
            for (const [key, defaultVal] of Object.entries(DEFAULTS)) {
                if (typeof defaultVal === 'boolean') {
                    settings.set_boolean(key, defaultVal);
                } else if (Number.isInteger(defaultVal)) {
                    settings.set_int(key, defaultVal);
                } else if (typeof defaultVal === 'number') {
                    settings.set_double(key, defaultVal);
                }
            }
        });
        resetAllActionRow.add_suffix(resetBtnInRow);
        resetGroup.add(resetAllActionRow);

        const infoGroup = new Adw.PreferencesGroup({
            title: _('Project Information'),
        });
        aboutPage.add(infoGroup);

        const versionRow = new Adw.ActionRow({
            title: _('GNOME Adaptive Tone'),
            subtitle: _('v3.2.0 (Native GNOME Shell Extension & Zero-Overhead Daemon)'),
        });
        infoGroup.add(versionRow);

        const authorRow = new Adw.ActionRow({
            title: _('Hardware Integration'),
            subtitle: _('Intel ISH ALS CCT sensor & GNOME Mutter/gsd-color LUT native pipeline'),
        });
        infoGroup.add(authorRow);
    }
}
