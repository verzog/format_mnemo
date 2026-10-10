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
     * untouched, so this is safe to run on every install and upgrade. When
     * config.php fixes the custom file types, Moodle refuses to change them, so
     * nothing is registered and the administrator must add the types there.
     * The extensions added are remembered so uninstall() removes only those.
     *
     * @return string[] The extensions newly registered.
     */
    public static function register(): array {
        global $CFG;
        if (array_key_exists('customfiletypes', $CFG->config_php_settings)) {
            return [];
        }
        $added = [];
        foreach (self::TYPES as $extension => [$mimetype, $description]) {
            if (array_key_exists($extension, get_mimetypes_array())) {
                continue;
            }
            core_filetypes::add_type($extension, $mimetype, 'unknown', [], '', $description);
            $added[] = $extension;
        }
        if ($added) {
            $owned = array_merge(self::owned(), $added);
            set_config('ownedfiletypes', implode(',', array_unique($owned)), 'format_mnemo');
        }
        return $added;
    }

    /**
     * Remove the file types this plugin registered, for the uninstall hook.
     *
     * Only a type still holding the custom entry this plugin added (same MIME
     * type) is removed, so a type an administrator has since redefined stays.
     *
     * @return string[] The extensions removed.
     */
    public static function uninstall(): array {
        global $CFG;
        $removed = [];
        if (array_key_exists('customfiletypes', $CFG->config_php_settings)) {
            return $removed;
        }
        $mimetypes = get_mimetypes_array();
        foreach (self::owned() as $extension) {
            $entry = $mimetypes[$extension] ?? null;
            if (
                $entry === null || empty($entry['custom']) || !isset(self::TYPES[$extension]) ||
                $entry['type'] !== self::TYPES[$extension][0]
            ) {
                continue;
            }
            core_filetypes::delete_type($extension);
            $removed[] = $extension;
        }
        unset_config('ownedfiletypes', 'format_mnemo');
        return $removed;
    }

    /**
     * The extensions this plugin has registered, as recorded by register().
     *
     * @return string[] The owned extensions.
     */
    protected static function owned(): array {
        $value = (string)get_config('format_mnemo', 'ownedfiletypes');
        return $value === '' ? [] : explode(',', $value);
    }
}
