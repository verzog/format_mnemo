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
 * Site wide settings for the Mnemo (VR cyberspace) course format.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($ADMIN->fulltree) {
    // URL of the Three.js ES module. Left blank, the plugin loads the copy it
    // bundles (thirdparty/three.module.min.js). Override only to point at a
    // shared or newer hosted copy; it must be an ES module build that exports
    // the THREE namespace.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/threeurl',
        get_string('setting_threeurl', 'format_mnemo'),
        get_string('setting_threeurl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));

    // Default cyberspace environment for newly created courses.
    $settings->add(new admin_setting_configselect(
        'format_mnemo/defaultenvironment',
        get_string('setting_defaultenvironment', 'format_mnemo'),
        get_string('setting_defaultenvironment_desc', 'format_mnemo'),
        'cyberspace',
        [
            'cyberspace' => get_string('environment_cyberspace', 'format_mnemo'),
            'grid' => get_string('environment_grid', 'format_mnemo'),
            'void' => get_string('environment_void', 'format_mnemo'),
        ]
    ));

    // Default neon palette for newly created courses.
    $settings->add(new admin_setting_configselect(
        'format_mnemo/defaultpalette',
        get_string('setting_defaultpalette', 'format_mnemo'),
        get_string('setting_defaultpalette_desc', 'format_mnemo'),
        'cyan',
        [
            'cyan' => get_string('palette_cyan', 'format_mnemo'),
            'amber' => get_string('palette_amber', 'format_mnemo'),
            'magenta' => get_string('palette_magenta', 'format_mnemo'),
            'green' => get_string('palette_green', 'format_mnemo'),
        ]
    ));

    // Default street-lighting density for courses that inherit it (each course
    // can override this in its settings).
    $settings->add(new admin_setting_configselect(
        'format_mnemo/defaultlighting',
        get_string('setting_defaultlighting', 'format_mnemo'),
        get_string('setting_defaultlighting_desc', 'format_mnemo'),
        'normal',
        [
            'off' => get_string('lighting_off', 'format_mnemo'),
            'sparse' => get_string('lighting_sparse', 'format_mnemo'),
            'normal' => get_string('lighting_normal', 'format_mnemo'),
            'dense' => get_string('lighting_dense', 'format_mnemo'),
        ]
    ));

    // Base URL of an external glTF (.glb) prop asset pack. Left blank, the
    // plugin loads the original props it bundles (models/). Point this at a
    // directory of .glb files (av, lamp, kiosk, barrier, ...) to swap in your
    // own CC0/licensed models; Draco/meshopt geometry and KTX2 textures are
    // supported via the bundled addon loaders.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/assetbaseurl',
        get_string('setting_assetbaseurl', 'format_mnemo'),
        get_string('setting_assetbaseurl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));

    // Upload a prop asset pack straight into Moodle instead of hosting it at a
    // URL. Files land in the 'assetpack' file area at system context and are
    // served via pluginfile; the loader reads them by the same
    // av/lamp/kiosk/barrier naming convention. Draco/meshopt-compressed .glb
    // models are supported. The URL setting above, if set, takes precedence.
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/assetpack',
        get_string('setting_assetpack', 'format_mnemo'),
        get_string('setting_assetpack_desc', 'format_mnemo'),
        'assetpack',
        0,
        ['subdirs' => 0, 'maxfiles' => 50, 'accepted_types' => ['.glb']]
    ));

    // Neon sign webfont. Left blank, sign and label text is drawn in the
    // bundled "Courier New"/monospace stack. Point this at a hosted webfont file
    // (.woff2/.woff/.ttf/.otf) to give every neon sign a custom typeface. The
    // uploaded font below is used if this is blank; this URL, if set, wins.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/signfonturl',
        get_string('setting_signfonturl', 'format_mnemo'),
        get_string('setting_signfonturl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));

    // Upload a neon sign webfont straight into Moodle instead of hosting it at a
    // URL. The file lands in the 'signfont' file area at system context and is
    // served via pluginfile. The URL setting above, if set, takes precedence.
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/signfont',
        get_string('setting_signfont', 'format_mnemo'),
        get_string('setting_signfont_desc', 'format_mnemo'),
        'signfont',
        0,
        ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['.woff2', '.woff', '.ttf', '.otf']]
    ));

    // Sign frame texture. Left blank, sign frames are drawn as a flat neon glow.
    // Point this at a hosted image to tint every sign's frame with a texture
    // (e.g. brushed metal, worn plastic). The uploaded texture below is used if
    // this is blank; this URL, if set, wins.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/signtextureurl',
        get_string('setting_signtextureurl', 'format_mnemo'),
        get_string('setting_signtextureurl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));

    // Upload a sign frame texture straight into Moodle instead of hosting it at
    // a URL. The file lands in the 'signtexture' file area at system context and
    // is served via pluginfile. The URL setting above, if set, takes precedence.
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/signtexture',
        get_string('setting_signtexture', 'format_mnemo'),
        get_string('setting_signtexture_desc', 'format_mnemo'),
        'signtexture',
        0,
        ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image']]
    ));

    // Road texture. Left blank, streets are the bundled flat wet-asphalt
    // colour. Point this at a hosted tileable image (or upload one below) to
    // tile a surface across every road. The uploaded texture is used if this is
    // blank; this URL, if set, wins.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/roadtextureurl',
        get_string('setting_roadtextureurl', 'format_mnemo'),
        get_string('setting_roadtextureurl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));

    // Upload a tileable road texture straight into Moodle instead of hosting it
    // at a URL. The file lands in the 'roadtexture' file area at system context
    // and is served via pluginfile. The URL setting above, if set, wins.
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/roadtexture',
        get_string('setting_roadtexture', 'format_mnemo'),
        get_string('setting_roadtexture_desc', 'format_mnemo'),
        'roadtexture',
        0,
        ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image']]
    ));

    // Ground texture, tiled as a plaza patch around each building (see the patch
    // size below). Left blank, the ground stays the dark neon floor. Point this
    // at a hosted tileable image, or upload one below; the URL, if set, wins.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/groundtextureurl',
        get_string('setting_groundtextureurl', 'format_mnemo'),
        get_string('setting_groundtextureurl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));

    // Upload a tileable ground texture straight into Moodle instead of hosting
    // it at a URL. The file lands in the 'groundtexture' file area at system
    // context and is served via pluginfile. The URL setting above, if set, wins.
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/groundtexture',
        get_string('setting_groundtexture', 'format_mnemo'),
        get_string('setting_groundtexture_desc', 'format_mnemo'),
        'groundtexture',
        0,
        ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image']]
    ));

    // Sidewalk texture, tiled onto the raised sidewalks flanking the avenue.
    // Left blank, the sidewalks keep their plain concrete top. Point this at a
    // hosted tileable image, or upload one below; the URL, if set, wins.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/sidewalktextureurl',
        get_string('setting_sidewalktextureurl', 'format_mnemo'),
        get_string('setting_sidewalktextureurl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));

    // Upload a tileable sidewalk texture straight into Moodle instead of hosting
    // it at a URL. The file lands in the 'sidewalktexture' file area at system
    // context and is served via pluginfile. The URL setting above, if set, wins.
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/sidewalktexture',
        get_string('setting_sidewalktexture', 'format_mnemo'),
        get_string('setting_sidewalktexture_desc', 'format_mnemo'),
        'sidewalktexture',
        0,
        ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image']]
    ));

    // Void backdrop: an equirectangular (2:1 lat-long) sky/starfield image that
    // replaces the procedural stars in the Void environment. Left blank, the
    // Void keeps its generated starfield and nebulae. URL, or upload below.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/spacetextureurl',
        get_string('setting_spacetextureurl', 'format_mnemo'),
        get_string('setting_spacetextureurl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/spacetexture',
        get_string('setting_spacetexture', 'format_mnemo'),
        get_string('setting_spacetexture_desc', 'format_mnemo'),
        'spacetexture',
        0,
        ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image']]
    ));

    // Planet surface maps for the Void: upload up to nine equirectangular (2:1
    // lat-long) images and each is applied to one of the Void's planets, in
    // filename order. With none uploaded, the Void keeps its procedural planets.
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/planettextures',
        get_string('setting_planettextures', 'format_mnemo'),
        get_string('setting_planettextures_desc', 'format_mnemo'),
        'planettextures',
        0,
        ['subdirs' => 0, 'maxfiles' => 9, 'accepted_types' => ['web_image']]
    ));

    // Ring image for the Void's ringed planets: a radial strip read from the
    // inner edge (left) to the outer edge (right) and wrapped once around the
    // ring, so it reads as concentric bands. A planet is ringed when its planet
    // texture's filename contains "ring". Left blank, rings use a flat band.
    // URL, or upload below.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/ringtextureurl',
        get_string('setting_ringtextureurl', 'format_mnemo'),
        get_string('setting_ringtextureurl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/ringtexture',
        get_string('setting_ringtexture', 'format_mnemo'),
        get_string('setting_ringtexture_desc', 'format_mnemo'),
        'ringtexture',
        0,
        ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image']]
    ));

    // Texture tiling scale (world units per tile) for the road, ground and
    // sidewalk textures. Larger values stretch the texture over more ground
    // (fewer, more spread-out tiles); smaller values repeat it more densely.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/roadtexturescale',
        get_string('setting_roadtexturescale', 'format_mnemo'),
        get_string('setting_roadtexturescale_desc', 'format_mnemo'),
        '8',
        PARAM_INT
    ));
    $settings->add(new admin_setting_configtext(
        'format_mnemo/groundtexturescale',
        get_string('setting_groundtexturescale', 'format_mnemo'),
        get_string('setting_groundtexturescale_desc', 'format_mnemo'),
        '8',
        PARAM_INT
    ));
    $settings->add(new admin_setting_configtext(
        'format_mnemo/sidewalktexturescale',
        get_string('setting_sidewalktexturescale', 'format_mnemo'),
        get_string('setting_sidewalktexturescale_desc', 'format_mnemo'),
        '4',
        PARAM_INT
    ));

    // Size (in world units) of the textured ground patch laid around each
    // building. Zero disables the patches even when a ground texture is set.
    $settings->add(new admin_setting_configtext(
        'format_mnemo/groundpatchsize',
        get_string('setting_groundpatchsize', 'format_mnemo'),
        get_string('setting_groundpatchsize_desc', 'format_mnemo'),
        '14',
        PARAM_INT
    ));

    // Default drag-to-look direction for newly created courses. Teachers can
    // override this per course, so the direction never needs a code change.
    $settings->add(new admin_setting_configcheckbox(
        'format_mnemo/defaultinvertlook',
        get_string('setting_defaultinvertlook', 'format_mnemo'),
        get_string('setting_defaultinvertlook_desc', 'format_mnemo'),
        0
    ));
}

// The asset viewer: a gallery of the uploaded/bundled textures and prop models.
// Registered outside the fulltree guard so its URL always resolves in the admin
// tree, and gated by site config like the settings page itself.
$ADMIN->add('formatsettings', new admin_externalpage(
    'format_mnemo_preview',
    get_string('preview_title', 'format_mnemo'),
    new moodle_url('/course/format/mnemo/preview.php'),
    'moodle/site:config'
));
