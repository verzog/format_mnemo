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
 * Resolves the plugin's site-wide visual assets (textures and glTF prop models)
 * to their effective URL and source, for the admin asset viewer.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\output;

use moodle_url;

/**
 * Site-wide asset resolution for the admin viewer. Deliberately independent of
 * the course-bound {@see scene} builder: everything here reads only site config
 * and the plugin's system-context file areas, so it works on an admin page with
 * no course in context. Each entry reports where its asset comes from - an
 * uploaded file, a configured URL, the bundled default, or nothing.
 */
class asset_gallery {
    /**
     * The texture assets, each as an ordered map describing one card: its key,
     * label/usage string keys, effective URL (or null) and source. A URL setting
     * takes precedence over an uploaded file, matching the scene renderer.
     *
     * @return array[] The texture entries.
     */
    public static function textures(): array {
        $defs = [
            ['key' => 'signtexture', 'urlsetting' => 'signtextureurl', 'filearea' => 'signtexture'],
            ['key' => 'roadtexture', 'urlsetting' => 'roadtextureurl', 'filearea' => 'roadtexture'],
            ['key' => 'groundtexture', 'urlsetting' => 'groundtextureurl', 'filearea' => 'groundtexture'],
            ['key' => 'sidewalktexture', 'urlsetting' => 'sidewalktextureurl', 'filearea' => 'sidewalktexture'],
            ['key' => 'spacetexture', 'urlsetting' => 'spacetextureurl', 'filearea' => 'spacetexture'],
            ['key' => 'ringtexture', 'urlsetting' => 'ringtextureurl', 'filearea' => 'ringtexture'],
        ];
        $out = [];
        foreach ($defs as $def) {
            $out[] = self::single_texture($def['key'], $def['urlsetting'], $def['filearea']);
        }
        // The planet maps are a multi-file area: one card per uploaded map.
        // get_area_files() keys by pathname hash, so count with our own index.
        $n = 0;
        foreach (self::stored_files('planettextures') as $file) {
            $n++;
            $out[] = [
                'key' => 'planettexture',
                'label' => get_string('preview_tex_planet', 'format_mnemo', $n),
                'usagekey' => 'preview_use_planet',
                'url' => self::file_url('planettextures', $file),
                'source' => 'uploaded',
                'filename' => $file->get_filename(),
                'ringed' => (bool)preg_match('/(?:^|[^a-z])ring(?:[^a-z]|$)/i', $file->get_filename()),
            ];
        }
        return $out;
    }

    /**
     * One single-file texture entry (its URL setting, else its uploaded file,
     * else none).
     *
     * @param string $key The asset key (also the label/usage string suffix).
     * @param string $urlsetting The URL config setting name.
     * @param string $filearea The system-context file area.
     * @return array The texture entry.
     */
    protected static function single_texture(string $key, string $urlsetting, string $filearea): array {
        $url = get_config('format_mnemo', $urlsetting);
        $source = 'none';
        if (!empty($url)) {
            $source = 'url';
        } else {
            $files = self::stored_files($filearea);
            if (!empty($files)) {
                $url = self::file_url($filearea, reset($files));
                $source = 'uploaded';
            } else {
                $url = null;
            }
        }
        return [
            'key' => $key,
            'label' => get_string('preview_tex_' . $key, 'format_mnemo'),
            'usagekey' => 'preview_use_' . $key,
            'url' => $url ?: null,
            'source' => $source,
        ];
    }

    /**
     * The glTF prop/building models the scene may use, each resolved to its
     * effective URL and source with the same precedence as the scene renderer:
     * an external asset-pack URL first, then an uploaded asset-pack file, then
     * the bundled model. The name set is the union of the bundled models and any
     * uploaded pack files, so an uploaded-only model (e.g. building-forum.glb
     * with no bundled counterpart) still gets a card.
     *
     * @return array[] The model entries.
     */
    public static function models(): array {
        global $CFG;
        $names = [];
        foreach (glob($CFG->dirroot . '/course/format/mnemo/models/*.glb') ?: [] as $path) {
            $names[basename($path, '.glb')] = true;
        }
        $uploaded = self::uploaded_pack_names();
        foreach (array_keys($uploaded) as $filename) {
            if (substr($filename, -4) === '.glb') {
                $names[basename($filename, '.glb')] = true;
            }
        }
        $names = array_keys($names);
        sort($names);

        $packbase = get_config('format_mnemo', 'assetbaseurl');
        $bundled = self::bundled_model_names();

        $out = [];
        foreach ($names as $name) {
            $filename = $name . '.glb';
            // Match models_base_url(): the external URL pack wins, then an
            // uploaded file, then the bundled model.
            if (!empty($packbase)) {
                $url = rtrim($packbase, '/') . '/' . $filename;
                $source = 'url';
            } else if (isset($uploaded[$filename])) {
                $url = self::file_url('assetpack', $uploaded[$filename]);
                $source = 'uploaded';
            } else if (isset($bundled[$name])) {
                $url = (new moodle_url('/course/format/mnemo/models/' . $filename))->out(false);
                $source = 'bundled';
            } else {
                continue;
            }
            $out[] = [
                'key' => $name,
                'label' => $name,
                'url' => $url,
                'source' => $source,
            ];
        }
        return $out;
    }

