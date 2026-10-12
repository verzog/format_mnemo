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

use format_mnemo\local\model_bounds;
use format_mnemo\local\model_budget;
use format_mnemo\local\model_config;
use format_mnemo\local\model_licence;
use format_mnemo\local\model_variants;
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
     * @var float|null Wall-clock deadline (epoch seconds) for remote model
     * metadata reads in this request, or null before the first remote read.
     * Bounds the total time the gallery spends fetching from external packs.
     */
    protected static $metafetchdeadline = null;

    /**
     * @var bool Whether a remote model's metadata was skipped (not cached yet)
     * in this request because remote reads were off; see credits().
     */
    protected static $remotemissed = false;

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
        // Sun and moon assets that are images (a .glb is a model, shown under
        // models() instead). Each skins the celestial disc in every world.
        foreach (['sun', 'moon'] as $body) {
            $cel = self::celestial($body);
            if ($cel !== null && $cel['kind'] === 'image') {
                $out[] = [
                    'key' => $body,
                    'label' => get_string('preview_tex_' . $body, 'format_mnemo'),
                    'usagekey' => 'preview_use_' . $body,
                    'url' => $cel['url'],
                    'source' => $cel['source'],
                ];
            }
        }
        // The planet maps are a multi-file area: one card per uploaded map. Which
        // planet is ringed follows the authoritative "Ringed planets" admin
        // setting (planets numbered in upload order), matching the scene.
        // get_area_files() keys by pathname hash, so count with our own index.
        $ringset = self::ringed_planets();
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
                'ringed' => isset($ringset[$n]),
            ];
        }
        return $out;
    }

    /**
     * The set of Void planet numbers (1-based, upload order) that wear a ring,
     * from the "ringplanets" admin setting, defaulting to the three that were
     * ringed by default before it existed. Returned as a lookup set (planet
     * number => true), matching {@see scene::ring_flags()}.
     *
     * @return array<int, bool> Map of planet number => true.
     */
    protected static function ringed_planets(): array {
        $raw = get_config('format_mnemo', 'ringplanets');
        if ($raw === false) {
            $selected = [1, 5, 9];
        } else {
            $selected = [];
            foreach (explode(',', (string)$raw) as $piece) {
                $piece = trim($piece);
                if ($piece !== '' && ctype_digit($piece)) {
                    $selected[] = (int)$piece;
                }
            }
        }
        return array_flip($selected);
    }

    /**
     * Resolve a celestial (sun or moon) asset to {url, kind, source}, or null
     * when none is configured. A URL setting wins over an uploaded file; the
     * kind is 'model' for a glTF binary (.glb/.gltf) and 'image' otherwise.
     *
     * @param string $body 'sun' or 'moon'.
     * @return array{url: string, kind: string, source: string}|null
     */
    protected static function celestial(string $body): ?array {
        $url = get_config('format_mnemo', $body . 'asseturl');
        if (!empty($url)) {
            return ['url' => $url, 'kind' => self::asset_kind($url), 'source' => 'url'];
        }
        $files = self::stored_files($body . 'asset');
        if (!empty($files)) {
            $file = reset($files);
            return [
                'url' => self::file_url($body . 'asset', $file),
                'kind' => self::asset_kind($file->get_filename()),
                'source' => 'uploaded',
                'file' => $file,
            ];
        }
        return null;
    }

    /**
     * Classify a celestial asset by extension: a 3D model (.glb/.gltf/.fbx) is a
     * 'model', anything else is a flat 'image'.
     *
     * @param string $nameorurl A file name or URL.
     * @return string 'model' or 'image'.
     */
    protected static function asset_kind(string $nameorurl): string {
        return preg_match('/\.(glb|gltf|fbx)(\?|#|$)/i', $nameorurl) ? 'model' : 'image';
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
     * @param bool $remote Whether a remote pack's models may be fetched for their
     *     metadata (false on the course page, which must not wait on them).
     * @return array[] The model entries.
     */
    public static function models(bool $remote = true): array {
        // Categorise the bundled models by naming convention: building-* are
        // buildings, "av" is the flying-car vehicle, the rest are props.
        $bundledprops = [];
        $bundledvehicles = [];
        $bundledbuildings = [];
        foreach (array_keys(self::bundled_model_names()) as $name) {
            if (strpos($name, 'building-') === 0) {
                $bundledbuildings[$name] = true;
            } else if ($name === 'av') {
                $bundledvehicles[$name] = true;
            } else {
                $bundledprops[$name] = true;
            }
        }

        // Props resolve like the scene: external URL pack, then the uploaded
        // prop pack, then bundled. Vehicles and buildings each have their own
        // upload area (no external URL), then bundled.
        $externalpack = (string)get_config('format_mnemo', 'assetbaseurl');
        $out = array_merge(
            self::area_model_cards('prop', 'assetpack', $bundledprops, $externalpack, $remote),
            self::area_model_cards('vehicle', 'vehicleassets', $bundledvehicles, '', $remote),
            self::area_model_cards('building', 'buildingassets', $bundledbuildings, '', $remote)
        );

        // Sun and moon assets that are 3D models (a plain image is a texture,
        // shown under textures() instead). They get a live 3D preview here.
        foreach (['sun', 'moon'] as $body) {
            $cel = self::celestial($body);
            if ($cel !== null && $cel['kind'] === 'model') {
                // Credit from the model file only: the sun and moon have no
                // model settings to type one into.
                $meta = self::model_metadata($cel['source'], $cel['url'], null, $cel['file'] ?? null, $remote);
                $out[] = [
                    'key' => $body,
                    'label' => get_string('preview_tex_' . $body, 'format_mnemo'),
                    'url' => $cel['url'],
                    'source' => $cel['source'],
                    'category' => 'celestial',
                    'copyright' => $meta['copyright'],
                    'generator' => $meta['generator'],
                    'credit' => model_licence::merge($meta['credit'], []),
                    'licenceflags' => model_licence::flags(model_licence::merge($meta['credit'], [])),
                ];
            }
        }
        return $out;
    }

    /**
     * The model cards for one category (prop/vehicle/building), assembled from
     * the bundled models of that category plus the .glb files uploaded into its
     * file area. Each resolves to its effective URL with the category's
     * precedence: an external URL pack (props only), then the uploaded file,
     * then the bundled model.
     *
     * @param string $category The category tag (prop, vehicle, building).
     * @param string $filearea The upload file area for this category.
     * @param array $bundledset The bundled model names in this category, as keys.
     * @param string $externalbase An external asset-pack base URL, or '' if none.
     * @param bool $remote Whether a remote model may be fetched for its metadata.
     * @return array[] The model entries.
     */
    protected static function area_model_cards(
        string $category,
        string $filearea,
        array $bundledset,
        string $externalbase,
        bool $remote = true
    ): array {
        global $CFG;
        $uploaded = self::stored_glb_files($filearea);
        $litefiles = model_variants::lite_files($filearea);
        $configs = model_config::all();
        // Base name => the uploaded file's real extension (glb unless it is an
        // .fbx upload), so a card reconstructs the right filename below.
        $uploadedext = [];
        $names = $bundledset;
        foreach (array_keys($uploaded) as $filename) {
            $base = self::model_basename($filename);
            $names[$base] = true;
            $uploadedext[$base] = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        }
        $names = array_keys($names);
        sort($names);

        $out = [];
        foreach ($names as $name) {
            // Uploaded models keep their real extension; an external pack and the
            // bundled models are always .glb.
            $ext = isset($uploadedext[$name]) ? $uploadedext[$name] : 'glb';
            $filename = $name . '.' . $ext;
            $path = null;
            $file = null;
            $filesize = null;
            if ($externalbase !== '') {
                $url = rtrim($externalbase, '/') . '/' . $name . '.glb';
                $source = 'url';
            } else if (isset($uploaded[$filename])) {
                $file = $uploaded[$filename];
                $source = 'uploaded';
                $filesize = (int)$file->get_filesize();
                if ($ext === 'zip') {
                    // A multi-file bundle resolves to its extracted entry URL;
                    // metadata is not read from the zip (left null below).
                    $url = \format_mnemo\local\model_bundle::entry_url($file);
                    if ($url === null) {
                        continue;
                    }
                    $file = null;
                } else {
                    $url = self::file_url($filearea, $file);
                }
            } else if (isset($bundledset[$name])) {
                $url = (new moodle_url('/course/format/mnemo/models/' . $name . '.glb'))->out(false);
                $source = 'bundled';
                $path = $CFG->dirroot . '/course/format/mnemo/models/' . $name . '.glb';
                $filesize = is_readable($path) ? (int)filesize($path) : null;
            } else {
                continue;
            }
            $meta = self::model_metadata($source, $url, $path, $file, $remote);
            // The credit: the file's own, with any field typed into the model's
            // settings taking precedence. A lite copy shares its full model's.
            $credit = model_licence::merge($meta['credit'], $configs[$name]['credit'] ?? []);
            // An uploaded lite copy only counts when the full model is uploaded
            // too (an external pack or bundled model is what loads otherwise).
            // The budget category: the prop pack's "av" is the flying car.
            $budgetcat = model_budget::category($filearea, $name) ?? $category;
            $lite = $source === 'uploaded' && isset($litefiles[$name])
                ? self::lite_card($budgetcat, $filearea, $litefiles[$name])
                : null;
            $out[] = [
                'key' => $name,
                'label' => $name,
                'url' => $url,
                'source' => $source,
                'category' => $category,
                'copyright' => $meta['copyright'],
                'generator' => $meta['generator'],
                'triangles' => $meta['triangles'],
                'filesize' => $filesize,
                'warnings' => model_budget::model_warnings($budgetcat, $name, $filesize, $meta['triangles'], $lite !== null),
                'lite' => $lite,
                'credit' => $credit,
                'licenceflags' => model_licence::flags($credit),
                // Where an uploaded model lives, so the viewer can offer to delete it.
                'filearea' => $source === 'uploaded' ? $filearea : null,
                'bounds' => $meta['bounds'],
                'size' => $category === 'building' ? self::building_size($meta['bounds'], $configs[$name] ?? []) : null,
            ];
        }
        return $out;
    }

    /**
     * The size details of an uploaded lite copy, for its full model's card.
     *
     * @param string $category The model category (prop, vehicle or building).
     * @param string $filearea The upload file area.
     * @param \stored_file $file The lite copy's file.
     * @return array The triangles, filesize and warnings (against the lite budget).
     */
    protected static function lite_card(string $category, string $filearea, \stored_file $file): array {
        $filesize = (int)$file->get_filesize();
        $triangles = null;
        if (strtolower(pathinfo($file->get_filename(), PATHINFO_EXTENSION)) === 'glb') {
            $meta = self::model_metadata('uploaded', self::file_url($filearea, $file), null, $file);
            $triangles = $meta['triangles'];
        }
        return [
            'filename' => $file->get_filename(),
            'triangles' => $triangles,
            'filesize' => $filesize,
            'warnings' => model_budget::warnings($category, $filesize, $triangles, 'lite'),
        ];
    }

    /**
     * The glTF asset metadata (copyright and generator) embedded in a model,
     * and its triangle count, read from its GLB header. Cached per source+URL so the gallery does not
     * re-read local files or re-fetch remote packs on every view. Best-effort:
     * anything unreadable (a truncated file, a remote fetch failure, a model
     * with no such fields) yields nulls.
     *
     * @param string $source Where the model comes from: bundled, uploaded, url.
     * @param string $url The model's effective URL (the cache key with source).
     * @param string|null $path Local filesystem path, for a bundled model.
     * @param \stored_file|null $file The stored file, for an uploaded model.
     * @param bool $remote Whether a remote model may be fetched on a cache miss.
     * @return array The copyright, generator, triangles and credit.
     */
    protected static function model_metadata(
        string $source,
        string $url,
        ?string $path,
        ?\stored_file $file,
        bool $remote = true
    ): array {
        $cache = \cache::make('format_mnemo', 'modelmeta');
        $cachekey = sha1($source . '|' . $url);
        $cached = $cache->get($cachekey);
        // Entries cached before triangle counts, credits and bounds were added are re-read.
        if (is_array($cached) && array_key_exists('bounds', $cached)) {
            return $cached;
        }
        // Without remote reads (the course page), a remote model not yet in the
        // cache gets no metadata, and nothing is cached for it.
        if ($source === 'url' && !$remote) {
            self::$remotemissed = true;
            return self::parse_glb_asset('');
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
        global $CFG;
        // Cap on how much of a remote file to read: the JSON chunk sits right
        // after the 12-byte header, so this covers the asset block of almost any
        // model. Local files are read to the end of their JSON chunk instead.
        $cap = 1048576;
        if ($source === 'bundled' && $path !== null && is_readable($path)) {
            $fh = fopen($path, 'rb');
            return $fh === false ? '' : self::read_glb_head($fh);
        }
        if ($source === 'uploaded' && $file !== null) {
            $fh = $file->get_content_file_handle();
            return $fh === false ? '' : self::read_glb_head($fh);
        }
        if ($source === 'url') {
            // Never make network calls under unit tests: they must stay
            // hermetic and fast. Real admin views still fetch.
            if (defined('PHPUNIT_TEST') && PHPUNIT_TEST) {
                return '';
            }
            // A whole-gallery wall-clock budget for cold remote reads, so a slow
            // or unreachable external pack cannot hold the admin page open: once
            // the budget is spent, remaining models get no metadata (cached
            // results are still served, so a warm gallery is unaffected).
            if (self::$metafetchdeadline === null) {
                self::$metafetchdeadline = microtime(true) + 8.0;
            }
            if (microtime(true) >= self::$metafetchdeadline) {
                return '';
            }
            // The global curl class lives in the legacy file API, which is not
            // autoloaded and may not have been pulled in by the admin page.
            require_once($CFG->libdir . '/filelib.php');
            $curl = new \curl();
            $bytes = $curl->get($url, [], [
                // Request only the head - the JSON chunk is at the file start.
                'CURLOPT_RANGE' => '0-' . ($cap - 1),
                // Refuse an over-cap body up front (when the server declares a
                // length), and keep timeouts short so one slow host cannot
                // dominate the gallery-wide budget above.
                'CURLOPT_MAXFILESIZE' => $cap,
                'CURLOPT_TIMEOUT' => 3,
                'CURLOPT_CONNECTTIMEOUT' => 2,
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
     * Read a local GLB's 12-byte header and its whole JSON chunk (the length
     * the chunk header declares, up to 16 MB), then close the handle. A local
     * model's JSON can be over the 1 MB a remote read takes, and the triangle
     * count needs all of it.
     *
     * @param resource $fh An open file handle at the start of the file.
     * @return string The header and JSON chunk bytes (possibly short or empty).
     */
    protected static function read_glb_head($fh): string {
        $bytes = (string)fread($fh, 20);
        if (strlen($bytes) === 20 && substr($bytes, 0, 4) === 'glTF') {
            $length = unpack('V', substr($bytes, 12, 4))[1];
            if ($length > 0 && $length <= 16777216) {
                $bytes .= (string)stream_get_contents($fh, $length);
            }
        }
        fclose($fh);
        return $bytes;
    }

    /**
     * Parse the glTF asset block (copyright, generator) and the triangle count
     * out of the leading bytes of a GLB. Tolerant of anything malformed or truncated - it simply
     * returns nulls rather than raising.
     *
     * @param string $bytes The leading bytes of a GLB (header + JSON chunk).
     * @return array The copyright, generator, triangles, credit and bounds.
     */
    protected static function parse_glb_asset(string $bytes): array {
        $none = ['copyright' => null, 'generator' => null, 'triangles' => null, 'credit' => [], 'bounds' => null];
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
        if (!is_array($data)) {
            return $none;
        }
        $triangles = model_budget::count_triangles($data);
        $bounds = model_bounds::bounds($data);
        if (!isset($data['asset']) || !is_array($data['asset'])) {
            return ['triangles' => $triangles, 'bounds' => $bounds] + $none;
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
            'triangles' => $triangles,
            'credit' => model_licence::from_asset($asset),
            'bounds' => $bounds,
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
                if (preg_match('/\.(glb|fbx|zip)$/i', $filename)) {
                    $names[self::model_basename($filename)] = true;
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
     * The activity types enabled on the site that have no building model
     * (uploaded or bundled) and so use the procedural building, for the asset
     * viewer's placeholder cards. Labels are left out: they are not buildings.
     *
     * @param array[] $models The model entries (see models()).
     * @return array[] Each placeholder: modname, label (the activity type's
     *     name) and filename (the building model name to upload), sorted by label.
     */
    public static function building_placeholders(array $models): array {
        global $DB;
        $have = [];
        foreach ($models as $model) {
            if (($model['category'] ?? '') === 'building') {
                $have[(string)$model['key']] = true;
            }
        }
        $out = [];
        foreach ($DB->get_fieldset_select('modules', 'name', 'visible = 1') as $modname) {
            $name = 'building-' . $modname;
            if ($modname === 'label' || isset($have[$name])) {
                continue;
            }
            $label = get_string_manager()->string_exists('pluginname', 'mod_' . $modname)
                ? get_string('pluginname', 'mod_' . $modname)
                : $modname;
            $out[] = ['modname' => $modname, 'label' => $label, 'filename' => $name];
        }
        usort($out, function ($a, $b) {
            return strcmp(\core_text::strtolower($a['label']), \core_text::strtolower($b['label']));
        });
        return $out;
    }

    /**
     * The model names whose per-model settings (environments, facing, scale and
     * behaviour flags such as "animate") may be edited in the asset viewer: every
     * model card the viewer shows except the sun/moon celestials, which carry
     * their own URL config rather than a model-config entry. This is the single
     * source of truth shared by the preview page's settings form (which cards
     * get one) and its save handler (which names it accepts), so a vehicle or
     * building model can be configured, not just a placeable prop.
     *
     * @return string[] The configurable model base names.
     */
    public static function configurable_model_names(): array {
        $names = [];
        foreach (self::models() as $model) {
            if (($model['category'] ?? 'prop') !== 'celestial') {
                $names[(string)$model['key']] = true;
            }
        }
        return array_map('strval', array_keys($names));
    }

    /**
     * The credits to show under the 3D view: every model that names an author,
     * a licence or a copyright notice, as escaped credit-line HTML. Two models
     * may share a name (an "av" prop and an "av" vehicle), so each keeps its
     * own entry.
     *
     * @return array[] Each credit: name (the model's base name) and html, sorted by name.
     */
    public static function credits(): array {
        return self::scene_assets()['credits'];
    }

    /**
     * The storey sizing of each building model whose size is known (see
     * building_size()), for the 3D view to scale it and give it a wide-enough
     * plot.
     *
     * @return array[] Model name => w, h, d (the model's own units, after its
     *     orientation) and storeys.
     */
    public static function building_sizes(): array {
        return self::scene_assets()['buildings'];
    }

    /**
     * A building model's storey sizing: its box after its saved orientation
     * and the storeys that box (or a typed count) gives, or null when the size
     * is unknown or does not look like metres (the model is fitted to its plot).
     *
     * @param array|null $bounds The model's box from its file, or null.
     * @param array $cfg The model's stored settings.
     * @return array|null The w, h, d, storeys and typed (only storeys and typed
     *     when the size is unknown), or null.
     */
    public static function building_size(?array $bounds, array $cfg): ?array {
        if ($bounds === null) {
            // The size cannot be read (an .fbx or .zip): a typed storey count
            // still sets the model's height, though its plot cannot widen.
            return isset($cfg['storeys']) ? ['storeys' => $cfg['storeys'], 'typed' => true] : null;
        }
        $box = model_bounds::orient($bounds, $cfg['pitch'] ?? 0.0, $cfg['yaw'] ?? 0.0, $cfg['roll'] ?? 0.0);
        $w = $box[3] - $box[0];
        $h = $box[4] - $box[1];
        $d = $box[5] - $box[2];
        if (!($w > 0) || !($h > 0) || !($d > 0)) {
            return null;
        }
        $storeys = model_bounds::storeys($h, $cfg['storeys'] ?? null);
        if ($storeys === null) {
            return null;
        }
        return ['w' => round($w, 4), 'h' => round($h, 4), 'd' => round($d, 4), 'storeys' => $storeys,
            'typed' => isset($cfg['storeys'])];
    }

    /**
     * What the course page needs from the models: the credits list and the
     * building sizes. Building it reads every model's metadata, so it is
     * cached until a model, a model setting or the language changes. Remote
     * packs are never fetched here (the course page must not wait on them):
     * when a remote model's metadata is not cached yet, a background task
     * fetches it and the result is rebuilt on a later page view.
     *
     * @return array The credits and buildings.
     */
    protected static function scene_assets(): array {
        $cache = \cache::make('format_mnemo', 'modelcredits');
        $key = self::credits_revision();
        $cached = $cache->get($key);
        if (is_array($cached) && isset($cached['credits'], $cached['buildings'])) {
            return $cached;
        }
        self::$remotemissed = false;
        $credits = [];
        $buildings = [];
        $seen = [];
        foreach (self::models(false) as $model) {
            if (!empty($model['size'])) {
                $buildings[(string)$model['key']] = $model['size'];
            }
            if (empty($model['credit']) || !model_licence::is_creditable($model['credit'])) {
                continue;
            }
            $name = (string)$model['key'];
            $html = model_licence::credit_html($model['credit'], (string)$model['label']);
            if (!isset($seen[$name . '|' . $html])) {
                $seen[$name . '|' . $html] = true;
                $credits[] = ['name' => $name, 'html' => $html];
            }
        }
        usort($credits, function ($a, $b) {
            return strcmp($a['name'], $b['name']);
        });
        $out = ['credits' => $credits, 'buildings' => $buildings];
        if (self::$remotemissed) {
            \core\task\manager::queue_adhoc_task(new \format_mnemo\task\fetch_model_metadata(), true);
        } else {
            $cache->set($key, $out);
        }
        return $out;
    }

    /**
     * A key that changes whenever the credits list could: any model file
     * (uploaded or bundled), the model settings, the asset-pack and sun/moon
     * URLs, or the language the credit lines are written in.
     *
     * @return string The revision key.
     */
    protected static function credits_revision(): string {
        global $CFG;
        $parts = [current_language(), (string)get_config('format_mnemo', 'version')];
        foreach (['assetbaseurl', 'sunasseturl', 'moonasseturl', 'modelconfig'] as $setting) {
            $parts[] = (string)get_config('format_mnemo', $setting);
        }
        foreach (['assetpack', 'vehicleassets', 'buildingassets', 'sunasset', 'moonasset'] as $filearea) {
            foreach (self::stored_files($filearea) as $file) {
                $parts[] = $filearea . '/' . $file->get_filename() . '/' . $file->get_contenthash();
            }
        }
        foreach (glob($CFG->dirroot . '/course/format/mnemo/models/*.glb') ?: [] as $path) {
            $parts[] = basename($path) . '/' . (int)@filemtime($path);
        }
        return sha1(implode("\n", $parts));
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
        // The bundled glTF addon stack imports the bundled Three.js and is
        // version-matched to it, so it is only offered when no threeurl override
        // is set (mirroring scene::get_scene_config); otherwise the preview
        // would run two Three.js instances. With an override, compressed models
        // fall back to the built-in uncompressed-glTF parser.
        $customthree = !empty(get_config('format_mnemo', 'threeurl'));
        $threeurl = $customthree
            ? get_config('format_mnemo', 'threeurl')
            : (new moodle_url('/course/format/mnemo/thirdparty/three.module.min.js'))->out(false);
        return [
            'threeurl' => $threeurl,
            'loaderurl' => (new moodle_url('/course/format/mnemo/js/three-esm-loader.js'))->out(false),
            'addonsbaseurl' => $customthree
                ? ''
                : (new moodle_url('/course/format/mnemo/thirdparty/jsm/'))->out(false),
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
     * Uploaded asset-pack (prop) model files, keyed by filename.
     *
     * @return array<string, \stored_file> Map of filename => file.
     */
    protected static function uploaded_pack_names(): array {
        return self::stored_glb_files('assetpack');
    }

    /**
     * The uploaded model files (.glb, .fbx and .zip bundles) in a system-context
     * file area, keyed by filename.
     *
     * @param string $filearea The file area.
     * @return array<string, \stored_file> Map of filename => file.
     */
    protected static function stored_glb_files(string $filearea): array {
        $map = [];
        foreach (self::stored_files($filearea) as $file) {
            // Lite copies belong to their full model, not a card of their own.
            $islite = model_variants::is_lite_file($file->get_filename());
            if (!$islite && preg_match('/\.(glb|fbx|zip)$/i', $file->get_filename())) {
                $map[$file->get_filename()] = $file;
            }
        }
        return $map;
    }

    /**
     * Strip a model file's extension (.glb, .fbx or .zip) to its base name. A
     * name with no known model extension is returned unchanged.
     *
     * @param string $filename The model file name.
     * @return string The base name without the model extension.
     */
    protected static function model_basename(string $filename): string {
        return preg_replace('/\.(glb|fbx|zip)$/i', '', $filename);
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
