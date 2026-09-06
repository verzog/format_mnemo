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
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {
    // URL of the Three.js ES module. Left blank, the plugin loads the copy it
    // bundles (thirdparty/three.module.min.js). Override only to point at a
    // shared or newer hosted copy; it must be an ES module build that exports
    // the THREE namespace.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/threeurl',
        get_string('setting_threeurl', 'format_mnemo'),
        get_string('setting_threeurl_desc', 'format_mnemo'),
        '',
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

    // Base URL of an external glTF (.glb) prop asset pack. Left blank, the
    // plugin loads the original props it bundles (models/). Point this at a
    // directory of .glb files (av, lamp, kiosk, barrier, ...) to swap in your
    // own CC0/licensed models; Draco/meshopt geometry and KTX2 textures are
    // supported via the bundled addon loaders.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/assetbaseurl',
        get_string('setting_assetbaseurl', 'format_mnemo'),
        get_string('setting_assetbaseurl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));

    // Upload a prop asset pack straight into Moodle instead of hosting it at a
    // URL. Files land in the 'assetpack' file area at system context and are
    // served via pluginfile; the loader reads them by the same
    // av/lamp/kiosk/barrier naming convention. Draco/meshopt-compressed .glb
    // models are supported. The URL setting above, if set, takes precedence.
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/assetpack',
        get_string('setting_assetpack', 'format_mnemo'),
        get_string('setting_assetpack_desc', 'format_mnemo'),
        'assetpack',
        0,
        ['subdirs' => 0, 'maxfiles' => 50, 'accepted_types' => ['.glb']]
    ));

    // Default drag-to-look direction for newly created courses. Teachers can
    // override this per course, so the direction never needs a code change.
    $settings->add(new admin_setting_configcheckbox(
        'format_mnemo/defaultinvertlook',
        get_string('setting_defaultinvertlook', 'format_mnemo'),
        get_string('setting_defaultinvertlook_desc', 'format_mnemo'),
        0
    ));
}
