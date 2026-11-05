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
 * Validation and clamping for stored scene values.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * The one set of rules for the values the format stores about a course's scene
 * (activity building models and transforms, scene-object transforms and keys,
 * placed props). Used by the web services, the activity settings form and the
 * backup restore, so a value that arrives by any route - including a backup
 * file, which is untrusted input - is held to the same limits.
 */
class scene_values {
    /** @var string Allowed shape of a scene-object slot key (type:index), e.g. lamp:3 or placed:12. */
    const KEY_PATTERN = '/^[a-z]+:[0-9]+$/';

    /** @var string Allowed shape of a model file name (a .glb, .fbx or .zip bundle). */
    const MODEL_FILE_PATTERN = '/^[A-Za-z0-9._-]+\.(glb|fbx|zip)$/i';

    /** @var int Length of the stored model column. */
    const MODEL_MAXLEN = 1333;

    /** @var int Length of the stored placed-prop type column. */
    const TYPE_MAXLEN = 32;

    /** @var int Length of the stored scene-object key column. */
    const KEY_MAXLEN = 64;

    /** @var float Placement grid cell size for placed props (world units). */
    const GRID = 2.0;

    /** @var float Half-extent clamp on placed-prop coordinates (world units). */
    const BOUND = 400.0;

    /**
     * Clamp a number into a range, treating a non-finite value as the default.
     *
     * @param mixed $value The raw value.
     * @param float $min The lowest allowed value.
     * @param float $max The highest allowed value.
     * @param float $default The value used when the input is not a finite number.
     * @return float The clamped value.
     */
    public static function clamp($value, float $min, float $max, float $default): float {
        $value = is_numeric($value) ? (float)$value : $default;
        if (!is_finite($value)) {
            $value = $default;
        }
        return min($max, max($min, $value));
    }

    /**
     * Normalise a rotation in degrees into [0, 360).
     *
     * @param mixed $value The raw rotation.
     * @return float The normalised rotation.
     */
    public static function rotation($value): float {
        $value = is_numeric($value) ? (float)$value : 0.0;
        if (!is_finite($value)) {
            return 0.0;
        }
        $value = fmod($value, 360.0);
        return $value < 0 ? $value + 360.0 : $value;
    }

    /**
     * The clamped transform fields shared by activity buildings and scene
     * objects: scale 0.1-10 per axis, offsets within +/-200, rotation 0-360.
     *
     * @param array $raw The raw values, keyed by field name (missing fields take their defaults).
     * @return array The clean fields: scale, scalex, scaley, scalez, offsetx, offsety, offsetz, rotation.
     */
    public static function transform(array $raw): array {
        return [
            'scale' => self::clamp($raw['scale'] ?? 1.0, 0.1, 10.0, 1.0),
            'scalex' => self::clamp($raw['scalex'] ?? 1.0, 0.1, 10.0, 1.0),
            'scaley' => self::clamp($raw['scaley'] ?? 1.0, 0.1, 10.0, 1.0),
            'scalez' => self::clamp($raw['scalez'] ?? 1.0, 0.1, 10.0, 1.0),
            'offsetx' => self::clamp($raw['offsetx'] ?? 0.0, -200.0, 200.0, 0.0),
            'offsety' => self::clamp($raw['offsety'] ?? 0.0, -200.0, 200.0, 0.0),
            'offsetz' => self::clamp($raw['offsetz'] ?? 0.0, -200.0, 200.0, 0.0),
            'rotation' => self::rotation($raw['rotation'] ?? 0.0),
        ];
    }

    /**
     * A scene object's brightness multiplier, clamped to 0-5.
     *
     * @param mixed $value The raw brightness.
     * @return float The clamped brightness.
     */
    public static function brightness($value): float {
        return self::clamp($value, 0.0, 5.0, 1.0);
    }

    /**
     * Snap a placed prop's coordinate to the grid and clamp it to the world.
     *
     * @param mixed $value The raw coordinate.
     * @return float The snapped coordinate.
     */
    public static function placed_coordinate($value): float {
        $value = self::clamp($value, -self::BOUND, self::BOUND, 0.0);
        $value = round($value / self::GRID) * self::GRID;
        return min(self::BOUND, max(-self::BOUND, $value));
    }

    /**
     * Whether a scene-object slot key has the allowed shape.
     *
     * @param mixed $key The raw key.
     * @return bool True when valid.
     */
    public static function valid_key($key): bool {
        return is_string($key) && strlen($key) <= self::KEY_MAXLEN && preg_match(self::KEY_PATTERN, $key) === 1;
    }

    /**
     * Whether a building model value is a model file name or an http(s) URL
     * that fits the stored column. (Blank, meaning "no model", is checked by
     * the caller.)
     *
     * @param mixed $model The raw, trimmed model value.
     * @return bool True when valid.
     */
    public static function valid_model($model): bool {
        if (!is_string($model) || $model === '' || \core_text::strlen($model) > self::MODEL_MAXLEN) {
            return false;
        }
        if (preg_match(self::MODEL_FILE_PATTERN, $model)) {
            return true;
        }
        return preg_match('#^https?://#i', $model) === 1 && clean_param($model, PARAM_URL) === $model;
    }

    /**
     * Whether a placed prop's type is a safe model base name: not empty, fits
     * the stored column, and has no path separators, parent references or
     * control characters. Uploaded model names may hold spaces, dots or
     * Unicode, so the name is not limited to a narrower character set, and a
     * name whose model is not (yet) on this site is still accepted - the scene
     * simply cannot load it until it is uploaded.
     *
     * @param mixed $type The raw type.
     * @return bool True when valid.
     */
    public static function valid_prop_type($type): bool {
        if (!is_string($type) || trim($type) === '' || \core_text::strlen($type) > self::TYPE_MAXLEN) {
            return false;
        }
        if (strpos($type, '/') !== false || strpos($type, '\\') !== false || strpos($type, '..') !== false) {
            return false;
        }
        return preg_match('/[\x00-\x1F\x7F]/', $type) === 0;
    }
}
