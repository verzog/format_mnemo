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

admin_externalpage_setup('format_mnemo_preview');

$PAGE->set_title(get_string('preview_title', 'format_mnemo'));
$PAGE->set_heading(get_string('preview_title', 'format_mnemo'));

// Save a per-model settings form (environments, facing, scale). The admin
// external page already gates access to site config; a sesskey guards the POST.
$savemodel = optional_param('savemodel', '', PARAM_RAW_TRIMMED);
if ($savemodel !== '' && confirm_sesskey()) {
    // Only accept a name that is a real, placeable model.
    $known = asset_gallery::placer_prop_names();
    if (in_array($savemodel, $known, true)) {
        $envs = [];
        foreach (model_config::ENVIRONMENTS as $env) {
            if (optional_param('env_' . $env, 0, PARAM_BOOL)) {
                $envs[] = $env;
            }
        }
        $yawraw = optional_param('yaw', '', PARAM_RAW_TRIMMED);
        $scaleraw = optional_param('scale', '', PARAM_RAW_TRIMMED);
        model_config::set($savemodel, [
            'envs' => $envs,
            'yaw' => ($yawraw === '' || !is_numeric($yawraw)) ? null : (float)$yawraw,
            'scale' => ($scaleraw === '' || !is_numeric($scaleraw)) ? null : (float)$scaleraw,
            // Preserve any behaviour flags set elsewhere until that panel lands.
            'behaviour' => model_config::get($savemodel)['behaviour'],
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

$textures = asset_gallery::textures();
$models = asset_gallery::models();
$placeable = asset_gallery::placer_prop_names();
$rootid = 'mnemo-preview-' . uniqid();

/**
 * The per-model settings panel: a collapsible form to set the model's
 * environments, facing and scale, saved back to this page.
 *
 * @param string $name The model name (.glb basename).
 * @param array $cfg The model's current normalised config.
 * @param moodle_url $url This page's URL (the form target).
 * @return string HTML for the panel.
 */
function mnemo_model_settings_panel(string $name, array $cfg, moodle_url $url): string {
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

    // Facing radios: Auto, or a cardinal preset (degrees).
    $current = $cfg['yaw'] === null ? '' : (string)(int)round($cfg['yaw']);
    $dirs = ['' => 'auto', '0' => '0', '90' => '90', '180' => '180', '270' => '270'];
    $radios = '';
    foreach ($dirs as $value => $key) {
        $attrs = ['type' => 'radio', 'name' => 'yaw', 'value' => $value];
        if ($value === $current) {
            $attrs['checked'] = 'checked';
        }
        $radios .= html_writer::tag(
            'label',
            html_writer::empty_tag('input', $attrs) . ' ' .
            get_string('preview_dir_' . $key, 'format_mnemo'),
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

    // Scale (blank = model default).
    $rows .= html_writer::div(
        html_writer::tag(
            'label',
            get_string('preview_scale', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__field-label', 'for' => 'scale_' . $name]
        ) .
        html_writer::empty_tag('input', [
            'type' => 'number', 'name' => 'scale', 'id' => 'scale_' . $name,
            'min' => '0.1', 'max' => '10', 'step' => '0.1', 'class' => 'format-mnemo-preview__scale',
            'value' => $cfg['scale'] === null ? '' : rtrim(rtrim(sprintf('%.2f', $cfg['scale']), '0'), '.'),
        ]),
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
        ['method' => 'post', 'action' => $url->out(false), 'class' => 'format-mnemo-preview__form']
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
    $modelconfig[] = ['canvasid' => $rootid . '-model-' . $i, 'url' => $model['url']];
}
$config = asset_gallery::client_config();
$config['models'] = $modelconfig;

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
echo html_writer::start_div('format-mnemo-preview__grid');
foreach ($models as $i => $model) {
    $canvas = html_writer::tag('canvas', '', [
        'id' => $rootid . '-model-' . $i,
        'class' => 'format-mnemo-preview__canvas',
        'width' => 240, 'height' => 240,
        'aria-label' => $model['label'],
    ]);
    $body = html_writer::div($model['label'], 'format-mnemo-preview__name') .
        $sourcebadge($model['source']) .
        html_writer::link(
            $model['url'],
            get_string('preview_openmodel', 'format_mnemo'),
            ['class' => 'format-mnemo-preview__use', 'target' => '_blank', 'rel' => 'noopener']
        );
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
    // Per-model settings panel: environments, facing and scale, saved to
    // model_config. Only offered for placeable models (named building models
    // are activity-bound and not free props).
    if (in_array($model['key'], $placeable, true)) {
        $body .= mnemo_model_settings_panel($model['key'], model_config::get($model['key']), $PAGE->url);
    }
    echo html_writer::div(
        $canvas . html_writer::div($body, 'format-mnemo-preview__meta'),
        'format-mnemo-preview__card'
    );
}
echo html_writer::end_div();

echo html_writer::end_div();

$PAGE->requires->js_call_amd('format_mnemo/vr', 'initPreview', [$rootid]);

echo $OUTPUT->footer();
