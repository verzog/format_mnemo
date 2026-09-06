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
 * @copyright  2026 Vernon Spain
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
        $this->assertSame('cyberspace', $options['mnemoenvironment']);
        $this->assertSame('cyan', $options['mnemopalette']);
        $this->assertTrue($format->uses_sections());
        $this->assertTrue($format->supports_components());
    }

    /**
     * Unnamed sections fall back to the default "Section N" naming.
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
     * A named section shows its title alone on the sign, but title + number in
     * the editing interface.
     */
    public function test_named_section_title_and_number(): void {
        global $PAGE;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 2],
            ['createsections' => true]
        );
        $format = course_get_format($course);
        // Give section 1 a real title.
        $modinfo = get_fast_modinfo($course);
        $section1 = $modinfo->get_section_info(1);
        course_update_section($course, $section1, ['name' => 'Wetwire']);

        // Editing interface: title followed by the topic number.
        $this->assertSame('Wetwire (1)', $format->get_section_name(1));
        // Cyberspace sign: the plain title only.
        $this->assertSame('Wetwire', $format->get_section_title_plain(1));

        // The scene exposes the plain title (no number).
        $PAGE->set_context(context_course::instance($course->id));
        $scene = new \format_mnemo\output\scene($format);
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));
        $names = array_column($config['sections'], 'name', 'number');
        $this->assertSame('Wetwire', $names[1]);
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
        // The mouse-look direction is exposed to the client (off by default).
        $this->assertArrayHasKey('invertlook', $config);
        $this->assertFalse($config['invertlook']);

        // The site hour drives the day/night cycle; it is a 0-24 float.
        $this->assertArrayHasKey('hour', $config);
        $this->assertIsFloat($config['hour']);
        $this->assertGreaterThanOrEqual(0.0, $config['hour']);
        $this->assertLessThan(24.0, $config['hour']);

        // Find section 1 and confirm the page is present and the label is not.
        $sectionone = null;
        foreach ($config['sections'] as $section) {
            if ($section['number'] === 1) {
                $sectionone = $section;
            }
        }
        $this->assertNotNull($sectionone);
        // The topic image field is present and null when no image is uploaded.
        $this->assertArrayHasKey('image', $sectionone);
        $this->assertNull($sectionone['image']);
        $names = array_column($sectionone['activities'], 'name');
        $this->assertContains('Wetwire briefing', $names);
        $this->assertCount(1, $sectionone['activities'], 'Labels must not become nodes');

        $activity = $sectionone['activities'][0];
        $this->assertArrayHasKey('url', $activity);
        $this->assertArrayHasKey('state', $activity);
        $this->assertContains($activity['state'], ['available', 'complete', 'restricted']);
        $this->assertStringContainsString('/mod/page/view.php', $activity['url']);
        $this->assertSame($page->cmid, $activity['id']);
        // With no override set, the per-activity building field is present and null.
        $this->assertArrayHasKey('building', $activity);
        $this->assertNull($activity['building']);
    }

    /**
     * Video activities are classified in the scene config: a YouTube URL is an
     * embed, a direct video-file URL is a playable file, and non-video
     * activities carry a null video.
     */
    public function test_scene_config_video(): void {
        global $PAGE;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $youtube = $this->getDataGenerator()->create_module('url', [
            'course' => $course->id, 'section' => 1, 'name' => 'Lecture',
            'externalurl' => 'https://youtu.be/dQw4w9WgXcQ',
        ]);
        $mp4 = $this->getDataGenerator()->create_module('url', [
            'course' => $course->id, 'section' => 1, 'name' => 'Clip',
            'externalurl' => 'https://cdn.example/clip.mp4',
        ]);
        $link = $this->getDataGenerator()->create_module('url', [
            'course' => $course->id, 'section' => 1, 'name' => 'Docs',
            'externalurl' => 'https://example.com/page',
        ]);
        $page = $this->getDataGenerator()->create_module('page', [
            'course' => $course->id, 'section' => 1, 'name' => 'Notes',
        ]);

        $PAGE->set_context(context_course::instance($course->id));
        $format = course_get_format($course);
        $scene = new \format_mnemo\output\scene($format);
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $videos = [];
        foreach ($config['sections'] as $section) {
            foreach ($section['activities'] as $act) {
                $videos[$act['id']] = $act['video'];
            }
        }

        $this->assertSame('embed', $videos[$youtube->cmid]['kind']);
        $this->assertSame('file', $videos[$mp4->cmid]['kind']);
        $this->assertSame('https://cdn.example/clip.mp4', $videos[$mp4->cmid]['src']);
        $this->assertNull($videos[$link->cmid]);
        $this->assertNull($videos[$page->cmid]);
    }

    /**
     * A per-activity building override is exposed in the scene config for that
     * activity only, and other activities keep a null building.
     */
    public function test_scene_config_activity_building(): void {
        global $PAGE, $DB;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $withmodel = $this->getDataGenerator()->create_module('page', [
            'course' => $course->id, 'section' => 1, 'name' => 'Library',
        ]);
        $plain = $this->getDataGenerator()->create_module('page', [
            'course' => $course->id, 'section' => 1, 'name' => 'Plain',
        ]);

        $DB->insert_record('format_mnemo_building', (object)[
            'cmid' => $withmodel->cmid, 'model' => 'library.glb', 'timemodified' => time(),
        ]);

        $PAGE->set_context(context_course::instance($course->id));
        $format = course_get_format($course);
        $scene = new \format_mnemo\output\scene($format);
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $buildings = [];
        foreach ($config['sections'] as $section) {
            foreach ($section['activities'] as $act) {
                $buildings[$act['id']] = $act['building'];
            }
        }
        $this->assertSame('library.glb', $buildings[$withmodel->cmid]);
        $this->assertNull($buildings[$plain->cmid]);
    }

    /**
     * The activity settings hook stores an override, updates it, and clears it
     * again when the field is emptied.
     */
    public function test_coursemodule_building_save_update_and_clear(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $page = $this->getDataGenerator()->create_module('page', [
            'course' => $course->id, 'section' => 0,
        ]);

        // Save a new override.
        $data = (object)['coursemodule' => $page->cmid, 'format_mnemo_building' => 'library.glb'];
        format_mnemo_coursemodule_edit_post_actions($data, $course);
        $this->assertSame('library.glb', $DB->get_field('format_mnemo_building', 'model', ['cmid' => $page->cmid]));

        // Update it.
        $data->format_mnemo_building = 'tower.glb';
        format_mnemo_coursemodule_edit_post_actions($data, $course);
        $this->assertSame('tower.glb', $DB->get_field('format_mnemo_building', 'model', ['cmid' => $page->cmid]));
        $this->assertEquals(1, $DB->count_records('format_mnemo_building', ['cmid' => $page->cmid]));

        // Clear it.
        $data->format_mnemo_building = '';
        format_mnemo_coursemodule_edit_post_actions($data, $course);
        $this->assertFalse($DB->record_exists('format_mnemo_building', ['cmid' => $page->cmid]));

        // A URL's scheme is stored lower-cased (so the renderer recognises it);
        // the rest of the URL keeps its case.
        $data->format_mnemo_building = 'HTTPS://cdn.example/Model.glb';
        format_mnemo_coursemodule_edit_post_actions($data, $course);
        $this->assertSame(
            'https://cdn.example/Model.glb',
            $DB->get_field('format_mnemo_building', 'model', ['cmid' => $page->cmid])
        );
    }

    /**
     * Deleting an activity removes its stored building override.
     */
    public function test_building_removed_when_module_deleted(): void {
        global $DB;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $page = $this->getDataGenerator()->create_module('page', [
            'course' => $course->id, 'section' => 0,
        ]);
        $DB->insert_record('format_mnemo_building', (object)[
            'cmid' => $page->cmid, 'model' => 'library.glb', 'timemodified' => time(),
        ]);

        course_delete_module($page->cmid);

        $this->assertFalse($DB->record_exists('format_mnemo_building', ['cmid' => $page->cmid]));
    }

    /**
     * The building field validates: blank, a .glb file name, or an http(s) URL
     * are accepted; anything else is rejected.
     */
    public function test_coursemodule_building_validation(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);

        // A lightweight stand-in for the moodleform_mod wrapper.
        $wrapper = new class ($course) {
            /** @var \stdClass The course. */
            private $course;

            /**
             * Store the course.
             *
             * @param \stdClass $course the course
             */
            public function __construct($course) {
                $this->course = $course;
            }

            /**
             * Return the course.
             *
             * @return \stdClass the course
             */
            public function get_course() {
                return $this->course;
            }
        };

        $this->assertSame([], format_mnemo_coursemodule_validation($wrapper, ['format_mnemo_building' => '']));
        $this->assertSame([], format_mnemo_coursemodule_validation($wrapper, ['format_mnemo_building' => 'library.glb']));
        $this->assertSame(
            [],
            format_mnemo_coursemodule_validation($wrapper, ['format_mnemo_building' => 'https://cdn.example/x.glb'])
        );
        $errors = format_mnemo_coursemodule_validation($wrapper, ['format_mnemo_building' => 'not a model']);
        $this->assertArrayHasKey('format_mnemo_building', $errors);
    }
}
