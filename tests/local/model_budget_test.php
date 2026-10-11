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
 * Tests for the model size budgets.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Tests the triangle counting, the budget warnings and the upload checks.
 *
 * @covers \format_mnemo\local\model_budget
 * @covers \format_mnemo\admin\setting_modelupload
 */
final class model_budget_test extends \advanced_testcase {
    /**
     * Build GLB bytes holding the given glTF JSON (no binary chunk).
     *
     * @param array $gltf The glTF document.
     * @return string The GLB bytes.
     */
    protected function make_glb(array $gltf): string {
        $json = json_encode($gltf);
        while (strlen($json) % 4 !== 0) {
            $json .= ' ';
        }
        $chunk = pack('V', strlen($json)) . 'JSON' . $json;
        return 'glTF' . pack('V', 2) . pack('V', 12 + strlen($chunk)) . $chunk;
    }

    /**
     * A glTF document with one indexed triangle mesh used by one node.
     *
     * @param int $triangles The triangle count of the mesh.
     * @return array The glTF document.
     */
    protected static function one_mesh(int $triangles): array {
        return [
            'asset' => ['version' => '2.0'],
            'accessors' => [['count' => $triangles * 3], ['count' => $triangles * 3]],
            'meshes' => [['primitives' => [['attributes' => ['POSITION' => 1], 'indices' => 0]]]],
            'nodes' => [['mesh' => 0]],
        ];
    }

    /**
     * Store a file in a system-context plugin file area.
     *
     * @param string $filearea The file area.
     * @param string $filename The file name.
     * @param string $content The file content.
     * @return \stored_file The stored file.
     */
    protected function store(string $filearea, string $filename, string $content): \stored_file {
        return get_file_storage()->create_file_from_string([
            'contextid' => \context_system::instance()->id,
            'component' => 'format_mnemo',
            'filearea' => $filearea,
            'itemid' => 0,
            'filepath' => '/',
            'filename' => $filename,
        ], $content);
    }

    /**
     * Triangle counts for each kind of glTF document.
     *
     * @return array[] Test cases: the glTF document and the expected count.
     */
    public static function triangle_provider(): array {
        $accessors = [['count' => 30], ['count' => 12]];
        return [
            'indexed triangles' => [self::one_mesh(10), 10],
            'no indices uses the vertex count' => [[
                'accessors' => $accessors,
                'meshes' => [['primitives' => [['attributes' => ['POSITION' => 1]]]]],
            ], 4],
            'triangle strip' => [[
                'accessors' => $accessors,
                'meshes' => [['primitives' => [['attributes' => ['POSITION' => 1], 'indices' => 0, 'mode' => 5]]]],
            ], 28],
            'lines are not triangles' => [[
                'accessors' => $accessors,
                'meshes' => [['primitives' => [['attributes' => ['POSITION' => 1], 'indices' => 0, 'mode' => 1]]]],
            ], 0],
            'a mesh used by two nodes counts twice' => [[
                'nodes' => [['mesh' => 0], ['mesh' => 0]],
            ] + self::one_mesh(10), 20],
            'GPU instancing counts each instance' => [[
                'accessors' => [['count' => 30], ['count' => 30], ['count' => 5]],
                'nodes' => [['mesh' => 0, 'extensions' => ['EXT_mesh_gpu_instancing' => [
                    'attributes' => ['TRANSLATION' => 2],
                ]]]],
            ] + self::one_mesh(10), 50],
            'no meshes' => [['asset' => ['version' => '2.0']], null],
        ];
    }

    /**
     * Triangles are counted from accessor counts, by primitive mode and use.
     *
     * @dataProvider triangle_provider
     * @param array $gltf The glTF document.
     * @param int|null $expected The expected triangle count.
     */
    public function test_count_triangles(array $gltf, ?int $expected): void {
        $this->assertSame($expected, model_budget::count_triangles($gltf));
    }

    /**
     * A model gets one warning per limit it is over, and none when it is within
     * budget, its numbers are unknown, or its category has no budget.
     */
    public function test_warnings(): void {
        $this->assertSame([], model_budget::warnings('building', 3145728, 20000));
        $this->assertSame([], model_budget::warnings('building', null, null));
        $this->assertSame([], model_budget::warnings('celestial', 99999999, 9999999));

        $warnings = model_budget::warnings('building', 21579384, 623000);
        $this->assertCount(2, $warnings);
        $this->assertStringContainsString('623,000', $warnings[0]);
        $this->assertStringContainsString('20,000', $warnings[0]);

        $this->assertCount(1, model_budget::warnings('prop', 2000000, 100));
        $this->assertCount(1, model_budget::warnings('vehicle', 1000, 5001));
    }

