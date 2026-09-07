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

use completion_info;
use context_course;
use context_module;
use core_courseformat\base as course_format;
use moodle_url;
use renderable;
use renderer_base;
use stdClass;
use templatable;

/**
 * Builds the data for, and renders, the Mnemo cyberspace scene.
 *
 * The same section/activity graph is used twice: once serialised as JSON for
 * the WebXR client module, and once as an accessible HTML list rendered from
 * the mustache template as a fallback / non-VR alternative.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class scene implements renderable, templatable {
    /** @var course_format The course format instance. */
    protected $format;

    /**
     * Constructor.
     *
     * @param course_format $format the course format instance
     */
    public function __construct(course_format $format) {
        $this->format = $format;
    }

    /**
     * Build the raw scene graph: sections, each with their activities.
     *
     * @return array{sections: array, nodecount: int}
     */
    protected function build_nodes(): array {
        global $DB;
        $course = $this->format->get_course();
        $context = context_course::instance($course->id);
        $modinfo = get_fast_modinfo($course);
        $completion = new completion_info($course);
        $completionenabled = $completion->is_enabled();
        $imagefiles = $this->preload_section_images($context);
        $buildingrows = $this->preload_building_rows((int)$course->id);
        // Whether the viewer can edit activities at all (course level); the
        // in-view editor is offered only then, and each activity is separately
        // checked at its own module context (see below) so a module-level
        // prohibit hides that one object from the editor.
        $canedit = has_capability('moodle/course:manageactivities', $context);
        // URL activity records and Resource video main files for the course, so
        // video detection is a couple of queries rather than one per activity.
        $urlrecords = $DB->get_records('url', ['course' => (int)$course->id]);
        $resourcevideos = $this->preload_resource_videos((int)$course->id);

        $sections = [];
        $coursesections = $modinfo->get_section_info_all();
        foreach ($coursesections as $section) {
            // Respect hidden sections: skip sections the user cannot see at all
            // (and that carry no "available from" teaser to show).
            if (!$section->uservisible && empty($section->availableinfo)) {
                continue;
            }

            $activities = [];
            if (!empty($modinfo->sections[$section->section])) {
                foreach ($modinfo->sections[$section->section] as $cmid) {
                    $cm = $modinfo->cms[$cmid];
                    if (!$cm->uservisible && empty($cm->availableinfo)) {
                        // Completely hidden from this user.
                        continue;
                    }
                    if (!$cm->is_visible_on_course_page()) {
                        continue;
                    }
                    if ($cm->modname === 'label') {
                        // Labels have no view page to fly to; skip in the scene.
                        continue;
                    }

                    $state = 'available';
                    if (!$cm->uservisible) {
                        $state = 'restricted';
                    } else if ($completionenabled && $cm->completion != COMPLETION_TRACKING_NONE) {
                        $data = $completion->get_data($cm, true);
                        if (in_array((int)$data->completionstate, [COMPLETION_COMPLETE, COMPLETION_COMPLETE_PASS], true)) {
                            $state = 'complete';
                        }
                    }

                    $url = $cm->url;
                    $activities[] = [
                        'id' => (int)$cm->id,
                        'name' => format_string($cm->get_formatted_name(), true, ['context' => $context]),
                        'modname' => $cm->modname,
                        'url' => $url ? $url->out(false) : null,
                        'state' => $state,
                        // A teacher-chosen building model for this specific
                        // activity (file name or URL), or null to use the
                        // type-based/procedural building.
                        'building' => $this->row_model($buildingrows[(int)$cm->id] ?? null),
                        // A per-activity in-view transform (scale/position/
                        // rotation) set with the editor, or null when default.
                        'transform' => $this->row_transform($buildingrows[(int)$cm->id] ?? null),
                        // Whether this specific object may be edited, matching
                        // the web service's module-context capability check so a
                        // module-level prohibit removes it from the editor.
                        'editable' => $canedit &&
                            has_capability('moodle/course:manageactivities', context_module::instance((int)$cm->id)),
                        // Video info for activities that are videos, so the
                        // client can render them as an interactive screen; null
                        // otherwise. Only exposed for activities the user can
                        // actually access, so a restricted activity never leaks a
                        // playable source.
                        'video' => $cm->uservisible ? $this->video_info($cm, $urlrecords, $resourcevideos, $course) : null,
                    ];
                }
            }

            // Signs show the teacher's plain title (no editing-view number).
            $name = $this->format->get_section_title_plain($section);
            $sections[] = [
                'number' => (int)$section->section,
                'name' => $name,
                'visible' => (bool)$section->visible,
                'current' => $this->format->is_section_current($section),
                'image' => $this->section_image_url($imagefiles[(int)$section->id] ?? null, $context),
                'activities' => $activities,
                'activitycount' => count($activities),
                'hasactivities' => !empty($activities),
            ];
        }

        return [
            'sections' => $sections,
            'nodecount' => count($sections),
        ];
    }

    /**
     * Load every topic-image file for the course in one query, keyed by the
     * section id, so building the scene does not do one query per section.
     *
     * @param context_course $context the course context
     * @return \stored_file[] map of section id => the first image file
     */
    protected function preload_section_images(context_course $context): array {
        $fs = get_file_storage();
        $files = $fs->get_area_files(
            $context->id,
            'format_mnemo',
            'sectionimage',
            false,
            'itemid, filepath, filename',
            false
        );
        $map = [];
        foreach ($files as $file) {
            $itemid = (int)$file->get_itemid();
            if (!isset($map[$itemid])) {
                $map[$itemid] = $file;
            }
        }
        return $map;
    }

    /**
     * Load every activity's building-model override for the course in one query,
     * keyed by the course module id, so building the scene does not do one query
     * per activity. Joined through course_modules by course id, so it stays a
     * single bounded query however many activities the course has.
     *
     * @param int $courseid the course id
     * @return array map of cmid => row (model plus scale/offset/rotation)
     */
    protected function preload_building_rows(int $courseid): array {
        global $DB;
        $sql = "SELECT b.cmid, b.model, b.scale, b.offsetx, b.offsety, b.offsetz, b.rotation
                  FROM {format_mnemo_building} b
                  JOIN {course_modules} cm ON cm.id = b.cmid
                 WHERE cm.course = :course";
        $rows = $DB->get_records_sql($sql, ['course' => $courseid]);
        $map = [];
        foreach ($rows as $row) {
            $map[(int)$row->cmid] = $row;
        }
        return $map;
    }

    /**
     * The per-course in-view overrides for non-activity scene objects (props,
     * gates, pylons), as a map of slot key => {scale, x, y, z, rot, brightness}.
     * Only non-default rows are stored, so the map is small.
     *
     * @param int $courseid the course id
     * @return array map of objkey => transform array
     */
    protected function scene_objects(int $courseid): array {
        global $DB;
        $rows = $DB->get_records('format_mnemo_sceneobj', ['courseid' => $courseid]);
        $map = [];
        foreach ($rows as $row) {
            $map[$row->objkey] = [
                'scale' => (float)$row->scale,
                'x' => (float)$row->offsetx,
                'y' => (float)$row->offsety,
                'z' => (float)$row->offsetz,
                'rot' => (float)$row->rotation,
                'brightness' => (float)$row->brightness,
            ];
        }
        return $map;
    }

    /**
     * The model file name/URL for a building row, or null when it holds only a
     * transform (empty model).
     *
     * @param stdClass|null $row A preload_building_rows() row, or null.
     * @return string|null
     */
    protected function row_model(?stdClass $row): ?string {
        if ($row === null || trim((string)$row->model) === '') {
            return null;
        }
        return $row->model;
    }

    /**
     * The in-view transform for a building row as a compact array, or null when
     * it is the default (so the scene payload stays small).
     *
     * @param stdClass|null $row A preload_building_rows() row, or null.
     * @return array{scale: float, x: float, y: float, z: float, rot: float}|null
     */
    protected function row_transform(?stdClass $row): ?array {
        if ($row === null) {
            return null;
        }
        $scale = (float)$row->scale;
        $x = (float)$row->offsetx;
        $y = (float)$row->offsety;
        $z = (float)$row->offsetz;
        $rot = (float)$row->rotation;
        if ($scale == 1.0 && $x == 0.0 && $y == 0.0 && $z == 0.0 && $rot == 0.0) {
            return null;
        }
        return ['scale' => $scale, 'x' => $x, 'y' => $y, 'z' => $z, 'rot' => $rot];
    }

    /**
     * Describe an activity as a video screen, or null when it is not a video.
     *
     * A URL activity pointing at YouTube/Vimeo is an embed (poster + open); one
     * pointing at a direct video file, or a File resource whose main file is a
     * video, is a file that can play in-world.
     *
     * @param \cm_info $cm the course module
     * @param array $urlrecords map of url-instance id => url record
     * @param array $resourcevideos map of cmid => video descriptor for resources
     * @param \stdClass $course the course
     * @return array|null ['kind' => 'file'|'embed', 'src' => string] or null
     */
    protected function video_info(\cm_info $cm, array $urlrecords, array $resourcevideos, \stdClass $course): ?array {
        if ($cm->modname === 'url') {
            $record = $urlrecords[$cm->instance] ?? null;
            if (!$record) {
                return null;
            }
            // Resolve the URL module's full URL so any configured URL variables
            // (course/user/custom parameters) are applied, rather than the raw
            // stored value.
            global $CFG;
            require_once($CFG->dirroot . '/mod/url/locallib.php');
            return $this->classify_video_url(url_get_full_url($record, $cm, $course));
        }
        if ($cm->modname === 'resource') {
            return $resourcevideos[(int)$cm->id] ?? null;
        }
        return null;
    }

    /**
     * Classify an external URL as a video: an embed (YouTube/Vimeo) shown as a
     * clickable poster, or a direct video file playable in-world. Audio-capable
     * ambiguous extensions (.ogg) are not treated as video.
     *
     * @param string $url the external URL
     * @return array|null the video descriptor, or null when it is not a video
     */
    protected function classify_video_url(string $url): ?array {
        $host = strtolower((string)parse_url($url, PHP_URL_HOST));
        foreach (['youtube.com', 'youtu.be', 'vimeo.com'] as $embedhost) {
            if ($host !== '' && strpos($host, $embedhost) !== false) {
                return ['kind' => 'embed'];
            }
        }
        $path = strtolower((string)parse_url($url, PHP_URL_PATH));
        if (preg_match('/\.(mp4|webm|ogv|m4v|mov)$/', $path)) {
            return ['kind' => 'file', 'src' => $url];
        }
        return null;
    }

    /**
     * Preload, in bounded queries, the playable video source for every File
     * resource in the course whose main file is a video — keyed by course
     * module id. Joined through the module contexts by course (no per-activity
     * query), inspects only each resource's main file, and uses the resource
     * revision in the URL so a replaced file busts caches.
     *
     * @param int $courseid the course id
     * @return array map of cmid => ['kind' => 'file', 'src' => string]
     */
    protected function preload_resource_videos(int $courseid): array {
        global $DB;
        $revisions = $DB->get_records_menu('resource', ['course' => $courseid], '', 'id, revision');
        $sql = "SELECT f.id, f.contextid, f.filepath, f.filename, f.mimetype, f.sortorder,
                       cm.id AS cmid, cm.instance AS instanceid
                  FROM {files} f
                  JOIN {context} ctx ON ctx.id = f.contextid AND ctx.contextlevel = :ctxmod
                  JOIN {course_modules} cm ON cm.id = ctx.instanceid
                  JOIN {modules} m ON m.id = cm.module AND m.name = 'resource'
                 WHERE cm.course = :course
                   AND f.component = 'mod_resource'
                   AND f.filearea = 'content'
                   AND f.filename <> '.'
              ORDER BY cm.id ASC, f.sortorder DESC, f.id ASC";
        $rows = $DB->get_recordset_sql($sql, ['ctxmod' => CONTEXT_MODULE, 'course' => $courseid]);
        $seen = [];
        $videos = [];
        foreach ($rows as $row) {
            if (isset($seen[$row->cmid])) {
                // Only the resource's main file (first by sortorder) is examined.
                continue;
            }
            $seen[$row->cmid] = true;
            if (strpos((string)$row->mimetype, 'video/') === 0) {
                $rev = $revisions[$row->instanceid] ?? 0;
                $src = moodle_url::make_pluginfile_url(
                    $row->contextid,
                    'mod_resource',
                    'content',
                    $rev,
                    $row->filepath,
                    $row->filename
                )->out(false);
                $videos[(int)$row->cmid] = ['kind' => 'file', 'src' => $src];
            }
        }
        $rows->close();
        return $videos;
    }

    /**
     * The pluginfile URL for a preloaded topic-image file, or null when none.
     *
     * @param \stored_file|null $file the section's image file, if any
     * @param context_course $context the course context
     * @return string|null
     */
    protected function section_image_url(?\stored_file $file, context_course $context): ?string {
        if ($file === null) {
            return null;
        }
        return moodle_url::make_pluginfile_url(
            $context->id,
            'format_mnemo',
            'sectionimage',
            $file->get_itemid(),
            $file->get_filepath(),
            $file->get_filename()
        )->out(false);
    }

    /**
     * Build the configuration object handed to the browser WebXR module.
     *
     * @param renderer_base $output
     * @return array
     */
    public function get_scene_config(renderer_base $output): array {
        $course = $this->format->get_course();
        $options = $this->format->get_format_options();
        $nodes = $this->build_nodes();

        // Default to the Three.js copy bundled with the plugin; an admin can
        // override the URL (e.g. a CDN or a shared local copy) in settings.
        $threeurl = get_config('format_mnemo', 'threeurl');
        if (empty($threeurl)) {
            $threeurl = (new moodle_url('/course/format/mnemo/thirdparty/three.module.min.js'))->out(false);
        }

        return [
            'courseid' => (int)$course->id,
            'rootid' => $this->rootid(),
            // Whether the viewer may edit activities (and so use the in-view
            // object editor to move/scale/rotate buildings and screens).
            'canedit' => has_capability(
                'moodle/course:manageactivities',
                context_course::instance((int)$course->id)
            ),
            // Per-course in-view transforms for non-activity scene objects
            // (props, gates, pylons), keyed by their stable slot key.
            'sceneobjects' => $this->scene_objects((int)$course->id),
            'threeurl' => $threeurl,
            'loaderurl' => (new moodle_url('/course/format/mnemo/js/three-esm-loader.js'))->out(false),
            // Base URL of the bundled Three.js addon modules (GLTFLoader and the
            // Draco/KTX2/meshopt decoders), used by the client's import map so
            // compressed glTF asset packs load.
            'addonsbaseurl' => (new moodle_url('/course/format/mnemo/thirdparty/jsm/'))->out(false),
            'environment' => $options['mnemoenvironment'] ?? 'cyberspace',
            'palette' => $options['mnemopalette'] ?? 'cyan',
            'invertlook' => !empty($options['mnemoinvertlook']),
            // Hour of day (0-24 float) in the site's timezone, so the client can
            // run a day/night cycle that matches the Moodle site's clock.
            'hour' => $this->site_hour(),
            // Base URL for glTF prop models. Defaults to the plugin's bundled
            // models; an admin can point it at an external asset pack.
            'modelsbaseurl' => $this->models_base_url(),
            // The plugin's own bundled models URL, always available as a
            // per-model fallback so a partial asset pack (only some props) keeps
            // the bundled models for the props it omits.
            'modelsfallbackurl' => (new moodle_url('/course/format/mnemo/models/'))->out(false),
            // Module types that have a building-<modname>.glb model available, so
            // the client only attempts to load buildings it can expect to find.
            'buildingmodels' => $this->building_models($nodes),
            // Optional site-wide assets, each resolving to an admin-set URL, then
            // an uploaded file, then null (the client keeps its bundled look).
            // See resolve_asset_url().
            'signfonturl' => $this->resolve_asset_url('signfonturl', 'signfont'),
            'signtextureurl' => $this->resolve_asset_url('signtextureurl', 'signtexture'),
            'roadtextureurl' => $this->resolve_asset_url('roadtextureurl', 'roadtexture'),
            'groundtextureurl' => $this->resolve_asset_url('groundtextureurl', 'groundtexture'),
            // Texture tiling scale (world units per tile) and the size of the
            // ground patch laid around each building, with sensible defaults.
            'roadtexturescale' => $this->int_config('roadtexturescale', 8),
            'groundtexturescale' => $this->int_config('groundtexturescale', 8),
            'groundpatchsize' => $this->int_config('groundpatchsize', 14),
            'strings' => [
                'entervr' => get_string('entervr', 'format_mnemo'),
                'exitvr' => get_string('exitvr', 'format_mnemo'),
                'vrnotsupported' => get_string('vrnotsupported', 'format_mnemo'),
                'loading' => get_string('loadingscene', 'format_mnemo'),
                'failed' => get_string('scenefailed', 'format_mnemo'),
                'controls' => get_string('scenecontrols', 'format_mnemo'),
                'complete' => get_string('statecomplete', 'format_mnemo'),
                'available' => get_string('stateavailable', 'format_mnemo'),
                'restricted' => get_string('staterestricted', 'format_mnemo'),
                'fullscreen' => get_string('fullscreen', 'format_mnemo'),
                'exitfullscreen' => get_string('exitfullscreen', 'format_mnemo'),
                'edit' => get_string('editlayout', 'format_mnemo'),
                'editdone' => get_string('editdone', 'format_mnemo'),
                'editbrightness' => get_string('editbrightness', 'format_mnemo'),
                'edittexsize' => get_string('edittexsize', 'format_mnemo'),
                'editroadsurface' => get_string('editroadsurface', 'format_mnemo'),
                'editgroundsurface' => get_string('editgroundsurface', 'format_mnemo'),
                'editscale' => get_string('editscale', 'format_mnemo'),
                'editmove' => get_string('editmove', 'format_mnemo'),
                'editrotate' => get_string('editrotate', 'format_mnemo'),
                'editsave' => get_string('editsave', 'format_mnemo'),
                'editreset' => get_string('editreset', 'format_mnemo'),
                'editclose' => get_string('editclose', 'format_mnemo'),
                'editsaving' => get_string('editsaving', 'format_mnemo'),
                'editsaved' => get_string('editsaved', 'format_mnemo'),
                'editsaveerror' => get_string('editsaveerror', 'format_mnemo'),
            ],
            'sections' => $nodes['sections'],
        ];
    }

    /**
     * The current hour of day (0-24, with minutes as a fraction) in the site's
     * configured timezone, so the scene's day/night cycle follows the site
     * clock rather than each viewer's local time.
     *
     * @return float
     */
    protected function site_hour(): float {
        $tz = \core_date::get_server_timezone_object();
        $now = new \DateTime('now', $tz);
        return (int)$now->format('G') + ((int)$now->format('i')) / 60.0;
    }

    /**
     * The base URL the client loads glTF prop models from, in order of
     * precedence: an admin-configured external asset-pack URL, then an asset
     * pack uploaded into Moodle, then the plugin's bundled models.
     *
     * @return string
     */
    protected function models_base_url(): string {
        // 1) An explicit external asset-pack URL always wins.
        $base = get_config('format_mnemo', 'assetbaseurl');
        if (!empty($base)) {
            return rtrim($base, '/') . '/';
        }
        // 2) An asset pack uploaded into Moodle (system context file area).
        $uploaded = $this->uploaded_pack_base_url();
        if ($uploaded !== null) {
            return $uploaded;
        }
        // 3) The props bundled with the plugin.
        return (new moodle_url('/course/format/mnemo/models/'))->out(false);
    }

    /**
     * The pluginfile base URL for an admin-uploaded prop asset pack, or null
     * when none has been uploaded. The client appends "<name>.glb" to this, so
     * the returned URL is slash-terminated (or ends where a filename belongs).
     *
     * @return string|null
     */
    protected function uploaded_pack_base_url(): ?string {
        $context = \context_system::instance();
        $fs = get_file_storage();
        $files = $fs->get_area_files($context->id, 'format_mnemo', 'assetpack', 0, 'filename', false);
        if (empty($files)) {
            return null;
        }
        // Use the newest file's modified time as a revision in the URL, so that
        // replacing a same-named model busts the browser cache (the pluginfile
        // handler ignores this segment and always serves the itemid-0 files).
        $rev = 0;
        foreach ($files as $file) {
            $rev = max($rev, (int)$file->get_timemodified());
        }
        // Build a per-file pluginfile URL with a sentinel name, then trim the
        // name so the client can append the real "<role>.glb" it needs.
        $sentinel = 'model.glb';
        $url = moodle_url::make_pluginfile_url(
            $context->id,
            'format_mnemo',
            'assetpack',
            $rev,
            '/',
            $sentinel
        )->out(false);
        return substr($url, 0, -strlen($sentinel));
    }

    /**
     * Resolve an optional site-wide asset (a sign webfont/texture or a
     * road/ground texture) to a URL, in order of precedence: an admin-configured
     * external URL, then a file uploaded into the plugin's settings, then null
     * (the client falls back to its bundled look).
     *
     * @param string $urlsetting The URL config key (e.g. 'signfonturl').
     * @param string $filearea   The system-context file area (e.g. 'signfont').
     * @return string|null
     */
    protected function resolve_asset_url(string $urlsetting, string $filearea): ?string {
        $url = get_config('format_mnemo', $urlsetting);
        if (!empty($url)) {
            return $url;
        }
        return $this->stored_asset_url($filearea);
    }

    /**
     * An integer plugin setting, falling back to a default when unset or blank.
     *
     * @param string $name The config key.
     * @param int $default The value to use when the setting is unset/blank.
     * @return int
     */
    protected function int_config(string $name, int $default): int {
        $value = get_config('format_mnemo', $name);
        if ($value === false || $value === '') {
            return $default;
        }
        return (int)$value;
    }

    /**
     * The pluginfile URL for a single-file site-wide asset uploaded into the
     * given system-context file area, or null when none has been uploaded. The
     * newest file's modified time is embedded as a cache-busting revision (the
     * pluginfile handler discards it and serves from itemid 0).
     *
     * @param string $filearea The system-context file area.
     * @return string|null
     */
    protected function stored_asset_url(string $filearea): ?string {
        $context = \context_system::instance();
        $fs = get_file_storage();
        $files = $fs->get_area_files($context->id, 'format_mnemo', $filearea, 0, 'filename', false);
        if (empty($files)) {
            return null;
        }
        $rev = 0;
        $stored = null;
        foreach ($files as $file) {
            if ((int)$file->get_timemodified() >= $rev) {
                $rev = (int)$file->get_timemodified();
                $stored = $file;
            }
        }
        return moodle_url::make_pluginfile_url(
            $context->id,
            'format_mnemo',
            $filearea,
            $rev,
            '/',
            $stored->get_filename()
        )->out(false);
    }

    /**
     * The module types (modnames) that have a building model
     * (<code>building-&lt;modname&gt;.glb</code>) available at the models base
     * URL, so the client only attempts to load buildings it can expect to find.
     *
     * The source is matched to models_base_url()'s precedence: an external URL
     * pack cannot be enumerated, so every module type the course actually uses is
     * offered (missing ones fall back to the procedural building); an uploaded or
     * bundled pack is enumerated exactly.
     *
     * @param array $nodes The build_nodes() result.
     * @return array List of modname strings.
     */
    protected function building_models(array $nodes): array {
        if (!empty(get_config('format_mnemo', 'assetbaseurl'))) {
            return $this->course_modnames($nodes);
        }
        $uploaded = $this->uploaded_building_modnames();
        if (!empty($uploaded)) {
            return $uploaded;
        }
        return $this->bundled_building_modnames();
    }

    /**
     * The distinct module types used across the course's activities.
     *
     * @param array $nodes The build_nodes() result.
     * @return array List of modname strings.
     */
    protected function course_modnames(array $nodes): array {
        $set = [];
        foreach ($nodes['sections'] as $section) {
            foreach ($section['activities'] as $act) {
                $set[$act['modname']] = true;
            }
        }
        return array_keys($set);
    }

    /**
     * The modnames of building models uploaded into the asset-pack file area.
     *
     * @return array List of modname strings.
     */
    protected function uploaded_building_modnames(): array {
        $context = \context_system::instance();
        $fs = get_file_storage();
        $files = $fs->get_area_files($context->id, 'format_mnemo', 'assetpack', 0, 'filename', false);
        $names = [];
        foreach ($files as $file) {
            if (preg_match('/^building-(.+)\.glb$/', $file->get_filename(), $m)) {
                $names[] = $m[1];
            }
        }
        return $names;
    }

    /**
     * The modnames of building models bundled in the plugin's models/ directory.
     *
     * @return array List of modname strings.
     */
    protected function bundled_building_modnames(): array {
        $dir = dirname(__DIR__, 2) . '/models';
        $names = [];
        foreach (glob($dir . '/building-*.glb') ?: [] as $path) {
            if (preg_match('/^building-(.+)\.glb$/', basename($path), $m)) {
                $names[] = $m[1];
            }
        }
        return $names;
    }

    /**
     * A stable DOM id for the scene root, unique to this course render.
     *
     * @return string
     */
    protected function rootid(): string {
        return 'mnemo-scene-' . $this->format->get_courseid();
    }

    /**
     * Export the accessible list-view data for the mustache template.
     *
     * @param renderer_base $output
     * @return stdClass
     */
    public function export_for_template(renderer_base $output): stdClass {
        $config = $this->get_scene_config($output);

        $data = new stdClass();
        $data->rootid = $config['rootid'];
        $data->environment = $config['environment'];
        $data->palette = $config['palette'];
        // The full scene graph is handed to the browser via a data attribute
        // (read in JS) instead of a large js_call_amd argument.
        $data->configjson = json_encode($config);
        $data->sections = array_values(array_map(function ($section) {
            $section['activities'] = array_values($section['activities']);
            return (object)$section;
        }, $config['sections']));
        $data->hassections = !empty($config['sections']);

        // UI strings for the template.
        $data->str_loading = get_string('loadingscene', 'format_mnemo');
        $data->str_listview = get_string('listview', 'format_mnemo');
        $data->str_sceneview = get_string('sceneview', 'format_mnemo');
        $data->str_toggle = get_string('togglelistview', 'format_mnemo');
        $data->str_controls = get_string('scenecontrols', 'format_mnemo');
        $data->str_arialabel = get_string('scenearialabel', 'format_mnemo');
        $data->str_emptynode = get_string('emptynode', 'format_mnemo');

        return $data;
    }
}
