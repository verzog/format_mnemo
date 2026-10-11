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
 * Size budgets for uploaded 3D models, and checks against them.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Size budgets for uploaded 3D models, and checks against them.
 *
 * Two tiers. A full model is what desktops on a fast connection load; a lite
 * copy (see {@see model_variants}) is what headsets, phones and slow
 * connections load, so it has the tighter, headset-safe budget. A model with no
 * lite copy is loaded everywhere, so it is also flagged when it is over the
 * lite budget. Going over is a warning, never a refusal - the upload still works.
 */
class model_budget {
    /** @var array[] Tier => category => [maximum triangles, maximum file size in bytes]. */
    const BUDGETS = [
        'full' => [
            'prop' => [10000, 3145728],
            'vehicle' => [15000, 3145728],
            'building' => [100000, 10485760],
        ],
        'lite' => [
            'prop' => [3000, 1048576],
            'vehicle' => [5000, 1048576],
            'building' => [20000, 3145728],
        ],
    ];

    /** @var string[] Upload file area => the model category it holds. */
    const AREAS = [
        'assetpack' => 'prop',
        'vehicleassets' => 'vehicle',
        'buildingassets' => 'building',
    ];

    /**
     * The budget category of a model uploaded to a file area. The prop pack
     * may also replace the flying car ("av"), which gets the vehicle budget.
     *
     * @param string $filearea The upload file area.
     * @param string $name The model base name (a lite copy's full model name).
     * @return string|null The category, or null for an unknown area.
     */
    public static function category(string $filearea, string $name): ?string {
        if ($filearea === 'assetpack' && $name === 'av') {
            return 'vehicle';
        }
        return self::AREAS[$filearea] ?? null;
    }

    /**
     * Count the triangles a glTF document draws, from its JSON alone.
     *
     * Uses each primitive's index (or vertex) count, so it works for Draco and
     * meshopt compressed models without decoding them. Only the nodes of the
     * scene the loader shows are counted (a mesh used by several of them once per
     * node, and GPU-instanced nodes once per instance), so alternate scenes and
     * unused meshes are left out.
     *
     * @param array $gltf The decoded glTF JSON.
     * @return int|null The triangle count, or null if the document has no meshes.
     */
    public static function count_triangles(array $gltf): ?int {
        $meshes = $gltf['meshes'] ?? null;
        $accessors = $gltf['accessors'] ?? [];
        if (!is_array($meshes) || !$meshes || !is_array($accessors)) {
            return null;
        }
        $permesh = [];
        foreach ($meshes as $i => $mesh) {
            $permesh[$i] = 0;
            foreach (($mesh['primitives'] ?? []) as $prim) {
                $acc = $prim['indices'] ?? ($prim['attributes']['POSITION'] ?? null);
                $count = (int)($accessors[$acc]['count'] ?? 0);
                $mode = (int)($prim['mode'] ?? 4);
                if ($mode === 4) {
                    $permesh[$i] += intdiv($count, 3);
                } else if ($mode === 5 || $mode === 6) {
                    $permesh[$i] += max(0, $count - 2);
                }
            }
        }
        $nodes = is_array($gltf['nodes'] ?? null) ? $gltf['nodes'] : [];
        $total = 0;
        // Walk the node tree from the scene the loader shows. A visited set
        // guards against a malformed file whose nodes form a loop.
        $stack = self::root_nodes($gltf, $nodes);
        $visited = [];
        while ($stack) {
            $index = array_pop($stack);
            if (isset($visited[$index]) || !is_array($nodes[$index] ?? null)) {
                continue;
            }
            $visited[$index] = true;
            $node = $nodes[$index];
            foreach (($node['children'] ?? []) as $child) {
                $stack[] = $child;
            }
            if (!isset($node['mesh']) || !isset($permesh[$node['mesh']])) {
                continue;
            }
            $copies = 1;
            $inst = $node['extensions']['EXT_mesh_gpu_instancing']['attributes'] ?? null;
            if (is_array($inst) && $inst) {
                $acc = reset($inst);
                $copies = max(1, (int)($accessors[$acc]['count'] ?? 1));
            }
            $total += $permesh[$node['mesh']] * $copies;
        }
        return $total;
    }

    /**
     * The root nodes of the scene a glTF loader shows: the document's default
     * scene (or its first), else every node that is no other node's child.
     *
     * @param array $gltf The decoded glTF JSON.
     * @param array $nodes The document's nodes.
     * @return int[] The root node indexes.
     */
    protected static function root_nodes(array $gltf, array $nodes): array {
        $scenes = $gltf['scenes'] ?? null;
        if (is_array($scenes) && $scenes) {
            $scene = $scenes[$gltf['scene'] ?? 0] ?? reset($scenes);
            return array_values(array_filter((array)($scene['nodes'] ?? []), 'is_int'));
        }
        $children = [];
        foreach ($nodes as $node) {
            foreach ((array)($node['children'] ?? []) as $child) {
                $children[$child] = true;
            }
        }
        return array_values(array_diff(array_keys($nodes), array_keys($children)));
    }

