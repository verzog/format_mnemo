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

namespace format_mnemo\external;

/**
 * Tests for the get_states external function's access checks.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(get_states::class)]
final class get_states_test extends \advanced_testcase {
    /**
     * An enrolled student gets the course's activity states.
     */
    public function test_enrolled_student_gets_states(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id]);
        $this->setUser($this->getDataGenerator()->create_and_enrol($course, 'student'));

        $result = get_states::execute($course->id);
        $this->assertContains((int)$page->cmid, array_column($result['states'], 'cmid'));
    }

    /**
     * The states carry each section's lock state, so the client can drop or
     * raise a topic's access barrier live: a learner who has not met a
     * section's conditions sees it locked (and blocked), an unrestricted
     * section is unlocked.
     */
    public function test_section_lock_state_is_returned(): void {
        global $DB;
        $this->resetAfterTest();
        $generator = $this->getDataGenerator();
        $course = $generator->create_course(
            ['format' => 'mnemo', 'numsections' => 2],
            ['createsections' => true]
        );
        // Restrict section 1 to a future date, shown (greyed) so the condition
        // text is available rather than the section being hidden.
        $availability = json_encode((object)[
            'op' => '&',
            'c' => [(object)['type' => 'date', 'd' => '>=', 't' => time() + DAYSECS]],
            'showc' => [true],
        ]);
        $sectionid = $DB->get_field('course_sections', 'id', ['course' => $course->id, 'section' => 1]);
        $DB->set_field('course_sections', 'availability', $availability, ['id' => $sectionid]);
        rebuild_course_cache($course->id, true);
        $this->setUser($generator->create_and_enrol($course, 'student'));

        $result = get_states::execute($course->id);
        $bynumber = [];
        foreach ($result['sections'] as $section) {
            $bynumber[$section['number']] = $section;
        }
        $this->assertArrayHasKey(1, $bynumber);
        $this->assertTrue($bynumber[1]['locked']);
        $this->assertTrue($bynumber[1]['lockblocks']);
        $this->assertNotEmpty($bynumber[1]['conditions']);
        $this->assertArrayHasKey(0, $bynumber);
        $this->assertFalse($bynumber[0]['locked']);
        $this->assertSame('', $bynumber[0]['conditions']);
    }

    /**
     * A student in a hidden course is refused with a web service error, not
     * an HTML notice.
     */
    public function test_hidden_course_is_refused(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo', 'visible' => 0]);
        $this->setUser($this->getDataGenerator()->create_and_enrol($course, 'student'));

        $this->expectException(\require_login_exception::class);
        get_states::execute($course->id);
    }

    /**
     * A user who is not enrolled is refused.
     */
    public function test_not_enrolled_is_refused(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $this->setUser($this->getDataGenerator()->create_user());

        $this->expectException(\require_login_exception::class);
        get_states::execute($course->id);
    }
}
