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
 * Tests for model slots.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Tests the slots, their choices, saving, and the aliases the 3D view gets.
 *
 * @covers \format_mnemo\local\model_slots
 */
final class model_slots_test extends \advanced_testcase {
    /**
     * Store a file in a system-context plugin file area.
     *
     * @param string $filearea The file area.
     * @param string $filename The file name.
     * @return \stored_file The file.
     */
    protected function store(string $filearea, string $filename): \stored_file {
        return get_file_storage()->create_file_from_string([
            'contextid' => \context_system::instance()->id,
            'component' => 'format_mnemo',
            'filearea' => $filearea,
            'itemid' => 0,
            'filepath' => '/',
            'filename' => $filename,
        ], 'x');
    }

    /**
     * Props, the default car and one slot per enabled activity type (no
     * labels), each in its category.
     */
    public function test_slots(): void {
        $this->resetAfterTest();
        $this->assertSame(['lamp', 'kiosk', 'barrier'], array_keys(model_slots::slots('prop')));
        $this->assertSame(['av'], array_keys(model_slots::slots('vehicle')));
        $buildings = model_slots::slots('building');
        $this->assertArrayHasKey('building-forum', $buildings);
        $this->assertSame(get_string('pluginname', 'mod_forum'), $buildings['building-forum']);
        $this->assertArrayNotHasKey('building-label', $buildings);
        $this->assertSame([], model_slots::slots('celestial'));

        $this->assertSame('prop', model_slots::category('lamp'));
        $this->assertSame('vehicle', model_slots::category('av'));
        $this->assertSame('building', model_slots::category('building-quiz'));
        $this->assertNull(model_slots::category('building-nosuchmod'));
        $this->assertNull(model_slots::category('statue'));
    }

    /**
     * A slot may only be set to a model uploaded to its own section (not a lite
     * copy); "none" is for buildings only; "default" clears the choice.
     */
    public function test_save(): void {
        $this->resetAfterTest();
        $this->store('assetpack', 'neon-lamp.glb');
        $this->store('assetpack', 'neon-lamp-lite.glb');
        $this->store('vehicleassets', 'hovercar.fbx');
        $this->store('buildingassets', 'tower-a.zip');
        $this->assertSame(['neon-lamp'], model_slots::choices('prop'));

        $m = model_slots::MODEL;
        model_slots::save([
            'lamp' => $m . 'neon-lamp',
            'kiosk' => $m . 'hovercar',
            'barrier' => model_slots::NONE,
            'av' => $m . 'hovercar',
            'building-forum' => $m . 'tower-a',
            'building-page' => model_slots::NONE,
            'building-quiz' => $m . 'neon-lamp',
            'building-book' => 'tower-a',
            'statue' => $m . 'neon-lamp',
        ]);
        $this->assertSame([
            'av' => 'hovercar',
            'building-forum' => 'tower-a',
            'building-page' => '',
            'lamp' => 'neon-lamp',
        ], model_slots::stored());
        $this->assertSame(model_slots::DEFAULT, model_slots::get('kiosk'));
        $this->assertSame(model_slots::NONE, model_slots::get('building-page'));
        $this->assertSame($m . 'tower-a', model_slots::get('building-forum'));
        // The procedural building type is not an alias.
        $this->assertEquals(['av' => 'hovercar', 'building-forum' => 'tower-a', 'lamp' => 'neon-lamp'], model_slots::aliases());
        $this->assertSame(['page'], model_slots::procedural_types());

        $this->assertEquals(['lamp' => 'neon-lamp'], model_slots::aliases(['prop']));

        // Models named like the form's choices can still be picked.
        $this->store('buildingassets', 'none.glb');
        $this->store('buildingassets', 'default.glb');
        model_slots::save(['building-book' => $m . 'none', 'building-url' => $m . 'default']);
        $this->assertSame('none', model_slots::stored()['building-book']);
        $this->assertSame('default', model_slots::stored()['building-url']);
        $this->assertSame(['page'], model_slots::procedural_types());

        // With an external asset pack, uploaded props cannot be used.
        set_config('assetbaseurl', 'https://pack.example.com/', 'format_mnemo');
        $this->assertSame([], model_slots::choices('prop'));
        $this->assertArrayNotHasKey('lamp', model_slots::aliases());
        set_config('assetbaseurl', '', 'format_mnemo');

        // Default clears a slot; a deleted model drops out of the aliases.
        model_slots::save(['lamp' => model_slots::DEFAULT]);
        $this->assertArrayNotHasKey('lamp', model_slots::stored());
        model_store::delete('buildingassets', 'tower-a');
        $this->assertArrayNotHasKey('building-forum', model_slots::aliases());
    }
}