    /**
     * The budget warnings for one model: one string per limit it is over.
     *
     * @param string $category The model category (prop, vehicle or building).
     * @param int|null $filesize The file size in bytes, or null if unknown.
     * @param int|null $triangles The triangle count, or null if unknown.
     * @param string $tier The budget tier: full, or lite for a lite copy.
     * @return string[] The warnings (empty when within budget or no budget applies).
     */
    public static function warnings(string $category, ?int $filesize, ?int $triangles, string $tier = 'full'): array {
        if (!isset(self::BUDGETS[$tier][$category])) {
            return [];
        }
        [$maxtris, $maxbytes] = self::BUDGETS[$tier][$category];
        $out = [];
        if ($triangles !== null && $triangles > $maxtris) {
            $out[] = get_string('budget_triangles', 'format_mnemo', (object)[
                'count' => number_format($triangles),
                'max' => number_format($maxtris),
            ]);
        }
        if ($filesize !== null && $filesize > $maxbytes) {
            $out[] = get_string('budget_filesize', 'format_mnemo', (object)[
                'size' => display_size($filesize),
                'max' => display_size($maxbytes),
            ]);
        }
        return $out;
    }

    /**
     * All the warnings for a full model: its own full-budget warnings, plus a
     * lite-copy suggestion when it has no lite copy and is over the lite budget
     * (so headsets, phones and slow connections would load it as it is).
     *
     * @param string $category The model category (prop, vehicle or building).
     * @param string $name The model base name.
     * @param int|null $filesize The file size in bytes, or null if unknown.
     * @param int|null $triangles The triangle count, or null if unknown.
     * @param bool $haslite Whether a lite copy is uploaded for it.
     * @return string[] The warnings.
     */
    public static function model_warnings(
        string $category,
        string $name,
        ?int $filesize,
        ?int $triangles,
        bool $haslite
    ): array {
        $out = self::warnings($category, $filesize, $triangles);
        $overlite = (bool)self::warnings($category, $filesize, $triangles, 'lite');
        if (!$haslite && $overlite) {
            [$maxtris, $maxbytes] = self::BUDGETS['lite'][$category];
            $out[] = get_string('budget_nolite', 'format_mnemo', (object)[
                'name' => $name . model_variants::SUFFIX . '.glb',
                'max' => number_format($maxtris),
                'size' => display_size($maxbytes),
            ]);
        }
        return $out;
    }

    /**
     * The triangle count of a stored model file, when it is a .glb.
     *
     * Reads only the GLB header and JSON chunk. Other formats (.fbx, a .zip
     * bundle) and unreadable files give null, so only their size is checked.
     *
     * @param \stored_file $file The stored model file.
     * @return int|null The triangle count, or null if it cannot be read.
     */
    public static function file_triangles(\stored_file $file): ?int {
        if (strtolower(pathinfo($file->get_filename(), PATHINFO_EXTENSION)) !== 'glb') {
            return null;
        }
        $fh = $file->get_content_file_handle();
        if ($fh === false) {
            return null;
        }
        $head = (string)fread($fh, 20);
        $gltf = null;
        if (strlen($head) === 20 && substr($head, 0, 4) === 'glTF') {
            $chunk = unpack('Vlength/Vtype', substr($head, 12, 8));
            // The first chunk must be JSON; cap its size so a bad header cannot
            // make us read a huge file into memory.
            if ($chunk && $chunk['type'] === 0x4E4F534A && $chunk['length'] > 0 && $chunk['length'] <= 16777216) {
                $gltf = json_decode((string)fread($fh, $chunk['length']), true);
            }
        }
        fclose($fh);
        return is_array($gltf) ? self::count_triangles($gltf) : null;
    }

    /**
     * Queue a warning for each over-budget model among some uploaded files.
     *
     * Called by the model upload settings after a save, with the files that
     * save added or replaced; the warnings show on the next page. A lite copy
     * is checked against the lite budget, and a full model against the full
     * one (and the lite one too when it has no lite copy).
     *
     * @param string $filearea The upload file area the files are in.
     * @param \stored_file[] $files The uploaded files to check.
     */
    public static function notify_uploads(string $filearea, array $files): void {
        if (!isset(self::AREAS[$filearea])) {
            return;
        }
        $lites = model_variants::lite_files($filearea);
        foreach ($files as $file) {
            $name = preg_replace('/\.(glb|fbx|zip)$/i', '', $file->get_filename());
            $size = (int)$file->get_filesize();
            $tris = self::file_triangles($file);
            if (model_variants::is_lite($name)) {
                $category = self::category($filearea, model_variants::full_name($name));
                $warnings = self::warnings($category, $size, $tris, 'lite');
            } else {
                $category = self::category($filearea, $name);
                $warnings = self::model_warnings($category, $name, $size, $tris, isset($lites[$name]));
            }
            if (!$warnings) {
                continue;
            }
            \core\notification::warning(get_string('budget_upload', 'format_mnemo', (object)[
                'name' => s($file->get_filename()),
                'problems' => implode(' ', $warnings),
            ]));
        }
    }
}
