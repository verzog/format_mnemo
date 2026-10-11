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
 * Background fetch of remote model metadata.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\task;

use format_mnemo\output\asset_gallery;

/**
 * Fetch the metadata (credits) of the models in an external asset pack.
 *
 * The course page never fetches remote models itself, so it queues this task
 * when a remote model's metadata is not cached yet. Reading the models with
 * remote fetches allowed fills the metadata cache; the next course page view
 * then builds a complete credits list.
 */
class fetch_model_metadata extends \core\task\adhoc_task {
    /**
     * The task name shown in the task logs.
     *
     * @return string The name.
     */
    public function get_name(): string {
        return get_string('task_fetchmodelmetadata', 'format_mnemo');
    }

    /**
     * Read every model with remote fetches allowed, filling the metadata cache.
     */
    public function execute(): void {
        asset_gallery::models(true);
    }
}
