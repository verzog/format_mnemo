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

namespace format_mnemo\output;

/**
 * Tests for recognising YouTube and Vimeo hosts for embed posters.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
#[\PHPUnit\Framework\Attributes\CoversClass(scene::class)]
final class scene_video_host_test extends \advanced_testcase {
    /**
     * Hosts and whether each is an embed host.
     *
     * @return array Cases of [host, expected].
     */
    public static function host_provider(): array {
        return [
            'youtube' => ['youtube.com', true],
            'www youtube' => ['www.youtube.com', true],
            'mobile youtube' => ['m.youtube.com', true],
            'upper case' => ['WWW.YouTube.com', true],
            'trailing dot' => ['youtube.com.', true],
            'short link' => ['youtu.be', true],
            'no cookie' => ['www.youtube-nocookie.com', true],
            'vimeo' => ['vimeo.com', true],
            'player vimeo' => ['player.vimeo.com', true],
            'lookalike prefix' => ['notyoutube.com', false],
            'lookalike suffix' => ['youtube.com.example', false],
            'lookalike sub' => ['youtube.com.evil.example', false],
            'other' => ['example.org', false],
            'empty' => ['', false],
        ];
    }

    /**
     * Only the video site's own domain and its subdomains count.
     *
     * @param string $host The host.
     * @param bool $expected Whether it is an embed host.
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('host_provider')]
    public function test_is_embed_host(string $host, bool $expected): void {
        $this->assertSame($expected, scene::is_embed_host($host));
    }
}
