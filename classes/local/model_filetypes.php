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
 * Registers the 3D model file types the plugin's uploaders accept.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

use core_filetypes;

/**
 * Registers the 3D model file types the plugin's uploaders accept.
 *
 * Moodle core does not know the .glb or .fbx extensions, and a file manager
 * silently drops any accepted type it does not know, so those uploads are
 * refused with "File type not accepted". Registering them as site file types
 * (Site administration > Server > File types) makes the uploaders accept them.
 */
class model_filetypes {
    /** @var array[] Extension => [MIME type, description] for each model type. */
    const TYPES = [
        'fbx' => ['application/octet-stream', 'Autodesk FBX 3D model'],
        'glb' => ['model/gltf-binary', 'Binary glTF (Self-contained 3D model)'],
    ];

    /**
     * Register each model file type the site does not already know.
     *
     * An existing entry (core, or one an administrator added by hand) is left
     * untouched, so this is safe to run on every install and upgrade.
     *
     * @return string[] The extensions newly registered.
     */
    public static function register(): array {
        $added = [];
        foreach (self::TYPES as $extension => [$mimetype, $description]) {
            if (array_key_exists($extension, get_mimetypes_array())) {
                continue;
            }
            core_filetypes::add_type($extension, $mimetype, 'unknown', [], '', $description);
            $added[] = $extension;
        }
        return $added;
    }
}
