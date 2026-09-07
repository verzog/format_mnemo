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
 * External function to remove a teacher-placed decorative prop.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use context_course;

/**
 * Remove one teacher-placed prop (and any transform it accumulated), by id and
 * course. Guarded by the activity-editing capability on the course.
 */
class remove_placed_object extends external_api {
    /**
     * Parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'id' => new external_value(PARAM_INT, 'The placed-object id to remove'),
        ]);
    }

    /**
     * Delete one placed prop and its stored transform.
     *
     * @param int $courseid Course id.
     * @param int $id Placed-object id.
     * @return array{status: bool}
     */
    public static function execute(int $courseid, int $id): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'id' => $id,
        ]);

        $context = context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        // Scope the delete to the course so an id from another course cannot be
        // removed. A no-op when the row does not exist.
        $DB->delete_records('format_mnemo_placedobj', [
            'id' => $params['id'],
            'courseid' => $params['courseid'],
        ]);
        // Drop any in-view transform the prop accumulated (keyed placed:<id>).
        $DB->delete_records('format_mnemo_sceneobj', [
            'courseid' => $params['courseid'],
            'objkey' => 'placed:' . $params['id'],
        ]);

        return ['status' => true];
    }

    /**
     * Return value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status' => new external_value(PARAM_BOOL, 'Whether the prop was removed'),
        ]);
    }
}
