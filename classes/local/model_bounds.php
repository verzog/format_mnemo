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
 * Model bounding boxes and storey sizing.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Model bounding boxes, read from glTF JSON, and the storey count they imply.
 *
 * A glTF POSITION accessor must carry its min and max, so a model's size is
 * known from its JSON alone (Draco and meshopt models included): each mesh's
 * box is carried through the node transforms of the scene the loader shows.
 * The model spec asks for real metres, so a building's height over 3 m gives
 * its storeys, which the 3D view uses to size it against the procedural
 * buildings' window rows.
 */
class model_bounds {
    /** @var float The height of one storey in a model built in metres. */
    const STOREY_METRES = 3.0;

    /** @var int The most storeys a height may imply before it is taken as not being in metres. */
    const MAX_AUTO_STOREYS = 30;

    /** @var int The most storeys an admin may type. */
    const MAX_STOREYS = 60;

    /**
     * The axis-aligned box a glTF document's shown scene occupies.
     *
     * @param array $gltf The decoded glTF JSON.
     * @return float[]|null The box as [minx, miny, minz, maxx, maxy, maxz], or null when unknown.
     */
    public static function bounds(array $gltf): ?array {
        $nodes = is_array($gltf['nodes'] ?? null) ? $gltf['nodes'] : [];
        $meshes = is_array($gltf['meshes'] ?? null) ? $gltf['meshes'] : [];
        $accessors = is_array($gltf['accessors'] ?? null) ? $gltf['accessors'] : [];
        $box = null;
        // Walk the shown scene's node tree with each node's world matrix. A
        // visited set guards against a malformed file whose nodes form a loop.
        $stack = [];
        foreach (model_budget::root_nodes($gltf, $nodes) as $root) {
            $stack[] = [$root, self::identity()];
        }
        $visited = [];
        while ($stack) {
            [$index, $parent] = array_pop($stack);
            if (isset($visited[$index]) || !is_array($nodes[$index] ?? null)) {
                continue;
            }
            $visited[$index] = true;
            $node = $nodes[$index];
            $world = self::multiply($parent, self::local_matrix($node));
            foreach (model_budget::indexes($node['children'] ?? null) as $child) {
                $stack[] = [$child, $world];
            }
            $meshindex = model_budget::index($node['mesh'] ?? null);
            $mesh = $meshindex === null ? null : ($meshes[$meshindex] ?? null);
            foreach (model_budget::items(is_array($mesh) ? ($mesh['primitives'] ?? null) : null) as $prim) {
                $accindex = is_array($prim) ? model_budget::index($prim['attributes']['POSITION'] ?? null) : null;
                $acc = $accindex === null ? null : ($accessors[$accindex] ?? null);
                $min = self::vector(is_array($acc) ? ($acc['min'] ?? null) : null, 3);
                $max = self::vector(is_array($acc) ? ($acc['max'] ?? null) : null, 3);
                if ($min === null || $max === null) {
                    continue;
                }
                foreach (self::corners($min, $max) as $corner) {
                    $box = self::grow($box, self::transform($world, $corner));
                }
            }
        }
        return $box;
    }

    /**
     * A box turned by a model's orientation correction (pitch about X, yaw
     * about Y, roll about Z, in degrees, applied as the 3D view does), as the
     * box around the turned corners.
     *
     * @param float[] $box The box [minx, miny, minz, maxx, maxy, maxz].
     * @param float $pitch Pitch in degrees.
     * @param float $yaw Yaw in degrees.
     * @param float $roll Roll in degrees.
     * @return float[] The turned box.
     */
    public static function orient(array $box, float $pitch, float $yaw, float $roll): array {
        $m = self::euler_xyz(deg2rad($pitch), deg2rad($yaw), deg2rad($roll));
        $out = null;
        foreach (self::corners(array_slice($box, 0, 3), array_slice($box, 3, 3)) as $corner) {
            $out = self::grow($out, self::transform($m, $corner));
        }
        return $out;
    }

    /**
     * The storeys a building model has: the typed count when set, else its
     * height in metres over 3 m, when that gives a believable building (1 to
     * 30 storeys); otherwise null, and the model is fitted to its plot.
     *
     * @param float $height The model's height in its own units (after orientation).
     * @param int|null $typed The storeys typed into the model's settings, or null.
     * @return int|null The storey count, or null to fit the model to its plot.
     */
    public static function storeys(float $height, ?int $typed): ?int {
        if ($typed !== null) {
            return $typed;
        }
        $storeys = (int)round($height / self::STOREY_METRES);
        return ($storeys >= 1 && $storeys <= self::MAX_AUTO_STOREYS) ? $storeys : null;
    }

