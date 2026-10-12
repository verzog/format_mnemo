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
 * Deleting uploaded models.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Deleting uploaded models from the asset viewer.
 *
 * Deleting a model removes every upload of it in its file area (its .glb,
 * .fbx or .zip, and its "-lite" copy), the unpacked contents of any .zip no
 * other upload shares, and its model settings. A bundled model with the same
 * name is then used again.
 */
class model_store {
    /**
     * The uploaded files that make up one model in a file area: the model
     * itself and its lite copy, in any model format.
     *
     * @param string $filearea The upload file area (assetpack, vehicleassets or buildingassets).
     * @param string $name The model base name (not a lite copy's).
     * @return \stored_file[] The files, keyed by file name; empty for an unknown area.
     */
    public static function files(string $filearea, string $name): array {
        if (!in_array($filearea, model_variants::AREAS, true) || $name === '' || model_variants::is_lite($name)) {
            return [];
        }
        $files = get_file_storage()->get_area_files(
            \context_system::instance()->id,
            'format_mnemo',
            $filearea,
            0,
            'filename',
            false
        );
        $out = [];
        foreach ($files as $file) {
            $base = preg_replace('/\.(glb|fbx|zip)$/i', '', $file->get_filename(), 1, $count);
            if ($count && ($base === $name || $base === $name . model_variants::SUFFIX)) {
                $out[$file->get_filename()] = $file;
            }
        }
        return $out;
    }

    /**
     * Delete an uploaded model: its files, the unpacked contents of its .zip
     * bundles, and its model settings. Each deleted file is recorded in the
     * config changes report.
     *
     * @param string $filearea The upload file area.
     * @param string $name The model base name.
     * @return string[] The names of the files deleted (empty when there was nothing to delete).
     */
    public static function delete(string $filearea, string $name): array {
        $files = self::files($filearea, $name);
        if (!$files) {
            return [];
        }
        $fs = get_file_storage();
        $contextid = \context_system::instance()->id;
        $zips = [];
        foreach ($files as $filename => $file) {
            if (strtolower(pathinfo($filename, PATHINFO_EXTENSION)) === 'zip') {
                $zips[] = $file->get_contenthash();
            }
            $file->delete();
            add_to_config_log('modeldeleted', $filearea . '/' . $filename, '', 'format_mnemo');
        }
        // A bundle's unpacked files sit in a folder named for the zip's content
        // hash; remove it unless another upload is the same zip.
        foreach (array_unique($zips) as $hash) {
            if (model_bundle::find_by_hash($hash) === null) {
                $cached = $fs->get_directory_files($contextid, 'format_mnemo', 'modelcache', 0, '/' . $hash . '/', true, true);
                foreach ($cached as $cachedfile) {
                    $cachedfile->delete();
                }
                $dir = $fs->get_file($contextid, 'format_mnemo', 'modelcache', 0, '/' . $hash . '/', '.');
                if ($dir) {
                    $dir->delete();
                }
            }
        }
        model_config::set($name, []);
        return array_keys($files);
    }
}
