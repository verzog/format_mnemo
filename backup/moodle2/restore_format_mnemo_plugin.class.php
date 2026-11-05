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

use format_mnemo\local\scene_values;

/**
 * Restores the per-section topic images stored by the Mnemo format.
 *
 * Section format options themselves are restored generically by core; this
 * plugin re-attaches the files from the format's 'sectionimage' area, mapping
 * each old section id to the newly created one.
 *
 * A backup file is untrusted input (it may come from another site or have been
 * edited by hand), so every scene value is held to the same rules as the web
 * services and the activity form ({@see scene_values}): numbers are clamped,
 * and a model, key or prop type that is not valid is dropped.
 */
class restore_format_mnemo_plugin extends restore_format_plugin {
    /** @var array<int, int> Old-to-new id map for placed props, so a
     * placed:&lt;id&gt; transform key can be remapped to the restored prop. */
    protected $placedmap = [];

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

    /**
     * Define the module-level path element for the per-activity building row.
     *
     * @return restore_path_element[] the paths handled by this plugin
     */
    protected function define_module_plugin_structure() {
        return [
            new restore_path_element('mnemobuilding', $this->get_pathfor('/building')),
        ];
    }

    /**
     * Restore an activity's building-model override and in-view transform,
     * keyed to the newly created course module.
     *
     * @param array $data the element data
     * @return void
     */
    public function process_mnemobuilding($data) {
        global $DB;

        $data = (array)$data;
        $model = trim((string)($data['model'] ?? ''));
        if ($model !== '' && !scene_values::valid_model($model)) {
            // Not a model file name or URL: keep the transform, drop the model.
            $model = '';
        }
        $record = (object)(scene_values::transform($data) + [
            'cmid' => $this->task->get_moduleid(),
            'model' => $model,
            'timemodified' => (int)($data['timemodified'] ?? 0),
        ]);
        // A given module has at most one row (unique cmid); guard against a
        // pre-existing one from a partial/repeated restore.
        if (!$DB->record_exists('format_mnemo_building', ['cmid' => $record->cmid])) {
            $DB->insert_record('format_mnemo_building', $record);
        }
    }

    /**
     * Define the course-level path element for the per-course scene objects.
     *
     * @return restore_path_element[] the paths handled by this plugin
     */
    protected function define_course_plugin_structure() {
        // Placed props first so their ids are mapped before the transforms
        // that reference them (placed:<id>) are restored. The backup writes
        // them in this order too, so the callbacks fire in step.
        return [
            new restore_path_element('mnemoplacedobj', $this->get_pathfor('/placedobjs/placedobj')),
            new restore_path_element('mnemosceneobj', $this->get_pathfor('/sceneobjs/sceneobj')),
        ];
    }

    /**
     * Restore a teacher-placed prop for the restored course, remembering the
     * old-to-new id map so its placed:&lt;id&gt; transform can be remapped.
     *
     * @param array $data the element data
     * @return void
     */
    public function process_mnemoplacedobj($data) {
        global $DB;

        $data = (array)$data;
        $oldid = (int)($data['id'] ?? 0);
        if (!scene_values::valid_prop_type($data['type'] ?? null)) {
            return; // Not a safe model name; its transform is dropped as an orphan too.
        }
        $courseid = $this->task->get_courseid();
        if ($DB->count_records('format_mnemo_placedobj', ['courseid' => $courseid]) >= scene_values::MAX_PLACED) {
            return; // The course is at the placed-prop limit; extra props are dropped.
        }
        $record = (object)[
            'courseid' => $courseid,
            'type' => $data['type'],
            'basex' => scene_values::placed_coordinate($data['basex'] ?? 0),
            'basez' => scene_values::placed_coordinate($data['basez'] ?? 0),
            'timecreated' => (int)($data['timecreated'] ?? 0),
        ];
        $this->placedmap[$oldid] = (int)$DB->insert_record('format_mnemo_placedobj', $record);
    }

    /**
     * Restore a non-activity scene object's transform for the restored course.
     * Slot keys are per-course-relative, so only the course id is remapped -
     * except a placed:&lt;id&gt; key, whose id is remapped to the restored prop
     * (a transform whose prop did not come across is dropped).
     *
     * @param array $data the element data
     * @return void
     */
    public function process_mnemosceneobj($data) {
        global $DB;

        $data = (array)$data;
        $objkey = $data['objkey'] ?? null;
        if (!scene_values::valid_key($objkey)) {
            return; // Not a valid slot key.
        }
        if (preg_match('/^placed:([0-9]+)$/', $objkey, $matches)) {
            $oldid = (int)$matches[1];
            if (!isset($this->placedmap[$oldid])) {
                return; // Orphan transform: its prop was not restored.
            }
            $objkey = 'placed:' . $this->placedmap[$oldid];
        }
        $record = (object)(scene_values::transform($data) + [
            'courseid' => $this->task->get_courseid(),
            'objkey' => $objkey,
            'brightness' => scene_values::brightness($data['brightness'] ?? 1.0),
            'hidden' => empty($data['hidden']) ? 0 : 1,
            'timemodified' => (int)($data['timemodified'] ?? 0),
        ]);
        if (
            !$DB->record_exists(
                'format_mnemo_sceneobj',
                ['courseid' => $record->courseid, 'objkey' => $record->objkey]
            )
        ) {
            $DB->insert_record('format_mnemo_sceneobj', $record);
        }
    }
}
