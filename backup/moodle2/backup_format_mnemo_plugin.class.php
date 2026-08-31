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
 * Backup support for the Mnemo course format.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Backs up the per-section topic images stored by the Mnemo format.
 *
 * The scalar section format options are handled generically by the core
 * section backup step. This plugin only needs to annotate the files kept in
 * the format's 'sectionimage' area so they travel with the backup.
 */
class backup_format_mnemo_plugin extends backup_format_plugin {
    /**
     * Annotate the topic image files attached to each section.
     *
     * @return backup_plugin_element the plugin element attached to the section
     */
    protected function define_section_plugin_structure() {
        // Only include this structure when the course actually uses this format.
        $plugin = $this->get_plugin_element(null, $this->get_format_condition(), 'format_mnemo');

        // Wrapper element recommended for plugin structures.
        $pluginwrapper = new backup_nested_element($this->get_recommended_name());
        $plugin->add_child($pluginwrapper);

        // A single element per section, sourced from the section itself, so its
        // id can be used as the itemid when annotating the topic image files.
        $sectionfiles = new backup_nested_element('sectionfiles', ['id'], null);
        $pluginwrapper->add_child($sectionfiles);

        $sectionfiles->set_source_table('course_sections', ['id' => backup::VAR_SECTIONID]);

        $sectionfiles->annotate_files('format_mnemo', 'sectionimage', 'id');

        return $plugin;
    }
}
