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
 * Lighter "-lite" copies of uploaded models.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Lighter "-lite" copies of uploaded models.
 *
 * An admin can upload a lighter copy of any model next to it, named with a
 * "-lite" suffix (building-quiz-lite.glb beside building-quiz.glb). Headsets,
 * phones and slow connections load the lite copy; everyone else the full one.
 * A lite copy is never a model in its own right, so it is left out of every
 * model list and only reached through its full model's name.
 */
class model_variants {
    /** @var string The base-name suffix that marks a lite copy. */
    const SUFFIX = '-lite';

    /** @var string[] The model upload file areas. */
    const AREAS = ['assetpack', 'vehicleassets', 'buildingassets'];

    /**
     * Whether a model base name (no extension) is a lite copy.
     *
     * @param string $basename The model base name.
     * @return bool True for a lite copy.
     */
    public static function is_lite(string $basename): bool {
        return strlen($basename) > strlen(self::SUFFIX) && str_ends_with($basename, self::SUFFIX);
    }

    /**
     * Whether a model file name is a lite copy.
     *
     * @param string $filename The file name, with its extension.
     * @return bool True for a lite copy.
     */
    public static function is_lite_file(string $filename): bool {
        return self::is_lite(preg_replace('/\.(glb|fbx|zip)$/i', '', $filename));
    }

    /**
     * The full model's base name for a lite copy's base name.
     *
     * @param string $basename The lite copy's base name.
     * @return string The full model's base name.
     */
    public static function full_name(string $basename): string {
        return substr($basename, 0, -strlen(self::SUFFIX));
    }

    /**
     * The lite copies uploaded in one file area, keyed by full model base name.
     *
     * @param string $filearea The upload file area.
     * @return \stored_file[] Full model base name => the lite copy's file.
     */
    public static function lite_files(string $filearea): array {
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
            if (preg_match('/^(.+)\.(glb|fbx|zip)$/i', $file->get_filename(), $m) && self::is_lite($m[1])) {
                $out[self::full_name($m[1])] = $out[self::full_name($m[1])] ?? $file;
            }
        }
        return $out;
    }

    /**
     * The URL of every uploaded lite copy, keyed by its full model's base name,
     * for the 3D view to load in place of the full model where it should.
     *
     * @return string[] Full model base name => the lite copy's URL.
     */
    public static function lite_urls(): array {
        $out = [];
        foreach (self::AREAS as $filearea) {
            foreach (self::lite_files($filearea) as $name => $file) {
                if (strtolower(pathinfo($file->get_filename(), PATHINFO_EXTENSION)) === 'zip') {
                    $url = model_bundle::entry_url($file);
                } else {
                    $url = \moodle_url::make_pluginfile_url(
                        \context_system::instance()->id,
                        'format_mnemo',
                        $filearea,
                        (int)$file->get_timemodified(),
                        '/',
                        $file->get_filename()
                    )->out(false);
                }
                if ($url !== null && !isset($out[$name])) {
                    $out[$name] = $url;
                }
            }
        }
        return $out;
    }
}
