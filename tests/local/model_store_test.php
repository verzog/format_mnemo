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
 * Tests for deleting uploaded models.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Tests which files make up a model and that deleting removes them, the
 * lite copy, unpacked bundles and the model's settings, and nothing else.
 *
 * @covers \format_mnemo\local\model_store
 */
final class model_store_test extends \advanced_testcase {
    /**
     * Store a file in a system-context plugin file area.
     *
     * @param string $filearea The file area.
     * @param string $filename The file name (with a leading folder for modelcache).
     * @param string $content The file content.
     */
    protected function store(string $filearea, string $filename, string $content = 'x'): void {
        get_file_storage()->create_file_from_string([
            'contextid' => \context_system::instance()->id,
            'component' => 'format_mnemo',
            'filearea' => $filearea,
            'itemid' => 0,
            'filepath' => '/' . (dirname($filename) === '.' ? '' : dirname($filename) . '/'),
            'filename' => basename($filename),
        ], $content);
    }

    /**
     * The file names left in an area.
     *
     * @param string $filearea The file area.
     * @return string[] The file paths, sorted.
     */
    protected function left(string $filearea): array {
        $files = get_file_storage()->get_area_files(
            \context_system::instance()->id,
            'format_mnemo',
            $filearea,
            0,
            'filepath, filename',
            false
        );
        $out = array_map(function ($file) {
            return ltrim($file->get_filepath() . $file->get_filename(), '/');
        }, $files);
        sort($out);
        return $out;
    }

    /**
     * A model is its own upload and its lite copy, never a model whose name
     * only starts the same; unknown areas and lite names give nothing.
     */
    public function test_files(): void {
        $this->resetAfterTest();
        $this->store('buildingassets', 'building-quiz.glb');
        $this->store('buildingassets', 'building-quiz-lite.fbx');
        $this->store('buildingassets', 'building-quizzes.glb');
        $this->store('buildingassets', 'notes.txt');
        $this->assertSame(
            ['building-quiz-lite.fbx', 'building-quiz.glb'],
            array_keys(model_store::files('buildingassets', 'building-quiz'))
        );
        $this->assertSame([], model_store::files('signfont', 'building-quiz'));
        $this->assertSame([], model_store::files('buildingassets', 'building-quiz-lite'));
        $this->assertSame([], model_store::files('buildingassets', 'nothing'));
    }

    /**
     * Deleting removes the model's files, the unpacked bundle no other upload
     * shares, and its settings; it keeps everything else and logs each file.
     */
    public function test_delete(): void {
        global $DB;
        $this->resetAfterTest();
        $this->store('assetpack', 'statue.zip', 'zip one');
        $this->store('assetpack', 'statue-lite.glb');
        $this->store('assetpack', 'bench.zip', 'zip two');
        $one = sha1('zip one');
        $two = sha1('zip two');
        $this->store('modelcache', $one . '/scene.gltf');
        $this->store('modelcache', $two . '/scene.gltf');
        model_config::set('statue', ['scale' => 2]);
        model_config::set('bench', ['scale' => 3]);

        $deleted = model_store::delete('assetpack', 'statue');
        $this->assertEqualsCanonicalizing(['statue.zip', 'statue-lite.glb'], $deleted);
        $this->assertSame(['bench.zip'], $this->left('assetpack'));
        $this->assertSame([$two . '/scene.gltf'], $this->left('modelcache'));
        $this->assertArrayNotHasKey('statue', model_config::all());
        $this->assertSame(3.0, model_config::get('bench')['scale']);
        $this->assertSame(2, $DB->count_records('config_log', ['plugin' => 'format_mnemo', 'name' => 'modeldeleted']));

        // Nothing left to delete.
        $this->assertSame([], model_store::delete('assetpack', 'statue'));
    }

    /**
     * A bundle's unpacked files stay while another upload is the same zip.
     */
    public function test_delete_keeps_shared_bundle(): void {
        $this->resetAfterTest();
        $this->store('assetpack', 'statue.zip', 'same zip');
        $this->store('vehicleassets', 'hovercar.zip', 'same zip');
        $this->store('modelcache', sha1('same zip') . '/scene.gltf');
        model_store::delete('assetpack', 'statue');
        $this->assertSame([sha1('same zip') . '/scene.gltf'], $this->left('modelcache'));
    }
}
