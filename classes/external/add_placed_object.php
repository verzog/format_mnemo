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
 * External function to place a decorative prop in the scene.
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
use format_mnemo\output\asset_gallery;

/**
 * Place one decorative prop at a grid-snapped position with the in-view object
 * placer, stored per course. The prop may be any bundled prop or uploaded
 * asset-pack model that is not a named building; the accepted set is resolved
 * by {@see asset_gallery::placer_prop_names()} so it always matches the palette
 * the scene offers. Guarded by the activity-editing capability on the course.
 */
class add_placed_object extends external_api {
    /** @var float Grid cell size the placement snaps to (world units). */
    const GRID = 2.0;

    /** @var float Half-extent clamp on placement coordinates (world units). */
    const BOUND = 400.0;

    /**
     * Parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Course id'),
            // Accept the raw name and gate it on the placeable-prop whitelist
            // below: an uploaded model's base name may contain spaces, dots or
            // Unicode that a restricted param type would reject even though the
            // palette advertises it.
            'type' => new external_value(PARAM_RAW, 'Prop model base name (a placeable prop, not a named building)'),
            'x' => new external_value(PARAM_FLOAT, 'World-x where the prop is placed'),
            'z' => new external_value(PARAM_FLOAT, 'World-z where the prop is placed'),
        ]);
    }

    /**
     * Place one prop and return its new id and snapped position.
     *
     * @param int $courseid Course id.
     * @param string $type Prop model name.
     * @param float $x World-x.
     * @param float $z World-z.
     * @return array{id: int, type: string, x: float, z: float}
     */
    public static function execute(int $courseid, string $type, float $x, float $z): array {
        global $DB;

        $params = self::validate_parameters(self::execute_parameters(), [
            'courseid' => $courseid,
            'type' => $type,
            'x' => $x,
            'z' => $z,
        ]);

        if (!in_array($params['type'], asset_gallery::placer_prop_names(), true)) {
            throw new invalid_parameter_exception('Unknown prop type');
        }

        $context = context_course::instance($params['courseid']);
        self::validate_context($context);
        require_capability('moodle/course:manageactivities', $context);

        // Snap to the placement grid and clamp to sane world bounds so a
        // misbehaving client cannot drop a prop at an extreme coordinate.
        $snap = function (float $v): float {
            $v = round($v / self::GRID) * self::GRID;
            return min(self::BOUND, max(-self::BOUND, $v));
        };
        $basex = $snap((float)$params['x']);
        $basez = $snap((float)$params['z']);

        $record = (object)[
            'courseid' => $params['courseid'],
            'type' => $params['type'],
            'basex' => $basex,
            'basez' => $basez,
            'timecreated' => time(),
        ];
        $record->id = $DB->insert_record('format_mnemo_placedobj', $record);

        return [
            'id' => (int)$record->id,
            'type' => $params['type'],
            'x' => $basex,
            'z' => $basez,
        ];
    }

    /**
     * Return value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'id' => new external_value(PARAM_INT, 'The new placed-object id'),
            'type' => new external_value(PARAM_RAW, 'Prop model base name'),
            'x' => new external_value(PARAM_FLOAT, 'Grid-snapped world-x'),
            'z' => new external_value(PARAM_FLOAT, 'Grid-snapped world-z'),
        ]);
    }
}
