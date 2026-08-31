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

namespace format_mnemo\form;

use context_course;

/**
 * Section editing form for the Mnemo course format.
 *
 * Extends the standard section form to prepare the per-section topic image
 * filemanager draft area so an existing image loads for editing. The parent
 * class lives in course/editsection_form.php and is required by
 * format_mnemo::editsection_form() before this class is instantiated.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class editsection extends \editsection_form {
    /**
     * Load existing data as form defaults, preparing the topic image draft area.
     *
     * @param stdClass|array $defaultvalues object or array of default values
     */
    public function set_data($defaultvalues) {
        $defaultvalues = (object)$defaultvalues;
        if (!empty($defaultvalues->id)) {
            $context = context_course::instance($this->_customdata['course']->id);
            $draftitemid = file_get_submitted_draft_itemid('topicimage');
            file_prepare_draft_area(
                $draftitemid,
                $context->id,
                'format_mnemo',
                'sectionimage',
                (int)$defaultvalues->id,
                ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image']]
            );
            $defaultvalues->topicimage = $draftitemid;
        }
        parent::set_data($defaultvalues);
    }
}
