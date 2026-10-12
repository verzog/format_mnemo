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
 * Tests for the asset viewer's model settings forms.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Tests saving one card's form and saving every changed card at once.
 *
 * @covers \format_mnemo\local\model_form
 */
final class model_form_test extends \advanced_testcase {
    /**
     * One card's form saves only the settings its category shows.
     */
    public function test_save(): void {
        $this->resetAfterTest();

        // A building card: facing, pitch and storeys; it shows no scale, so a
        // posted scale is ignored.
        $this->assertTrue(model_form::save('building-quiz', 'building', [
            'yaw' => '90', 'pitch' => '12.5', 'storeys' => '6', 'scale' => '3', 'beh_animate' => '1',
        ]));
        $cfg = model_config::get('building-quiz');
        $this->assertEquals(90, $cfg['yaw']);
        $this->assertEquals(12.5, $cfg['pitch']);
        $this->assertEquals(6, $cfg['storeys']);
        $this->assertNull($cfg['scale']);
        $this->assertTrue($cfg['behaviour']['animate']);

        // Blank fields clear their setting, and an unticked box is off.
        $this->assertTrue(model_form::save('building-quiz', 'building', ['yaw' => '', 'storeys' => '']));
        $cfg = model_config::get('building-quiz');
        $this->assertNull($cfg['yaw']);
        $this->assertNull($cfg['storeys']);
        $this->assertArrayNotHasKey('animate', $cfg['behaviour']);

        // An unknown model, or a category the model is not shown in, is refused.
        $this->assertFalse(model_form::save('no-such-model', 'prop', ['scale' => '2']));
        $this->assertFalse(model_form::save('lamp', 'building', ['storeys' => '4']));
        $this->assertNull(model_config::get('lamp')['storeys']);
    }

    /**
     * "Save all" saves every listed card, skipping entries it cannot use.
     */
    public function test_save_batch(): void {
        $this->resetAfterTest();

        $saved = model_form::save_batch(json_encode([
            ['model' => 'building-quiz', 'category' => 'building', 'values' => ['yaw' => '180', 'storeys' => '9']],
            ['model' => 'lamp', 'category' => 'prop', 'values' => ['scale' => '1.5', 'roll' => '90']],
            ['model' => 'no-such-model', 'category' => 'prop', 'values' => ['scale' => '2']],
            ['model' => ['not', 'a', 'name'], 'category' => 'prop'],
            'not an entry',
        ]));
        $this->assertSame(['building-quiz', 'lamp'], $saved);
        $this->assertEquals(180, model_config::get('building-quiz')['yaw']);
        $this->assertEquals(9, model_config::get('building-quiz')['storeys']);
        $this->assertEquals(1.5, model_config::get('lamp')['scale']);
        $this->assertEquals(90, model_config::get('lamp')['roll']);

        // Rubbish posts save nothing.
        $this->assertSame([], model_form::save_batch('not json'));
        $this->assertSame([], model_form::save_batch('"a string"'));
    }
}
