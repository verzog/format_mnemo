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
 * Tests for the set_transform external function.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\external;

/**
 * Tests for saving an activity's in-view transform.
 *
 * @covers \format_mnemo\external\set_transform
 */
final class set_transform_test extends \advanced_testcase {
    /**
     * An editing teacher can save a transform, which lands in the building table
     * with an empty model.
     */
    public function test_teacher_can_save_transform(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id]);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $result = set_transform::execute($page->cmid, 1.5, 2.0, 0.0, -3.0, 45.0);
        $this->assertTrue($result['status']);

        $row = $DB->get_record('format_mnemo_building', ['cmid' => $page->cmid], '*', MUST_EXIST);
        $this->assertEqualsWithDelta(1.5, (float)$row->scale, 1e-6);
        $this->assertEqualsWithDelta(2.0, (float)$row->offsetx, 1e-6);
        $this->assertEqualsWithDelta(-3.0, (float)$row->offsetz, 1e-6);
        $this->assertEqualsWithDelta(45.0, (float)$row->rotation, 1e-6);
        $this->assertSame('', $row->model);
    }

    /**
     * Out-of-range values are clamped, and the rotation is normalised.
     */
    public function test_values_are_clamped(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id]);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        set_transform::execute($page->cmid, 100.0, 999.0, -999.0, 0.0, 400.0);

        $row = $DB->get_record('format_mnemo_building', ['cmid' => $page->cmid], '*', MUST_EXIST);
        $this->assertEqualsWithDelta(10.0, (float)$row->scale, 1e-6);
        $this->assertEqualsWithDelta(200.0, (float)$row->offsetx, 1e-6);
        $this->assertEqualsWithDelta(-200.0, (float)$row->offsety, 1e-6);
        $this->assertEqualsWithDelta(40.0, (float)$row->rotation, 1e-6);
    }

    /**
     * Setting a transform keeps any existing building-model override.
     */
    public function test_preserves_existing_model(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id]);
        $DB->insert_record('format_mnemo_building', (object)[
            'cmid' => $page->cmid, 'model' => 'library.glb', 'timemodified' => time(),
        ]);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        set_transform::execute($page->cmid, 2.0, 0.0, 0.0, 0.0, 0.0);

        $row = $DB->get_record('format_mnemo_building', ['cmid' => $page->cmid], '*', MUST_EXIST);
        $this->assertSame('library.glb', $row->model);
        $this->assertEqualsWithDelta(2.0, (float)$row->scale, 1e-6);
    }

    /**
     * A student (without the activity-editing capability) is denied.
     */
    public function test_student_is_denied(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        set_transform::execute($page->cmid, 2.0, 0.0, 0.0, 0.0, 0.0);
    }
}
