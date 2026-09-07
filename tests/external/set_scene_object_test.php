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
 * Tests for the set_scene_object external function.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\external;

/**
 * Tests for saving a non-activity scene object's transform per course.
 *
 * @covers \format_mnemo\external\set_scene_object
 */
final class set_scene_object_test extends \advanced_testcase {
    /**
     * An editing teacher can save a scene object, keyed per course by slot key.
     */
    public function test_teacher_can_save_scene_object(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $result = set_scene_object::execute($course->id, 'lamp:2', 1.5, 2.0, 0.0, -1.0, 90.0, 2.5);
        $this->assertTrue($result['status']);

        $row = $DB->get_record(
            'format_mnemo_sceneobj',
            ['courseid' => $course->id, 'objkey' => 'lamp:2'],
            '*',
            MUST_EXIST
        );
        $this->assertEqualsWithDelta(1.5, (float)$row->scale, 1e-6);
        $this->assertEqualsWithDelta(-1.0, (float)$row->offsetz, 1e-6);
        $this->assertEqualsWithDelta(90.0, (float)$row->rotation, 1e-6);
        $this->assertEqualsWithDelta(2.5, (float)$row->brightness, 1e-6);
    }

    /**
     * The per-axis width/height/depth multipliers are stored for a scene object.
     */
    public function test_axis_scales_saved(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        // Positional order matches execute(): ... brightness, then scalex/y/z.
        set_scene_object::execute($course->id, 'lamp:1', 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.5, 2.0, 0.5);

        $row = $DB->get_record(
            'format_mnemo_sceneobj',
            ['courseid' => $course->id, 'objkey' => 'lamp:1'],
            '*',
            MUST_EXIST
        );
        $this->assertEqualsWithDelta(1.5, (float)$row->scalex, 1e-6);
        $this->assertEqualsWithDelta(2.0, (float)$row->scaley, 1e-6);
        $this->assertEqualsWithDelta(0.5, (float)$row->scalez, 1e-6);
    }

    /**
     * A second save for the same slot key updates the row rather than duplicating.
     */
    public function test_save_upserts_by_slot_key(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        set_scene_object::execute($course->id, 'kiosk:0', 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
        set_scene_object::execute($course->id, 'kiosk:0', 2.0, 0.0, 0.0, 0.0, 0.0, 1.0);

        $rows = $DB->get_records(
            'format_mnemo_sceneobj',
            ['courseid' => $course->id, 'objkey' => 'kiosk:0']
        );
        $this->assertCount(1, $rows);
        $this->assertEqualsWithDelta(2.0, (float)reset($rows)->scale, 1e-6);
    }

    /**
     * Out-of-range values are clamped.
     */
    public function test_values_are_clamped(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        set_scene_object::execute($course->id, 'gate:0', 100.0, 999.0, 0.0, 0.0, 400.0, 99.0);

        $row = $DB->get_record(
            'format_mnemo_sceneobj',
            ['courseid' => $course->id, 'objkey' => 'gate:0'],
            '*',
            MUST_EXIST
        );
        $this->assertEqualsWithDelta(10.0, (float)$row->scale, 1e-6);
        $this->assertEqualsWithDelta(200.0, (float)$row->offsetx, 1e-6);
        $this->assertEqualsWithDelta(40.0, (float)$row->rotation, 1e-6);
        $this->assertEqualsWithDelta(5.0, (float)$row->brightness, 1e-6);
    }

    /**
     * A malformed slot key is rejected.
     */
    public function test_bad_key_rejected(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $this->expectException(\invalid_parameter_exception::class);
        set_scene_object::execute($course->id, 'lamp; DROP', 1.0, 0.0, 0.0, 0.0, 0.0, 1.0);
    }

    /**
     * A student (without the activity-editing capability) is denied.
     */
    public function test_student_is_denied(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        set_scene_object::execute($course->id, 'lamp:0', 2.0, 0.0, 0.0, 0.0, 0.0, 1.0);
    }
}
