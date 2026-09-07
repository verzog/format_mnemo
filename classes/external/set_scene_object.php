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
 * External function to save a non-activity scene object's transform.
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
 * Save the transform and brightness set for a non-activity scene object (a
 * prop, gate or pylon) with the in-view editor, keyed per course by a stable
 * slot key. Guarded by the activity-editing capability on the course.
 */
class set_scene_object extends external_api {
    /** @var string Allowed shape of a scene-object slot key (type:index). */
    const KEY_PATTERN = '/^[a-z]+:[0-9]+$/';

    /**
     * Parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            'objkey' => new external_value(PARAM_RAW_TRIMMED, 'Stable per-course slot key, e.g. lamp:3'),
            'scale' => new external_value(PARAM_FLOAT, 'Uniform scale multiplier'),
            'offsetx' => new external_value(PARAM_FLOAT, 'World-x offset from the default position'),
            'offsety' => new external_value(PARAM_FLOAT, 'World-y offset from the default position'),
            'offsetz' => new external_value(PARAM_FLOAT, 'World-z offset from the default position'),
            'rotation' => new external_value(PARAM_FLOAT, 'Extra rotation about the vertical axis, in degrees'),
            'brightness' => new external_value(PARAM_FLOAT, 'Brightness multiplier for light-emitting objects'),
            // Optional so an older cached client (that does not send them) still
            // works; declared last to match the execute() signature order, which
            // Moodle invokes positionally.
            'scalex' => new external_value(PARAM_FLOAT, 'Width (x) multiplier', VALUE_DEFAULT, 1.0),
            'scaley' => new external_value(PARAM_FLOAT, 'Height (y) multiplier', VALUE_DEFAULT, 1.0),
            'scalez' => new external_value(PARAM_FLOAT, 'Depth (z) multiplier', VALUE_DEFAULT, 1.0),
        ]);
    }

    /**
     * Save the transform/brightness for one scene object.
     *
     * @param int $courseid Course id.
     * @param string $objkey Slot key (type:index).
     * @param float $scale Uniform scale multiplier.
     * @param float $offsetx World-x offset.
     * @param float $offsety World-y offset.
     * @param float $offsetz World-z offset.
     * @param float $rotation Rotation in degrees.
     * @param float $brightness Brightness multiplier.
     * @param float $scalex Width (x) multiplier.
     * @param float $scaley Height (y) multiplier.
     * @param float $scalez Depth (z) multiplier.
     * @return array{status: bool}
     */
    public static function execute(
        int $courseid,
        string $objkey,
        float $scale,
        float $offsetx,
        float $offsety,
        float $offsetz,
        float $rotation,
        float $brightness,
        float $scalex = 1.0,
        float $scaley = 1.0,
        float $scalez = 1.0
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'objkey' => $objkey,
            'scale' => $scale,
            'scalex' => $scalex,
            'scaley' => $scaley,
            'scalez' => $scalez,
            'offsetx' => $offsetx,
            'offsety' => $offsety,
            'offsetz' => $offsetz,
            'rotation' => $rotation,
            'brightness' => $brightness,
        ]);

        if (!preg_match(self::KEY_PATTERN, $params['objkey'])) {
            throw new invalid_parameter_exception('Invalid scene object key');
        }

        $context = context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        // Clamp to sane ranges so a misbehaving client cannot store extreme
        // values, and normalise the rotation.
        $rotation = fmod((float)$params['rotation'], 360.0);
        if ($rotation < 0) {
            $rotation += 360.0;
        }
        $fields = [
            'scale' => min(10.0, max(0.1, (float)$params['scale'])),
            'scalex' => min(10.0, max(0.1, (float)$params['scalex'])),
            'scaley' => min(10.0, max(0.1, (float)$params['scaley'])),
            'scalez' => min(10.0, max(0.1, (float)$params['scalez'])),
            'offsetx' => min(200.0, max(-200.0, (float)$params['offsetx'])),
            'offsety' => min(200.0, max(-200.0, (float)$params['offsety'])),
            'offsetz' => min(200.0, max(-200.0, (float)$params['offsetz'])),
            'rotation' => $rotation,
            'brightness' => min(5.0, max(0.0, (float)$params['brightness'])),
            'timemodified' => time(),
        ];

        $record = $DB->get_record(
            'format_mnemo_sceneobj',
            ['courseid' => $params['courseid'], 'objkey' => $params['objkey']]
        );
        if ($record) {
            $DB->update_record('format_mnemo_sceneobj', (object)(['id' => $record->id] + $fields));
        } else {
            $insert = ['courseid' => $params['courseid'], 'objkey' => $params['objkey']] + $fields;
            try {
                $DB->insert_record('format_mnemo_sceneobj', (object)$insert);
            } catch (\dml_exception $e) {
                // A concurrent save created the row first (unique courseid+objkey);
                // update the existing row instead of failing.
                $record = $DB->get_record(
                    'format_mnemo_sceneobj',
                    ['courseid' => $params['courseid'], 'objkey' => $params['objkey']],
                    '*',
                    MUST_EXIST
                );
                $DB->update_record('format_mnemo_sceneobj', (object)(['id' => $record->id] + $fields));
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
            'status' => new external_value(PARAM_BOOL, 'Whether the object was saved'),
        ]);
    }
}
