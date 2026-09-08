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

admin_externalpage_setup('format_mnemo_preview');

$PAGE->set_title(get_string('preview_title', 'format_mnemo'));
$PAGE->set_heading(get_string('preview_title', 'format_mnemo'));

$textures = asset_gallery::textures();
$models = asset_gallery::models();
$rootid = 'mnemo-preview-' . uniqid();

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
    echo html_writer::div(
        $canvas . html_writer::div($body, 'format-mnemo-preview__meta'),
        'format-mnemo-preview__card'
    );
}
echo html_writer::end_div();

echo html_writer::end_div();

$PAGE->requires->js_call_amd('format_mnemo/vr', 'initPreview', [$rootid]);

echo $OUTPUT->footer();
