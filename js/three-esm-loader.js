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

//
// Native ES module loader for Three.js and its glTF loader stack.
//
// This file is deliberately NOT placed under amd/src: Moodle's JS build
// (rollup) rewrites a literal `import()` into a RequireJS call, which cannot
// load a real ES module such as three.module.min.js. Kept here as a plain,
// unbuilt module, the browser executes its dynamic import() natively.
//
// It is loaded by amd/src/vr.js as `<script type="module"
// src=".../js/three-esm-loader.js?src=<encoded three.js url>">` and hands the
// imported module namespace(s) back through a window CustomEvent.
//
// Three itself is imported from the explicit `src` URL, so it always loads.
// The optional glTF loader stack (GLTFLoader + Draco/KTX2/meshopt decoders) is
// imported through the `three/addons/` bare specifier, resolved by an import
// map that amd/src/vr.js injects; the addons' own `import ... from 'three'`
// resolves through the same map to the same three instance. If the import map
// is absent (e.g. a strict CSP that blocks it) or the addons fail to load, the
// event still carries three alone and the client falls back to its built-in
// glTF parser.
//
// @package    format_mnemo
// @copyright  2026 Vernon Spain
// @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
//

const src = new URL(import.meta.url).searchParams.get('src');

/**
 * Try to load the addon glTF loader stack. Resolves to an object of the addon
 * classes, or an empty object if they are unavailable.
 *
 * @returns {Promise<Object>}
 */
async function loadAddons() {
    try {
        const [gltf, draco, ktx2, meshopt] = await Promise.all([
            import('three/addons/loaders/GLTFLoader.js'),
            import('three/addons/loaders/DRACOLoader.js'),
            import('three/addons/loaders/KTX2Loader.js'),
            import('three/addons/libs/meshopt_decoder.module.js'),
        ]);
        return {
            GLTFLoader: gltf.GLTFLoader,
            DRACOLoader: draco.DRACOLoader,
            KTX2Loader: ktx2.KTX2Loader,
            MeshoptDecoder: meshopt.MeshoptDecoder,
        };
    } catch (e) {
        return {};
    }
}

import(src).then(async(three) => {
    const addons = await loadAddons();
    const detail = Object.assign({THREE: three}, addons);
    window.dispatchEvent(new CustomEvent('format_mnemo:three-ready', {detail: detail}));
}).catch((error) => {
    window.dispatchEvent(new CustomEvent('format_mnemo:three-error', {detail: error}));
});
