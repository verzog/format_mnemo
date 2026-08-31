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
 * Site wide settings for the Mnemo (VR cyberspace) course format.
 *
 * @package    format_mnemo
 * @copyright  2026 format_mnemo contributors
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {

    // URL of the Three.js ES module. Point this to a locally hosted copy for
    // offline / air-gapped installations or to satisfy a strict Content
    // Security Policy. It must be an ES module build that exports the THREE
    // namespace as a default/named export set.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/threeurl',
        get_string('setting_threeurl', 'format_mnemo'),
        get_string('setting_threeurl_desc', 'format_mnemo'),
        'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js',
        PARAM_URL
    ));

    // Default cyberspace environment for newly created courses.
    $settings->add(new admin_setting_configselect(
        'format_mnemo/defaultenvironment',
        get_string('setting_defaultenvironment', 'format_mnemo'),
        get_string('setting_defaultenvironment_desc', 'format_mnemo'),
        'cyberspace',
        [
            'cyberspace' => get_string('environment_cyberspace', 'format_mnemo'),
            'grid' => get_string('environment_grid', 'format_mnemo'),
            'void' => get_string('environment_void', 'format_mnemo'),
        ]
    ));

    // Default neon palette for newly created courses.
    $settings->add(new admin_setting_configselect(
        'format_mnemo/defaultpalette',
        get_string('setting_defaultpalette', 'format_mnemo'),
        get_string('setting_defaultpalette_desc', 'format_mnemo'),
        'cyan',
        [
            'cyan' => get_string('palette_cyan', 'format_mnemo'),
            'amber' => get_string('palette_amber', 'format_mnemo'),
            'magenta' => get_string('palette_magenta', 'format_mnemo'),
            'green' => get_string('palette_green', 'format_mnemo'),
        ]
    ));
}
