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
 * Tests for the per-model configuration store.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Tests that model_config validates, stores and reads per-model settings.
 *
 * @covers \format_mnemo\local\model_config
 */
final class model_config_test extends \advanced_testcase {
    /**
     * Set then get round-trips a valid config, and a defaults-only config is
     * not stored.
     */
    public function test_set_and_get(): void {
        $this->resetAfterTest();
        model_config::set('hovercar', ['envs' => ['cyberspace', 'grid'], 'yaw' => 180, 'scale' => 1.5]);
        $cfg = model_config::get('hovercar');
        $this->assertEquals(['cyberspace', 'grid'], $cfg['envs']);
        $this->assertEqualsWithDelta(180.0, $cfg['yaw'], 0.001);
        $this->assertEqualsWithDelta(1.5, $cfg['scale'], 0.001);

        // A model with no stored config reads as defaults.
        $none = model_config::get('unknownmodel');
        $this->assertSame([], $none['envs']);
        $this->assertNull($none['yaw']);
        $this->assertNull($none['scale']);

        // Storing all-defaults removes the entry (keeps the blob compact).
        model_config::set('hovercar', ['envs' => [], 'yaw' => null, 'scale' => null]);
        $this->assertArrayNotHasKey('hovercar', model_config::all());
    }

    /**
     * Invalid values are dropped/clamped rather than stored verbatim.
     */
    public function test_validation(): void {
        $this->resetAfterTest();
        model_config::set('x', [
            'envs' => ['cyberspace', 'bogus', 'cyberspace'], // Unknown + duplicate dropped.
            'yaw' => 1e309, // Non-finite -> null.
            'scale' => 999, // Clamped to 10.
        ]);
        $cfg = model_config::get('x');
        $this->assertEquals(['cyberspace'], $cfg['envs']);
        $this->assertNull($cfg['yaw']);
        $this->assertEqualsWithDelta(10.0, $cfg['scale'], 0.001);
    }

    /**
     * Yaw wraps into [0, 360).
     */
    public function test_yaw_wraps(): void {
        $this->resetAfterTest();
        model_config::set('x', ['yaw' => -90]);
        $this->assertEqualsWithDelta(270.0, model_config::get('x')['yaw'], 0.001);
    }

    /**
     * A model with no tags is in every environment; a tagged model only in its
     * own.
     */
    public function test_in_environment(): void {
        $untagged = model_config::get('none');
        $this->assertTrue(model_config::in_environment($untagged, 'void'));
        $tagged = ['envs' => ['grid'], 'yaw' => null, 'scale' => null, 'behaviour' => []];
        $this->assertTrue(model_config::in_environment($tagged, 'grid'));
        $this->assertFalse(model_config::in_environment($tagged, 'void'));
    }

    /**
     * A corrupt stored blob reads as empty rather than throwing.
     */
    public function test_corrupt_blob(): void {
        $this->resetAfterTest();
        set_config('modelconfig', 'not json', 'format_mnemo');
        $this->assertSame([], model_config::all());
    }

    /**
     * A numeric model name (e.g. from 123.glb) round-trips, even though JSON
     * decodes its key as an integer.
     */
    public function test_numeric_name(): void {
        $this->resetAfterTest();
        model_config::set('123', ['envs' => ['grid']]);
        $this->assertArrayHasKey('123', model_config::all());
        $this->assertEquals(['grid'], model_config::get('123')['envs']);
    }

    /**
     * Behaviour flags: a known flag changed from its default is stored, an
     * unknown key or a value left at the default is dropped, and a non-encodable
     * value can never wipe another model's settings.
     */
    public function test_behaviour_flags(): void {
        $this->resetAfterTest();
        model_config::set('a', ['envs' => ['grid']]);
        model_config::set('b', ['behaviour' => [
            // Known flag, differs from default -> stored.
            'grounded' => true,
            // Known flag, equals its default -> dropped.
            'avoid' => true,
            // Unknown key -> dropped.
            'bogus' => 'x',
            // A non-finite value casts to bool and differs from the default -> stored true.
            'takeoffland' => INF,
        ]]);
        // The earlier model survived the write.
        $this->assertEquals(['grid'], model_config::get('a')['envs']);
        $b = model_config::get('b');
        $this->assertTrue($b['behaviour']['grounded']);
        $this->assertTrue($b['behaviour']['takeoffland']);
        $this->assertArrayNotHasKey('avoid', $b['behaviour']);
        $this->assertArrayNotHasKey('bogus', $b['behaviour']);
    }

    /**
     * A config whose only setting is an all-default behaviour map is not stored.
     */
    public function test_default_behaviour_not_stored(): void {
        $this->resetAfterTest();
        model_config::set('c', ['behaviour' => ['grounded' => false, 'avoid' => true, 'face' => true]]);
        $this->assertArrayNotHasKey('c', model_config::all());
    }

    /**
     * for_client() exposes the behaviour map so the scene can read the flags.
     */
    public function test_for_client_includes_behaviour(): void {
        $this->resetAfterTest();
        model_config::set('d', ['behaviour' => ['grounded' => true]]);
        $client = model_config::for_client();
        $this->assertArrayHasKey('d', $client);
        $this->assertTrue($client['d']['behaviour']['grounded']);
    }
}
