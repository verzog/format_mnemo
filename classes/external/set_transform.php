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
 * External function to save an activity's in-view transform.
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
use context_module;

/**
 * Save the scale, position offset and rotation set for an activity's object
 * with the in-view editor. Guarded by the activity-editing capability.
 */
class set_transform extends external_api {
    /**
     * Parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course module id of the activity'),
            'scale' => new external_value(PARAM_FLOAT, 'Uniform scale multiplier'),
            'offsetx' => new external_value(PARAM_FLOAT, 'World-x offset from the default position'),
            'offsety' => new external_value(PARAM_FLOAT, 'World-y offset from the default position'),
            'offsetz' => new external_value(PARAM_FLOAT, 'World-z offset from the default position'),
            'rotation' => new external_value(PARAM_FLOAT, 'Extra rotation about the vertical axis, in degrees'),
        ]);
    }

    /**
     * Save the transform for one activity.
     *
     * @param int $cmid Course module id.
     * @param float $scale Uniform scale multiplier.
     * @param float $offsetx World-x offset.
     * @param float $offsety World-y offset.
     * @param float $offsetz World-z offset.
     * @param float $rotation Rotation in degrees.
     * @return array{status: bool}
     */
    public static function execute(
        int $cmid,
        float $scale,
        float $offsetx,
        float $offsety,
        float $offsetz,
        float $rotation
    ): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'cmid' => $cmid,
            'scale' => $scale,
            'offsetx' => $offsetx,
            'offsety' => $offsety,
            'offsetz' => $offsetz,
            'rotation' => $rotation,
        ]);

        $cm = get_coursemodule_from_id('', $params['cmid'], 0, false, MUST_EXIST);
        $context = context_module::instance($cm->id);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        // Clamp to sane ranges so a misbehaving client cannot store extreme
        // values that would break the scene, and normalise the rotation.
        $scale = min(10.0, max(0.1, (float)$params['scale']));
        $offsetx = min(200.0, max(-200.0, (float)$params['offsetx']));
        $offsety = min(200.0, max(-200.0, (float)$params['offsety']));
        $offsetz = min(200.0, max(-200.0, (float)$params['offsetz']));
        $rotation = fmod((float)$params['rotation'], 360.0);
        if ($rotation < 0) {
            $rotation += 360.0;
        }

        $record = $DB->get_record('format_mnemo_building', ['cmid' => $cm->id]);
        if ($record) {
            $record->scale = $scale;
            $record->offsetx = $offsetx;
            $record->offsety = $offsety;
            $record->offsetz = $offsetz;
            $record->rotation = $rotation;
            $record->timemodified = time();
            $DB->update_record('format_mnemo_building', $record);
        } else {
            $DB->insert_record('format_mnemo_building', (object)[
                'cmid' => $cm->id,
                'model' => '',
                'scale' => $scale,
                'offsetx' => $offsetx,
                'offsety' => $offsety,
                'offsetz' => $offsetz,
                'rotation' => $rotation,
                'timemodified' => time(),
            ]);
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
            'status' => new external_value(PARAM_BOOL, 'Whether the transform was saved'),
        ]);
    }
}
