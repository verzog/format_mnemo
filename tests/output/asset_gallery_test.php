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
 * Tests for the admin asset viewer's asset resolution.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\output;

/**
 * Tests that the gallery resolves each texture and model to the right URL and
 * source (uploaded / url / bundled / none).
 *
 * @covers \format_mnemo\output\asset_gallery
 */
final class asset_gallery_test extends \advanced_testcase {
    /**
     * Store a one-byte file in a system-context plugin file area.
     *
     * @param string $filearea The file area.
     * @param string $filename The file name.
     */
    protected function make_file(string $filearea, string $filename): void {
        get_file_storage()->create_file_from_string([
            'contextid' => \context_system::instance()->id,
            'component' => 'format_mnemo',
            'filearea' => $filearea,
            'itemid' => 0,
            'filepath' => '/',
            'filename' => $filename,
        ], 'x');
    }

    /**
     * Find the first texture entry with the given key.
     *
     * @param array $textures The texture entries.
     * @param string $key The key.
     * @return array|null The entry, or null.
     */
    protected function tex(array $textures, string $key): ?array {
        foreach ($textures as $t) {
            if ($t['key'] === $key) {
                return $t;
            }
        }
        return null;
    }

    /**
     * A texture with nothing configured reports the procedural (none) source; a
     * URL setting wins; an uploaded file is used when no URL is set.
     */
    public function test_texture_sources(): void {
        $this->resetAfterTest();

        // Nothing set: every single-file texture is 'none'.
        $ring = $this->tex(asset_gallery::textures(), 'ringtexture');
        $this->assertSame('none', $ring['source']);
        $this->assertNull($ring['url']);

        // A URL setting takes precedence.
        set_config('ringtextureurl', 'https://cdn.example.org/ring.png', 'format_mnemo');
        $ring = $this->tex(asset_gallery::textures(), 'ringtexture');
        $this->assertSame('url', $ring['source']);
        $this->assertSame('https://cdn.example.org/ring.png', $ring['url']);

        // An uploaded file is used when there is no URL.
        $this->make_file('spacetexture', 'sky.jpg');
        $space = $this->tex(asset_gallery::textures(), 'spacetexture');
        $this->assertSame('uploaded', $space['source']);
        $this->assertStringContainsString('sky.jpg', $space['url']);
    }

    /**
     * Each uploaded planet map becomes a card, and one whose filename contains
     * "ring" is flagged as ringed.
     */
    public function test_planet_maps_and_ring_flag(): void {
        $this->resetAfterTest();

        $this->make_file('planettextures', 'aaa-plain.png');
        $this->make_file('planettextures', 'saturn-ring.png');

        $planets = array_values(array_filter(asset_gallery::textures(), function ($t) {
            return $t['key'] === 'planettexture';
        }));
        $this->assertCount(2, $planets);
        // Ordered by filename: the plain one first, the ringed one second.
        $this->assertFalse($planets[0]['ringed']);
        $this->assertTrue($planets[1]['ringed']);
    }

    /**
     * Models list the bundled defaults, and an uploaded asset-pack file of the
     * same name overrides one to the uploaded source.
     */
    public function test_models_bundled_then_overridden(): void {
        $this->resetAfterTest();

        $bundled = asset_gallery::models();
        $keys = array_map(function ($m) {
            return $m['key'];
        }, $bundled);
        $this->assertContains('lamp', $keys);
        foreach ($bundled as $model) {
            $this->assertSame('bundled', $model['source']);
        }

        // Upload a replacement lamp, and an uploaded-only building model with no
        // bundled counterpart: the lamp flips to uploaded and the building model
        // gains its own card.
        $this->make_file('assetpack', 'lamp.glb');
        $this->make_file('assetpack', 'building-forum.glb');
        $models = asset_gallery::models();
        $bykey = [];
        foreach ($models as $model) {
            $bykey[$model['key']] = $model;
        }
        $this->assertSame('uploaded', $bykey['lamp']['source']);
        $this->assertStringContainsString('lamp.glb', $bykey['lamp']['url']);
        $this->assertArrayHasKey('building-forum', $bykey);
        $this->assertSame('uploaded', $bykey['building-forum']['source']);

        // A configured external pack URL wins over uploads (matching the scene).
        set_config('assetbaseurl', 'https://cdn.example.org/pack/', 'format_mnemo');
        foreach (asset_gallery::models() as $model) {
            $this->assertSame('url', $model['source']);
            $this->assertStringStartsWith('https://cdn.example.org/pack/', $model['url']);
        }
    }

    /**
     * The placer offers the bundled props plus any uploaded model, but never a
     * named building model.
     */
    public function test_placer_prop_names(): void {
        $this->resetAfterTest();

        // The bundled props are offered out of the box; building-quiz.glb is a
        // named building and is excluded.
        $names = asset_gallery::placer_prop_names();
        $this->assertContains('lamp', $names);
        $this->assertContains('av', $names);
        $this->assertNotContains('building-quiz', $names);

        // An uploaded prop joins the list; an uploaded building model does not.
        // A numeric base name (123.glb) must survive as the string "123", not
        // an int, so the web service's strict comparison still matches it.
        $this->make_file('assetpack', 'spaceship.glb');
        $this->make_file('assetpack', 'building-forum.glb');
        $this->make_file('assetpack', '123.glb');
        $names = asset_gallery::placer_prop_names();
        $this->assertContains('spaceship', $names);
        $this->assertNotContains('building-forum', $names);
        $this->assertTrue(in_array('123', $names, true), 'numeric names must be strings');
        foreach ($names as $name) {
            $this->assertIsString($name);
        }
        // The list is sorted and free of duplicates.
        $sorted = $names;
        sort($sorted, SORT_STRING);
        $this->assertSame($sorted, $names);
        $this->assertSame(array_values(array_unique($names)), $names);

        // With an external asset-pack URL configured, uploaded-only names are
        // dropped (the scene loads from the pack, falling back only to bundled
        // models, so an uploaded-only prop could never load); bundled props
        // remain.
        set_config('assetbaseurl', 'https://cdn.example.org/pack/', 'format_mnemo');
        $names = asset_gallery::placer_prop_names();
        $this->assertContains('lamp', $names);
        $this->assertNotContains('spaceship', $names);
        $this->assertNotContains('123', $names);
    }
}
