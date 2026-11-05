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

namespace format_mnemo\local;

/**
 * Tests for the file types the format's public file areas may serve.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(public_files::class)]
final class public_files_test extends \advanced_testcase {
    /**
     * File names and whether each is served, per area.
     *
     * @return array Cases of [filearea, filename, expected].
     */
    public static function allowed_provider(): array {
        return [
            'bundle gltf' => ['modelcache', 'scene.gltf', true],
            'bundle buffer' => ['modelcache', 'scene.bin', true],
            'bundle texture' => ['modelcache', 'textures/Base.PNG', true],
            'bundle ktx2' => ['modelcache', 'albedo.ktx2', true],
            'bundle html' => ['modelcache', 'index.html', false],
            'bundle htm' => ['modelcache', 'page.htm', false],
            'bundle script' => ['modelcache', 'evil.js', false],
            'bundle xhtml' => ['modelcache', 'x.xhtml', false],
            'bundle font' => ['modelcache', 'sign.woff2', false],
            'bundle zip' => ['modelcache', 'nested.zip', false],
            'bundle no extension' => ['modelcache', 'README', false],
            'pack glb' => ['assetpack', 'lamp.glb', true],
            'pack zip' => ['assetpack', 'av.zip', true],
            'font' => ['signfont', 'neon.woff2', true],
            'texture' => ['roadtexture', 'road.webp', true],
            'texture svg' => ['signtexture', 'frame.svg', true],
            'site html' => ['assetpack', 'index.html', false],
            'site php' => ['roadtexture', 'shell.php', false],
        ];
    }

    /**
     * Only the file types the scene loads are served from the public areas.
     *
     * @param string $filearea The file area.
     * @param string $filename The file name.
     * @param bool $expected Whether it should be served.
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('allowed_provider')]
    public function test_allowed(string $filearea, string $filename, bool $expected): void {
        $this->assertSame($expected, public_files::allowed($filearea, $filename));
    }
}
