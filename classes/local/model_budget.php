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
 * The budgets are headset-safe limits (Quest-class standalone headsets as well
 * as desktop browsers), matching the model spec sheet: the largest model in
 * each category, so a model over them will slow loading or rendering. Going
 * over is a warning, never a refusal - the upload still works.
 */
class model_budget {
    /** @var array[] Category => [maximum triangles, maximum file size in bytes]. */
    const BUDGETS = [
        'prop' => [3000, 1048576],
        'vehicle' => [5000, 1048576],
        'building' => [20000, 3145728],
    ];

    /** @var string[] Upload file area => the model category it holds. */
    const AREAS = [
        'assetpack' => 'prop',
        'vehicleassets' => 'vehicle',
        'buildingassets' => 'building',
    ];

    /**
     * Count the triangles a glTF document draws, from its JSON alone.
     *
     * Uses each primitive's index (or vertex) count, so it works for Draco and
     * meshopt compressed models without decoding them. A mesh used by several
     * nodes is counted once per node, and GPU-instanced nodes once per instance.
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
        $uses = [];
        foreach (($gltf['nodes'] ?? []) as $node) {
            if (!isset($node['mesh']) || !isset($permesh[$node['mesh']])) {
                continue;
            }
            $copies = 1;
            $inst = $node['extensions']['EXT_mesh_gpu_instancing']['attributes'] ?? null;
            if (is_array($inst) && $inst) {
                $acc = reset($inst);
                $copies = max(1, (int)($accessors[$acc]['count'] ?? 1));
            }
            $uses[$node['mesh']] = ($uses[$node['mesh']] ?? 0) + $copies;
        }
        $total = 0;
        foreach ($permesh as $i => $tris) {
            // A mesh no node uses is still counted once, as a loader may show it.
            $total += $tris * ($uses[$i] ?? 1);
        }
        return $total;
    }

    /**
     * The budget warnings for one model: one string per limit it is over.
     *
     * @param string $category The model category (prop, vehicle or building).
     * @param int|null $filesize The file size in bytes, or null if unknown.
     * @param int|null $triangles The triangle count, or null if unknown.
     * @return string[] The warnings (empty when within budget or no budget applies).
     */
    public static function warnings(string $category, ?int $filesize, ?int $triangles): array {
        if (!isset(self::BUDGETS[$category])) {
            return [];
        }
        [$maxtris, $maxbytes] = self::BUDGETS[$category];
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
     * save added or replaced; the warnings show on the next page.
     *
     * @param string $filearea The upload file area the files are in.
     * @param \stored_file[] $files The uploaded files to check.
     */
    public static function notify_uploads(string $filearea, array $files): void {
        $category = self::AREAS[$filearea] ?? null;
        if ($category === null) {
            return;
        }
        foreach ($files as $file) {
            $warnings = self::warnings($category, (int)$file->get_filesize(), self::file_triangles($file));
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