    /**
     * The prop model base names the in-view object placer may drop: the union
     * of the plugin's bundled models and any uploaded asset-pack .glb file,
     * minus the named building models (building-*), which are bound to
     * activities and are not free-standing props. Sorted, with names too long
     * for the placed-object type column dropped. This is the single source of
     * truth shared by the scene payload (the palette it offers) and the
     * add_placed_object web service (the names it accepts).
     *
     * @return string[] The placeable prop base names.
     */
    public static function placer_prop_names(): array {
        $names = [];
        foreach (array_keys(self::bundled_model_names()) as $name) {
            $names[$name] = true;
        }
        // Uploaded models are only loadable when no external asset-pack URL is
        // configured: with a pack URL set, the scene loads from that pack and
        // falls back only to the bundled models (see scene::models_base_url()
        // and the client's loadProp()), so an uploaded-only name could never
        // load. Follow the same precedence here so the palette never offers a
        // prop whose model cannot be fetched.
        if (empty(get_config('format_mnemo', 'assetbaseurl'))) {
            foreach (array_keys(self::uploaded_pack_names()) as $filename) {
                $filename = (string)$filename;
                if (substr($filename, -4) === '.glb') {
                    $names[basename($filename, '.glb')] = true;
                }
            }
        }
        $out = [];
        foreach (array_keys($names) as $name) {
            // A base name that looks numeric (e.g. "123" from 123.glb) comes
            // back from array_keys() as an int; keep the contract's string[] so
            // the web service's strict in_array() match still works.
            $name = (string)$name;
            // Named building models are activity-bound, not free-standing props.
            if (strpos($name, 'building-') === 0) {
                continue;
            }
            // Keep within the format_mnemo_placedobj.type column width.
            if ($name === '' || \core_text::strlen($name) > 32) {
                continue;
            }
            $out[] = $name;
        }
        sort($out, SORT_STRING);
        return $out;
    }

    /**
     * The base names of the models bundled with the plugin, as a lookup set.
     *
     * @return array<string, bool> Map of model name => true.
     */
    protected static function bundled_model_names(): array {
        global $CFG;
        $set = [];
        foreach (glob($CFG->dirroot . '/course/format/mnemo/models/*.glb') ?: [] as $path) {
            $set[basename($path, '.glb')] = true;
        }
        return $set;
    }

    /**
     * The client bootstrap URLs the preview module needs to load Three.js and
     * the glTF addon loaders (mirroring the scene renderer's defaults).
     *
     * @return array{threeurl: string, loaderurl: string, addonsbaseurl: string}
     */
    public static function client_config(): array {
        $threeurl = get_config('format_mnemo', 'threeurl');
        if (empty($threeurl)) {
            $threeurl = (new moodle_url('/course/format/mnemo/thirdparty/three.module.min.js'))->out(false);
        }
        return [
            'threeurl' => $threeurl,
            'loaderurl' => (new moodle_url('/course/format/mnemo/js/three-esm-loader.js'))->out(false),
            'addonsbaseurl' => (new moodle_url('/course/format/mnemo/thirdparty/jsm/'))->out(false),
        ];
    }

    /**
     * The files in a system-context file area, ordered by filename.
     *
     * @param string $filearea The file area.
     * @return \stored_file[] The stored files (may be empty).
     */
    protected static function stored_files(string $filearea): array {
        $fs = get_file_storage();
        return $fs->get_area_files(
            \context_system::instance()->id,
            'format_mnemo',
            $filearea,
            0,
            'filename',
            false
        );
    }

    /**
     * Uploaded asset-pack model files, keyed by filename.
     *
     * @return array<string, \stored_file> Map of filename => file.
     */
    protected static function uploaded_pack_names(): array {
        $map = [];
        foreach (self::stored_files('assetpack') as $file) {
            $map[$file->get_filename()] = $file;
        }
        return $map;
    }

    /**
     * The pluginfile URL for one stored file in a system-context area, with the
     * file's modified time as a cache-busting revision.
     *
     * @param string $filearea The file area.
     * @param \stored_file $file The stored file.
     * @return string The pluginfile URL.
     */
    protected static function file_url(string $filearea, \stored_file $file): string {
        return moodle_url::make_pluginfile_url(
            \context_system::instance()->id,
            'format_mnemo',
            $filearea,
            (int)$file->get_timemodified(),
            '/',
            $file->get_filename()
        )->out(false);
    }
}
