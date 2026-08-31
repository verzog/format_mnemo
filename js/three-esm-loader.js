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
// Native ES module loader for Three.js.
//
// This file is deliberately NOT placed under amd/src: Moodle's JS build
// (rollup) rewrites a literal `import()` into a RequireJS call, which cannot
// load a real ES module such as three.module.min.js. Kept here as a plain,
// unbuilt module, the browser executes its dynamic import() natively.
//
// It is loaded by amd/src/vr.js as `<script type="module"
// src=".../js/three-esm-loader.js?src=<encoded three.js url>">` and hands the
// imported module namespace back through a window CustomEvent.
//
// @package    format_mnemo
// @copyright  2026 Vernon Spain
// @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
//

const src = new URL(import.meta.url).searchParams.get('src');

import(src).then((module) => {
    window.dispatchEvent(new CustomEvent('format_mnemo:three-ready', {detail: module}));
}).catch((error) => {
    window.dispatchEvent(new CustomEvent('format_mnemo:three-error', {detail: error}));
});
