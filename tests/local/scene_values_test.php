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
 * Tests for the shared scene value rules.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(scene_values::class)]
final class scene_values_test extends \advanced_testcase {
    /**
     * Transforms are clamped, defaulted and normalised.
     */
    public function test_transform(): void {
        $this->assertSame([
            'scale' => 10.0, 'scalex' => 0.1, 'scaley' => 1.0, 'scalez' => 1.0,
            'offsetx' => 200.0, 'offsety' => -200.0, 'offsetz' => 0.0, 'rotation' => 270.0,
        ], scene_values::transform([
            'scale' => 99, 'scalex' => '-5', 'scaley' => 'abc', 'offsetx' => 1e9,
            'offsety' => -1e9, 'offsetz' => NAN, 'rotation' => -90,
        ]));
        $this->assertSame(5.0, scene_values::brightness(50));
        $this->assertSame(1.0, scene_values::brightness(INF));
        $this->assertSame(400.0, scene_values::placed_coordinate(1e6));
        $this->assertSame(4.0, scene_values::placed_coordinate(3.1));
    }

    /**
     * Values and whether each is valid, per rule.
     *
     * @return array Cases of [method, value, expected].
     */
    public static function validity_provider(): array {
        return [
            'key' => ['valid_key', 'lamp:3', true],
            'placed key' => ['valid_key', 'placed:12', true],
            'key upper' => ['valid_key', 'Lamp:3', false],
            'key junk' => ['valid_key', 'lamp:3;drop', false],
            'key not string' => ['valid_key', ['lamp:3'], false],
            'model file' => ['valid_model', 'library.glb', true],
            'model zip' => ['valid_model', 'building-page.zip', true],
            'model url' => ['valid_model', 'https://cdn.example/x.glb', true],
            'model path' => ['valid_model', '../../x.glb', false],
            'model js' => ['valid_model', 'javascript:alert(1)', false],
            'model too long' => ['valid_model', 'https://cdn.example/' . str_repeat('a', 1400) . '.glb', false],
            'model empty' => ['valid_model', '', false],
            'prop' => ['valid_prop_type', 'lamp', true],
            'prop unicode' => ['valid_prop_type', 'Café sign v2', true],
            'prop double dot' => ['valid_prop_type', 'tree..v2', true],
            'prop dot dot' => ['valid_prop_type', '..', false],
            'prop slash' => ['valid_prop_type', '../lamp', false],
            'prop backslash' => ['valid_prop_type', 'a\\b', false],
            'prop control' => ['valid_prop_type', "lamp\n", false],
            'prop too long' => ['valid_prop_type', str_repeat('a', 33), false],
            'prop blank' => ['valid_prop_type', '  ', false],
        ];
    }

    /**
     * Keys, models and prop types are validated.
     *
     * @param string $method The scene_values method.
     * @param mixed $value The value.
     * @param bool $expected Whether it is valid.
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('validity_provider')]
    public function test_validity(string $method, $value, bool $expected): void {
        $this->assertSame($expected, scene_values::$method($value));
    }
}
