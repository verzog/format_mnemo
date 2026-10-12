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
 * Model slots: which uploaded model each building type, street prop and the
 * default flying car uses.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Model slots: which uploaded model each building type, street prop and the
 * default flying car uses.
 *
 * A slot is a model name the city asks for: "building-<activity type>" for an
 * activity type's building, lamp, kiosk and barrier for the street props, and
 * av for the default flying car. By default a slot loads the model of its own
 * name (uploaded, else bundled). In the asset viewer an admin can point a slot
 * at any model uploaded to its section, without renaming the file, or set a
 * building type to the procedural building. The 3D view then loads, sizes and
 * configures the chosen model in the slot's place.
 */
class model_slots {
    /** @var string The slot value for "use the default naming rule" (not stored). */
    const DEFAULT = 'default';

    /** @var string The slot value for "use the procedural building" (buildings only). */
    const NONE = 'none';

    /** @var string[] Street prop slot => its language string. */
    const PROPS = ['lamp' => 'slot_lamp', 'kiosk' => 'slot_kiosk', 'barrier' => 'slot_barrier'];

    /** @var string[] Vehicle slot => its language string. */
    const VEHICLES = ['av' => 'slot_av'];

    /**
     * The slots in one category, in display order.
     *
     * @param string $category prop, vehicle or building.
     * @return string[] Slot name => its label.
     */
    public static function slots(string $category): array {
        $out = [];
        if ($category === 'prop' || $category === 'vehicle') {
            foreach ($category === 'prop' ? self::PROPS : self::VEHICLES as $slot => $string) {
                $out[$slot] = get_string($string, 'format_mnemo');
            }
            return $out;
        }
        if ($category !== 'building') {
            return [];
        }
        foreach (self::activity_types() as $modname => $label) {
            $out['building-' . $modname] = $label;
        }
        return $out;
    }

    /**
     * The activity types enabled on the site that become buildings (labels
     * aside), sorted by name.
     *
     * @return string[] Module name => its name in the site's language.
     */
    public static function activity_types(): array {
        global $DB;
        $out = [];
        foreach ($DB->get_fieldset_select('modules', 'name', 'visible = 1') as $modname) {
            if ($modname === 'label') {
                continue;
            }
            $out[$modname] = get_string_manager()->string_exists('pluginname', 'mod_' . $modname)
                ? get_string('pluginname', 'mod_' . $modname)
                : $modname;
        }
        \core_collator::asort($out);
        return $out;
    }

    /**
     * The upload area a category's models come from.
     *
     * @param string $category prop, vehicle or building.
     * @return string|null The file area, or null for an unknown category.
     */
    public static function area(string $category): ?string {
        return ['prop' => 'assetpack', 'vehicle' => 'vehicleassets', 'building' => 'buildingassets'][$category] ?? null;
    }

    /**
     * The category a slot belongs to.
     *
     * @param string $slot The slot name.
     * @return string|null prop, vehicle or building, or null when it is not a slot.
     */
    public static function category(string $slot): ?string {
        if (isset(self::PROPS[$slot])) {
            return 'prop';
        }
        if (isset(self::VEHICLES[$slot])) {
            return 'vehicle';
        }
        if (strpos($slot, 'building-') === 0 && isset(self::activity_types()[substr($slot, 9)])) {
            return 'building';
        }
        return null;
    }

    /**
     * The models uploaded to a category's area that a slot may use (lite
     * copies aside), sorted.
     *
     * @param string $category prop, vehicle or building.
     * @return string[] Model base names.
     */
    public static function choices(string $category): array {
        $area = self::area($category);
        if ($area === null) {
            return [];
        }
        $files = get_file_storage()->get_area_files(
            \context_system::instance()->id,
            'format_mnemo',
            $area,
            0,
            'filename',
            false
        );
        $out = [];
        foreach ($files as $file) {
            if (preg_match('/^(.+)\.(glb|fbx|zip)$/i', $file->get_filename(), $m) && !model_variants::is_lite($m[1])) {
                $out[$m[1]] = true;
            }
        }
        $out = array_map('strval', array_keys($out));
        sort($out, SORT_STRING);
        return $out;
    }

    /**
     * The stored slot choices (only slots set away from the default).
     *
     * @return string[] Slot => model name, or NONE for the procedural building.
     */
    public static function stored(): array {
        $decoded = json_decode((string)get_config('format_mnemo', 'modelslots'), true);
        if (!is_array($decoded)) {
            return [];
        }
        $out = [];
        foreach ($decoded as $slot => $value) {
            if (is_string($value)) {
                $out[(string)$slot] = $value;
            }
        }
        return $out;
    }

    /**
     * The current value of one slot: DEFAULT, NONE or a model name.
     *
     * @param string $slot The slot name.
     * @return string The value.
     */
    public static function get(string $slot): string {
        return self::stored()[$slot] ?? self::DEFAULT;
    }

    /**
     * Save slot choices. Each value must be DEFAULT, NONE (buildings only) or
     * a model uploaded to the slot's section; anything else, or an unknown
     * slot, is ignored. Slots not given keep their value.
     *
     * @param string[] $values Slot => value.
     */
    public static function save(array $values): void {
        $stored = self::stored();
        foreach ($values as $slot => $value) {
            $slot = (string)$slot;
            $category = self::category($slot);
            if ($category === null || !is_string($value)) {
                continue;
            }
            if ($value === self::DEFAULT) {
                unset($stored[$slot]);
            } else if ($value === self::NONE ? $category === 'building' : in_array($value, self::choices($category), true)) {
                $stored[$slot] = $value;
            }
        }
        ksort($stored, SORT_STRING);
        set_config('modelslots', $stored ? json_encode($stored) : '', 'format_mnemo');
    }

    /**
     * The slots pointed at another model that is still uploaded, for the 3D
     * view to load in their place. A choice whose model has since been deleted
     * is left out, so the slot falls back to its default.
     *
     * @return string[] Slot => model name.
     */
    public static function aliases(): array {
        $out = [];
        $choices = [];
        foreach (self::stored() as $slot => $value) {
            $category = self::category($slot);
            if ($category === null || $value === self::NONE) {
                continue;
            }
            $choices[$category] = $choices[$category] ?? self::choices($category);
            if (in_array($value, $choices[$category], true)) {
                $out[$slot] = $value;
            }
        }
        return $out;
    }

    /**
     * The activity types set to use the procedural building.
     *
     * @return string[] Module names.
     */
    public static function procedural_types(): array {
        $out = [];
        foreach (self::stored() as $slot => $value) {
            if ($value === self::NONE && self::category($slot) === 'building') {
                $out[] = substr($slot, 9);
            }
        }
        return $out;
    }
}
