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

namespace format_mnemo\local;

use moodle_url;

/**
 * Multi-file model bundles: a model uploaded as a single <code>.zip</code> that
 * carries a glTF (<code>.gltf</code> + <code>.bin</code> + textures), a binary
 * glTF (<code>.glb</code>) or an FBX together with its external resources.
 *
 * A bundle is served by extracting it (lazily, on first request) into the
 * <code>modelcache</code> file area under a folder named for the zip's content
 * hash, then serving its files there. The entry model file inside the zip is
 * loaded by the client, and its relative references (buffers, textures) resolve
 * to the sibling files extracted alongside it.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class model_bundle {
    /** @var string[] Model entry extensions inside a bundle, in load preference order. */
    const ENTRY_EXTS = ['gltf', 'glb', 'fbx'];

    /** @var string[] The model upload file areas a bundle may be uploaded into. */
    const AREAS = ['assetpack', 'vehicleassets', 'buildingassets'];

    /** @var int Refuse to extract a bundle with more than this many entries. */
    const MAX_ENTRIES = 500;

    /** @var int Refuse to extract a bundle whose contents exceed this many bytes. */
    const MAX_BYTES = 209715200;

    /**
     * The internal path of the model entry file inside a bundle zip, or null
     * when the zip holds no recognised model file. The entry is chosen as: the
     * most-preferred extension present (glTF, then GLB, then FBX), then the
     * shallowest one, then the one whose name matches the zip's base name, then
     * the first alphabetically. This keeps the choice stable and predictable.
     *
     * @param \stored_file $zip The uploaded .zip stored file.
     * @return string|null The entry's path within the archive, or null.
     */
    public static function entry_path(\stored_file $zip): ?string {
        $packer = get_file_packer('application/zip');
        $files = $zip->list_files($packer);
        if (!is_array($files)) {
            return null;
        }
        $zipbase = strtolower(pathinfo($zip->get_filename(), PATHINFO_FILENAME));
        $candidates = [];
        foreach ($files as $file) {
            if (!empty($file->is_directory)) {
                continue;
            }
            $path = $file->pathname;
            if (!preg_match('/\.(gltf|glb|fbx)$/i', $path, $m)) {
                continue;
            }
            $ext = strtolower($m[1]);
            $candidates[] = [
                'path' => $path,
                'pref' => array_search($ext, self::ENTRY_EXTS, true),
                'depth' => substr_count($path, '/'),
                'namematch' => (strtolower(pathinfo($path, PATHINFO_FILENAME)) === $zipbase) ? 0 : 1,
            ];
        }
        if (empty($candidates)) {
            return null;
        }
        usort($candidates, function ($a, $b) {
            return [$a['pref'], $a['depth'], $a['namematch'], $a['path']]
                <=> [$b['pref'], $b['depth'], $b['namematch'], $b['path']];
        });
        return $candidates[0]['path'];
    }

    /**
     * The absolute pluginfile URL of a bundle's entry model file (served from the
     * extracted modelcache area), or null when the zip holds no model file. The
     * URL is not fetched here and the zip is not extracted; extraction happens
     * lazily when the URL is first requested (see extract_by_hash()).
     *
     * @param \stored_file $zip The uploaded .zip stored file.
     * @return string|null
     */
    public static function entry_url(\stored_file $zip): ?string {
        $entry = self::entry_path($zip);
        if ($entry === null) {
            return null;
        }
        $hash = $zip->get_contenthash();
        $full = $hash . '/' . $entry;
        $filename = basename($full);
        $dir = ltrim(dirname($full), '.');
        $filepath = '/' . ($dir === '' ? '' : $dir . '/');
        return moodle_url::make_pluginfile_url(
            \context_system::instance()->id,
            'format_mnemo',
            'modelcache',
            0,
            $filepath,
            $filename
        )->out(false);
    }

    /**
     * Find the uploaded bundle zip with the given content hash, across the model
     * upload areas. Used by the pluginfile handler to locate the source zip for
     * an extracted-content request.
     *
     * @param string $hash A 40-character SHA-1 content hash.
     * @return \stored_file|null
     */
    public static function find_by_hash(string $hash): ?\stored_file {
        if (!preg_match('/^[0-9a-f]{40}$/', $hash)) {
            return null;
        }
        $fs = get_file_storage();
        $contextid = \context_system::instance()->id;
        foreach (self::AREAS as $area) {
            foreach ($fs->get_area_files($contextid, 'format_mnemo', $area, 0, 'filename', false) as $file) {
                if (
                    strtolower(pathinfo($file->get_filename(), PATHINFO_EXTENSION)) === 'zip'
                        && $file->get_contenthash() === $hash
                ) {
                    return $file;
                }
            }
        }
        return null;
    }

    /**
     * Extract the bundle with the given content hash into the modelcache area
     * (under /<hash>/), unless it is already extracted. Bounded by MAX_ENTRIES
     * and MAX_BYTES so a malformed or oversized archive cannot exhaust storage.
     *
     * @param string $hash A 40-character SHA-1 content hash.
     * @return bool True if the bundle's files are present after the call.
     */
    public static function extract_by_hash(string $hash): bool {
        $zip = self::find_by_hash($hash);
        if ($zip === null) {
            return false;
        }
        $fs = get_file_storage();
        $contextid = \context_system::instance()->id;
        // Already extracted? (any file present under /<hash>/).
        if ($fs->get_directory_files($contextid, 'format_mnemo', 'modelcache', 0, '/' . $hash . '/', true, false)) {
            return true;
        }
        $packer = get_file_packer('application/zip');
        $files = $zip->list_files($packer);
        if (!is_array($files)) {
            return false;
        }
        $count = 0;
        $bytes = 0;
        foreach ($files as $file) {
            if (!empty($file->is_directory)) {
                continue;
            }
            $count++;
            $bytes += (int)($file->size ?? 0);
            if ($count > self::MAX_ENTRIES || $bytes > self::MAX_BYTES) {
                debugging('format_mnemo: model bundle too large to extract (' . $hash . ')', DEBUG_NORMAL);
                return false;
            }
        }
        // The packer sanitises entry paths into the file area, so a crafted
        // "../" path cannot escape the modelcache folder (no zip-slip).
        $result = $zip->extract_to_storage(
            $packer,
            $contextid,
            'format_mnemo',
            'modelcache',
            0,
            '/' . $hash . '/'
        );
        return $result !== false && $result !== null;
    }
}
