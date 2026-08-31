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

use core_courseformat\output\section_renderer;

/**
 * Renderer for the Mnemo course format.
 *
 * Extends the standard course format section renderer so that the normal 2D
 * section editing interface is available while editing is turned on, and adds a
 * helper for rendering the immersive cyberspace scene for learners.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class renderer extends section_renderer {
    /**
     * Render the immersive cyberspace scene for learners.
     *
     * Queues the WebXR/Three.js AMD module with the scene data and returns the
     * markup for the scene container together with an accessible list-view
     * fallback.
     *
     * Note: this method is deliberately NOT named render_scene(). The base
     * renderer's render() dispatches a renderable to a method named
     * render_<short class name>, so a method called render_scene() would be
     * invoked with a \format_mnemo\output\scene instance, clashing with this
     * course-format entry point. The template is therefore rendered explicitly.
     *
     * @param \core_courseformat\base $format the course format instance
     * @return string HTML
     */
    public function render_cyberspace(\core_courseformat\base $format): string {
        $scene = new scene($format);
        $config = $scene->get_scene_config($this);

        // Hand the full scene graph to the browser module. Rendering happens
        // client-side against WebXR; PHP only ships the data and the fallback.
        $this->page->requires->js_call_amd('format_mnemo/vr', 'init', [$config]);

        return $this->render_from_template('format_mnemo/scene', $scene->export_for_template($this));
    }
}