    /**
     * A stored .glb has its triangles counted; other formats and broken files
     * give null.
     */
    public function test_file_triangles(): void {
        $this->resetAfterTest();
        $glb = $this->store('buildingassets', 'building-forum.glb', $this->make_glb(self::one_mesh(42)));
        $this->assertSame(42, model_budget::file_triangles($glb));
        $fbx = $this->store('buildingassets', 'building-page.fbx', $this->make_glb(self::one_mesh(42)));
        $this->assertNull(model_budget::file_triangles($fbx));
        $bad = $this->store('buildingassets', 'building-quiz.glb', 'not a model');
        $this->assertNull(model_budget::file_triangles($bad));
    }

    /**
     * The bundled models are all within their budgets.
     */
    public function test_bundled_models_within_budget(): void {
        global $CFG;
        foreach (glob($CFG->dirroot . '/course/format/mnemo/models/*.glb') as $path) {
            $name = basename($path, '.glb');
            $category = strpos($name, 'building-') === 0 ? 'building' : ($name === 'av' ? 'vehicle' : 'prop');
            $bytes = (string)file_get_contents($path);
            $len = unpack('V', substr($bytes, 12, 4))[1];
            $tris = model_budget::count_triangles(json_decode(substr($bytes, 20, $len), true));
            $this->assertGreaterThan(0, $tris, $name);
            $this->assertSame([], model_budget::warnings($category, strlen($bytes), $tris), $name);
        }
    }

    /**
     * Over-budget uploads each queue one warning; within-budget ones none.
     */
    public function test_notify_uploads(): void {
        $this->resetAfterTest();
        $big = $this->store('buildingassets', 'building-forum.glb', $this->make_glb(self::one_mesh(25000)));
        $small = $this->store('buildingassets', 'building-page.glb', $this->make_glb(self::one_mesh(500)));
        \core\notification::fetch();

        model_budget::notify_uploads('buildingassets', [$big, $small]);
        $notes = \core\notification::fetch();
        $this->assertCount(1, $notes);
        $this->assertSame(\core\notification::WARNING, $notes[0]->get_message_type());
        $this->assertStringContainsString('building-forum.glb', $notes[0]->get_message());
        $this->assertStringContainsString('25,000', $notes[0]->get_message());

        // The small model is within the prop budget too, and an unknown area is ignored.
        model_budget::notify_uploads('assetpack', [$small]);
        $this->assertCount(0, \core\notification::fetch());
        model_budget::notify_uploads('nosucharea', [$big]);
        $this->assertCount(0, \core\notification::fetch());
    }

    /**
     * Saving the upload setting warns about a newly added over-budget model,
     * but not again on a later save that leaves it unchanged.
     */
    public function test_setting_warns_on_new_uploads(): void {
        global $CFG, $USER;
        require_once($CFG->libdir . '/adminlib.php');
        $this->resetAfterTest();
        $this->setAdminUser();

        $setting = new \format_mnemo\admin\setting_modelupload(
            'format_mnemo/buildingassets',
            'Buildings',
            '',
            'buildingassets',
            0,
            ['subdirs' => 0, 'maxfiles' => 50, 'accepted_types' => ['.glb', '.fbx', '.zip']]
        );
        $fs = get_file_storage();
        $usercontext = \context_user::instance($USER->id);
        $draft = file_get_unused_draft_itemid();
        $fs->create_file_from_string([
            'contextid' => $usercontext->id,
            'component' => 'user',
            'filearea' => 'draft',
            'itemid' => $draft,
            'filepath' => '/',
            'filename' => 'building-forum.glb',
        ], $this->make_glb(self::one_mesh(25000)));
        \core\notification::fetch();

        $this->assertSame('', $setting->write_setting($draft));
        $notes = \core\notification::fetch();
        $this->assertCount(1, $notes);
        $this->assertStringContainsString('building-forum.glb', $notes[0]->get_message());

        // Save again from a fresh draft of the same files: nothing new, no warning.
        $draft = 0;
        file_prepare_draft_area($draft, \context_system::instance()->id, 'format_mnemo', 'buildingassets', 0);
        $this->assertSame('', $setting->write_setting($draft));
        $this->assertCount(0, \core\notification::fetch());
    }
}
