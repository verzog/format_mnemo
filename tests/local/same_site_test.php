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
 * Tests for the same-site rule on script URLs.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(same_site::class)]
#[\PHPUnit\Framework\Attributes\CoversClass(\format_mnemo\admin\setting_samesiteurl::class)]
final class same_site_test extends \advanced_testcase {
    /**
     * Only URLs on this site (or root-relative paths) count as same-site.
     */
    public function test_is_same_site(): void {
        global $CFG;
        $this->resetAfterTest();
        $CFG->wwwroot = 'https://lms.example.edu.au/moodle';

        $this->assertTrue(same_site::is_same_site('https://lms.example.edu.au/moodle/local/x/three.js'));
        $this->assertTrue(same_site::is_same_site('HTTPS://LMS.example.edu.au:443/other/three.js'));
        $this->assertTrue(same_site::is_same_site('/moodle/local/x/three.js'));
        $this->assertFalse(same_site::is_same_site('https://cdn.example.com/three.js'));
        $this->assertFalse(same_site::is_same_site('http://lms.example.edu.au/three.js'));
        $this->assertFalse(same_site::is_same_site('https://lms.example.edu.au:8443/three.js'));
        $this->assertFalse(same_site::is_same_site('https://lms.example.edu.au.evil.example/three.js'));
        $this->assertFalse(same_site::is_same_site('//cdn.example.com/three.js'));
        $this->assertFalse(same_site::is_same_site('/\\cdn.example.com/three.js'));
        $this->assertFalse(same_site::is_same_site('three.js'));
        $this->assertFalse(same_site::is_same_site(''));
    }

    /**
     * The Three.js override is used only when it is on this site; an
     * off-site value saved earlier falls back to the bundled copy.
     */
    public function test_three_url(): void {
        global $CFG;
        $this->resetAfterTest();

        [$url, $custom] = same_site::three_url();
        $this->assertFalse($custom);
        $this->assertStringEndsWith('/course/format/mnemo/thirdparty/three.module.min.js', $url);

        $mine = $CFG->wwwroot . '/local/three/three.module.min.js';
        set_config('threeurl', $mine, 'format_mnemo');
        $this->assertSame([$mine, true], same_site::three_url());

        set_config('threeurl', 'https://cdn.example.com/three.module.min.js', 'format_mnemo');
        [$url, $custom] = same_site::three_url();
        $this->assertFalse($custom);
        $this->assertStringEndsWith('/course/format/mnemo/thirdparty/three.module.min.js', $url);
    }

    /**
     * The admin setting refuses a URL on another site and accepts blank or a
     * URL on this site.
     */
    public function test_setting_validation(): void {
        global $CFG;
        $this->resetAfterTest();
        require_once($CFG->libdir . '/adminlib.php');
        $setting = new \format_mnemo\admin\setting_samesiteurl('format_mnemo/threeurl', 'x', 'y', '', PARAM_URL);

        $this->assertTrue($setting->validate(''));
        $this->assertTrue($setting->validate($CFG->wwwroot . '/local/three/three.module.min.js'));
        $this->assertSame(
            get_string('setting_threeurl_notsamesite', 'format_mnemo'),
            $setting->validate('https://cdn.example.com/three.module.min.js')
        );
    }
}
