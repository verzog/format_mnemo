<?php
// This file is part of Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * Admin asset viewer: a gallery of the plugin's site-wide textures (as image
 * previews) and glTF prop models (as live 3D previews), showing which are
 * uploaded, configured by URL, or the bundled default.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/adminlib.php');

use format_mnemo\output\asset_gallery;
use format_mnemo\local\model_config;
use format_mnemo\local\model_licence;
use format_mnemo\local\model_store;

admin_externalpage_setup('format_mnemo_preview');

$PAGE->set_title(get_string('preview_title', 'format_mnemo'));
$PAGE->set_heading(get_string('preview_title', 'format_mnemo'));

// Save a per-model settings form (environments, facing, scale). The admin
// external page already gates access to site config; a sesskey guards the POST.
$savemodel = optional_param('savemodel', '', PARAM_RAW_TRIMMED);
if ($savemodel !== '' && confirm_sesskey()) {
    // Only accept a name that is a real, configurable model (props, vehicles
    // and buildings — every viewer model bar the celestials).
    $known = asset_gallery::configurable_model_names();
    if (in_array($savemodel, $known, true)) {
        $envs = [];
        foreach (model_config::ENVIRONMENTS as $env) {
            if (optional_param('env_' . $env, 0, PARAM_BOOL)) {
                $envs[] = $env;
            }
        }
        $yawraw = optional_param('yaw', '', PARAM_RAW_TRIMMED);
        $pitchraw = optional_param('pitch', '', PARAM_RAW_TRIMMED);
        $rollraw = optional_param('roll', '', PARAM_RAW_TRIMMED);
        $scaleraw = optional_param('scale', '', PARAM_RAW_TRIMMED);
        $numornull = function (string $raw): ?float {
            return ($raw === '' || !is_numeric($raw)) ? null : (float)$raw;
        };
        // Behaviour checkboxes: read every known flag (an unchecked box does not
        // post), so the saved state matches the form. The store drops any flag
        // left at its engine default.
        $behaviour = [];
        foreach (array_keys(model_config::BEHAVIOUR_DEFAULTS) as $flag) {
            $behaviour[$flag] = (bool)optional_param('beh_' . $flag, 0, PARAM_BOOL);
        }
        model_config::set($savemodel, [
            'envs' => $envs,
            'yaw' => $numornull($yawraw),
            'pitch' => $numornull($pitchraw),
            'roll' => $numornull($rollraw),
            'scale' => $numornull($scaleraw),
            'behaviour' => $behaviour,
            'credit' => [
                'title' => optional_param('credit_title', '', PARAM_TEXT),
                'author' => optional_param('credit_author', '', PARAM_TEXT),
                'licence' => optional_param('credit_licence', '', PARAM_TEXT),
                'source' => optional_param('credit_source', '', PARAM_URL),
            ],
        ]);
        redirect(
            $PAGE->url,
            get_string('preview_saved', 'format_mnemo', s($savemodel)),
            null,
            \core\output\notification::NOTIFY_SUCCESS
        );
    }
    redirect($PAGE->url);
}

// Delete an uploaded model: the card's Delete link asks first on a confirm
// page; the confirmed POST (with sesskey) deletes. Only an uploaded model in
// one of the three model areas can be deleted, never a bundled one.
$deletemodel = optional_param('deletemodel', '', PARAM_RAW_TRIMMED);
if ($deletemodel !== '') {
    $deletearea = optional_param('deletearea', '', PARAM_ALPHA);
    $files = model_store::files($deletearea, $deletemodel);
    if (!$files) {
        redirect($PAGE->url);
    }
    if (optional_param('confirm', 0, PARAM_BOOL) && confirm_sesskey()) {
        model_store::delete($deletearea, $deletemodel);
        redirect(
            $PAGE->url,
            get_string('preview_deleted', 'format_mnemo', s($deletemodel)),
            null,
            \core\output\notification::NOTIFY_SUCCESS
        );
    }
    $message = get_string('preview_delete_confirm', 'format_mnemo', (object)[
        'name' => s($deletemodel),
        'files' => s(implode(', ', array_keys($files))),
    ]);
    if (is_readable($CFG->dirroot . '/course/format/mnemo/models/' . $deletemodel . '.glb')) {
        $message .= ' ' . get_string('preview_delete_bundled', 'format_mnemo', s($deletemodel));
    }
    $continue = new moodle_url($PAGE->url, [
        'deletemodel' => $deletemodel,
        'deletearea' => $deletearea,
        'confirm' => 1,
        'sesskey' => sesskey(),
    ]);
    echo $OUTPUT->header();
    echo $OUTPUT->confirm(
        $message,
        new single_button($continue, get_string('preview_delete', 'format_mnemo'), 'post', single_button::BUTTON_DANGER),
        $PAGE->url
    );
    echo $OUTPUT->footer();
    die;
}

