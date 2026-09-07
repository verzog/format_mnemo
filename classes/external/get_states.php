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
 * External function returning the current per-activity scene states for a
 * course, so the client can refresh completion/availability without a reload.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;
use completion_info;
use format_mnemo\output\scene;

/**
 * Return the current state (restricted / available / complete) of each visible
 * activity in a course, computed exactly as the initial scene build does. Any
 * user who can view the course may call it (so a learner sees their own
 * completion refresh); it reads only, and leaks nothing a viewer cannot see.
 */
class get_states extends external_api {
    /**
     * Parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
        ]);
    }

    /**
     * Compute the current per-activity states.
     *
     * @param int $courseid Course id.
     * @return array{states: array<array{cmid: int, state: string}>}
     */
    public static function execute(int $courseid): array {
        $params = self::validate_parameters(self::execute_parameters(), ['courseid' => $courseid]);

        $course = get_course($params['courseid']);
        require_login($course);
        $context = context_course::instance($course->id);
        self::validate_context($context);

        $modinfo = get_fast_modinfo($course);
        $completion = new completion_info($course);
        $enabled = $completion->is_enabled();

        $states = [];
        foreach ($modinfo->get_cms() as $cm) {
            // Mirror the scene build: skip fully hidden modules, ones not shown
            // on the course page, and labels (which have no view page).
            if (!$cm->uservisible && empty($cm->availableinfo)) {
                continue;
            }
            if (!$cm->is_visible_on_course_page() || $cm->modname === 'label') {
                continue;
            }
            $states[] = [
                'cmid' => (int)$cm->id,
                'state' => scene::compute_state($cm, $completion, $enabled),
            ];
        }

        return ['states' => $states];
    }

    /**
     * Return value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'states' => new external_multiple_structure(
                new external_single_structure([
                    'cmid' => new external_value(PARAM_INT, 'Course-module id'),
                    'state' => new external_value(PARAM_ALPHA, 'One of restricted, available, complete'),
                ])
            ),
        ]);
    }
}
