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
 * Restore support for the Mnemo course format.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Restores the per-section topic images stored by the Mnemo format.
 *
 * Section format options themselves are restored generically by core; this
 * plugin re-attaches the files from the format's 'sectionimage' area, mapping
 * each old section id to the newly created one.
 */
class restore_format_mnemo_plugin extends restore_format_plugin {
    /**
     * Define the section-level path element used to trigger the file restore.
     *
     * @return restore_path_element[] the paths handled by this plugin
     */
    protected function define_section_plugin_structure() {
        $paths = [];

        // A dummy element so after_restore_section() is called for each section.
        $paths[] = new restore_path_element('sectionfiles', $this->get_pathfor('/sectionfiles'));

        return $paths;
    }

    /**
     * No per-record processing is needed; the files are added afterwards.
     *
     * @param array $data the element data
     * @return void
     */
    public function process_sectionfiles($data) {
    }

    /**
     * Re-attach the topic image files once the section has been restored.
     *
     * The files live in the course context keyed by section id, so they are
     * matched against the 'course_section' mapping created by the core section
     * restore step.
     *
     * @return void
     */
    public function after_restore_section() {
        $this->add_related_files('format_mnemo', 'sectionimage', 'course_section');
    }
}
