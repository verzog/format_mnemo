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
 * Which files the format's public (system context) file areas may serve.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * The site-wide asset areas and the unpacked model bundles are served without
 * a login check, from this site's own address. So that an uploaded file (or a
 * file inside an uploaded .zip) can never be served as a web page or script on
 * the site, only the file types the 3D scene actually loads are served: models
 * and their buffers, images, compressed textures and webfonts. Anything else
 * (for example an .html, .js or .xml file inside a bundle) is refused.
 */
class public_files {
    /** @var string[] Model files and their resources, as loaded from an unpacked bundle. */
    const MODEL_EXTS = ['gltf', 'glb', 'fbx', 'bin'];

    /** @var string[] Image and compressed-texture files. SVG is safe here: Moodle forces it to download. */
    const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'jpe', 'gif', 'webp', 'avif', 'bmp', 'svg', 'ktx2', 'tga'];

    /** @var string[] Webfont files (the neon sign font). */
    const FONT_EXTS = ['woff2', 'woff', 'ttf', 'otf'];

    /**
     * Whether a file may be served from one of the format's public areas.
     *
     * @param string $filearea The file area ('modelcache' or a site asset area).
     * @param string $filename The file name.
     * @return bool True when the file's type may be served.
     */
    public static function allowed(string $filearea, string $filename): bool {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        if ($ext === '') {
            return false;
        }
        $exts = array_merge(self::MODEL_EXTS, self::IMAGE_EXTS);
        if ($filearea !== 'modelcache') {
            // The uploaders also accept a .zip bundle and webfonts.
            $exts = array_merge($exts, self::FONT_EXTS, ['zip']);
        }
        return in_array($ext, $exts, true);
    }
}
