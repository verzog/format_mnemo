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
 * External function to remove (hide) a generated decorative prop from a course.
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
use invalid_parameter_exception;

/**
 * Mark a generated prop's slot (a street lamp, barrier or kiosk) hidden for the
 * course, so the scene stops building it. Recorded on the per-course scene-object
 * row keyed by slot; guarded by the activity-editing capability on the course.
 * Only the decorative-prop slot types are removable — gates and pylons (which
 * mark topics) and activities are not.
 */
class remove_scene_object extends external_api {
    /** @var string Allowed shape of a removable prop slot key. */
    const KEY_PATTERN = '/^(?:lamp|barrier|kiosk):[0-9]+$/';

    /**
     * Parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'objkey' => new external_value(PARAM_RAW_TRIMMED, 'Prop slot key, e.g. lamp:3'),
        ]);
    }

    /**
     * Hide one generated prop, upserting its scene-object row with hidden = 1.
     *
     * @param int $courseid Course id.
     * @param string $objkey Prop slot key (lamp/barrier/kiosk:index).
     * @return array{status: bool}
     */
    public static function execute(int $courseid, string $objkey): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'objkey' => $objkey,
        ]);

        if (!preg_match(self::KEY_PATTERN, $params['objkey'])) {
            throw new invalid_parameter_exception('Not a removable prop key');
        }

        $context = context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        $existing = $DB->get_record(
            'format_mnemo_sceneobj',
            ['courseid' => $params['courseid'], 'objkey' => $params['objkey']]
        );
        if ($existing) {
            $DB->update_record('format_mnemo_sceneobj', (object)[
                'id' => $existing->id,
                'hidden' => 1,
                'timemodified' => time(),
            ]);
        } else {
            $insert = [
                'courseid' => $params['courseid'],
                'objkey' => $params['objkey'],
                'hidden' => 1,
                'timemodified' => time(),
            ];
            try {
                $DB->insert_record('format_mnemo_sceneobj', (object)$insert);
            } catch (\dml_exception $e) {
                // A concurrent write created the row first (unique courseid+objkey);
                // update it instead of failing.
                $existing = $DB->get_record(
                    'format_mnemo_sceneobj',
                    ['courseid' => $params['courseid'], 'objkey' => $params['objkey']],
                    '*',
                    MUST_EXIST
                );
                $DB->update_record('format_mnemo_sceneobj', (object)[
                    'id' => $existing->id,
                    'hidden' => 1,
                    'timemodified' => time(),
                ]);
            }
        }

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
