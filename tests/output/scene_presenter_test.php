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

namespace format_mnemo\output;

use context_course;

/**
 * Tests for who is offered presenter mode in the scene config.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(scene::class)]
final class scene_presenter_test extends \advanced_testcase {
    /**
     * The scene config for a user in a course.
     *
     * @param \stdClass $course The course.
     * @param \stdClass $user The viewer.
     * @return array The scene config.
     */
    protected function config_for(\stdClass $course, \stdClass $user): array {
        global $PAGE;
        $this->setUser($user);
        $PAGE->set_context(context_course::instance($course->id));
        $scene = new scene(course_get_format($course));
        return $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));
    }

    /**
     * Editing and non-editing teachers are offered presenter mode, students
     * are not, and the site-wide setting turns it off for everyone. The pose
     * model is served from the plugin itself.
     */
    public function test_presenter_offered_to_teachers_only(): void {
        global $CFG;
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $editor = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'teacher');
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');

        $config = $this->config_for($course, $editor);
        $this->assertTrue($config['presenter']);
        $this->assertStringStartsWith(
            $CFG->wwwroot . '/course/format/mnemo/thirdparty/mediapipe/models/',
            $config['mediapipeposemodelurl']
        );
        $this->assertTrue($this->config_for($course, $teacher)['presenter']);
        $this->assertFalse($this->config_for($course, $student)['presenter']);

        set_config('presentermode', 0, 'format_mnemo');
        $this->assertFalse($this->config_for($course, $editor)['presenter']);
    }

    /**
     * The presenter capability is defined with no risks, and the vendored
     * pose model the config points at is present.
     */
    public function test_capability_and_model(): void {
        global $CFG;
        $this->resetAfterTest();
        $cap = get_capability_info('format/mnemo:present');
        $this->assertNotEmpty($cap);
        $this->assertEquals(0, (int)$cap->riskbitmask);
        $this->assertFileExists($CFG->dirroot . '/course/format/mnemo/thirdparty/mediapipe/models/pose_landmarker_lite.task');
    }
}
