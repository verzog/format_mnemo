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

namespace format_mnemo\privacy;

use core_privacy\local\metadata\collection;
use core_privacy\local\metadata\types\external_location;
use core_privacy\local\metadata\types\subsystem_link;
use core_privacy\local\metadata\types\user_preference;

/**
 * Tests for the Mnemo course format's privacy provider metadata.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(provider::class)]
final class provider_test extends \advanced_testcase {
    /**
     * The metadata declares the files link, both preferences and the external
     * hosts a learner's browser may fetch assets from, with defined strings.
     */
    public function test_get_metadata(): void {
        $collection = provider::get_metadata(new collection('format_mnemo'));
        $found = [];
        foreach ($collection->get_collection() as $item) {
            $found[get_class($item) . ':' . $item->get_name()] = $item;
            $this->assertTrue(get_string_manager()->string_exists($item->get_summary(), 'format_mnemo'));
        }
        $this->assertArrayHasKey(subsystem_link::class . ':core_files', $found);
        $this->assertArrayHasKey(user_preference::class . ':format_mnemo_comfort', $found);
        $this->assertArrayHasKey(user_preference::class . ':format_mnemo_keybinds', $found);
        $key = external_location::class . ':externalassets';
        $this->assertArrayHasKey($key, $found);
        $fields = $found[$key]->get_privacy_fields();
        $this->assertSame(['ipaddress', 'useragent'], array_keys($fields));
        foreach ($fields as $string) {
            $this->assertTrue(get_string_manager()->string_exists($string, 'format_mnemo'));
        }
    }
}
