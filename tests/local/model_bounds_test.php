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
 * Tests for model bounding boxes and storey sizing.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Tests reading a model's box through its node transforms, turning it by an
 * orientation, and the storeys it implies.
 *
 * @covers \format_mnemo\local\model_bounds
 */
final class model_bounds_test extends \advanced_testcase {
    /**
     * A glTF document with one mesh whose POSITION box is 2 x 4 x 6, centred
     * on the origin, used by the given nodes and scenes.
     *
     * @param array $nodes The nodes.
     * @param array|null $scenes The scenes, or null for none.
     * @return array The glTF document.
     */
    protected static function doc(array $nodes, ?array $scenes = [['nodes' => [0]]]): array {
        $doc = [
            'accessors' => [['count' => 8, 'min' => [-1, -2, -3], 'max' => [1, 2, 3]]],
            'meshes' => [['primitives' => [['attributes' => ['POSITION' => 0]]]]],
            'nodes' => $nodes,
        ];
        if ($scenes !== null) {
            $doc['scenes'] = $scenes;
        }
        return $doc;
    }

    /**
     * Assert two boxes match to within rounding.
     *
     * @param array $expected The expected box.
     * @param array|null $actual The actual box.
     */
    protected function assert_box(array $expected, ?array $actual): void {
        $this->assertNotNull($actual);
        foreach ($expected as $i => $value) {
            $this->assertEqualsWithDelta($value, $actual[$i], 1e-9, "box[$i]");
        }
    }

    /**
     * The box follows translation, scale, rotation, matrices and parents, and
     * only the shown scene counts.
     */
    public function test_bounds(): void {
        $this->assert_box([-1, -2, -3, 1, 2, 3], model_bounds::bounds(self::doc([['mesh' => 0]])));
        // Moved up 2 and doubled.
        $this->assert_box([-2, -2, -6, 2, 6, 6], model_bounds::bounds(self::doc([
            ['mesh' => 0, 'translation' => [0, 2, 0], 'scale' => [2, 2, 2]],
        ])));
        // Turned 90 degrees about X (a Z-up model stood up): y and z swap.
        $q = [sin(M_PI / 4), 0, 0, cos(M_PI / 4)];
        $this->assert_box([-1, -3, -2, 1, 3, 2], model_bounds::bounds(self::doc([['mesh' => 0, 'rotation' => $q]])));
        // A matrix, through a parent that moves it 10 along X.
        $this->assert_box([9, -2, -3, 11, 2, 3], model_bounds::bounds(self::doc([
            ['children' => [1], 'matrix' => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]],
            ['mesh' => 0],
        ])));
        // Two copies, one moved; only the shown scene's.
        $this->assert_box([-1, -2, -3, 1, 2, 3], model_bounds::bounds(self::doc(
            [['mesh' => 0], ['mesh' => 0, 'translation' => [50, 0, 0]]],
            [['nodes' => [0]], ['nodes' => [1]]]
        )));
        // No scenes: the root nodes; no meshes: no box; a loop is safe.
        $this->assert_box([-1, -2, -3, 1, 2, 3], model_bounds::bounds(self::doc([['mesh' => 0]], null)));
        $this->assertNull(model_bounds::bounds(['nodes' => [['name' => 'empty']]]));
        $this->assert_box([-1, -2, -3, 1, 2, 3], model_bounds::bounds(self::doc(
            [['mesh' => 0, 'children' => [1]], ['mesh' => 0, 'children' => [0]]]
        )));
    }

    /**
     * A malformed file (lists or strings where indexes or numbers belong) is
     * read as far as it is valid, never raising an error.
     */
    public function test_bounds_malformed(): void {
        $doc = self::doc([
            ['mesh' => 0, 'children' => [[1], 'x', -1, 1], 'translation' => ['a', 0, 0]],
            ['mesh' => [0]],
        ], [['nodes' => [[0], 0]]]);
        $doc['scene'] = [0];
        $doc['meshes'][] = ['primitives' => [['attributes' => ['POSITION' => [0]]], 'junk']];
        $this->assert_box([-1, -2, -3, 1, 2, 3], model_bounds::bounds($doc));
        $doc['accessors'][0]['min'] = ['a', 0, 0];
        $this->assertNull(model_bounds::bounds($doc));
        $this->assertNull(model_bounds::bounds(['nodes' => 'x', 'scenes' => [['nodes' => 'y']], 'meshes' => 5]));
    }

    /**
     * Turning a box by pitch, yaw and roll swaps its extents as the 3D view
     * would turn the model.
     */
    public function test_orient(): void {
        $box = [-1, -2, -3, 1, 2, 3];
        $this->assert_box($box, model_bounds::orient($box, 0, 0, 0));
        $this->assert_box([-1, -3, -2, 1, 3, 2], model_bounds::orient($box, 90, 0, 0));
        $this->assert_box([-3, -2, -1, 3, 2, 1], model_bounds::orient($box, 0, 90, 0));
        $this->assert_box([-2, -1, -3, 2, 1, 3], model_bounds::orient($box, 0, 0, 270));
    }

    /**
     * Storeys: a typed count wins; otherwise height over 3 m, when that gives
     * 1 to 30 storeys.
     */
    public function test_storeys(): void {
        $this->assertSame(10, model_bounds::storeys(30.0, null));
        $this->assertSame(1, model_bounds::storeys(2.0, null));
        $this->assertNull(model_bounds::storeys(1.0, null));
        $this->assertSame(30, model_bounds::storeys(90.0, null));
        $this->assertNull(model_bounds::storeys(300.0, null));
        $this->assertSame(4, model_bounds::storeys(300.0, 4));
    }
}
