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

    /**
     * With no sign font/texture configured, the scene config carries null for
     * both, so the client keeps its bundled monospace font and flat neon frame.
     */
    public function test_scene_config_sign_assets_default_null(): void {
        global $PAGE;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $PAGE->set_context(context_course::instance($course->id));
        $format = course_get_format($course);
        $scene = new \format_mnemo\output\scene($format);
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $this->assertNull($config['signfonturl']);
        $this->assertNull($config['signtextureurl']);
    }

    /**
     * An admin-configured sign font/texture URL is passed through to the scene
     * config, so the client loads it as the neon font and frame texture.
     */
    public function test_scene_config_sign_assets_url(): void {
        global $PAGE;
        $this->resetAfterTest();
        $this->setAdminUser();

        set_config('signfonturl', 'https://cdn.example/neon.woff2', 'format_mnemo');
        set_config('signtextureurl', 'https://cdn.example/frame.png', 'format_mnemo');

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $PAGE->set_context(context_course::instance($course->id));
        $format = course_get_format($course);
        $scene = new \format_mnemo\output\scene($format);
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $this->assertSame('https://cdn.example/neon.woff2', $config['signfonturl']);
        $this->assertSame('https://cdn.example/frame.png', $config['signtextureurl']);
    }

    /**
     * With nothing configured, the road/ground texture URLs are null and the
     * tiling scales and patch size carry their defaults, so the client keeps its
     * bundled flat road and neon floor.
     */
    public function test_scene_config_ground_defaults(): void {
        global $PAGE;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $PAGE->set_context(context_course::instance($course->id));
        $format = course_get_format($course);
        $scene = new \format_mnemo\output\scene($format);
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $this->assertNull($config['roadtextureurl']);
        $this->assertNull($config['groundtextureurl']);
        $this->assertSame(8, $config['roadtexturescale']);
        $this->assertSame(8, $config['groundtexturescale']);
        $this->assertSame(14, $config['groundpatchsize']);
    }

    /**
     * Admin-configured road/ground texture URLs and tiling/patch values pass
     * through to the scene config.
     */
    public function test_scene_config_ground_configured(): void {
        global $PAGE;
        $this->resetAfterTest();
        $this->setAdminUser();

        set_config('roadtextureurl', 'https://cdn.example/road.png', 'format_mnemo');
        set_config('groundtextureurl', 'https://cdn.example/ground.png', 'format_mnemo');
        set_config('roadtexturescale', '12', 'format_mnemo');
        set_config('groundtexturescale', '6', 'format_mnemo');
        set_config('groundpatchsize', '20', 'format_mnemo');

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $PAGE->set_context(context_course::instance($course->id));
        $format = course_get_format($course);
        $scene = new \format_mnemo\output\scene($format);
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $this->assertSame('https://cdn.example/road.png', $config['roadtextureurl']);
        $this->assertSame('https://cdn.example/ground.png', $config['groundtextureurl']);
        $this->assertSame(12, $config['roadtexturescale']);
        $this->assertSame(6, $config['groundtexturescale']);
        $this->assertSame(20, $config['groundpatchsize']);
    }

    /**
     * canedit is true for a user who can edit activities (editing teacher) and
     * false for a student, gating the in-view editor.
     */
    public function test_scene_config_canedit(): void {
        global $PAGE;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');
        $PAGE->set_context(context_course::instance($course->id));

        $this->setUser($student);
        $scene = new \format_mnemo\output\scene(course_get_format($course));
        $this->assertFalse($scene->get_scene_config($PAGE->get_renderer('format_mnemo'))['canedit']);

        $this->setUser($teacher);
        $scene = new \format_mnemo\output\scene(course_get_format($course));
        $this->assertTrue($scene->get_scene_config($PAGE->get_renderer('format_mnemo'))['canedit']);
    }

    /**
     * A per-activity in-view transform is exposed for that activity, with the
     * building left null when only a transform (empty model) is stored.
     */
    public function test_scene_config_activity_transform(): void {
        global $PAGE, $DB;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $page = $this->getDataGenerator()->create_module('page', [
            'course' => $course->id, 'section' => 1, 'name' => 'Moved',
        ]);
        $DB->insert_record('format_mnemo_building', (object)[
            'cmid' => $page->cmid, 'model' => '', 'scale' => 2.0,
            'offsetx' => 1.0, 'offsety' => 0.0, 'offsetz' => -2.0,
            'rotation' => 90.0, 'timemodified' => time(),
        ]);

        $PAGE->set_context(context_course::instance($course->id));
        $scene = new \format_mnemo\output\scene(course_get_format($course));
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $transform = null;
        $building = 'unset';
        foreach ($config['sections'] as $section) {
            foreach ($section['activities'] as $act) {
                if ((int)$act['id'] === (int)$page->cmid) {
                    $transform = $act['transform'];
                    $building = $act['building'];
                }
            }
        }

        $this->assertNull($building);
        $this->assertIsArray($transform);
        $this->assertEqualsWithDelta(2.0, $transform['scale'], 1e-6);
        $this->assertEqualsWithDelta(1.0, $transform['x'], 1e-6);
        $this->assertEqualsWithDelta(-2.0, $transform['z'], 1e-6);
        $this->assertEqualsWithDelta(90.0, $transform['rot'], 1e-6);
    }

    /**
     * Per-course scene-object overrides (props/gates/pylons) are exposed in the
     * scene config, keyed by their slot key.
     */
    public function test_scene_config_scene_objects(): void {
        global $PAGE, $DB;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(
            ['format' => 'mnemo', 'numsections' => 1],
            ['createsections' => true]
        );
        $DB->insert_record('format_mnemo_sceneobj', (object)[
            'courseid' => $course->id, 'objkey' => 'lamp:1', 'scale' => 2.0,
            'offsetx' => 1.0, 'offsety' => 0.0, 'offsetz' => 0.0,
            'rotation' => 45.0, 'brightness' => 2.0, 'timemodified' => time(),
        ]);

        $PAGE->set_context(context_course::instance($course->id));
        $scene = new \format_mnemo\output\scene(course_get_format($course));
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $this->assertArrayHasKey('lamp:1', $config['sceneobjects']);
        $obj = $config['sceneobjects']['lamp:1'];
        $this->assertEqualsWithDelta(2.0, $obj['scale'], 1e-6);
        $this->assertEqualsWithDelta(1.0, $obj['x'], 1e-6);
        $this->assertEqualsWithDelta(45.0, $obj['rot'], 1e-6);
        $this->assertEqualsWithDelta(2.0, $obj['brightness'], 1e-6);
    }

    /**
     * The flying-car types setting is parsed into the scene config: valid lines
     * become car types (numeric fields clamped), and comment/blank/malformed
     * lines and unknown models are skipped.
     */
    public function test_scene_config_parses_car_types(): void {
        global $PAGE;
        $this->resetAfterTest();
        $this->setAdminUser();

        set_config('cartypes', implode("\n", [
            '# a comment',
            '',
            'av | avenue | 14 | 20 | none | 8',
            'av | cross | 999 | 26 | rooftop', // Speed clamped to 60; default count.
            'nope | avenue | 10 | 20 | none', // Unknown model: skipped.
            'av | spiral | 10 | 20 | none', // Bad path: skipped.
            'av | diagonal | 10 | 20 | orbit', // Bad land: skipped.
            'av | avenue | fast | high | none', // Non-numeric speed/height: skipped.
            'av | avenue | 10', // Too few fields: skipped.
        ]), 'format_mnemo');

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $PAGE->set_context(context_course::instance($course->id));
        $scene = new \format_mnemo\output\scene(course_get_format($course));
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $cars = $config['cartypes'];
        $this->assertCount(2, $cars);
        $this->assertSame('avenue', $cars[0]['path']);
        $this->assertEqualsWithDelta(14.0, $cars[0]['speed'], 1e-6);
        $this->assertSame(8, $cars[0]['count']);
        $this->assertSame('cross', $cars[1]['path']);
        $this->assertEqualsWithDelta(60.0, $cars[1]['speed'], 1e-6); // Clamped.
        $this->assertSame('rooftop', $cars[1]['land']);
        $this->assertSame(4, $cars[1]['count']); // Default.
    }

    /**
     * With no car types configured, the scene exposes an empty list (the client
     * then falls back to its single default avenue vehicle).
     */
    public function test_scene_config_car_types_default_empty(): void {
        global $PAGE;
        $this->resetAfterTest();
        $this->setAdminUser();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $PAGE->set_context(context_course::instance($course->id));
        $scene = new \format_mnemo\output\scene(course_get_format($course));
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));

        $this->assertSame([], $config['cartypes']);
    }

    /**
     * With no comfort preference the scene exposes the defaults; a stored
     * preference is parsed through, and invalid fields fall back to defaults.
     */
    public function test_scene_config_comfort(): void {
        global $PAGE;
        $this->resetAfterTest();

        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user);
        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $PAGE->set_context(context_course::instance($course->id));
        $scene = new \format_mnemo\output\scene(course_get_format($course));

        // No preference: null, so the client can fall back to a device-local
        // choice (then the client defaults).
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));
        $this->assertNull($config['comfort']);

        // A stored preference passes through; an invalid field defaults.
        set_user_preference('format_mnemo_comfort', json_encode([
            'turn' => 'smooth', 'snapangle' => 45, 'vignette' => 'off', 'speed' => 'bogus',
            'locomotion' => 'teleport',
        ]));
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));
        $this->assertSame('smooth', $config['comfort']['turn']);
        $this->assertSame(45, $config['comfort']['snapangle']);
        $this->assertSame('off', $config['comfort']['vignette']);
        $this->assertSame('normal', $config['comfort']['speed']); // Invalid -> default.
        $this->assertSame('teleport', $config['comfort']['locomotion']);

        // A non-scalar field (a hand-edited PARAM_RAW value) must not error; it
        // just takes the defaults.
        set_user_preference('format_mnemo_comfort', json_encode([
            'turn' => [], 'snapangle' => ['x'], 'vignette' => 'light', 'speed' => 'fast',
            'locomotion' => 'bogus',
        ]));
        $config = $scene->get_scene_config($PAGE->get_renderer('format_mnemo'));
        $this->assertSame('snap', $config['comfort']['turn']); // Array -> default.
        $this->assertSame(30, $config['comfort']['snapangle']); // Array -> default.
        $this->assertSame('light', $config['comfort']['vignette']);
        $this->assertSame('fast', $config['comfort']['speed']);
        $this->assertSame('smooth', $config['comfort']['locomotion']); // Invalid -> default.
    }

    /**
     * The comfort user-preference is writable only by its owner: the permission
     * callback accepts the current user and rejects another.
     */
    public function test_comfort_preference_permission(): void {
        $this->resetAfterTest();

        $owner = $this->getDataGenerator()->create_user();
        $other = $this->getDataGenerator()->create_user();
        $this->setUser($owner);

        $prefs = format_mnemo_user_preferences();
        $this->assertArrayHasKey('format_mnemo_comfort', $prefs);
        $callback = $prefs['format_mnemo_comfort']['permissioncallback'];
        $this->assertTrue($callback($owner, 'format_mnemo_comfort'));
        $this->assertFalse($callback($other, 'format_mnemo_comfort'));
    }
}
