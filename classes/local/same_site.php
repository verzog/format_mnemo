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
 * Same-site checks for script URLs.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

use moodle_url;

/**
 * The scene imports its JavaScript modules only from this Moodle site, so a
 * script never runs on a course page from a host the site does not control,
 * and the loader scripts cannot be used to pull in a script from elsewhere.
 */
class same_site {
    /**
     * Whether a URL is on this Moodle site: the same scheme, host and port as
     * $CFG->wwwroot, or a path beginning with a single "/".
     *
     * @param string $url The URL.
     * @return bool True when the URL is on this site.
     */
    public static function is_same_site(string $url): bool {
        global $CFG;
        $url = trim($url);
        if ($url === '') {
            return false;
        }
        if ($url[0] === '/' && !str_starts_with($url, '//') && !str_starts_with($url, '/\\')) {
            return true;
        }
        $origin = function (string $u): ?string {
            $parts = parse_url($u);
            if (empty($parts['scheme']) || empty($parts['host'])) {
                return null;
            }
            $scheme = strtolower($parts['scheme']);
            $port = $parts['port'] ?? ($scheme === 'https' ? 443 : ($scheme === 'http' ? 80 : null));
            return $scheme . '://' . strtolower($parts['host']) . ':' . $port;
        };
        $mine = $origin($url);
        return $mine !== null && $mine === $origin($CFG->wwwroot);
    }

    /**
     * The Three.js module URL to load: the admin's override when it is set and
     * on this site, otherwise the copy bundled with the plugin.
     *
     * @return array The URL, and whether it is a custom override: [string, bool].
     */
    public static function three_url(): array {
        $custom = trim((string)get_config('format_mnemo', 'threeurl'));
        if ($custom !== '' && self::is_same_site($custom)) {
            return [$custom, true];
        }
        return [(new moodle_url('/course/format/mnemo/thirdparty/three.module.min.js'))->out(false), false];
    }
}
