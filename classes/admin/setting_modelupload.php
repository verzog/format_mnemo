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
 * A model upload setting that warns about over-budget models.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\admin;

use format_mnemo\local\model_budget;
use format_mnemo\local\model_licence;

/**
 * A model upload setting that warns about over-budget models.
 *
 * Works like the standard stored-file setting, then checks each model the save
 * added or replaced against the size budget for its category and for licence
 * problems, and queues a warning for each one found. Models already there are
 * not re-checked, so saving the page again does not repeat old warnings.
 */
class setting_modelupload extends \admin_setting_configstoredfile {
    /**
     * Save the uploaded files, then warn about new over-budget models.
     *
     * @param mixed $data The draft item id from the file manager.
     * @return string Empty on success, else an error message.
     */
    public function write_setting($data) {
        $before = $this->area_hashes();
        $result = parent::write_setting($data);
        if ($result === '') {
            $changed = [];
            foreach ($this->area_files() as $file) {
                if (($before[$file->get_pathnamehash()] ?? null) !== $file->get_contenthash()) {
                    $changed[] = $file;
                }
            }
            model_budget::notify_uploads($this->filearea, $changed);
            model_licence::notify_uploads($changed);
        }
        return $result;
    }

    /**
     * The files currently in this setting's file area.
     *
     * @return \stored_file[] The files, directories excluded.
     */
    protected function area_files(): array {
        return get_file_storage()->get_area_files(
            \context_system::instance()->id,
            'format_mnemo',
            $this->filearea,
            $this->itemid,
            'filename',
            false
        );
    }

    /**
     * The content hash of each file in the area, keyed by path name hash.
     *
     * @return string[] Path name hash => content hash.
     */
    protected function area_hashes(): array {
        $out = [];
        foreach ($this->area_files() as $file) {
            $out[$file->get_pathnamehash()] = $file->get_contenthash();
        }
        return $out;
    }
}
