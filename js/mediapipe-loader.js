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
// Native ES module loader for MediaPipe Tasks Vision (hand/face landmarkers),
// used by the optional pose-based camera navigation.
//
// Like three-esm-loader.js, this file is deliberately NOT under amd/src: Moodle's
// JS build (rollup) rewrites a literal import() into a RequireJS call, which
// cannot load a real ES module such as the vendored vision_bundle.mjs. Kept here
// as a plain, unbuilt module, the browser runs its dynamic import() natively.
// The vision bundle is vendored with a .js extension (not .mjs) so servers that
// do not map .mjs to a JavaScript MIME type still serve it as a module.
//
// It is loaded by amd/src/vr.js as `<script type="module"
// src=".../js/mediapipe-loader.js?src=<encoded vision_bundle.js url>">` and hands
// the imported classes back through a window CustomEvent. The WASM runtime and
// the model files are loaded later by the client from the same vendored,
// same-origin thirdparty/mediapipe/ directory (see CameraNav.initPose), so no
// external host is contacted.
//
// @package    format_mnemo
// @copyright  2026 Vernon Spain
// @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
//

const params = new URL(import.meta.url).searchParams;
const src = params.get('src');

import(src).then((vision) => {
    window.dispatchEvent(new CustomEvent('format_mnemo:mediapipe-ready', {detail: {
        FilesetResolver: vision.FilesetResolver,
        HandLandmarker: vision.HandLandmarker,
        FaceLandmarker: vision.FaceLandmarker,
    }}));
}).catch((error) => {
    window.dispatchEvent(new CustomEvent('format_mnemo:mediapipe-error', {detail: error}));
});
