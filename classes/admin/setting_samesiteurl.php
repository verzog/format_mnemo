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
 * Admin setting for a URL that must be on this Moodle site.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\admin;

use format_mnemo\local\same_site;

/**
 * A URL text setting that accepts only blank or a URL on this Moodle site.
 */
class setting_samesiteurl extends \admin_setting_configtext {
    /**
     * Validate the value: blank, or a URL on this site.
     *
     * @param string $data The submitted value.
     * @return true|string True when valid, else the error message.
     */
    public function validate($data) {
        $valid = parent::validate($data);
        if ($valid !== true) {
            return $valid;
        }
        $data = trim((string)$data);
        if ($data !== '' && !same_site::is_same_site($data)) {
            return get_string('setting_threeurl_notsamesite', 'format_mnemo');
        }
        return true;
    }
}
