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
 * Strings for component 'format_mnemo'.
 *
 * @package    format_mnemo
 * @copyright  2026 format_mnemo contributors
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['pluginname'] = 'Mnemo (VR cyberspace)';
$string['plugin_description'] = 'Explore the course as a Johnny Mnemonic style cyberspace. Sections and activities float as neon data structures that learners fly through and reach out to open, on screen or in a WebXR headset.';
$string['privacy:metadata'] = 'The Mnemo course format plugin does not store any personal data.';

// Section naming.
$string['sectionname'] = 'Node';
$string['section0name'] = 'Jack-in point';
$string['newsectionname'] = 'New name for node {$a}';
$string['currentsection'] = 'This node';
$string['editsection'] = 'Edit node';
$string['editsectionname'] = 'Edit node name';
$string['deletesection'] = 'Delete node';
$string['sectionname_help'] = 'The name shown for this node in the cyberspace scene and section editor.';
$string['hidefromothers'] = 'Hide node';
$string['showfromothers'] = 'Show node';
$string['markthissection'] = 'Highlight this node as the current one';
$string['markedthissection'] = 'This node is highlighted as the current one';
$string['addsections'] = 'Add node';
$string['addsection'] = 'Add node';

// Course format options.
$string['environment'] = 'Environment';
$string['environment_help'] = 'The look of the world the learner flies through. Cyberspace is the classic neon grid void; Grid is a brighter flat data-plane; Void is a minimal dark space that keeps the focus on the nodes.';
$string['environment_cyberspace'] = 'Cyberspace (neon void)';
$string['environment_grid'] = 'Grid (data-plane)';
$string['environment_void'] = 'Void (minimal)';
$string['palette'] = 'Neon palette';
$string['palette_help'] = 'The dominant glow colour of the data structures.';
$string['palette_cyan'] = 'Cyan';
$string['palette_amber'] = 'Amber';
$string['palette_magenta'] = 'Magenta';
$string['palette_green'] = 'Green';
$string['layout'] = 'Node layout';
$string['layout_help'] = 'How section nodes are arranged in space. Ring surrounds the learner; Grid lays them out as a city block; Spiral climbs upward.';
$string['layout_ring'] = 'Ring around the learner';
$string['layout_grid'] = 'Grid / city block';
$string['layout_spiral'] = 'Ascending spiral';

// Scene UI.
$string['entervr'] = 'Enter VR';
$string['exitvr'] = 'Exit VR';
$string['vrnotsupported'] = 'VR headset not detected';
$string['listview'] = 'List view';
$string['sceneview'] = '3D view';
$string['togglelistview'] = 'Toggle list / 3D view';
$string['loadingscene'] = 'Initialising cyberspace…';
$string['scenefailed'] = 'The 3D scene could not be loaded. Showing the list view instead.';
$string['scenecontrols'] = 'Controls: drag to look, W/S to fly, click a node to open it. In VR, point and pinch (or squeeze the trigger) to fly and select.';
$string['nodeactivities'] = '{$a} activities';
$string['emptynode'] = 'This node has no activities yet.';
$string['statecomplete'] = 'Completed';
$string['stateavailable'] = 'Available';
$string['staterestricted'] = 'Restricted';
$string['scenearialabel'] = 'Interactive 3D cyberspace view of the course. An equivalent list of all sections and activities follows.';

// Admin settings.
$string['setting_threeurl'] = 'Three.js module URL';
$string['setting_threeurl_desc'] = 'URL of the Three.js ES module used to render the 3D scene. The default loads Three.js from a public CDN. For offline or air-gapped installations, or to satisfy a strict Content Security Policy, host a copy of <code>three.module.min.js</code> yourself and put its URL here.';
$string['setting_defaultenvironment'] = 'Default environment';
$string['setting_defaultenvironment_desc'] = 'The environment applied to newly created courses. Teachers can override this per course.';
$string['setting_defaultpalette'] = 'Default neon palette';
$string['setting_defaultpalette_desc'] = 'The neon palette applied to newly created courses. Teachers can override this per course.';
