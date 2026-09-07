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
 * Tests for the remove_scene_object external function.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\external;

/**
 * Tests for hiding (deleting) a generated decorative prop per course.
 *
 * @covers \format_mnemo\external\remove_scene_object
 */
final class remove_scene_object_test extends \advanced_testcase {
    /**
     * An editing teacher can hide a generated prop, creating the row with
     * hidden set when none existed.
     */
    public function test_teacher_can_hide_new_prop(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $result = remove_scene_object::execute($course->id, 'lamp:3');
        $this->assertTrue($result['status']);

        $row = $DB->get_record(
            'format_mnemo_sceneobj',
            ['courseid' => $course->id, 'objkey' => 'lamp:3'],
            '*',
            MUST_EXIST
        );
        $this->assertEquals(1, (int)$row->hidden);
    }

    /**
     * Hiding a prop that already has a transform row sets hidden on it and
     * leaves the stored transform intact.
     */
    public function test_hide_marks_existing_row(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        set_scene_object::execute($course->id, 'kiosk:0', 1.5, 0.0, 0.0, 0.0, 0.0, 1.0);
        remove_scene_object::execute($course->id, 'kiosk:0');

        $rows = $DB->get_records(
            'format_mnemo_sceneobj',
            ['courseid' => $course->id, 'objkey' => 'kiosk:0']
        );
        $this->assertCount(1, $rows);
        $row = reset($rows);
        $this->assertEquals(1, (int)$row->hidden);
        $this->assertEqualsWithDelta(1.5, (float)$row->scale, 1e-6);
    }

    /**
     * Only prop slots (lamp/barrier/kiosk) are removable; a gate, pylon or
     * malformed key is rejected.
     */
    public function test_non_prop_key_rejected(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $this->expectException(\invalid_parameter_exception::class);
        remove_scene_object::execute($course->id, 'gate:0');
    }

    /**
     * A student cannot hide a prop.
     */
    public function test_student_is_denied(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        remove_scene_object::execute($course->id, 'lamp:0');
    }
}
