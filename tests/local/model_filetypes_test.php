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
 * Tests for registering the 3D model file types.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Tests for registering the 3D model file types.
 *
 * @covers \format_mnemo\local\model_filetypes
 */
final class model_filetypes_test extends \advanced_testcase {
    /**
     * Missing .glb and .fbx types are registered with their MIME types.
     *
     * @return void
     */
    public function test_register_adds_missing_types(): void {
        $this->resetAfterTest();
        foreach (array_keys(model_filetypes::TYPES) as $extension) {
            if (array_key_exists($extension, get_mimetypes_array())) {
                \core_filetypes::delete_type($extension);
            }
        }

        $this->assertEqualsCanonicalizing(['fbx', 'glb'], model_filetypes::register());

        $mimetypes = get_mimetypes_array();
        $this->assertSame('model/gltf-binary', $mimetypes['glb']['type']);
        $this->assertSame('application/octet-stream', $mimetypes['fbx']['type']);
    }

    /**
     * Types the site already knows are left alone, so a re-run adds nothing.
     *
     * @return void
     */
    public function test_register_skips_known_types(): void {
        $this->resetAfterTest();
        model_filetypes::register();

        $this->assertSame([], model_filetypes::register());
    }
}
