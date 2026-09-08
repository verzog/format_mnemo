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
            $meta = self::model_metadata(
                $source,
                $url,
                $source === 'bundled' ? $CFG->dirroot . '/course/format/mnemo/models/' . $filename : null,
                $source === 'uploaded' ? ($uploaded[$filename] ?? null) : null
            );
            $out[] = [
                'key' => $name,
                'label' => $name,
                'url' => $url,
                'source' => $source,
                'copyright' => $meta['copyright'],
                'generator' => $meta['generator'],
            ];
        }
        return $out;
    }

    /**
     * The glTF asset metadata (copyright and generator) embedded in a model,
     * read from its GLB header. Cached per source+URL so the gallery does not
     * re-read local files or re-fetch remote packs on every view. Best-effort:
     * anything unreadable (a truncated file, a remote fetch failure, a model
     * with no such fields) yields nulls.
     *
     * @param string $source Where the model comes from: bundled, uploaded, url.
     * @param string $url The model's effective URL (the cache key with source).
     * @param string|null $path Local filesystem path, for a bundled model.
     * @param \stored_file|null $file The stored file, for an uploaded model.
     * @return array{copyright: ?string, generator: ?string}
     */
    protected static function model_metadata(string $source, string $url, ?string $path, ?\stored_file $file): array {
        $cache = \cache::make('format_mnemo', 'modelmeta');
        $cachekey = sha1($source . '|' . $url);
        $cached = $cache->get($cachekey);
        if (is_array($cached)) {
            return $cached;
        }
        $head = self::glb_head_bytes($source, $url, $path, $file);
        $meta = self::parse_glb_asset($head);
        $cache->set($cachekey, $meta);
        return $meta;
    }

    /**
     * Read enough of a GLB (the 12-byte header and the leading JSON chunk) to
     * hold its asset metadata, from whichever source backs the model. Returns
     * the empty string when the bytes cannot be obtained.
     *
     * @param string $source bundled, uploaded or url.
     * @param string $url The remote URL (for the url source).
     * @param string|null $path Local path (for the bundled source).
     * @param \stored_file|null $file The stored file (for the uploaded source).
     * @return string The leading bytes of the GLB (possibly empty).
     */
    protected static function glb_head_bytes(string $source, string $url, ?string $path, ?\stored_file $file): string {
        // Cap on how much of the file to read: the JSON chunk sits right after
        // the 12-byte header, so a few hundred KB covers any realistic model.
        $cap = 1048576;
        if ($source === 'bundled' && $path !== null && is_readable($path)) {
            return (string)file_get_contents($path, false, null, 0, $cap);
        }
        if ($source === 'uploaded' && $file !== null) {
            $fh = $file->get_content_file_handle();
            if ($fh === false) {
                return '';
            }
            $bytes = (string)fread($fh, $cap);
            fclose($fh);
            return $bytes;
        }
        if ($source === 'url') {
            // Never make network calls under unit tests: they must stay
            // hermetic and fast. Real admin views still fetch.
            if (defined('PHPUNIT_TEST') && PHPUNIT_TEST) {
                return '';
            }
            $curl = new \curl();
            $bytes = $curl->get($url, [], [
                'CURLOPT_RANGE' => '0-' . ($cap - 1),
                'CURLOPT_TIMEOUT' => 6,
                'CURLOPT_CONNECTTIMEOUT' => 4,
                'CURLOPT_FOLLOWLOCATION' => 1,
                'CURLOPT_MAXREDIRS' => 3,
            ]);
            if ($curl->get_errno() || !is_string($bytes)) {
                return '';
            }
            // A server that ignores Range returns the whole file; keep only the
            // capped head so parsing stays bounded.
            return substr($bytes, 0, $cap);
        }
        return '';
    }

    /**
     * Parse the glTF asset block (copyright, generator) out of the leading
     * bytes of a GLB. Tolerant of anything malformed or truncated - it simply
     * returns nulls rather than raising.
     *
     * @param string $bytes The leading bytes of a GLB (header + JSON chunk).
     * @return array{copyright: ?string, generator: ?string}
     */
    protected static function parse_glb_asset(string $bytes): array {
        $none = ['copyright' => null, 'generator' => null];
        // 12-byte GLB header (magic, version, length) + 8-byte chunk header.
        if (strlen($bytes) < 20 || substr($bytes, 0, 4) !== 'glTF') {
            return $none;
        }
        $chunk = unpack('Vlength/Vtype', substr($bytes, 12, 8));
        // The first chunk must be JSON (type 0x4E4F534A).
        if (!$chunk || $chunk['type'] !== 0x4E4F534A) {
            return $none;
        }
        $json = substr($bytes, 20, $chunk['length']);
        // If the buffer was truncated before the whole JSON chunk (a ranged
        // remote read), json_decode fails and we fall back to nulls.
        $data = json_decode($json, true);
        if (!is_array($data) || !isset($data['asset']) || !is_array($data['asset'])) {
            return $none;
        }
        $asset = $data['asset'];
        $clean = function ($value): ?string {
            if (!is_string($value)) {
                return null;
            }
            $value = trim($value);
            if ($value === '') {
                return null;
            }
            // Bound the stored/displayed length so a pathological file cannot
            // bloat the cache or the page.
            return \core_text::substr($value, 0, 500);
        };
        return [
            'copyright' => $clean($asset['copyright'] ?? null),
            'generator' => $clean($asset['generator'] ?? null),
        ];
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
