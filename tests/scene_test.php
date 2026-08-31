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

use context_course;

/**
 * Tests for the Mnemo course format and its cyberspace scene builder.
 *
 * @package    format_mnemo
 * @copyright  2026 format_mnemo contributors
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 * @covers     \format_mnemo
 * @covers     \format_mnemo\output\scene
 */
final class scene_test extends \advanced_testcase {

    /**
     * The format exposes the expected default format options.
     */
    public function test_default_course_format_options(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 3],
            ['createsections' => true]
        );
        $format = course_get_format($course);
        $options = $format->get_format_options();

        $this->assertArrayHasKey('mnemoenvironment', $options);
        $this->assertArrayHasKey('mnemopalette', $options);
        $this->assertArrayHasKey('mnemolayout', $options);
        $this->assertSame('cyberspace', $options['mnemoenvironment']);
        $this->assertSame('cyan', $options['mnemopalette']);
        $this->assertSame('ring', $options['mnemolayout']);
        $this->assertTrue($format->uses_sections());
        $this->assertTrue($format->supports_components());
    }

    /**
     * Default section names follow the cyberspace "node" naming.
     */
    public function test_default_section_name(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 2],
            ['createsections' => true]
        );
        $format = course_get_format($course);
        $modinfo = get_fast_modinfo($course);
        $sections = $modinfo->get_section_info_all();

        $this->assertSame(
            get_string('section0name', 'format_mnemo'),
            $format->get_default_section_name($sections[0])
        );
        $this->assertStringContainsString(
            get_string('sectionname', 'format_mnemo'),
            $format->get_default_section_name($sections[1])
        );
    }

    /**
     * The scene config exposes sections with their activities and metadata.
     */
    public function test_scene_config_contains_activities(): void {
        global $PAGE;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 2],
            ['createsections' => true]
        );
        // A real, viewable activity in section 1.
        $page = $this->getDataGenerator()->create_module('page', [
            'course' => $course->id,
            'section' => 1,
            'name' => 'Wetwire briefing',
        ]);
        // A label, which should be excluded from the flyable nodes.
        $this->getDataGenerator()->create_module('label', [
            'course' => $course->id,
            'section' => 1,
        ]);

        $PAGE->set_context(context_course::instance($course->id));
        $format = course_get_format($course);
        $scene = new \format_mnemo\output\scene($format);
        $renderer = $PAGE->get_renderer('format_mnemo');
        $config = $scene->get_scene_config($renderer);

        $this->assertSame((int)$course->id, $config['courseid']);
        $this->assertNotEmpty($config['threeurl']);
        $this->assertArrayHasKey('sections', $config);

        // Find section 1 and confirm the page is present and the label is not.
        $sectionone = null;
        foreach ($config['sections'] as $section) {
            if ($section['number'] === 1) {
                $sectionone = $section;
            }
        }
        $this->assertNotNull($sectionone);
        $names = array_column($sectionone['activities'], 'name');
        $this->assertContains('Wetwire briefing', $names);
        $this->assertCount(1, $sectionone['activities'], 'Labels must not become nodes');

        $activity = $sectionone['activities'][0];
        $this->assertArrayHasKey('url', $activity);
        $this->assertArrayHasKey('state', $activity);
        $this->assertContains($activity['state'], ['available', 'complete', 'restricted']);
        $this->assertStringContainsString('/mod/page/view.php', $activity['url']);
        $this->assertSame($page->cmid, $activity['id']);
    }
}
