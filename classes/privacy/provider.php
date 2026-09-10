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
 * Privacy Subsystem implementation for format_mnemo.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\request\writer;

/**
 * Privacy provider for format_mnemo.
 *
 * The format keeps no data in its own tables. It stores teacher-uploaded topic
 * images as course content via the files subsystem, and one per-user comfort
 * preference (VR turn mode/angle, motion vignette and movement speed); both are
 * declared here, and the comfort preference is exported on request.
 */
class provider implements
    \core_privacy\local\metadata\provider,
    \core_privacy\local\request\user_preference_provider {
    /**
     * Describe the data this plugin stores.
     *
     * @param collection $collection the metadata collection to add to
     * @return collection the updated collection
     */
    public static function get_metadata(collection $collection): collection {
        $collection->add_subsystem_link(
            'core_files',
            [],
            'privacy:metadata:core_files'
        );
        $collection->add_user_preference(
            'format_mnemo_comfort',
            'privacy:metadata:preference:comfort'
        );
        return $collection;
    }

    /**
     * Export the plugin's user preferences for a user.
     *
     * @param int $userid The user whose preferences are being exported.
     */
    public static function export_user_preferences(int $userid): void {
        $value = get_user_preferences('format_mnemo_comfort', null, $userid);
        if ($value !== null) {
            writer::export_user_preference(
                'format_mnemo',
                'format_mnemo_comfort',
                $value,
                get_string('privacy:metadata:preference:comfort', 'format_mnemo')
            );
        }
    }
}
