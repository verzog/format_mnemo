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
        foreach (self::stored_files('planettextures') as $index => $file) {
            $out[] = [
                'key' => 'planettexture',
                'label' => get_string('preview_tex_planet', 'format_mnemo', $index + 1),
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
     * The glTF prop/building models bundled with the plugin, each resolved to
     * the uploaded asset-pack file when one overrides it, otherwise the bundled
     * model. External URL packs cannot be enumerated, so a configured asset base
     * URL is reported per model as a URL-pack source pointing at the same name.
     *
     * @return array[] The model entries.
     */
    public static function models(): array {
        global $CFG;
        $dir = $CFG->dirroot . '/course/format/mnemo/models';
        $names = [];
        foreach (glob($dir . '/*.glb') ?: [] as $path) {
            $names[] = basename($path, '.glb');
        }
        sort($names);

        $packbase = get_config('format_mnemo', 'assetbaseurl');
        $uploaded = self::uploaded_pack_names();

        $out = [];
        foreach ($names as $name) {
            $filename = $name . '.glb';
            if (isset($uploaded[$filename])) {
                $url = self::file_url('assetpack', $uploaded[$filename]);
                $source = 'uploaded';
            } else if (!empty($packbase)) {
                $url = rtrim($packbase, '/') . '/' . $filename;
                $source = 'url';
            } else {
                $url = (new moodle_url('/course/format/mnemo/models/' . $filename))->out(false);
                $source = 'bundled';
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
