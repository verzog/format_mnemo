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

namespace format_mnemo\output;

use completion_info;
use context_course;
use core_courseformat\base as course_format;
use moodle_url;
use renderable;
use renderer_base;
use stdClass;
use templatable;

/**
 * Builds the data for, and renders, the Mnemo cyberspace scene.
 *
 * The same section/activity graph is used twice: once serialised as JSON for
 * the WebXR client module, and once as an accessible HTML list rendered from
 * the mustache template as a fallback / non-VR alternative.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class scene implements renderable, templatable {
    /** @var course_format The course format instance. */
    protected $format;

    /**
     * Constructor.
     *
     * @param course_format $format the course format instance
     */
    public function __construct(course_format $format) {
        $this->format = $format;
    }

    /**
     * Build the raw scene graph: sections, each with their activities.
     *
     * @return array{sections: array, nodecount: int}
     */
    protected function build_nodes(): array {
        $course = $this->format->get_course();
        $context = context_course::instance($course->id);
        $modinfo = get_fast_modinfo($course);
        $completion = new completion_info($course);
        $completionenabled = $completion->is_enabled();
        $imagefiles = $this->preload_section_images($context);
        $buildingmodels = $this->preload_building_models((int)$course->id);

        $sections = [];
        $coursesections = $modinfo->get_section_info_all();
        foreach ($coursesections as $section) {
            // Respect hidden sections: skip sections the user cannot see at all
            // (and that carry no "available from" teaser to show).
            if (!$section->uservisible && empty($section->availableinfo)) {
                continue;
            }

            $activities = [];
            if (!empty($modinfo->sections[$section->section])) {
                foreach ($modinfo->sections[$section->section] as $cmid) {
                    $cm = $modinfo->cms[$cmid];
                    if (!$cm->uservisible && empty($cm->availableinfo)) {
                        // Completely hidden from this user.
                        continue;
                    }
                    if (!$cm->is_visible_on_course_page()) {
                        continue;
                    }
                    if ($cm->modname === 'label') {
                        // Labels have no view page to fly to; skip in the scene.
                        continue;
                    }

                    $state = 'available';
                    if (!$cm->uservisible) {
                        $state = 'restricted';
                    } else if ($completionenabled && $cm->completion != COMPLETION_TRACKING_NONE) {
                        $data = $completion->get_data($cm, true);
                        if (in_array((int)$data->completionstate, [COMPLETION_COMPLETE, COMPLETION_COMPLETE_PASS], true)) {
                            $state = 'complete';
                        }
                    }

                    $url = $cm->url;
                    $activities[] = [
                        'id' => (int)$cm->id,
                        'name' => format_string($cm->get_formatted_name(), true, ['context' => $context]),
                        'modname' => $cm->modname,
                        'url' => $url ? $url->out(false) : null,
                        'state' => $state,
                        // A teacher-chosen building model for this specific
                        // activity (file name or URL), or null to use the
                        // type-based/procedural building.
                        'building' => $buildingmodels[(int)$cm->id] ?? null,
                    ];
                }
            }

            // Signs show the teacher's plain title (no editing-view number).
            $name = $this->format->get_section_title_plain($section);
            $sections[] = [
                'number' => (int)$section->section,
                'name' => $name,
                'visible' => (bool)$section->visible,
                'current' => $this->format->is_section_current($section),
                'image' => $this->section_image_url($imagefiles[(int)$section->id] ?? null, $context),
                'activities' => $activities,
                'activitycount' => count($activities),
                'hasactivities' => !empty($activities),
            ];
        }

        return [
            'sections' => $sections,
            'nodecount' => count($sections),
        ];
    }

    /**
     * Load every topic-image file for the course in one query, keyed by the
     * section id, so building the scene does not do one query per section.
     *
     * @param context_course $context the course context
     * @return \stored_file[] map of section id => the first image file
     */
    protected function preload_section_images(context_course $context): array {
        $fs = get_file_storage();
        $files = $fs->get_area_files(
            $context->id,
            'format_mnemo',
            'sectionimage',
            false,
            'itemid, filepath, filename',
            false
        );
        $map = [];
        foreach ($files as $file) {
            $itemid = (int)$file->get_itemid();
            if (!isset($map[$itemid])) {
                $map[$itemid] = $file;
            }
        }
        return $map;
    }

    /**
     * Load every activity's building-model override for the course in one query,
     * keyed by the course module id, so building the scene does not do one query
     * per activity. Joined through course_modules by course id, so it stays a
     * single bounded query however many activities the course has.
     *
     * @param int $courseid the course id
     * @return array map of cmid => model (file name or URL)
     */
    protected function preload_building_models(int $courseid): array {
        global $DB;
        $sql = "SELECT b.cmid, b.model
                  FROM {format_mnemo_building} b
                  JOIN {course_modules} cm ON cm.id = b.cmid
                 WHERE cm.course = :course";
        $rows = $DB->get_records_sql($sql, ['course' => $courseid]);
        $map = [];
        foreach ($rows as $row) {
            $map[(int)$row->cmid] = $row->model;
        }
        return $map;
    }

    /**
     * The pluginfile URL for a preloaded topic-image file, or null when none.
     *
     * @param \stored_file|null $file the section's image file, if any
     * @param context_course $context the course context
     * @return string|null
     */
    protected function section_image_url(?\stored_file $file, context_course $context): ?string {
        if ($file === null) {
            return null;
        }
        return moodle_url::make_pluginfile_url(
            $context->id,
            'format_mnemo',
            'sectionimage',
            $file->get_itemid(),
            $file->get_filepath(),
            $file->get_filename()
        )->out(false);
    }

    /**
     * Build the configuration object handed to the browser WebXR module.
     *
     * @param renderer_base $output
     * @return array
     */
    public function get_scene_config(renderer_base $output): array {
        $course = $this->format->get_course();
        $options = $this->format->get_format_options();
        $nodes = $this->build_nodes();

        // Default to the Three.js copy bundled with the plugin; an admin can
        // override the URL (e.g. a CDN or a shared local copy) in settings.
        $threeurl = get_config('format_mnemo', 'threeurl');
        if (empty($threeurl)) {
            $threeurl = (new moodle_url('/course/format/mnemo/thirdparty/three.module.min.js'))->out(false);
        }

        return [
            'courseid' => (int)$course->id,
            'rootid' => $this->rootid(),
            'threeurl' => $threeurl,
            'loaderurl' => (new moodle_url('/course/format/mnemo/js/three-esm-loader.js'))->out(false),
            'environment' => $options['mnemoenvironment'] ?? 'cyberspace',
            'palette' => $options['mnemopalette'] ?? 'cyan',
            'invertlook' => !empty($options['mnemoinvertlook']),
            // Hour of day (0-24 float) in the site's timezone, so the client can
            // run a day/night cycle that matches the Moodle site's clock.
            'hour' => $this->site_hour(),
            // Base URL for glTF prop models. Defaults to the plugin's bundled
            // models; an admin can point it at an external asset pack.
            'modelsbaseurl' => $this->models_base_url(),
            // The plugin's own bundled models URL, always available as a
            // per-model fallback so a partial asset pack (only some props) keeps
            // the bundled models for the props it omits.
            'modelsfallbackurl' => (new moodle_url('/course/format/mnemo/models/'))->out(false),
            // Module types that have a building-<modname>.glb model available, so
            // the client only attempts to load buildings it can expect to find.
            'buildingmodels' => $this->building_models($nodes),
            'strings' => [
                'entervr' => get_string('entervr', 'format_mnemo'),
                'exitvr' => get_string('exitvr', 'format_mnemo'),
                'vrnotsupported' => get_string('vrnotsupported', 'format_mnemo'),
                'loading' => get_string('loadingscene', 'format_mnemo'),
                'failed' => get_string('scenefailed', 'format_mnemo'),
                'controls' => get_string('scenecontrols', 'format_mnemo'),
                'complete' => get_string('statecomplete', 'format_mnemo'),
                'available' => get_string('stateavailable', 'format_mnemo'),
                'restricted' => get_string('staterestricted', 'format_mnemo'),
                'fullscreen' => get_string('fullscreen', 'format_mnemo'),
                'exitfullscreen' => get_string('exitfullscreen', 'format_mnemo'),
            ],
            'sections' => $nodes['sections'],
        ];
    }

    /**
     * The current hour of day (0-24, with minutes as a fraction) in the site's
     * configured timezone, so the scene's day/night cycle follows the site
     * clock rather than each viewer's local time.
     *
     * @return float
     */
    protected function site_hour(): float {
        $tz = \core_date::get_server_timezone_object();
        $now = new \DateTime('now', $tz);
        return (int)$now->format('G') + ((int)$now->format('i')) / 60.0;
    }

    /**
     * The base URL the client loads glTF prop models from, in order of
     * precedence: an admin-configured external asset-pack URL, then an asset
     * pack uploaded into Moodle, then the plugin's bundled models.
     *
     * @return string
     */
    protected function models_base_url(): string {
        // 1) An explicit external asset-pack URL always wins.
        $base = get_config('format_mnemo', 'assetbaseurl');
        if (!empty($base)) {
            return rtrim($base, '/') . '/';
        }
        // 2) An asset pack uploaded into Moodle (system context file area).
        $uploaded = $this->uploaded_pack_base_url();
        if ($uploaded !== null) {
            return $uploaded;
        }
        // 3) The props bundled with the plugin.
        return (new moodle_url('/course/format/mnemo/models/'))->out(false);
    }

    /**
     * The pluginfile base URL for an admin-uploaded prop asset pack, or null
     * when none has been uploaded. The client appends "<name>.glb" to this, so
     * the returned URL is slash-terminated (or ends where a filename belongs).
     *
     * @return string|null
     */
    protected function uploaded_pack_base_url(): ?string {
        $context = \context_system::instance();
        $fs = get_file_storage();
        $files = $fs->get_area_files($context->id, 'format_mnemo', 'assetpack', 0, 'filename', false);
        if (empty($files)) {
            return null;
        }
        // Use the newest file's modified time as a revision in the URL, so that
        // replacing a same-named model busts the browser cache (the pluginfile
        // handler ignores this segment and always serves the itemid-0 files).
        $rev = 0;
        foreach ($files as $file) {
            $rev = max($rev, (int)$file->get_timemodified());
        }
        // Build a per-file pluginfile URL with a sentinel name, then trim the
        // name so the client can append the real "<role>.glb" it needs.
        $sentinel = 'model.glb';
        $url = moodle_url::make_pluginfile_url(
            $context->id,
            'format_mnemo',
            'assetpack',
            $rev,
            '/',
            $sentinel
        )->out(false);
        return substr($url, 0, -strlen($sentinel));
    }

    /**
     * The module types (modnames) that have a building model
     * (<code>building-&lt;modname&gt;.glb</code>) available at the models base
     * URL, so the client only attempts to load buildings it can expect to find.
     *
     * The source is matched to models_base_url()'s precedence: an external URL
     * pack cannot be enumerated, so every module type the course actually uses is
     * offered (missing ones fall back to the procedural building); an uploaded or
     * bundled pack is enumerated exactly.
     *
     * @param array $nodes The build_nodes() result.
     * @return array List of modname strings.
     */
    protected function building_models(array $nodes): array {
        if (!empty(get_config('format_mnemo', 'assetbaseurl'))) {
            return $this->course_modnames($nodes);
        }
        $uploaded = $this->uploaded_building_modnames();
        if (!empty($uploaded)) {
            return $uploaded;
        }
        return $this->bundled_building_modnames();
    }

    /**
     * The distinct module types used across the course's activities.
     *
     * @param array $nodes The build_nodes() result.
     * @return array List of modname strings.
     */
    protected function course_modnames(array $nodes): array {
        $set = [];
        foreach ($nodes['sections'] as $section) {
            foreach ($section['activities'] as $act) {
                $set[$act['modname']] = true;
            }
        }
        return array_keys($set);
    }

    /**
     * The modnames of building models uploaded into the asset-pack file area.
     *
     * @return array List of modname strings.
     */
    protected function uploaded_building_modnames(): array {
        $context = \context_system::instance();
        $fs = get_file_storage();
        $files = $fs->get_area_files($context->id, 'format_mnemo', 'assetpack', 0, 'filename', false);
        $names = [];
        foreach ($files as $file) {
            if (preg_match('/^building-(.+)\.glb$/', $file->get_filename(), $m)) {
                $names[] = $m[1];
            }
        }
        return $names;
    }

    /**
     * The modnames of building models bundled in the plugin's models/ directory.
     *
     * @return array List of modname strings.
     */
    protected function bundled_building_modnames(): array {
        $dir = dirname(__DIR__, 2) . '/models';
        $names = [];
        foreach (glob($dir . '/building-*.glb') ?: [] as $path) {
            if (preg_match('/^building-(.+)\.glb$/', basename($path), $m)) {
                $names[] = $m[1];
            }
        }
        return $names;
    }

    /**
     * A stable DOM id for the scene root, unique to this course render.
     *
     * @return string
     */
    protected function rootid(): string {
        return 'mnemo-scene-' . $this->format->get_courseid();
    }

    /**
     * Export the accessible list-view data for the mustache template.
     *
     * @param renderer_base $output
     * @return stdClass
     */
    public function export_for_template(renderer_base $output): stdClass {
        $config = $this->get_scene_config($output);

        $data = new stdClass();
        $data->rootid = $config['rootid'];
        $data->environment = $config['environment'];
        $data->palette = $config['palette'];
        // The full scene graph is handed to the browser via a data attribute
        // (read in JS) instead of a large js_call_amd argument.
        $data->configjson = json_encode($config);
        $data->sections = array_values(array_map(function ($section) {
            $section['activities'] = array_values($section['activities']);
            return (object)$section;
        }, $config['sections']));
        $data->hassections = !empty($config['sections']);

        // UI strings for the template.
        $data->str_loading = get_string('loadingscene', 'format_mnemo');
        $data->str_listview = get_string('listview', 'format_mnemo');
        $data->str_sceneview = get_string('sceneview', 'format_mnemo');
        $data->str_toggle = get_string('togglelistview', 'format_mnemo');
        $data->str_controls = get_string('scenecontrols', 'format_mnemo');
        $data->str_arialabel = get_string('scenearialabel', 'format_mnemo');
        $data->str_emptynode = get_string('emptynode', 'format_mnemo');

        return $data;
    }
}