$textures = asset_gallery::textures();
$models = asset_gallery::models();
$configurable = asset_gallery::configurable_model_names();
$rootid = 'mnemo-preview-' . uniqid();

/**
 * The per-model settings panel: a collapsible form to set the model's
 * environments, facing, scale and behaviour, saved back to this page.
 *
 * @param string $name The model name (.glb basename).
 * @param array $cfg The model's current normalised config.
 * @param moodle_url $url This page's URL (the form target).
 * @param string $canvasid The model card's canvas id, so "Use this view" can find the form.
 * @return string HTML for the panel.
 */
function mnemo_model_settings_panel(string $name, array $cfg, moodle_url $url, string $canvasid): string {
    $rows = '';

    // Environment checkboxes (empty = every environment).
    $boxes = '';
    foreach (model_config::ENVIRONMENTS as $env) {
        $id = 'env_' . $name . '_' . $env;
        $attrs = ['type' => 'checkbox', 'name' => 'env_' . $env, 'value' => 1, 'id' => $id];
        if (in_array($env, $cfg['envs'], true)) {
            $attrs['checked'] = 'checked';
        }
        $boxes .= html_writer::tag(
            'label',
            html_writer::empty_tag('input', $attrs) . ' ' .
            get_string('environment_' . $env, 'format_mnemo'),
            ['class' => 'format-mnemo-preview__check']
        );
    }
    $rows .= html_writer::div(
        html_writer::tag(
            'span',
            get_string('preview_environments', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__field-label']
        ) . $boxes,
        'format-mnemo-preview__field'
    );

    // Facing radios: Auto, or a cardinal preset (degrees). A stored non-cardinal
    // facing (e.g. a hand-edited 45) is kept as its own checked option so saving
    // a change to another field does not silently clear it.
    $current = $cfg['yaw'] === null ? '' : rtrim(rtrim(sprintf('%.2f', $cfg['yaw']), '0'), '.');
    $dirs = ['' => get_string('preview_dir_auto', 'format_mnemo'),
        '0' => get_string('preview_dir_0', 'format_mnemo'),
        '90' => get_string('preview_dir_90', 'format_mnemo'),
        '180' => get_string('preview_dir_180', 'format_mnemo'),
        '270' => get_string('preview_dir_270', 'format_mnemo')];
    if ($current !== '' && !array_key_exists($current, $dirs)) {
        $dirs[$current] = $current . '°';
    }
    $radios = '';
    foreach ($dirs as $value => $label) {
        $attrs = ['type' => 'radio', 'name' => 'yaw', 'value' => $value];
        if ($value === $current) {
            $attrs['checked'] = 'checked';
        }
        $radios .= html_writer::tag(
            'label',
            html_writer::empty_tag('input', $attrs) . ' ' . $label,
            ['class' => 'format-mnemo-preview__check']
        );
    }
    $rows .= html_writer::div(
        html_writer::tag(
            'span',
            get_string('preview_direction', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__field-label']
        ) . $radios,
        'format-mnemo-preview__field'
    );

    // Pitch (X) and roll (Z) orientation corrections in degrees, for a model
    // authored lying down or upside down (yaw/facing is the field above). Blank
    // = no correction.
    $anglefield = function (string $key, string $label) use ($name, $cfg): string {
        $value = $cfg[$key] === null ? '' : rtrim(rtrim(sprintf('%.1f', $cfg[$key]), '0'), '.');
        return html_writer::div(
            html_writer::tag(
                'label',
                get_string($label, 'format_mnemo'),
                ['class' => 'format-mnemo-preview__field-label', 'for' => $key . '_' . $name]
            ) .
            html_writer::empty_tag('input', [
                'type' => 'number', 'name' => $key, 'id' => $key . '_' . $name,
                'min' => '0', 'max' => '360', 'step' => 'any',
                'class' => 'format-mnemo-preview__scale', 'value' => $value,
            ]),
            'format-mnemo-preview__field'
        );
    };
    $rows .= $anglefield('pitch', 'preview_pitch');
    $rows .= $anglefield('roll', 'preview_roll');

    // Scale (blank = model default).
    $rows .= html_writer::div(
        html_writer::tag(
            'label',
            get_string('preview_scale', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__field-label', 'for' => 'scale_' . $name]
        ) .
        html_writer::empty_tag('input', [
            'type' => 'number', 'name' => 'scale', 'id' => 'scale_' . $name,
            // A step of "any" so an already-stored value like 1.25 is not
            // rejected by the browser's step constraint (the store accepts any
            // finite scale).
            'min' => '0.1', 'max' => '10', 'step' => 'any', 'class' => 'format-mnemo-preview__scale',
            'value' => $cfg['scale'] === null ? '' : rtrim(rtrim(sprintf('%.2f', $cfg['scale']), '0'), '.'),
        ]),
        'format-mnemo-preview__field'
    );

    // Behaviour checkboxes: each shows the model's effective flag (its stored
    // value, or the engine default when unset). Only a change from the default
    // is stored on save.
    $behboxes = '';
    foreach (model_config::BEHAVIOUR_DEFAULTS as $flag => $default) {
        $id = 'beh_' . $name . '_' . $flag;
        $attrs = ['type' => 'checkbox', 'name' => 'beh_' . $flag, 'value' => 1, 'id' => $id];
        $on = array_key_exists($flag, $cfg['behaviour']) ? $cfg['behaviour'][$flag] : $default;
        if ($on) {
            $attrs['checked'] = 'checked';
        }
        $behboxes .= html_writer::tag(
            'label',
            html_writer::empty_tag('input', $attrs) . ' ' .
            get_string('preview_beh_' . $flag, 'format_mnemo'),
            ['class' => 'format-mnemo-preview__check']
        );
    }
    $rows .= html_writer::div(
        html_writer::tag(
            'span',
            get_string('preview_behaviour', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__field-label']
        ) . $behboxes . html_writer::tag(
            'small',
            get_string('preview_beh_animate_note', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__hint']
        ),
        'format-mnemo-preview__field'
    );

    // Credit fields: each one filled in here replaces what the model file says
    // (most useful for models whose file names no author or licence).
    $credit = $cfg['credit'] ?? [];
    $creditrows = '';
    foreach (model_licence::FIELDS as $field) {
        $id = 'credit_' . $field . '_' . $name;
        $creditrows .= html_writer::div(
            html_writer::tag(
                'label',
                get_string('preview_credit_' . $field, 'format_mnemo'),
                ['class' => 'format-mnemo-preview__field-label', 'for' => $id]
            ) .
            html_writer::empty_tag('input', [
                'type' => $field === 'source' ? 'url' : 'text', 'name' => 'credit_' . $field, 'id' => $id,
                'maxlength' => 255, 'class' => 'format-mnemo-preview__credit', 'value' => $credit[$field] ?? '',
            ]),
            'format-mnemo-preview__field'
        );
    }
    $rows .= html_writer::div(
        html_writer::tag(
            'span',
            get_string('preview_credit', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__field-label']
        ) .
        html_writer::tag(
            'small',
            get_string('preview_credit_help', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__hint']
        ) .
        $creditrows,
        'format-mnemo-preview__field'
    );

    $form = html_writer::tag(
        'form',
        html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'savemodel', 'value' => $name]) .
        html_writer::empty_tag('input', ['type' => 'hidden', 'name' => 'sesskey', 'value' => sesskey()]) .
        $rows .
        html_writer::tag(
            'button',
            get_string('preview_save', 'format_mnemo'),
            ['type' => 'submit', 'class' => 'btn btn-secondary btn-sm']
        ),
        [
            'method' => 'post',
            'action' => $url->out(false),
            'class' => 'format-mnemo-preview__form',
            'data-mnemo-settings-for' => $canvasid,
        ]
    );

    return html_writer::tag(
        'details',
        html_writer::tag('summary', get_string('preview_modelsettings', 'format_mnemo')) . $form,
        ['class' => 'format-mnemo-preview__settings']
    );
}

// The model previews are rendered client-side; hand the module the model URLs
// keyed by their card's canvas id, plus the Three.js bootstrap URLs.
$modelconfig = [];
foreach ($models as $i => $model) {
    $entry = ['canvasid' => $rootid . '-model-' . $i, 'url' => $model['url'], 'category' => $model['category'] ?? 'prop'];
    // Reflect a configurable model's orientation correction in its preview, so
    // an admin sees the effect of the pitch/yaw/roll they set (celestials have
    // no model-config entry). A vehicle's yaw is its travel-facing in the scene,
    // not a fixed pose, so its yaw is zeroed here to match how the scene orients
    // it (pitch/roll only).
    if (in_array($model['key'], $configurable, true)) {
        $cfg = model_config::get($model['key']);
        $isvehicle = ($model['category'] ?? 'prop') === 'vehicle';
        $entry['orient'] = [
            'pitch' => $cfg['pitch'],
            'yaw' => $isvehicle ? null : $cfg['yaw'],
            'roll' => $cfg['roll'],
        ];
    }
    $modelconfig[] = $entry;
}
$config = asset_gallery::client_config();
$config['models'] = $modelconfig;
// Short labels the client draws onto a card when a model cannot be shown, so a
// blank preview reports why (a load failure vs. a model with no geometry)
// rather than staying silently empty.
$config['strings'] = [
    'loadfailed' => get_string('preview_model_failed', 'format_mnemo'),
    'loadfailedfbx' => get_string('preview_model_failed_fbx', 'format_mnemo'),
    'nogeometry' => get_string('preview_model_empty', 'format_mnemo'),
    // The orientation readout under each card, with {pitch}/{yaw}/{roll}
    // placeholders the client fills in after each turn.
    'orientation' => get_string(
        'preview_orientation',
        'format_mnemo',
        (object)['pitch' => '{pitch}', 'yaw' => '{yaw}', 'roll' => '{roll}']
    ),
];

echo $OUTPUT->header();
echo $OUTPUT->heading(get_string('preview_title', 'format_mnemo'));
echo html_writer::tag('p', get_string('preview_intro', 'format_mnemo'), ['class' => 'text-muted']);

// Source badge helper: a short coloured label for where an asset comes from.
$sourcebadge = function (string $source): string {
    $classes = [
        'uploaded' => 'badge-success',
        'url' => 'badge-info',
        'bundled' => 'badge-secondary',
        'none' => 'badge-light',
    ];
    $class = $classes[$source] ?? 'badge-light';
    return html_writer::tag(
        'span',
        get_string('preview_source_' . $source, 'format_mnemo'),
        ['class' => 'badge ' . $class]
    );
};

echo html_writer::start_div('format-mnemo-preview', ['id' => $rootid,
    'data-mnemo-preview' => json_encode($config)]);

// Textures.
echo $OUTPUT->heading(get_string('preview_textures', 'format_mnemo'), 3);
echo html_writer::start_div('format-mnemo-preview__grid');
foreach ($textures as $tex) {
    $media = $tex['url']
        ? html_writer::empty_tag('img', ['src' => $tex['url'], 'alt' => $tex['label'],
            'class' => 'format-mnemo-preview__img', 'loading' => 'lazy'])
        : html_writer::div(
            get_string('preview_procedural', 'format_mnemo'),
            'format-mnemo-preview__placeholder'
        );
    $body = html_writer::div($tex['label'], 'format-mnemo-preview__name') .
        $sourcebadge($tex['source']) .
        html_writer::div(get_string($tex['usagekey'], 'format_mnemo'), 'format-mnemo-preview__use text-muted');
    if (!empty($tex['ringed'])) {
        $body .= html_writer::div(
            get_string('preview_ringmarked', 'format_mnemo'),
            'format-mnemo-preview__use text-muted'
        );
    }
    echo html_writer::div(
        $media . html_writer::div($body, 'format-mnemo-preview__meta'),
        'format-mnemo-preview__card'
    );
}
echo html_writer::end_div();

// Models.
echo $OUTPUT->heading(get_string('preview_models', 'format_mnemo'), 3);
echo html_writer::tag('p', get_string('preview_axes', 'format_mnemo'), ['class' => 'text-muted']);

// Render one model card. The canvas id keeps the model's index in the full list
// so it stays aligned with $modelconfig (the client renders into it by id).
$rendermodelcard = function (int $i, array $model) use ($rootid, $sourcebadge, $configurable, $PAGE): string {
    $canvasid = $rootid . '-model-' . $i;
    $canvas = html_writer::tag('canvas', '', [
        'id' => $canvasid,
        'class' => 'format-mnemo-preview__canvas',
        'width' => 240, 'height' => 240,
        'aria-label' => $model['label'],
    ]);
    // Snap-turn buttons (90° per press) and a readout of the resulting
    // orientation, wired up client-side (initPreview) by the canvas id.
    $turns = '';
    $turnbuttons = ['left' => '←', 'right' => '→', 'up' => '↑', 'down' => '↓', 'reset' => '⟲'];
    foreach ($turnbuttons as $turn => $glyph) {
        $label = get_string('preview_turn_' . $turn, 'format_mnemo');
        $turns .= html_writer::tag('button', $glyph, [
            'type' => 'button',
            'class' => 'btn btn-sm btn-secondary format-mnemo-preview__turnbtn',
            'data-mnemo-turn' => $turn,
            'title' => $label,
            'aria-label' => $label,
        ]);
    }
    // The Use this view button copies the current turn into the model's settings
    // form, ready to save; only models with a settings panel get it.
    if (in_array($model['key'], $configurable, true)) {
        $turns .= html_writer::tag('button', get_string('preview_useview', 'format_mnemo'), [
            'type' => 'button',
            'class' => 'btn btn-sm btn-secondary format-mnemo-preview__usebtn',
            'data-mnemo-useview' => 1,
            'title' => get_string('preview_useview_help', 'format_mnemo'),
        ]);
    }
    $canvas .= html_writer::div($turns, 'format-mnemo-preview__turns', ['data-mnemo-turn-for' => $canvasid]) .
        html_writer::div('', 'format-mnemo-preview__orient', ['id' => $canvasid . '-orient', 'aria-live' => 'polite']);
    $body = html_writer::div($model['label'], 'format-mnemo-preview__name') .
        $sourcebadge($model['source']) .
        html_writer::link(
            $model['url'],
            get_string('preview_openmodel', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__use', 'target' => '_blank', 'rel' => 'noopener']
        );
    // An uploaded model can be deleted (after a confirm page).
    if (!empty($model['filearea'])) {
        $body .= html_writer::link(
            new moodle_url($PAGE->url, ['deletemodel' => $model['key'], 'deletearea' => $model['filearea']]),
            get_string('preview_delete', 'format_mnemo'),
            ['class' => 'btn btn-sm btn-outline-danger format-mnemo-preview__delete']
        );
    }
    // Attribution read from the model's glTF asset block, when present.
    if (!empty($model['copyright'])) {
        $body .= html_writer::div(
            get_string('preview_copyright', 'format_mnemo', s($model['copyright'])),
            'format-mnemo-preview__use text-muted'
        );
    }
    if (!empty($model['generator'])) {
        $body .= html_writer::div(
            get_string('preview_generator', 'format_mnemo', s($model['generator'])),
            'format-mnemo-preview__use text-muted'
        );
    }
    // Credit and licence: the credit line students see, then a flag for each
    // licence problem (and a note when the author must be credited).
    if (!empty($model['credit']) && model_licence::is_creditable($model['credit'])) {
        $body .= html_writer::div(
            get_string(
                'preview_creditline',
                'format_mnemo',
                model_licence::credit_html($model['credit'], $model['label'])
            ),
            'format-mnemo-preview__use'
        );
    }
    foreach ($model['licenceflags'] ?? [] as $flag) {
        $body .= html_writer::div(
            s($flag['text']),
            'format-mnemo-preview__budget alert alert-' . $flag['level'],
            ['role' => 'note']
        );
    }
    // Size: the triangle count and file size when known, then a warning for
    // each headset budget the model is over.
    $size = [];
    if (isset($model['triangles'])) {
        $size[] = get_string('preview_triangles', 'format_mnemo', number_format($model['triangles']));
    }
    if (isset($model['filesize'])) {
        $size[] = display_size($model['filesize']);
    }
    if ($size) {
        $body .= html_writer::div(implode(' · ', $size), 'format-mnemo-preview__use text-muted');
    }
    foreach ($model['warnings'] ?? [] as $warning) {
        $body .= html_writer::div(s($warning), 'format-mnemo-preview__budget alert alert-warning', ['role' => 'note']);
    }
    // The lite copy that headsets, phones and slow connections load instead.
    if (!empty($model['lite'])) {
        $lite = $model['lite'];
        $size = [s($lite['filename'])];
        if (isset($lite['triangles'])) {
            $size[] = get_string('preview_triangles', 'format_mnemo', number_format($lite['triangles']));
        }
        $size[] = display_size($lite['filesize']);
        $body .= html_writer::div(
            get_string('preview_lite', 'format_mnemo', implode(' · ', $size)),
            'format-mnemo-preview__use text-muted'
        );
        foreach ($lite['warnings'] as $warning) {
            $body .= html_writer::div(s($warning), 'format-mnemo-preview__budget alert alert-warning', ['role' => 'note']);
        }
    }
    // Per-model settings panel: environments, facing, scale and behaviour
    // (including "animate"), saved to model_config. Offered for every
    // configurable model - props, vehicles and buildings - but not the
    // celestials, which carry their own URL config.
    if (in_array($model['key'], $configurable, true)) {
        $body .= mnemo_model_settings_panel($model['key'], model_config::get($model['key']), $PAGE->url, $canvasid);
    }
    return html_writer::div(
        $canvas . html_writer::div($body, 'format-mnemo-preview__meta'),
        'format-mnemo-preview__card'
    );
};

// Group the model cards into Props / Vehicles / Buildings / Sun & moon so each
// upload area's models are shown together, matching the separate uploaders.
$modelcats = [
    'prop' => get_string('preview_cat_props', 'format_mnemo'),
    'vehicle' => get_string('preview_cat_vehicles', 'format_mnemo'),
    'building' => get_string('preview_cat_buildings', 'format_mnemo'),
    'celestial' => get_string('preview_cat_celestial', 'format_mnemo'),
];
foreach ($modelcats as $cat => $catlabel) {
    $cards = '';
    foreach ($models as $i => $model) {
        if (($model['category'] ?? 'prop') === $cat) {
            $cards .= $rendermodelcard($i, $model);
        }
    }
    if ($cards === '') {
        continue;
    }
    echo $OUTPUT->heading($catlabel, 4);
    echo html_writer::div($cards, 'format-mnemo-preview__grid');
}

echo html_writer::end_div();

$PAGE->requires->js_call_amd('format_mnemo/vr', 'initPreview', [$rootid]);

echo $OUTPUT->footer();