    /**
     * A node's local matrix: its matrix, or translation x rotation x scale.
     *
     * @param array $node The glTF node.
     * @return float[] The column-major 4x4 matrix.
     */
    protected static function local_matrix(array $node): array {
        $matrix = self::vector($node['matrix'] ?? null, 16);
        if ($matrix !== null) {
            return $matrix;
        }
        $t = self::vector($node['translation'] ?? null, 3) ?? [0.0, 0.0, 0.0];
        $q = self::vector($node['rotation'] ?? null, 4) ?? [0.0, 0.0, 0.0, 1.0];
        $s = self::vector($node['scale'] ?? null, 3) ?? [1.0, 1.0, 1.0];
        [$x, $y, $z, $w] = $q;
        return [
            (1 - 2 * ($y * $y + $z * $z)) * $s[0], (2 * ($x * $y + $z * $w)) * $s[0], (2 * ($x * $z - $y * $w)) * $s[0], 0,
            (2 * ($x * $y - $z * $w)) * $s[1], (1 - 2 * ($x * $x + $z * $z)) * $s[1], (2 * ($y * $z + $x * $w)) * $s[1], 0,
            (2 * ($x * $z + $y * $w)) * $s[2], (2 * ($y * $z - $x * $w)) * $s[2], (1 - 2 * ($x * $x + $y * $y)) * $s[2], 0,
            $t[0], $t[1], $t[2], 1,
        ];
    }

    /**
     * A list of exactly the given number of finite numbers, as floats, or null
     * when the value is anything else (so a malformed file is ignored).
     *
     * @param mixed $value The raw value.
     * @param int $size The number of entries wanted.
     * @return float[]|null The numbers, or null.
     */
    protected static function vector($value, int $size): ?array {
        if (!is_array($value) || count($value) !== $size) {
            return null;
        }
        $out = [];
        foreach (array_values($value) as $number) {
            if ((!is_int($number) && !is_float($number)) || !is_finite((float)$number)) {
                return null;
            }
            $out[] = (float)$number;
        }
        return $out;
    }

    /**
     * The rotation matrix for Euler angles in X, Y, Z order (as Three.js
     * applies a rotation set as pitch, yaw, roll).
     *
     * @param float $a The X angle in radians.
     * @param float $b The Y angle in radians.
     * @param float $c The Z angle in radians.
     * @return float[] The column-major 4x4 matrix.
     */
    protected static function euler_xyz(float $a, float $b, float $c): array {
        [$ca, $sa, $cb, $sb, $cc, $sc] = [cos($a), sin($a), cos($b), sin($b), cos($c), sin($c)];
        return [
            $cb * $cc, $ca * $sc + $sa * $sb * $cc, $sa * $sc - $ca * $sb * $cc, 0,
            -$cb * $sc, $ca * $cc - $sa * $sb * $sc, $sa * $cc + $ca * $sb * $sc, 0,
            $sb, -$sa * $cb, $ca * $cb, 0,
            0, 0, 0, 1,
        ];
    }

    /**
     * The identity matrix.
     *
     * @return float[] The column-major 4x4 identity.
     */
    protected static function identity(): array {
        return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    }

    /**
     * The product a x b of two column-major 4x4 matrices.
     *
     * @param float[] $a The left matrix.
     * @param float[] $b The right matrix.
     * @return float[] The product.
     */
    protected static function multiply(array $a, array $b): array {
        $out = [];
        for ($col = 0; $col < 4; $col++) {
            for ($row = 0; $row < 4; $row++) {
                $sum = 0.0;
                for ($k = 0; $k < 4; $k++) {
                    $sum += $a[$k * 4 + $row] * $b[$col * 4 + $k];
                }
                $out[$col * 4 + $row] = $sum;
            }
        }
        return $out;
    }

    /**
     * A point moved by a column-major 4x4 matrix.
     *
     * @param float[] $m The matrix.
     * @param float[] $p The point [x, y, z].
     * @return float[] The moved point.
     */
    protected static function transform(array $m, array $p): array {
        return [
            $m[0] * $p[0] + $m[4] * $p[1] + $m[8] * $p[2] + $m[12],
            $m[1] * $p[0] + $m[5] * $p[1] + $m[9] * $p[2] + $m[13],
            $m[2] * $p[0] + $m[6] * $p[1] + $m[10] * $p[2] + $m[14],
        ];
    }

    /**
     * The eight corners of a box.
     *
     * @param array $min The minimum corner.
     * @param array $max The maximum corner.
     * @return float[][] The corners.
     */
    protected static function corners(array $min, array $max): array {
        $out = [];
        foreach ([$min[0], $max[0]] as $x) {
            foreach ([$min[1], $max[1]] as $y) {
                foreach ([$min[2], $max[2]] as $z) {
                    $out[] = [(float)$x, (float)$y, (float)$z];
                }
            }
        }
        return $out;
    }

    /**
     * A box grown to take in a point.
     *
     * @param float[]|null $box The box so far, or null for none.
     * @param float[] $p The point.
     * @return float[] The grown box.
     */
    protected static function grow(?array $box, array $p): array {
        if ($box === null) {
            return [$p[0], $p[1], $p[2], $p[0], $p[1], $p[2]];
        }
        return [min($box[0], $p[0]), min($box[1], $p[1]), min($box[2], $p[2]),
            max($box[3], $p[0]), max($box[4], $p[1]), max($box[5], $p[2])];
    }
}
