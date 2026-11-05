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
// imported from the explicit `addons` base URL (the plugin's thirdparty/jsm/).
// The addon modules are vendored to import three by a relative path to the same
// bundled three.module.min.js, so NO page-level import map is needed - this
// avoids the "Multiple import maps are not allowed" failure on Moodle pages
// that already carry one, which used to drop compressed (Draco/meshopt/KTX2)
// models to the built-in uncompressed-only parser. If the addons still fail to
// load, the event carries three alone and the client falls back to that parser.
//
// @package    format_mnemo
// @copyright  2026 Vernon Spain
// @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
//

const params = new URL(import.meta.url).searchParams;

// Import only from this site (the same origin as this loader). A loader URL
// such as ?src=https://elsewhere/x.js must not pull a foreign script onto the
// page, which would let it get around a same-site Content Security Policy.
const sameSite = (url) => {
    if (!url) {
        return null;
    }
    try {
        const resolved = new URL(url, import.meta.url);
        return resolved.origin === new URL(import.meta.url).origin ? resolved.href : null;
    } catch (e) {
        return null;
    }
};
const src = sameSite(params.get('src'));
const addonsBase = sameSite(params.get('addons'));

/**
 * Try to load the addon glTF loader stack from the explicit addons base URL
 * (no import map needed). Resolves to an object of the addon classes, or an
 * empty object if they are unavailable.
 *
 * @returns {Promise<Object>}
 */
async function loadAddons() {
    if (!addonsBase) {
        return {};
    }
    let out = {};
    try {
        const [gltf, draco, ktx2, meshopt] = await Promise.all([
            import(addonsBase + 'loaders/GLTFLoader.js'),
            import(addonsBase + 'loaders/DRACOLoader.js'),
            import(addonsBase + 'loaders/KTX2Loader.js'),
            import(addonsBase + 'libs/meshopt_decoder.module.js'),
        ]);
        out = {
            GLTFLoader: gltf.GLTFLoader,
            DRACOLoader: draco.DRACOLoader,
            KTX2Loader: ktx2.KTX2Loader,
            MeshoptDecoder: meshopt.MeshoptDecoder,
        };
    } catch (e) {
        out = {};
    }
    // FBX is optional and loaded independently, so a failure here (or the file
    // simply not being vendored) never drops the glTF stack above.
    try {
        const fbx = await import(addonsBase + 'loaders/FBXLoader.js');
        out.FBXLoader = fbx.FBXLoader;
    } catch (e) {
        // No FBX support on this page; glTF still works.
    }
    return out;
}

(src ? import(src) : Promise.reject(new Error('format_mnemo: Three.js must load from this site'))).then(async(three) => {
    const addons = await loadAddons();
    const detail = Object.assign({THREE: three}, addons);
    window.dispatchEvent(new CustomEvent('format_mnemo:three-ready', {detail: detail}));
}).catch((error) => {
    window.dispatchEvent(new CustomEvent('format_mnemo:three-error', {detail: error}));
});
