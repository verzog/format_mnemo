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

use backup;
use backup_controller;
use restore_controller;

/**
 * Tests that restoring a course holds its scene data to the format's rules.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(\restore_format_mnemo_plugin::class)]
final class backup_restore_test extends \advanced_testcase {
    /**
     * Back up a course and restore it as a new course. Import mode keeps the
     * unpacked backup in the temp folder, so the restore can read it by id.
     *
     * @param \stdClass $course The course to back up.
     * @return int The new course id.
     */
    protected function backup_and_restore(\stdClass $course): int {
        global $CFG, $USER;
        require_once($CFG->dirroot . '/backup/util/includes/backup_includes.php');
        require_once($CFG->dirroot . '/backup/util/includes/restore_includes.php');
        $CFG->backup_file_logger_level = backup::LOG_NONE;

        $bc = new backup_controller(
            backup::TYPE_1COURSE,
            $course->id,
            backup::FORMAT_MOODLE,
            backup::INTERACTIVE_NO,
            backup::MODE_IMPORT,
            $USER->id
        );
        $backupid = $bc->get_backupid();
        $bc->execute_plan();
        $bc->destroy();

        $newid = \restore_dbops::create_new_course($course->fullname . ' copy', $course->shortname . '_c', $course->category);
        $rc = new restore_controller(
            $backupid,
            $newid,
            backup::INTERACTIVE_NO,
            backup::MODE_IMPORT,
            $USER->id,
            backup::TARGET_NEW_COURSE
        );
        $this->assertTrue($rc->execute_precheck());
        $rc->execute_plan();
        $rc->destroy();
        return (int)$newid;
    }

    /**
     * Valid scene data survives a restore; out-of-range numbers are clamped and
     * invalid models, keys and prop types are dropped.
     */
    public function test_restore_validates_scene_data(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $good = $this->getDataGenerator()->create_module('page', ['course' => $course->id, 'section' => 1, 'name' => 'Good']);
        $bad = $this->getDataGenerator()->create_module('page', ['course' => $course->id, 'section' => 1, 'name' => 'Bad']);

        // Rows written straight to the database stand in for a tampered backup.
        $DB->insert_record('format_mnemo_building', (object)[
            'cmid' => $good->cmid, 'model' => 'library.glb', 'scale' => 2, 'timemodified' => 1,
        ]);
        $DB->insert_record('format_mnemo_building', (object)[
            'cmid' => $bad->cmid, 'model' => 'javascript:alert(1)', 'scale' => 9999, 'offsetx' => -9999,
            'rotation' => -90, 'timemodified' => 1,
        ]);
        $okprop = $DB->insert_record('format_mnemo_placedobj', (object)[
            'courseid' => $course->id, 'type' => 'lamp', 'basex' => 9999, 'basez' => 3, 'timecreated' => 1,
        ]);
        $badprop = $DB->insert_record('format_mnemo_placedobj', (object)[
            'courseid' => $course->id, 'type' => '../evil', 'basex' => 0, 'basez' => 0, 'timecreated' => 1,
        ]);
        foreach (['lamp:1', 'placed:' . $okprop, 'placed:' . $badprop, 'BAD KEY'] as $key) {
            $DB->insert_record('format_mnemo_sceneobj', (object)[
                'courseid' => $course->id, 'objkey' => $key, 'brightness' => 50, 'hidden' => 7, 'timemodified' => 1,
            ]);
        }

        $newid = $this->backup_and_restore($course);

        $modinfo = get_fast_modinfo($newid);
        $newcms = [];
        foreach ($modinfo->get_cms() as $cm) {
            $newcms[$cm->name] = $cm->id;
        }
        $goodrow = $DB->get_record('format_mnemo_building', ['cmid' => $newcms['Good']], '*', MUST_EXIST);
        $this->assertSame('library.glb', $goodrow->model);
        $this->assertEquals(2.0, (float)$goodrow->scale);

        $badrow = $DB->get_record('format_mnemo_building', ['cmid' => $newcms['Bad']], '*', MUST_EXIST);
        $this->assertSame('', $badrow->model);
        $this->assertEquals(10.0, (float)$badrow->scale);
        $this->assertEquals(-200.0, (float)$badrow->offsetx);
        $this->assertEquals(270.0, (float)$badrow->rotation);

        $props = array_values($DB->get_records('format_mnemo_placedobj', ['courseid' => $newid]));
        $this->assertCount(1, $props);
        $this->assertSame('lamp', $props[0]->type);
        $this->assertEquals(400.0, (float)$props[0]->basex);
        $this->assertEquals(4.0, (float)$props[0]->basez);

        $keys = $DB->get_records_menu('format_mnemo_sceneobj', ['courseid' => $newid], 'objkey', 'objkey, brightness');
        $this->assertEqualsCanonicalizing(['lamp:1', 'placed:' . $props[0]->id], array_keys($keys));
        foreach ($keys as $brightness) {
            $this->assertEquals(5.0, (float)$brightness);
        }
        $this->assertSame(
            ['1'],
            array_values(array_unique($DB->get_fieldset_select('format_mnemo_sceneobj', 'hidden', 'courseid = ?', [$newid])))
        );
    }
}
