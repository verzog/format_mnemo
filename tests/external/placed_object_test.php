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
 * Tests for the placed-object external functions.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\external;

/**
 * Tests for placing and removing teacher-placed decorative props.
 *
 * @covers \format_mnemo\external\add_placed_object
 * @covers \format_mnemo\external\remove_placed_object
 */
final class placed_object_test extends \advanced_testcase {
    /**
     * An editing teacher can place a prop; its position is grid-snapped.
     */
    public function test_teacher_can_place_and_snap(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        // 3.2 snaps to 4, -5.1 snaps to -6 on the 2-unit grid.
        $result = add_placed_object::execute($course->id, 'lamp', 3.2, -5.1);
        $this->assertGreaterThan(0, $result['id']);
        $this->assertSame('lamp', $result['type']);
        $this->assertEqualsWithDelta(4.0, $result['x'], 1e-6);
        $this->assertEqualsWithDelta(-6.0, $result['z'], 1e-6);

        $row = $DB->get_record('format_mnemo_placedobj', ['id' => $result['id']], '*', MUST_EXIST);
        $this->assertEquals($course->id, $row->courseid);
        $this->assertEqualsWithDelta(4.0, (float)$row->basex, 1e-6);
        $this->assertEqualsWithDelta(-6.0, (float)$row->basez, 1e-6);
    }

    /**
     * An unknown prop type is rejected.
     */
    public function test_bad_type_rejected(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $this->expectException(\invalid_parameter_exception::class);
        add_placed_object::execute($course->id, 'tower', 0.0, 0.0);
    }

    /**
     * Store a one-byte model in the system-context asset-pack file area.
     *
     * @param string $filename The glTF file name.
     */
    protected function upload_pack_model(string $filename): void {
        get_file_storage()->create_file_from_string([
            'contextid' => \context_system::instance()->id,
            'component' => 'format_mnemo',
            'filearea' => 'assetpack',
            'itemid' => 0,
            'filepath' => '/',
            'filename' => $filename,
        ], 'x');
    }

    /**
     * An uploaded asset-pack prop (not a bundled one) can be placed.
     */
    public function test_uploaded_prop_can_be_placed(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $this->upload_pack_model('spaceship.glb');

        $result = add_placed_object::execute($course->id, 'spaceship', 0.0, 0.0);
        $this->assertSame('spaceship', $result['type']);
        $this->assertSame('spaceship', $DB->get_field('format_mnemo_placedobj', 'type', ['id' => $result['id']]));
    }

    /**
     * An uploaded prop whose base name contains a space (which a restricted
     * param type would reject) can still be placed: the raw name is gated on
     * the placeable-prop whitelist.
     */
    public function test_uploaded_prop_with_space_can_be_placed(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $this->upload_pack_model('street light.glb');

        $result = add_placed_object::execute($course->id, 'street light', 0.0, 0.0);
        $this->assertSame('street light', $result['type']);
        $this->assertSame('street light', $DB->get_field('format_mnemo_placedobj', 'type', ['id' => $result['id']]));
    }

    /**
     * A named building model is never a placeable prop, even when uploaded.
     */
    public function test_building_model_is_not_placeable(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $this->upload_pack_model('building-forum.glb');

        $this->expectException(\invalid_parameter_exception::class);
        add_placed_object::execute($course->id, 'building-forum', 0.0, 0.0);
    }

    /**
     * Removing a prop also clears any transform it accumulated, and is scoped
     * to the course.
     */
    public function test_remove_clears_transform(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $this->setUser($teacher);

        $placed = add_placed_object::execute($course->id, 'kiosk', 2.0, 2.0);
        // A transform edit lives in the scene-object store keyed placed:<id>.
        set_scene_object::execute($course->id, 'placed:' . $placed['id'], 2.0, 0.0, 0.0, 0.0, 0.0, 1.0);

        $result = remove_placed_object::execute($course->id, $placed['id']);
        $this->assertTrue($result['status']);
        $this->assertFalse($DB->record_exists('format_mnemo_placedobj', ['id' => $placed['id']]));
        $this->assertFalse($DB->record_exists(
            'format_mnemo_sceneobj',
            ['courseid' => $course->id, 'objkey' => 'placed:' . $placed['id']]
        ));
    }

    /**
     * A prop id from another course cannot be removed via a different course id.
     */
    public function test_remove_is_course_scoped(): void {
        global $DB;
        $this->resetAfterTest();

        $coursea = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $courseb = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $teacher = $this->getDataGenerator()->create_and_enrol($coursea, 'editingteacher');
        $this->getDataGenerator()->enrol_user($teacher->id, $courseb->id, 'editingteacher');
        $this->setUser($teacher);

        $placed = add_placed_object::execute($coursea->id, 'barrier', 0.0, 0.0);
        // Attempting to remove course A's prop while naming course B is a no-op.
        remove_placed_object::execute($courseb->id, $placed['id']);
        $this->assertTrue($DB->record_exists('format_mnemo_placedobj', ['id' => $placed['id']]));
    }

    /**
     * A student (without the activity-editing capability) cannot place a prop.
     */
    public function test_student_is_denied(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->expectException(\required_capability_exception::class);
        add_placed_object::execute($course->id, 'lamp', 0.0, 0.0);
    }
}
