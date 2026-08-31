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
 * @copyright  2026 format_mnemo contributors
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
        global $CFG;

        $course = $this->format->get_course();
        $context = context_course::instance($course->id);
        $modinfo = get_fast_modinfo($course);
        $completion = new completion_info($course);
        $completionenabled = $completion->is_enabled();

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
                    ];
                }
            }

            $name = $this->format->get_section_name($section);
            $sections[] = [
                'number' => (int)$section->section,
                'name' => format_string($name, true, ['context' => $context]),
                'visible' => (bool)$section->visible,
                'current' => $this->format->is_section_current($section),
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
     * Build the configuration object handed to the browser WebXR module.
     *
     * @param renderer_base $output
     * @return array
     */
    public function get_scene_config(renderer_base $output): array {
        $course = $this->format->get_course();
        $options = $this->format->get_format_options();
        $nodes = $this->build_nodes();

        return [
            'courseid' => (int)$course->id,
            'rootid' => $this->rootid(),
            'threeurl' => get_config('format_mnemo', 'threeurl') ?:
                'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js',
            'environment' => $options['mnemoenvironment'] ?? 'cyberspace',
            'palette' => $options['mnemopalette'] ?? 'cyan',
            'layout' => $options['mnemolayout'] ?? 'ring',
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
            ],
            'sections' => $nodes['sections'],
        ];
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
        $nodes = $this->build_nodes();
        $options = $this->format->get_format_options();

        $data = new stdClass();
        $data->rootid = $this->rootid();
        $data->environment = $options['mnemoenvironment'] ?? 'cyberspace';
        $data->palette = $options['mnemopalette'] ?? 'cyan';
        $data->sections = array_values(array_map(function($section) {
            $section['activities'] = array_values($section['activities']);
            return (object)$section;
        }, $nodes['sections']));
        $data->hassections = !empty($nodes['sections']);

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
