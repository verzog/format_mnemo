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
 * External function definitions for the Mnemo (VR cyberspace) course format.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$functions = [
    'format_mnemo_set_transform' => [
        'classname'   => 'format_mnemo\\external\\set_transform',
        'methodname'  => 'execute',
        'description' => 'Save an activity\'s in-view transform (scale, position offset and rotation).',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities' => 'moodle/course:manageactivities',
    ],
    'format_mnemo_set_scene_object' => [
        'classname'   => 'format_mnemo\\external\\set_scene_object',
        'methodname'  => 'execute',
        'description' => 'Save a non-activity scene object\'s in-view transform and brightness.',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities' => 'moodle/course:manageactivities',
    ],
    'format_mnemo_add_placed_object' => [
        'classname'   => 'format_mnemo\\external\\add_placed_object',
        'methodname'  => 'execute',
        'description' => 'Place a decorative prop in the scene at a grid-snapped position.',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities' => 'moodle/course:manageactivities',
    ],
    'format_mnemo_remove_placed_object' => [
        'classname'   => 'format_mnemo\\external\\remove_placed_object',
        'methodname'  => 'execute',
        'description' => 'Remove a teacher-placed decorative prop.',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities' => 'moodle/course:manageactivities',
    ],
    'format_mnemo_remove_scene_object' => [
        'classname'   => 'format_mnemo\\external\\remove_scene_object',
        'methodname'  => 'execute',
        'description' => 'Remove (hide) a generated decorative prop from a course.',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities' => 'moodle/course:manageactivities',
    ],
];
