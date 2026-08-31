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

namespace format_mnemo;

/**
 * Event observers for the Mnemo course format.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class observer {
    /**
     * Delete a section's topic image when the section is deleted.
     *
     * The delete targets this plugin's file area for the section only, so it is
     * a harmless no-op for sections and courses that never had a topic image.
     *
     * @param \core\event\course_section_deleted $event the section deletion event
     */
    public static function course_section_deleted(\core\event\course_section_deleted $event): void {
        get_file_storage()->delete_area_files(
            $event->contextid,
            'format_mnemo',
            'sectionimage',
            $event->objectid
        );
    }
}
