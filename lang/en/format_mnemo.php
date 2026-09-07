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
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

$string['activitybuilding'] = 'Cyberspace building model';
$string['activitybuilding_help'] = 'Show this activity as a specific 3D building in the Mnemo cyberspace view. Enter the file name of a <code>.glb</code> model in the site\'s prop asset pack (for example <code>library.glb</code>), or a full URL to a <code>.glb</code> model. Leave this blank to use the building for the activity\'s type (if any), or the procedural building otherwise. It has no effect in the list view or in courses that use another format.';
$string['activitybuilding_invalid'] = 'Enter a <code>.glb</code> file name (letters, numbers, dots, dashes) or a full http(s):// URL to a <code>.glb</code> model.';
$string['addsection'] = 'Add node';
$string['addsections'] = 'Add node';
$string['currentsection'] = 'This node';
$string['deletesection'] = 'Delete node';
$string['editbrightness'] = 'Brightness';
$string['editclose'] = 'Close';
$string['editdelete'] = 'Delete';
$string['editdepth'] = 'Depth';
$string['editdone'] = 'Done editing';
$string['editediting'] = 'Editing';
$string['editgroundsurface'] = 'Ground surface';
$string['editheight'] = 'Height';
$string['editlayout'] = 'Edit layout';
$string['editmove'] = 'Move';
$string['editreset'] = 'Reset';
$string['editroadsurface'] = 'Road surface';
$string['editrotate'] = 'Rotate';
$string['editsave'] = 'Save';
$string['editsaved'] = 'Saved';
$string['editsaveerror'] = 'Could not save';
$string['editsaving'] = 'Saving…';
$string['editscale'] = 'Scale';
$string['editsection'] = 'Edit node';
$string['editsectionname'] = 'Edit node name';
$string['editsidewalksurface'] = 'Sidewalk surface';
$string['editsnap'] = 'Snap to grid';
$string['edittexsize'] = 'Texture size';
$string['editwidth'] = 'Width';
$string['emptynode'] = 'This node has no activities yet.';
$string['entervr'] = 'Enter VR';
$string['environment'] = 'Environment';
$string['environment_cyberspace'] = 'Cyberspace (neon city)';
$string['environment_grid'] = 'Grid (data-plane)';
$string['environment_help'] = 'The look of the world the learner flies through. Cyberspace is the full neon megalopolis, with corporate towers, elevated highways and holographic ads rising behind the streets; Grid is a brighter, flat data-plane with just the lit ground and the streets and their buildings; Void is deep space, where the streets float among a starfield, drifting nebulae and distant planets.';
$string['environment_void'] = 'Void (deep space)';
$string['exitfullscreen'] = 'Exit fullscreen';
$string['exitvr'] = 'Exit VR';
$string['fullscreen'] = 'Fullscreen';
$string['hidefromothers'] = 'Hide node';
$string['invertlook'] = 'Invert mouse look';
$string['invertlook_help'] = 'Reverses the drag-to-look direction in the 3D view. Turn this on if dragging the mouse feels backwards. It has no effect in a VR headset.';
$string['listview'] = 'List view';
$string['loadingscene'] = 'Initialising cyberspace…';
$string['markedthissection'] = 'This node is highlighted as the current one';
$string['markthissection'] = 'Highlight this node as the current one';
$string['newsectionname'] = 'New name for node {$a}';
$string['nodeactivities'] = '{$a} activities';
$string['palette'] = 'Neon palette';
$string['palette_amber'] = 'Amber';
$string['palette_cyan'] = 'Cyan';
$string['palette_green'] = 'Green';
$string['palette_help'] = 'The dominant glow colour of the data structures.';
$string['palette_magenta'] = 'Magenta';
$string['place'] = 'Place objects';
$string['placebarrier'] = 'Barrier';
$string['placedone'] = 'Done placing';
$string['placehint'] = 'Pick an object, then click a grid square to place it.';
$string['placekiosk'] = 'Kiosk';
$string['placelamp'] = 'Street lamp';
$string['placevehicle'] = 'Vehicle';
$string['plugin_description'] = 'Explore the course as a Johnny Mnemonic style cyberpunk city. Each topic is a neon sign on a street the learner flies down; its activities are signs along the branch, opened on screen or in a WebXR headset.';
$string['pluginname'] = 'Mnemo (VR cyberspace)';
$string['privacy:metadata:core_files'] = 'Topic images uploaded for the course format are stored using the Moodle files subsystem.';
$string['scenearialabel'] = 'Interactive 3D cyberpunk city view of the course. An equivalent list of all topics and activities follows.';
$string['scenecontrols'] = 'Controls: drag to look, W/S to fly down the street, click a sign to open it. In VR, point and pinch (or squeeze the trigger) to fly and select.';
$string['scenefailed'] = 'The 3D scene could not be loaded. Showing the list view instead.';
$string['sceneview'] = '3D view';
$string['section0name'] = 'General';
$string['sectionname'] = 'Section';
$string['sectionname_help'] = 'The title shown for this section on its cyberspace sign and in the section editor.';
$string['sectiontitlenumbered'] = '{$a->title} ({$a->number})';
$string['setting_assetbaseurl'] = 'Prop asset pack URL';
$string['setting_assetbaseurl_desc'] = 'Base URL of a directory of glTF (<code>.glb</code>) prop models named <code>av.glb</code>, <code>lamp.glb</code>, <code>kiosk.glb</code> and <code>barrier.glb</code>. Leave this blank to upload a pack below or to use the original props bundled with the plugin. Set it to point at your own CC0/licensed asset pack hosted elsewhere; the models may use Draco or meshopt geometry compression and KTX2 textures. If set, this URL takes precedence over any uploaded pack.';
$string['setting_assetpack'] = 'Upload prop asset pack';
$string['setting_assetpack_desc'] = 'Upload your own glTF (<code>.glb</code>) prop models directly into Moodle, as an alternative to hosting them at a URL above. Name each file exactly for the prop it replaces: <ul><li><code>av.glb</code> — flying car (glides above the streets as traffic)</li><li><code>lamp.glb</code> — street lamp (lines the avenue kerbs)</li><li><code>kiosk.glb</code> — street kiosk (sits at the mouth of each side street)</li><li><code>barrier.glb</code> — road barrier (lines the avenue kerbs)</li></ul>Any prop you do not upload keeps its bundled model. You may also include per-activity-type building models named <code>building-&lt;modname&gt;.glb</code> (for example <code>building-quiz.glb</code>, <code>building-forum.glb</code>); matching activities then render that building instead of the procedural one. Models may use Draco or meshopt geometry compression and KTX2 or embedded textures. Uploaded files are used only when the URL above is blank.';
$string['setting_defaultenvironment'] = 'Default environment';
$string['setting_defaultenvironment_desc'] = 'The environment applied to newly created courses. Teachers can override this per course.';
$string['setting_defaultinvertlook'] = 'Invert mouse look by default';
$string['setting_defaultinvertlook_desc'] = 'Whether newly created courses reverse the drag-to-look direction in the 3D view. Teachers can override this per course.';
$string['setting_defaultpalette'] = 'Default neon palette';
$string['setting_defaultpalette_desc'] = 'The neon palette applied to newly created courses. Teachers can override this per course.';
$string['setting_groundpatchsize'] = 'Ground patch size';
$string['setting_groundpatchsize_desc'] = 'The size (in world units) of the textured ground patch laid around each building, using the ground texture. Set to <code>0</code> to disable the patches even when a ground texture is configured.';
$string['setting_groundtexture'] = 'Upload ground texture';
$string['setting_groundtexture_desc'] = 'Upload a tileable image to lay as a plaza patch around each building in the 3D view, as an alternative to hosting it at a URL above. Leave both blank to keep the dark neon floor. Uploaded files are used only when the URL above is blank.';
$string['setting_groundtexturescale'] = 'Ground texture scale';
$string['setting_groundtexturescale_desc'] = 'How many world units each tile of the ground texture covers. Larger values spread the texture over more ground (fewer tiles); smaller values repeat it more densely.';
$string['setting_groundtextureurl'] = 'Ground texture URL';
$string['setting_groundtextureurl_desc'] = 'URL of a tileable image laid as a plaza patch around each building in the 3D view. Leave this blank to upload a texture below or to keep the dark neon floor. If set, this URL takes precedence over any uploaded texture. A hosted image must allow cross-origin use (its server needs a permissive CORS policy), and your site\'s content security policy must allow the image source.';
$string['setting_roadtexture'] = 'Upload road texture';
$string['setting_roadtexture_desc'] = 'Upload a tileable image to tile across every road surface in the 3D view, as an alternative to hosting it at a URL above. Leave both blank to keep the bundled flat wet-asphalt look. Uploaded files are used only when the URL above is blank.';
$string['setting_roadtexturescale'] = 'Road texture scale';
$string['setting_roadtexturescale_desc'] = 'How many world units each tile of the road texture covers. Larger values spread the texture over more road (fewer tiles); smaller values repeat it more densely.';
$string['setting_roadtextureurl'] = 'Road texture URL';
$string['setting_roadtextureurl_desc'] = 'URL of a tileable image tiled across every road surface in the 3D view. Leave this blank to upload a texture below or to keep the bundled flat wet-asphalt look. If set, this URL takes precedence over any uploaded texture. A hosted image must allow cross-origin use (its server needs a permissive CORS policy), and your site\'s content security policy must allow the image source.';
$string['setting_sidewalktexture'] = 'Upload sidewalk texture';
$string['setting_sidewalktexture_desc'] = 'Upload a tileable image to lay over the raised sidewalks flanking the avenue in the 3D view, as an alternative to hosting it at a URL above. Leave both blank to keep the plain concrete sidewalks. Uploaded files are used only when the URL above is blank.';
$string['setting_sidewalktexturescale'] = 'Sidewalk texture scale';
$string['setting_sidewalktexturescale_desc'] = 'How many world units each tile of the sidewalk texture covers. Larger values spread the texture over more sidewalk (fewer tiles); smaller values repeat it more densely.';
$string['setting_sidewalktextureurl'] = 'Sidewalk texture URL';
$string['setting_sidewalktextureurl_desc'] = 'URL of a tileable image laid over the raised sidewalks flanking the avenue in the 3D view. Leave this blank to upload a texture below or to keep the plain concrete sidewalks. If set, this URL takes precedence over any uploaded texture. A hosted image must allow cross-origin use (its server needs a permissive CORS policy), and your site\'s content security policy must allow the image source.';
$string['setting_signfont'] = 'Upload neon sign font';
$string['setting_signfont_desc'] = 'Upload a webfont (<code>.woff2</code>, <code>.woff</code>, <code>.ttf</code> or <code>.otf</code>) to letter every neon sign and label in the 3D view, as an alternative to hosting it at a URL above. Leave both blank to use the bundled monospace font. Uploaded files are used only when the URL above is blank.';
$string['setting_signfonturl'] = 'Neon sign font URL';
$string['setting_signfonturl_desc'] = 'URL of a webfont file (<code>.woff2</code>, <code>.woff</code>, <code>.ttf</code> or <code>.otf</code>) used to draw every neon sign and label in the 3D view. Leave this blank to upload a font below or to use the bundled monospace font. If set, this URL takes precedence over any uploaded font. A hosted font must allow cross-origin use (its server needs a permissive CORS policy), and your site\'s content security policy must allow the font source.';
$string['setting_signtexture'] = 'Upload sign frame texture';
$string['setting_signtexture_desc'] = 'Upload an image to tint every neon sign frame in the 3D view (for example brushed metal or worn plastic), as an alternative to hosting it at a URL above. Leave both blank for a flat neon frame. The activity state colour multiplies over the texture so signs still read as complete/available/restricted. Uploaded files are used only when the URL above is blank.';
$string['setting_signtextureurl'] = 'Sign frame texture URL';
$string['setting_signtextureurl_desc'] = 'URL of an image used to tint every neon sign frame in the 3D view. Leave this blank to upload a texture below or for a flat neon frame. If set, this URL takes precedence over any uploaded texture. A hosted image must allow cross-origin use (its server needs a permissive CORS policy), and your site\'s content security policy must allow the image source.';
$string['setting_threeurl'] = 'Three.js module URL';
$string['setting_threeurl_desc'] = 'URL of the Three.js ES module used to render the 3D scene. Leave this blank to use the copy bundled with the plugin. Set it only to load Three.js from a shared or newer hosted copy; it must be an ES module build of <code>three.module.min.js</code>.';
$string['showfromothers'] = 'Show node';
$string['stateavailable'] = 'Available';
$string['statecomplete'] = 'Completed';
$string['staterestricted'] = 'Restricted';
$string['togglelistview'] = 'Toggle list / 3D view';
$string['topicimage'] = 'Topic image';
$string['topicimage_help'] = 'An optional image shown on the sign for this topic in the 3D city view. Use a small web image (PNG, JPG or GIF). It has no effect in the list view.';
$string['vrnotsupported'] = 'VR headset not detected';
