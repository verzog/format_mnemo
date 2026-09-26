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
    // Global settings that apply to every environment.
    $settings->add(new admin_setting_heading(
        'format_mnemo/globalheading',
        get_string('setting_globalheading', 'format_mnemo'),
        get_string('setting_globalheading_desc', 'format_mnemo')
    ));

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

    // Base URL of an external glTF (.glb) prop asset pack. Left blank, the
    // plugin loads the original props it bundles (models/). Point this at a
    // directory of .glb files (av, lamp, kiosk, barrier, ...) to swap in your
    // own CC0/licensed models; Draco/meshopt geometry and KTX2 textures are
    // supported via the bundled addon loaders. Props appear in every world.
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
    // Signs appear in every world.
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

    // Offer flat-screen (non-VR) learners an opt-in webcam gesture control for
    // steering and moving. On by default; the camera is only used when the
    // learner turns it on, is processed on the device and never uploaded. Untick
    // to remove the control site-wide (e.g. to satisfy a camera policy).
    $settings->add(new admin_setting_configcheckbox(
        'format_mnemo/cameranav',
        get_string('setting_cameranav', 'format_mnemo'),
        get_string('setting_cameranav_desc', 'format_mnemo'),
        1
    ));

    // Sun and moon. In every environment one celestial body follows the site
    // clock — the sun by day, the moon by night. Each can be given its own
    // asset: a flat image that skins the glowing disc, or a 3D .glb model placed
    // in the sky. A model wins over an image, and either wins over the built-in
    // procedural disc. The URL, if set, takes precedence over the upload.
    $settings->add(new admin_setting_heading(
        'format_mnemo/celestialheading',
        get_string('setting_celestialheading', 'format_mnemo'),
        get_string('setting_celestialheading_desc', 'format_mnemo')
    ));
    $settings->add(new admin_setting_configtext(
        'format_mnemo/sunasseturl',
        get_string('setting_sunasseturl', 'format_mnemo'),
        get_string('setting_sunasseturl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/sunasset',
        get_string('setting_sunasset', 'format_mnemo'),
        get_string('setting_sunasset_desc', 'format_mnemo'),
        'sunasset',
        0,
        ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image', '.glb']]
    ));
    $settings->add(new admin_setting_configtext(
        'format_mnemo/moonasseturl',
        get_string('setting_moonasseturl', 'format_mnemo'),
        get_string('setting_moonasseturl_desc', 'format_mnemo'),
        '',
        PARAM_URL
    ));
    $settings->add(new admin_setting_configstoredfile(
        'format_mnemo/moonasset',
        get_string('setting_moonasset', 'format_mnemo'),
        get_string('setting_moonasset_desc', 'format_mnemo'),
        'moonasset',
        0,
        ['subdirs' => 0, 'maxfiles' => 1, 'accepted_types' => ['web_image', '.glb']]
    ));

    // Per-environment look and feel. Each world carries its own self-contained
    // palette, street lighting, mouse-look direction and arcade toggle under a
    // heading of its own; the Void additionally carries its own space/planet/
    // ring assets below its look. A course simply picks which world is active
    // (the "Default environment" above seeds new courses; a teacher switches it
    // in the course settings), and the scene reads that world's settings here.
    $paletteoptions = [
        'cyan' => get_string('palette_cyan', 'format_mnemo'),
        'amber' => get_string('palette_amber', 'format_mnemo'),
        'magenta' => get_string('palette_magenta', 'format_mnemo'),
        'green' => get_string('palette_green', 'format_mnemo'),
    ];
    $lightingoptions = [
        'off' => get_string('lighting_off', 'format_mnemo'),
        'sparse' => get_string('lighting_sparse', 'format_mnemo'),
        'normal' => get_string('lighting_normal', 'format_mnemo'),
        'dense' => get_string('lighting_dense', 'format_mnemo'),
    ];
    // Seed each environment's default from the former site-wide single defaults,
    // so a site that had customised them keeps its look after the split (the
    // upgrade step persists these too; this covers the display before it runs).
    $seedpalette = get_config('format_mnemo', 'defaultpalette') ?: 'cyan';
    $seedlighting = get_config('format_mnemo', 'defaultlighting') ?: 'normal';
    $seedinvert = get_config('format_mnemo', 'defaultinvertlook') ? 1 : 0;
    // Emit one world's look controls (palette, lighting, invert, arcade).
    $addlook = function (string $env) use (
        $settings,
        $paletteoptions,
        $lightingoptions,
        $seedpalette,
        $seedlighting,
        $seedinvert
    ) {
        $settings->add(new admin_setting_configselect(
            'format_mnemo/' . $env . '_palette',
            get_string('palette', 'format_mnemo'),
            get_string('palette_help', 'format_mnemo'),
            $seedpalette,
            $paletteoptions
        ));
        $settings->add(new admin_setting_configselect(
            'format_mnemo/' . $env . '_lighting',
            get_string('lighting', 'format_mnemo'),
            get_string('lighting_help', 'format_mnemo'),
            $seedlighting,
            $lightingoptions
        ));
        $settings->add(new admin_setting_configcheckbox(
            'format_mnemo/' . $env . '_invertlook',
            get_string('invertlook', 'format_mnemo'),
            get_string('invertlook_help', 'format_mnemo'),
            $seedinvert
        ));
        $settings->add(new admin_setting_configcheckbox(
            'format_mnemo/' . $env . '_game',
            get_string('game', 'format_mnemo'),
            get_string('game_help', 'format_mnemo'),
            0
        ));
    };

    // Cyberspace and Grid: look only. Their shared street assets live in the
    // "Streets" group below (both worlds have avenues and buildings).
    $settings->add(new admin_setting_heading(
        'format_mnemo/envheading_cyberspace',
        get_string('environment_cyberspace', 'format_mnemo'),
        get_string('setting_envheading_desc', 'format_mnemo')
    ));
    $addlook('cyberspace');

    $settings->add(new admin_setting_heading(
        'format_mnemo/envheading_grid',
        get_string('environment_grid', 'format_mnemo'),
        get_string('setting_envheading_desc', 'format_mnemo')
    ));
    $addlook('grid');

    // Void: look plus its own space backdrop, planet maps and ring settings.
    $settings->add(new admin_setting_heading(
        'format_mnemo/envheading_void',
        get_string('environment_void', 'format_mnemo'),
        get_string('setting_envheading_desc', 'format_mnemo')
    ));
    $addlook('void');

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

    // Which of the Void's planets wear a ring. The planets are numbered in the
    // order their surface maps are uploaded (Planet 1 is the first, and so on);
    // with no maps uploaded the Void shows three procedural planets. Only the
    // planets selected here are ringed, so rings appear exactly where intended.
    // Defaults to the three planets that were ringed by default before.
    // Each option is labelled with the uploaded surface-map's name (e.g.
    // "Planet 1 — jupiter") so the admin can tell which planet they are ringing;
    // a slot with no uploaded map yet falls back to a plain "Planet N".
    $planetnames = [];
    $planetfiles = get_file_storage()->get_area_files(
        \context_system::instance()->id,
        'format_mnemo',
        'planettextures',
        0,
        'filename',
        false
    );
    foreach ($planetfiles as $planetfile) {
        $planetnames[] = pathinfo($planetfile->get_filename(), PATHINFO_FILENAME);
    }
    $ringchoices = [];
    for ($i = 1; $i <= 9; $i++) {
        if (isset($planetnames[$i - 1]) && $planetnames[$i - 1] !== '') {
            $ringchoices[$i] = get_string(
                'setting_ringplanet_named',
                'format_mnemo',
                ['num' => $i, 'name' => $planetnames[$i - 1]]
            );
        } else {
            $ringchoices[$i] = get_string('setting_ringplanet', 'format_mnemo', $i);
        }
    }
    $settings->add(new admin_setting_configmultiselect(
        'format_mnemo/ringplanets',
        get_string('setting_ringplanets', 'format_mnemo'),
        get_string('setting_ringplanets_desc', 'format_mnemo'),
        [1, 5, 9],
        $ringchoices
    ));

    // Ring image for the Void's ringed planets: a radial strip read from the
    // inner edge (left) to the outer edge (right) and wrapped once around the
    // ring, so it reads as concentric bands. Which planets are ringed is set by
    // the "Ringed planets" setting above. Left blank, rings use a flat band.
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

    // Streets and traffic: the road, ground and sidewalk textures, their tiling
    // and the flying-car types. Shared by every world that has streets —
    // Cyberspace, Grid and the Void, whose streets float in space.
    $settings->add(new admin_setting_heading(
        'format_mnemo/streetsheading',
        get_string('setting_streetsheading', 'format_mnemo'),
        get_string('setting_streetsheading_desc', 'format_mnemo')
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

    // Flying-car traffic types. One car type per line, in the form
    // "model | path | speed | height | land [| count]",
    // where model is a placeable prop name (bundled or uploaded, e.g. "av"),
    // path is avenue|cross|diagonal, speed and height are world units, land is
    // none|ground|rooftop, and the optional count is how many of that car to
    // spawn. Blank lines and lines starting with "#" are ignored; unknown
    // models or bad values are skipped. Left blank, a single avenue vehicle
    // flies as before. See setting_cartypes_desc for the worked example.
    $settings->add(new admin_setting_configtextarea(
        'format_mnemo/cartypes',
        get_string('setting_cartypes', 'format_mnemo'),
        get_string('setting_cartypes_desc', 'format_mnemo'),
        '',
        PARAM_RAW
    ));
}

// Nest the plugin's pages under a single "Mnemo" category in the course-format
// list, rather than leaving the asset viewer as a separate sibling entry. The
// category holds the settings page core built for us (populated above) and the
// asset viewer. This block runs whether or not $ADMIN->fulltree is set, so the
// tree resolves for navigation and search as well as on the settings page.
$mnemocategory = new admin_category('format_mnemo', new lang_string('pluginname', 'format_mnemo'));
$ADMIN->add('formatsettings', $mnemocategory);

// Re-parent the auto-created settings page under the category. Its section name
// ('formatsettingmnemo') is unchanged, so the "Settings" links elsewhere in the
// admin UI still resolve to it.
$ADMIN->add('format_mnemo', $settings);

// The asset viewer: a gallery of the uploaded/bundled textures and prop models,
// gated by site config like the settings page itself.
$ADMIN->add('format_mnemo', new admin_externalpage(
    'format_mnemo_preview',
    get_string('preview_title', 'format_mnemo'),
    new moodle_url('/course/format/mnemo/preview.php'),
    'moodle/site:config'
));

// We have added the settings page to our own category, so tell core not to add
// it again under the default course-format parent.
$settings = null;
