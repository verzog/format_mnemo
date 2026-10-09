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
 * Tests for multi-file model bundle (.zip) resolution and extraction.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Tests for multi-file model bundle (.zip) resolution and extraction.
 *
 * @covers \format_mnemo\local\model_bundle
 */
final class model_bundle_test extends \advanced_testcase {
    /**
     * Store a .zip bundle with the given entries in a model file area.
     *
     * @param string $filename The zip file name (e.g. "spaceship.zip").
     * @param array $entries Map of internal path => contents.
     * @param string $filearea The model upload area (default assetpack).
     * @return \stored_file The stored zip file.
     */
    protected function make_zip(string $filename, array $entries, string $filearea = 'assetpack'): \stored_file {
        $path = make_request_directory() . '/' . $filename;
        $zip = new \ZipArchive();
        $zip->open($path, \ZipArchive::CREATE);
        foreach ($entries as $name => $contents) {
            $zip->addFromString($name, $contents);
        }
        $zip->close();
        return get_file_storage()->create_file_from_pathname([
            'contextid' => \context_system::instance()->id,
            'component' => 'format_mnemo',
            'filearea' => $filearea,
            'itemid' => 0,
            'filepath' => '/',
            'filename' => $filename,
        ], $path);
    }

    /**
     * The entry picks glTF over GLB over FBX, the shallowest, then a name match.
     */
    public function test_entry_path_preference(): void {
        $this->resetAfterTest();

        // Prefer glTF over glb/fbx even when deeper siblings exist at the root.
        $zip = $this->make_zip('ship.zip', [
            'model.fbx' => 'x',
            'scene.glb' => 'x',
            'scene.gltf' => '{"asset":{"version":"2.0"}}',
            'scene.bin' => 'x',
            'textures/t.png' => 'x',
            'readme.txt' => 'x',
        ]);
        $this->assertSame('scene.gltf', model_bundle::entry_path($zip));

        // With only glb and fbx, glb wins.
        $zip2 = $this->make_zip('ship2.zip', ['a.fbx' => 'x', 'b.glb' => 'x']);
        $this->assertSame('b.glb', model_bundle::entry_path($zip2));

        // A shallower entry beats a deeper one of the same type.
        $zip3 = $this->make_zip('ship3.zip', ['deep/inner.glb' => 'x', 'top.glb' => 'x']);
        $this->assertSame('top.glb', model_bundle::entry_path($zip3));

        // No model file inside => null.
        $zip4 = $this->make_zip('ship4.zip', ['readme.txt' => 'x', 'notes.md' => 'x']);
        $this->assertNull(model_bundle::entry_path($zip4));
    }

    /**
     * The entry URL points at the extracted modelcache area, keyed by the zip's
     * content hash, and preserves the entry's own subfolder.
     */
    public function test_entry_url(): void {
        $this->resetAfterTest();
        $zip = $this->make_zip('nested.zip', ['body/car.gltf' => '{"asset":{"version":"2.0"}}', 'body/car.bin' => 'x']);
        $hash = $zip->get_contenthash();
        $url = model_bundle::entry_url($zip);
        $this->assertNotNull($url);
        $this->assertStringContainsString('/format_mnemo/modelcache/0/' . $hash . '/body/car.gltf', $url);

        // A zip with no model file resolves to no URL.
        $none = $this->make_zip('empty.zip', ['readme.txt' => 'x']);
        $this->assertNull(model_bundle::entry_url($none));
    }

    /**
     * find_by_hash locates the source zip across the model areas, and only a zip.
     */
    public function test_find_by_hash(): void {
        $this->resetAfterTest();
        $zip = $this->make_zip('v.zip', ['m.glb' => 'x'], 'vehicleassets');
        $hash = $zip->get_contenthash();
        $found = model_bundle::find_by_hash($hash);
        $this->assertNotNull($found);
        $this->assertSame('v.zip', $found->get_filename());
        // A bogus hash finds nothing.
        $this->assertNull(model_bundle::find_by_hash(str_repeat('0', 40)));
        $this->assertNull(model_bundle::find_by_hash('not-a-hash'));
    }

    /**
     * extract_by_hash unpacks the bundle into the modelcache area so the entry
     * and its sibling resources are served from there; it is idempotent.
     */
    public function test_extract_by_hash(): void {
        $this->resetAfterTest();
        $zip = $this->make_zip('b.zip', [
            'scene.gltf' => '{"asset":{"version":"2.0"}}',
            'scene.bin' => 'binary-data',
            'textures/wall.png' => 'png-data',
        ]);
        $hash = $zip->get_contenthash();
        $this->assertTrue(model_bundle::extract_by_hash($hash));

        $fs = get_file_storage();
        $contextid = \context_system::instance()->id;
        $entry = $fs->get_file($contextid, 'format_mnemo', 'modelcache', 0, '/' . $hash . '/', 'scene.gltf');
        $this->assertNotFalse($entry);
        $bin = $fs->get_file($contextid, 'format_mnemo', 'modelcache', 0, '/' . $hash . '/', 'scene.bin');
        $this->assertNotFalse($bin);
        $this->assertSame('binary-data', $bin->get_content());
        $tex = $fs->get_file($contextid, 'format_mnemo', 'modelcache', 0, '/' . $hash . '/textures/', 'wall.png');
        $this->assertNotFalse($tex);

        // Calling again is a no-op success (already extracted).
        $this->assertTrue(model_bundle::extract_by_hash($hash));
    }
}
