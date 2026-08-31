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
 * Upgrade steps for the Mnemo (VR cyberspace) course format.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Upgrade the Mnemo course format.
 *
 * @param int $oldversion the version we are upgrading from
 * @return bool
 */
function xmldb_format_mnemo_upgrade($oldversion) {
    if ($oldversion < 2026083101) {
        // Three.js is now bundled with the plugin and is the default source.
        // Earlier versions defaulted the setting to a public CDN URL, which may
        // have been stored in config. Clear the stored value only when it still
        // holds that former default, so the bundled copy is used while genuine
        // administrator overrides are preserved.
        $formerdefault = 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js';
        if (get_config('format_mnemo', 'threeurl') === $formerdefault) {
            unset_config('threeurl', 'format_mnemo');
        }

        upgrade_plugin_savepoint(true, 2026083101, 'format', 'mnemo');
    }

    return true;
}
