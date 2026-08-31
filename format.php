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
 * Rendering entry point for the Mnemo course format.
 *
 * While editing is turned on the standard Moodle section editor is shown so
 * that teachers can build the course as usual. For learners (editing off) the
 * immersive WebXR cyberspace scene is rendered instead.
 *
 * @package    format_mnemo
 * @copyright  2026 format_mnemo contributors
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

// Horrible backwards compatible parameter aliasing.
if ($topic = optional_param('topic', 0, PARAM_INT)) {
    $url = $PAGE->url;
    $url->param('section', $topic);
    debugging('Outdated topic param passed to course/view.php', DEBUG_DEVELOPER);
    redirect($url);
}

$context = context_course::instance($course->id);

$format = core_courseformat\base::instance($course);
$course = $format->get_course();

$renderer = $format->get_renderer($PAGE);

if ($PAGE->user_is_editing()) {
    // Teachers get the standard, fully-featured 2D section editor. Building a
    // course inside a headset is impractical, so editing always happens here.
    if (!empty($displaysection)) {
        $format->set_section_number($displaysection);
    }
    $outputclass = $format->get_output_classname('content');
    $widget = new $outputclass($format);
    echo $renderer->render($widget);
} else {
    // Learners fly through the course as cyberspace.
    echo $renderer->render_cyberspace($format);
}
