// WebXR gesture smoke test.
//
// Opens tests/webxr/harness.html in headless Chromium and drives the real
// GestureManager (with the real bundled Three.js) through scripted controller
// and hand input, asserting the input->action mapping. This verifies the
// gesture logic without a headset. Run with: npm test (in tests/webxr).
//
// It exits non-zero if any scenario fails, so it can gate CI.

import {chromium} from 'playwright';
import {fileURLToPath} from 'url';
import {dirname, join, extname, normalize} from 'path';
import {createServer} from 'http';
import {readFile} from 'fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = normalize(join(here, '..', '..'));
// Use Playwright's own Chromium by default (as in CI). Only override the
// executable when PW_CHROMIUM points at a pre-installed browser.
const exe = process.env.PW_CHROMIUM || null;

// ES-module imports are blocked from a file:// origin, so serve the repo over
// http. Only static files under the repo root are served.
const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.map': 'application/json', '.json': 'application/json'
};
const server = createServer(async (req, res) => {
    try {
        const path = normalize(join(repoRoot, decodeURIComponent(req.url.split('?')[0])));
        if (!path.startsWith(repoRoot)) {
            res.writeHead(403);
            res.end();
            return;
        }
        const body = await readFile(path);
        res.writeHead(200, {'Content-Type': MIME[extname(path)] || 'application/octet-stream'});
        res.end(body);
    } catch (e) {
        res.writeHead(404);
        res.end();
    }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const harness = `http://127.0.0.1:${port}/tests/webxr/harness.html`;

// Each scenario runs entirely in the page (Three.js objects are not
// serialisable) and returns {pass, detail}.
const scenarios = [
    {
        name: 'deadzone: small stick is ignored',
        fn: () => {
            const T = window.__mnemoTest;
            const c = T.make();
            c.controllers[0].userData.inputSource.gamepad.axes = [0, 0, 0.1, 0.1];
            T.frame(c, 0.1);
            const s = T.state(c);
            const pass = Math.abs(s.x) < 1e-6 && Math.abs(s.z) < 1e-6;
            return {pass, detail: `x=${s.x.toFixed(4)} z=${s.z.toFixed(4)}`};
        }
    },
    {
        name: 'glide: left stick forward moves -Z',
        fn: () => {
            const T = window.__mnemoTest;
            const c = T.make();
            c.controllers[0].userData.inputSource.gamepad.axes = [0, 0, 0, -1];
            T.frame(c, 0.1);
            const s = T.state(c);
            // glideSpeed 4.5 * 0.1 = 0.45 along -Z.
            const pass = Math.abs(s.z + 0.45) < 0.02 && Math.abs(s.x) < 0.02;
            return {pass, detail: `z=${s.z.toFixed(4)} (want -0.45) x=${s.x.toFixed(4)}`};
        }
    },
    {
        name: 'strafe: left stick right moves +X',
        fn: () => {
            const T = window.__mnemoTest;
            const c = T.make();
            c.controllers[0].userData.inputSource.gamepad.axes = [0, 0, 1, 0];
            T.frame(c, 0.1);
            const s = T.state(c);
            const pass = Math.abs(s.x - 0.45) < 0.02 && Math.abs(s.z) < 0.02;
            return {pass, detail: `x=${s.x.toFixed(4)} (want 0.45) z=${s.z.toFixed(4)}`};
        }
    },
    {
        name: 'snap turn: one flick = one 30 step, debounced',
        fn: () => {
            const T = window.__mnemoTest;
            const snap = Math.PI / 6;
            const c = T.make();
            c.controllers[1].userData.inputSource.gamepad.axes = [0, 0, 1, 0];
            T.frame(c, 0.016);
            const r1 = T.state(c).rotY;
            T.frame(c, 0.016);
            const r2 = T.state(c).rotY;
            c.controllers[1].userData.inputSource.gamepad.axes = [0, 0, 0, 0];
            T.frame(c, 0.016);
            c.controllers[1].userData.inputSource.gamepad.axes = [0, 0, 1, 0];
            T.frame(c, 0.016);
            const r3 = T.state(c).rotY;
            const pass = Math.abs(r1 + snap) < 1e-3 &&
                Math.abs(r2 + snap) < 1e-3 &&
                Math.abs(r3 + 2 * snap) < 1e-3;
            return {pass, detail: `r1=${r1.toFixed(3)} r2=${r2.toFixed(3)} r3=${r3.toFixed(3)}`};
        }
    },
    {
        name: 'brake: open palm stops glide and sets brake',
        fn: () => {
            const T = window.__mnemoTest;
            const J = T.joint;
            const c = T.make();
            c.controllers[0].userData.inputSource.gamepad.axes = [0, 0, 0, -1];
            c.hands[0].joints = {
                'wrist': J(0, 0, 0),
                'index-finger-tip': J(0, 0.2, 0),
                'middle-finger-tip': J(0.02, 0.21, 0),
                'ring-finger-tip': J(0.04, 0.2, 0),
                'pinky-finger-tip': J(0.06, 0.19, 0)
            };
            T.frame(c, 0.1);
            const s = T.state(c);
            const pass = s.brake === true && Math.abs(s.z) < 1e-6;
            return {pass, detail: `brake=${s.brake} z=${s.z.toFixed(4)}`};
        }
    },
    {
        name: 'grab: grip + hand move pulls the rig the opposite way',
        fn: () => {
            const T = window.__mnemoTest;
            const c = T.make();
            const grip = c.controllers[0];
            grip.userData.inputSource.gamepad.buttons[1].pressed = true;
            grip.position.set(0, 0, 0);
            T.frame(c, 0.016); // Anchor, no move.
            grip.position.set(0.2, 0, 0);
            T.frame(c, 0.016); // Pull.
            const s = T.state(c);
            const pass = Math.abs(s.x + 0.2) < 1e-3;
            return {pass, detail: `x=${s.x.toFixed(4)} (want -0.2)`};
        }
    },
    {
        name: 'recenter: both thumbstick clicks return to the avenue mouth',
        fn: () => {
            const T = window.__mnemoTest;
            const c = T.make();
            c.player.position.set(5, 0, -30);
            c.player.rotation.set(0, 1, 0);
            c.controllers[0].userData.inputSource.gamepad.buttons[3].pressed = true;
            c.controllers[1].userData.inputSource.gamepad.buttons[3].pressed = true;
            T.frame(c, 0.016);
            const s = T.state(c);
            const pass = Math.abs(s.x) < 1e-6 && Math.abs(s.z - 12) < 1e-6 &&
                Math.abs(s.rotY) < 1e-6;
            return {pass, detail: `x=${s.x} z=${s.z} rotY=${s.rotY}`};
        }
    },
    {
        name: 'glide: right stick forward also glides (and does not turn)',
        fn: () => {
            const T = window.__mnemoTest;
            const c = T.make();
            c.controllers[1].userData.inputSource.gamepad.axes = [0, 0, 0, -1];
            T.frame(c, 0.1);
            const s = T.state(c);
            const pass = Math.abs(s.z + 0.45) < 0.02 && Math.abs(s.rotY) < 1e-6;
            return {pass, detail: `z=${s.z.toFixed(4)} rotY=${s.rotY}`};
        }
    },
    {
        name: 'grab: adding a second grip re-anchors without a jump',
        fn: () => {
            const T = window.__mnemoTest;
            const c = T.make();
            const L = c.controllers[0];
            const R = c.controllers[1];
            L.userData.inputSource.gamepad.buttons[1].pressed = true;
            L.position.set(0, 0, 0);
            T.frame(c, 0.016); // Anchor with one grip.
            R.userData.inputSource.gamepad.buttons[1].pressed = true;
            R.position.set(2, 0, 0); // Second grip added; neither hand moved L.
            T.frame(c, 0.016);
            const s = T.state(c);
            const pass = Math.abs(s.x) < 1e-6 && Math.abs(s.z) < 1e-6;
            return {pass, detail: `x=${s.x.toFixed(4)} z=${s.z.toFixed(4)} (want ~0)`};
        }
    },
    {
        name: 'brake: a hidden hand is ignored (no stale brake)',
        fn: () => {
            const T = window.__mnemoTest;
            const J = T.joint;
            const c = T.make();
            c.hands[0].visible = false;
            c.hands[0].joints = {
                'wrist': J(0, 0, 0),
                'index-finger-tip': J(0, 0.2, 0),
                'middle-finger-tip': J(0.02, 0.21, 0),
                'ring-finger-tip': J(0.04, 0.2, 0),
                'pinky-finger-tip': J(0.06, 0.19, 0)
            };
            c.controllers[0].userData.inputSource.gamepad.axes = [0, 0, 0, -1];
            T.frame(c, 0.1);
            const s = T.state(c);
            const pass = s.brake === false && Math.abs(s.z + 0.45) < 0.02;
            return {pass, detail: `brake=${s.brake} z=${s.z.toFixed(4)}`};
        }
    },
    {
        name: 'road: a small overstep on foot is clamped back to the corridor',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const fake = {
                flyThreshold: 1.2, captureMargin: 3,
                roads: [{xMin: -5, xMax: 5, zMin: -100, zMax: 12}],
                player: {position: {x: 6, y: 0, z: 0}}
            };
            CS.prototype.constrainToRoad.call(fake);
            const p = fake.player.position;
            const pass = Math.abs(p.x - 5) < 1e-9 && Math.abs(p.z) < 1e-9;
            return {pass, detail: `x=${p.x} z=${p.z} (want x=5)`};
        }
    },
    {
        name: 'road: landing far off-road from flight is not snapped',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const fake = {
                flyThreshold: 1.2, captureMargin: 3,
                roads: [{xMin: -5, xMax: 5, zMin: -100, zMax: 12}],
                player: {position: {x: 200, y: 0, z: 0}}
            };
            CS.prototype.constrainToRoad.call(fake);
            const p = fake.player.position;
            const pass = Math.abs(p.x - 200) < 1e-9;
            return {pass, detail: `x=${p.x} (want 200, no teleport)`};
        }
    },
    {
        name: 'road: while flying, movement is unconstrained',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const fake = {
                flyThreshold: 1.2, captureMargin: 3,
                roads: [{xMin: -5, xMax: 5, zMin: -100, zMax: 12}],
                player: {position: {x: 6, y: 3, z: 0}}
            };
            CS.prototype.constrainToRoad.call(fake);
            const p = fake.player.position;
            const pass = Math.abs(p.x - 6) < 1e-9;
            return {pass, detail: `x=${p.x} (want 6, unclamped)`};
        }
    },
    {
        name: 'road: nearest corridor within reach is chosen',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const fake = {
                flyThreshold: 1.2, captureMargin: 3,
                roads: [
                    {xMin: -5, xMax: 5, zMin: -100, zMax: 12},
                    {xMin: 5, xMax: 25, zMin: -54, zMax: -46}
                ],
                // Just off the side street; should clamp into it, not the avenue.
                player: {position: {x: 18, y: 0, z: -44}}
            };
            CS.prototype.constrainToRoad.call(fake);
            const p = fake.player.position;
            const pass = Math.abs(p.x - 18) < 1e-9 && Math.abs(p.z + 46) < 1e-9;
            return {pass, detail: `x=${p.x} z=${p.z} (want x=18 z=-46)`};
        }
    },
    {
        name: 'building: type-based URL for a confirmed module type',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {config: {modelsbaseurl: 'm/', buildingmodels: ['quiz']},
                joinBase: CS.prototype.joinBase};
            const url = CS.prototype.buildingModelUrl.call(self, {modname: 'quiz'});
            return {pass: url === 'm/building-quiz.glb', detail: `url=${url}`};
        }
    },
    {
        name: 'building: no model for an unconfirmed module type',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {config: {modelsbaseurl: 'm/', buildingmodels: ['quiz']},
                joinBase: CS.prototype.joinBase};
            const url = CS.prototype.buildingModelUrl.call(self, {modname: 'forum'});
            return {pass: url === null, detail: `url=${url}`};
        }
    },
    {
        name: 'building: per-activity filename override resolves against the pack',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {config: {modelsbaseurl: 'm/', buildingmodels: []},
                joinBase: CS.prototype.joinBase};
            const url = CS.prototype.buildingModelUrl.call(self,
                {modname: 'quiz', building: 'library.glb'});
            return {pass: url === 'm/library.glb', detail: `url=${url}`};
        }
    },
    {
        name: 'building: per-activity URL override is kept as-is',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {config: {modelsbaseurl: 'm/', buildingmodels: []},
                joinBase: CS.prototype.joinBase};
            const url = CS.prototype.buildingModelUrl.call(self,
                {modname: 'quiz', building: 'https://cdn/x.glb'});
            return {pass: url === 'https://cdn/x.glb', detail: `url=${url}`};
        }
    },
    {
        name: 'video: an embed activity builds a poster screen that opens on click',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const obj = {
                THREE: THREE, palette: {primary: 0x00ffff}, interactive: [], videos: [],
                makePosterTexture: CS.prototype.makePosterTexture,
                frameMaterial: CS.prototype.frameMaterial,
                signFontStack: CS.prototype.signFontStack,
                makeVideoScreen: CS.prototype.makeVideoScreen
            };
            const r = obj.makeVideoScreen(
                {name: 'Clip', url: 'https://x/watch', state: 'available', video: {kind: 'embed'}});
            const pass = r.group.isGroup === true &&
                r.panel.userData.url === 'https://x/watch' &&
                !r.panel.userData.videoToggle && !r.panel.userData.videoSrc &&
                obj.interactive.length === 1 && obj.videos.length === 0;
            return {pass, detail: `url=${r.panel.userData.url}`};
        }
    },
    {
        name: 'video: a file activity defers the video until activation',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const obj = {
                THREE: THREE, palette: {primary: 0x00ffff}, interactive: [], videos: [],
                makePosterTexture: CS.prototype.makePosterTexture,
                frameMaterial: CS.prototype.frameMaterial,
                signFontStack: CS.prototype.signFontStack,
                makeVideoScreen: CS.prototype.makeVideoScreen
            };
            const r = obj.makeVideoScreen(
                {name: 'V', url: 'u', state: 'available', video: {kind: 'file', src: 'movie.mp4'}});
            // No media element or URL request until the learner acts.
            const pass = r.panel.userData.videoSrc === 'movie.mp4' &&
                !r.panel.userData.videoToggle && !r.panel.userData.url &&
                obj.videos.length === 0;
            return {pass, detail: `src=${r.panel.userData.videoSrc} videos=${obj.videos.length}`};
        }
    },
    {
        name: 'video: activating a file screen starts the video (loaded lazily)',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const obj = {
                THREE: THREE, palette: {primary: 0x00ffff}, interactive: [], videos: [],
                makePosterTexture: CS.prototype.makePosterTexture,
                frameMaterial: CS.prototype.frameMaterial,
                signFontStack: CS.prototype.signFontStack,
                makeVideoScreen: CS.prototype.makeVideoScreen,
                activate: CS.prototype.activate, startVideo: CS.prototype.startVideo,
                toggleVideo: CS.prototype.toggleVideo,
                recordView: function() {
                    this.recorded = true;
                }
            };
            const r = obj.makeVideoScreen(
                {name: 'V', url: 'view.php', state: 'available', video: {kind: 'file', src: 'movie.mp4'}});
            obj.activate(r.panel);
            const v = r.panel.userData.videoToggle;
            const pass = !!v && v.tagName === 'VIDEO' && !r.panel.userData.videoSrc &&
                obj.videos.length === 1 && obj.recorded === true;
            return {pass, detail: `tag=${v && v.tagName} recorded=${obj.recorded}`};
        }
    },
    {
        name: 'video: activate opens a link node',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const obj = {open: function(u) {
                this.opened = u;
            }, toggleVideo: CS.prototype.toggleVideo, activate: CS.prototype.activate,
                openActivity: CS.prototype.openActivity,
                renderer: {xr: {isPresenting: true}}};
            obj.activate({userData: {url: 'openme'}});
            return {pass: obj.opened === 'openme', detail: `opened=${obj.opened}`};
        }
    },
    {
        name: 'building: fitModel scales to the footprint and grounds the base',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const m = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
            m.position.set(5, 9, -3);
            CS.prototype.fitModel.call({THREE: THREE}, m, 6, 6, 6);
            const box = new THREE.Box3().setFromObject(m);
            const pass = Math.abs(m.scale.x - 1.5) < 1e-6 &&
                Math.abs(box.min.y) < 1e-6 &&
                Math.abs((box.min.x + box.max.x) / 2) < 1e-6 &&
                Math.abs((box.min.z + box.max.z) / 2) < 1e-6;
            return {pass, detail: `scale=${m.scale.x} miny=${box.min.y.toFixed(3)}`};
        }
    },
    {
        name: 'prop: falls back to bundled models when the pack lacks one',
        fn: async () => {
            const CS = window.__mnemoModule._Cyberspace;
            const calls = [];
            const self = {
                config: {modelsbaseurl: 'pack/', modelsfallbackurl: 'bundled/'},
                joinBase: CS.prototype.joinBase,
                loadModel: (url) => {
                    calls.push(url);
                    return url.indexOf('pack/') === 0
                        ? Promise.reject(new Error('404'))
                        : Promise.resolve({tpl: true});
                }
            };
            const r = await CS.prototype.loadProp.call(self, 'lamp');
            const pass = calls[0] === 'pack/lamp.glb' &&
                calls[1] === 'bundled/lamp.glb' && !!r && r.tpl === true;
            return {pass, detail: calls.join(',')};
        }
    },
    {
        name: 'prop: no redundant fallback when the pack is the bundled base',
        fn: async () => {
            const CS = window.__mnemoModule._Cyberspace;
            const calls = [];
            const self = {
                config: {modelsbaseurl: 'm/', modelsfallbackurl: 'm/'},
                joinBase: CS.prototype.joinBase,
                loadModel: (url) => {
                    calls.push(url);
                    return Promise.resolve({});
                }
            };
            await CS.prototype.loadProp.call(self, 'av');
            return {pass: calls.length === 1 && calls[0] === 'm/av.glb', detail: calls.join(',')};
        }
    },
    {
        name: 'building: an empty model keeps the procedural body',
        fn: async () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const built = {w: 4, d: 4, h: 8, body: {visible: true}, group: new THREE.Group()};
            const self = {
                THREE: THREE, renderer: {shadowMap: {}},
                buildingModelUrl: () => 'x.glb',
                fitModel: CS.prototype.fitModel, setShadow: () => {},
                loadModel: () => Promise.resolve(new THREE.Group()) // Empty template.
            };
            await CS.prototype.applyBuildingModel.call(self, {}, built);
            return {pass: built.body.visible === true && built.group.children.length === 0,
                detail: `visible=${built.body.visible}`};
        }
    },
    {
        name: 'building: a real model hides the body and refreshes shadows',
        fn: async () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tpl = new THREE.Group();
            tpl.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2)));
            const sign = new THREE.Group();
            sign.position.set(0, 2, 2.12);
            const built = {w: 4, d: 4, h: 8, body: {visible: true}, sign: sign, group: new THREE.Group()};
            const sm = {needsUpdate: false};
            const self = {
                THREE: THREE, renderer: {shadowMap: sm},
                buildingModelUrl: () => 'x.glb',
                fitModel: CS.prototype.fitModel, setShadow: () => {},
                loadModel: () => Promise.resolve(tpl)
            };
            await CS.prototype.applyBuildingModel.call(self, {}, built);
            // Model (2x2x2) fitted into 3.6x3.6x8 -> scale 1.8 -> front at z=1.8;
            // the sign should sit just in front of it (1.8 + 0.2 = 2.0).
            const pass = built.body.visible === false && sm.needsUpdate === true &&
                built.group.children.length === 1 &&
                Math.abs(sign.position.z - 2.0) < 1e-6;
            return {pass, detail: `vis=${built.body.visible} signz=${sign.position.z}`};
        }
    },
    {
        name: 'sign: signFontStack falls back to monospace without a custom font',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const stack = CS.prototype.signFontStack.call({signFontFamily: null});
            return {pass: stack === '"Courier New", monospace', detail: stack};
        }
    },
    {
        name: 'sign: signFontStack uses the custom family when one is loaded',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const stack = CS.prototype.signFontStack.call(
                {signFontFamily: '"MnemoSign", "Courier New", monospace'});
            return {pass: /MnemoSign/.test(stack), detail: stack};
        }
    },
    {
        name: 'sign: wrapLines breaks on word boundaries within the width',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const c = document.createElement('canvas');
            c.width = 512;
            c.height = 128;
            const ctx = c.getContext('2d');
            ctx.font = 'bold 52px "Courier New", monospace';
            const lines = CS.prototype.wrapLines.call({}, ctx, 'Introduction to Cyberspace', 470);
            // Multiple lines, none exceeding the width, and no word split.
            const withinWidth = lines.every((ln) => ctx.measureText(ln).width <= 470);
            const joined = lines.join(' ');
            const pass = lines.length >= 2 && withinWidth &&
                joined === 'Introduction to Cyberspace';
            return {pass, detail: `lines=${lines.length} [${lines.join('|')}]`};
        }
    },
    {
        name: 'sign: wrapLines hard-breaks a single over-long word',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const c = document.createElement('canvas');
            c.width = 512;
            c.height = 128;
            const ctx = c.getContext('2d');
            ctx.font = 'bold 52px "Courier New", monospace';
            const lines = CS.prototype.wrapLines.call({}, ctx, 'Supercalifragilisticexpialidocious', 300);
            const withinWidth = lines.every((ln) => ctx.measureText(ln).width <= 300);
            // Every character is preserved across the broken lines.
            const pass = lines.length >= 2 && withinWidth &&
                lines.join('') === 'Supercalifragilisticexpialidocious';
            return {pass, detail: `lines=${lines.length} [${lines.join('|')}]`};
        }
    },
    {
        name: 'sign: frameMaterial applies the texture to any neon frame',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tex = new THREE.Texture();
            const withTex = CS.prototype.frameMaterial.call({THREE, signTexture: tex}, 0x00ffff, 0.5);
            const withoutTex = CS.prototype.frameMaterial.call({THREE, signTexture: null}, 0x00ffff, 0.5);
            const pass = withTex.map === tex && withoutTex.map === null &&
                Math.abs(withTex.opacity - 0.5) < 1e-6;
            return {pass, detail: `with=${!!withTex.map} without=${!!withoutTex.map}`};
        }
    },
    {
        name: 'sign: a frame takes the uploaded texture, or stays flat without one',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tex = new THREE.Texture();
            const make = (signTexture) => {
                const self = {
                    THREE, interactive: [], signTexture, signFontFamily: null,
                    makeTextTexture: CS.prototype.makeTextTexture,
                    signFontStack: CS.prototype.signFontStack,
                    wrapLines: CS.prototype.wrapLines,
                    frameMaterial: CS.prototype.frameMaterial,
                    makeSign: CS.prototype.makeSign
                };
                return self.makeSign(
                    {text: 'Shop', colour: 0x00ffff, width: 3, height: 1.4, post: false});
            };
            const frameWith = make(tex).group.children[0];
            const frameWithout = make(null).group.children[0];
            const pass = frameWith.material.map === tex && frameWithout.material.map === null;
            return {pass, detail: `with=${!!frameWith.material.map} without=${!!frameWithout.material.map}`};
        }
    },
    {
        name: 'layout: footprintClear rejects points on/near a building, accepts clear ones',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {footprints: [{xMin: -2, xMax: 2, zMin: -2, zMax: 2}]};
            const onIt = CS.prototype.footprintClear.call(self, 0, 0, 0.5);
            const withinMargin = CS.prototype.footprintClear.call(self, 2.4, 0, 0.5);
            const clear = CS.prototype.footprintClear.call(self, 6, 6, 0.5);
            const pass = onIt === false && withinMargin === false && clear === true;
            return {pass, detail: `on=${onIt} margin=${withinMargin} clear=${clear}`};
        }
    },
    {
        name: 'ground: paveStrip tiles the road texture at the configured scale',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tex = new THREE.Texture();
            const added = [];
            const self = {
                THREE, roadTexture: tex, roadScale: 8, roadTexMult: 1,
                config: {canedit: false}, roadMeshes: [], surfaces: [],
                tiledClone: CS.prototype.tiledClone,
                showSurfaceTexture: CS.prototype.showSurfaceTexture,
                registerSurfaceMesh: CS.prototype.registerSurfaceMesh,
                surfaceMeshList: CS.prototype.surfaceMeshList,
                scene: {add: (o) => added.push(o)},
                paveStrip: CS.prototype.paveStrip
            };
            self.paveStrip(0, 0, 16, 32, 0);
            const map = added[0].material.map;
            const pass = !!map && map.repeat.x === 2 && map.repeat.y === 4 &&
                map.wrapS === THREE.RepeatWrapping &&
                added[0].material.emissiveMap === map;
            return {pass, detail: `map=${!!map} repeat=${map && map.repeat.x}x${map && map.repeat.y}`};
        }
    },
    {
        name: 'ground: paveStrip stays flat asphalt without a road texture',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const added = [];
            const self = {
                THREE, roadTexture: null, roadScale: 8, surfaces: [],
                tiledClone: CS.prototype.tiledClone,
                scene: {add: (o) => added.push(o)},
                paveStrip: CS.prototype.paveStrip
            };
            self.paveStrip(0, 0, 16, 32, 0);
            const pass = added[0].material.map === null;
            return {pass, detail: `map=${added[0].material.map}`};
        }
    },
    {
        name: 'ground: groundPatchAt lays a patch only with a texture and non-zero size',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tex = new THREE.Texture();
            const added = [];
            const mk = (groundTexture, groundPatch) => ({
                THREE, groundTexture, groundPatch, groundScale: 7, groundTexMult: 1,
                config: {canedit: false}, groundMeshes: [], surfaces: [],
                tiledClone: CS.prototype.tiledClone,
                showSurfaceTexture: CS.prototype.showSurfaceTexture,
                registerSurfaceMesh: CS.prototype.registerSurfaceMesh,
                surfaceMeshList: CS.prototype.surfaceMeshList,
                scene: {add: (o) => added.push(o)},
                groundPatchAt: CS.prototype.groundPatchAt
            });
            mk(tex, 14).groundPatchAt(3, 5);
            const afterTex = added.length;
            mk(null, 14).groundPatchAt(3, 5); // No texture: no patch.
            mk(tex, 0).groundPatchAt(3, 5); // Zero size: no patch.
            const pass = afterTex === 1 && added.length === 1 &&
                !!added[0].material.map && added[0].material.map.repeat.x === 2;
            return {pass, detail: `count=${added.length} repeat=${added[0].material.map.repeat.x}`};
        }
    },
    {
        name: 'editor: applyTransform moves, rotates and scales relative to base',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const g = new THREE.Group();
            const self = {THREE, selBox: null, renderer: null};
            const ed = {
                group: g, baseX: 5, baseY: 0, baseZ: -3, baseRotY: 0,
                transform: {scale: 2, x: 1, y: 0.5, z: -2, rot: 90}
            };
            CS.prototype.applyTransform.call(self, ed);
            const pass = Math.abs(g.position.x - 6) < 1e-6 &&
                Math.abs(g.position.y - 0.5) < 1e-6 &&
                Math.abs(g.position.z + 5) < 1e-6 &&
                Math.abs(g.rotation.y - Math.PI / 2) < 1e-6 &&
                Math.abs(g.scale.x - 2) < 1e-6;
            return {pass, detail: `pos=${g.position.x},${g.position.y},${g.position.z} rotY=${g.rotation.y.toFixed(3)}`};
        }
    },
    {
        name: 'editor: editableFor walks up to the registered group',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const g = new THREE.Group();
            const ed = {cmid: 42};
            g.userData.mnemoEditable = ed;
            const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
            g.add(child);
            const found = CS.prototype.editableFor.call({}, child);
            const none = CS.prototype.editableFor.call({}, new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
            const pass = found === ed && none === null;
            return {pass, detail: `found=${found && found.cmid} none=${none}`};
        }
    },
    {
        name: 'editor: registerEditable records base and applies a stored transform',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const g = new THREE.Group();
            g.rotation.y = 0.5;
            const self = {
                THREE, editables: [], selBox: null, renderer: null, activities: {},
                registerEditable: CS.prototype.registerEditable,
                registerActivity: CS.prototype.registerActivity,
                makeTick: CS.prototype.makeTick, newCanvasCtx: CS.prototype.newCanvasCtx,
                applyTransform: CS.prototype.applyTransform
            };
            self.registerEditable(
                {id: 7, name: 'X', transform: {scale: 3, x: 2, y: 0, z: 0, rot: 0}}, g, 10, 0, 10);
            const ed = self.editables[0];
            const pass = ed.cmid === 7 && Math.abs(ed.baseRotY - 0.5) < 1e-6 &&
                Math.abs(g.position.x - 12) < 1e-6 && Math.abs(g.scale.x - 3) < 1e-6 &&
                g.userData.mnemoEditable === ed;
            return {pass, detail: `cmid=${ed.cmid} posx=${g.position.x} s=${g.scale.x}`};
        }
    },
    {
        name: 'editor: editProxy is an invisible, non-shadowing box at the footprint',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const proxy = CS.prototype.editProxy.call({THREE}, 4, 8, 4);
            const pass = proxy.visible === false && proxy.castShadow === false &&
                proxy.userData.mnemoProxy === true &&
                Math.abs(proxy.position.y - 4) < 1e-6;
            return {pass, detail: `visible=${proxy.visible} y=${proxy.position.y}`};
        }
    },
    {
        name: 'editor: an invisible proxy is still selectable (raycast + editableFor)',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const group = new THREE.Group();
            const ed = {cmid: 9};
            group.userData.mnemoEditable = ed;
            // A hidden model stand-in: body invisible, proxy invisible, no visible mesh.
            group.add(CS.prototype.editProxy.call({THREE}, 4, 8, 4));
            group.position.set(0, 0, -10);
            group.updateMatrixWorld(true);
            const ray = new THREE.Raycaster();
            ray.set(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, 0, -1));
            const hits = ray.intersectObjects([group], true);
            const found = hits.length ? CS.prototype.editableFor.call({}, hits[0].object) : null;
            return {pass: hits.length > 0 && found === ed, detail: `hits=${hits.length} cmid=${found && found.cmid}`};
        }
    },
    {
        name: 'scene-obj: applyBrightness clones shared materials so props are independent',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            // Two props that (like tpl.clone()) share one material instance.
            const shared = new THREE.MeshStandardMaterial({emissive: new THREE.Color(1, 1, 1)});
            shared.emissiveIntensity = 1;
            const a = new THREE.Group();
            a.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared));
            const b = new THREE.Group();
            b.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared));
            CS.prototype.applyBrightness.call({}, {group: a, transform: {brightness: 3}});
            // b must be untouched (its own material was not mutated).
            const bmat = b.children[0].material;
            const amat = a.children[0].material;
            const pass = Math.abs(amat.emissiveIntensity - 3) < 1e-6 &&
                Math.abs(bmat.emissiveIntensity - 1) < 1e-6 && amat !== bmat;
            return {pass, detail: `a=${amat.emissiveIntensity} b=${bmat.emissiveIntensity}`};
        }
    },
    {
        name: 'scene-obj: applyBrightness scales emissive from a captured base',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const g = new THREE.Group();
            const emat = new THREE.MeshStandardMaterial({emissive: new THREE.Color(1, 0, 0)});
            emat.emissiveIntensity = 0.5;
            g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), emat));
            const ed = {group: g, transform: {brightness: 2}};
            CS.prototype.applyBrightness.call({}, ed);
            // The mesh gets its own material clone; read that, not the original.
            const mat = () => g.children[0].material;
            const up = Math.abs(mat().emissiveIntensity - 1.0) < 1e-6;
            // Re-apply relative to the same captured base (0.5), not the last value.
            ed.transform.brightness = 0.5;
            CS.prototype.applyBrightness.call({}, ed);
            const down = Math.abs(mat().emissiveIntensity - 0.25) < 1e-6;
            return {pass: up && down, detail: `emis=${mat().emissiveIntensity}`};
        }
    },
    {
        name: 'scene-obj: registerSceneEditable applies a stored override and registers',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const g = new THREE.Group();
            const emat = new THREE.MeshStandardMaterial({emissive: new THREE.Color(1, 1, 1)});
            emat.emissiveIntensity = 1;
            g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), emat));
            const self = {
                THREE, editables: [], selBox: null, renderer: null,
                config: {canedit: true},
                sceneObjects: {'lamp:0': {scale: 2, x: 1, y: 0, z: 0, rot: 0, brightness: 3}},
                registerSceneEditable: CS.prototype.registerSceneEditable,
                applyTransform: CS.prototype.applyTransform,
                applyBrightness: CS.prototype.applyBrightness
            };
            self.registerSceneEditable('lamp:0', 'Street lamp', g, 5, 0, 5, true);
            const ed = self.editables[0];
            const mat = g.children[0].material;
            const pass = ed.objkey === 'lamp:0' && ed.cmid === null &&
                Math.abs(g.position.x - 6) < 1e-6 && Math.abs(g.scale.x - 2) < 1e-6 &&
                Math.abs(mat.emissiveIntensity - 3) < 1e-6 &&
                g.userData.mnemoEditable === ed;
            return {pass, detail: `objkey=${ed.objkey} posx=${g.position.x} emis=${mat.emissiveIntensity}`};
        }
    },
    {
        name: 'surface: retileSurface recomputes tile repeat from the multiplier',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tex = new THREE.Texture();
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial());
            const self = {
                THREE, roadTexture: tex, groundTexture: null,
                roadScale: 8, groundScale: 8,
                roadMeshes: [{mesh, w: 80, d: 80}], groundMeshes: [],
                roadTexMult: 1, groundTexMult: 1,
                tiledClone: CS.prototype.tiledClone,
                surfaceMeshList: CS.prototype.surfaceMeshList,
                surfaceParams: CS.prototype.surfaceParams,
                retileSurface: CS.prototype.retileSurface
            };
            const ed = {surfaceType: 'road', transform: {scale: 1}};
            self.retileSurface(ed);
            const r1 = mesh.material.map.repeat.x; // 80 / (8 * 1) = 10
            ed.transform.scale = 2; // Bigger tiles -> fewer repeats.
            self.retileSurface(ed);
            const r2 = mesh.material.map.repeat.x; // 80 / (8 * 2) = 5
            return {pass: r1 === 10 && r2 === 5, detail: `r1=${r1} r2=${r2}`};
        }
    },
    {
        name: 'surface: registerSurfaceMesh tags meshes and seeds a shared editable',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
            const self = {
                config: {canedit: true, strings: {}},
                roadMeshes: [], groundMeshes: [],
                surfaceEditables: {}, surfacePickMeshes: [],
                roadTexMult: 3, groundTexMult: 1,
                registerSurfaceMesh: CS.prototype.registerSurfaceMesh,
                surfaceMeshList: CS.prototype.surfaceMeshList,
                surfaceParams: CS.prototype.surfaceParams,
                surfaceEditable: CS.prototype.surfaceEditable
            };
            self.registerSurfaceMesh('road', mesh, 40, 40);
            const ed = self.surfaceEditables.road;
            const pass = self.roadMeshes.length === 1 && self.roadMeshes[0].w === 40 &&
                mesh.userData.mnemoEditable === ed && self.surfacePickMeshes[0] === mesh &&
                ed.objkey === 'road:0' && ed.kind === 'surface' &&
                Math.abs(ed.transform.scale - 3) < 1e-6;
            return {pass, detail: `objkey=${ed.objkey} mult=${ed.transform.scale}`};
        }
    },
    {
        name: 'surface: registerSurfaceMesh records but never selects when not editable',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial());
            const self = {
                config: {canedit: false, strings: {}},
                roadMeshes: [], groundMeshes: [],
                surfaceEditables: {}, surfacePickMeshes: [],
                roadTexMult: 1, groundTexMult: 1,
                registerSurfaceMesh: CS.prototype.registerSurfaceMesh,
                surfaceMeshList: CS.prototype.surfaceMeshList,
                surfaceParams: CS.prototype.surfaceParams,
                surfaceEditable: CS.prototype.surfaceEditable
            };
            self.registerSurfaceMesh('ground', mesh, 5, 5);
            const pass = self.groundMeshes.length === 1 &&
                self.surfacePickMeshes.length === 0 &&
                mesh.userData.mnemoEditable === undefined &&
                self.surfaceEditables.ground === undefined;
            return {pass, detail: `recorded=${self.groundMeshes.length} picks=${self.surfacePickMeshes.length}`};
        }
    },
    {
        name: 'surface: surfaceEditable is a singleton seeded from the stored multiplier',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {
                surfaceEditables: {}, roadTexMult: 1, groundTexMult: 2,
                config: {strings: {editgroundsurface: 'GS'}},
                surfaceParams: CS.prototype.surfaceParams,
                surfaceEditable: CS.prototype.surfaceEditable
            };
            const a = self.surfaceEditable('ground');
            const b = self.surfaceEditable('ground');
            const pass = a === b && a.name === 'GS' && a.objkey === 'ground:0' &&
                a.group === null && Math.abs(a.transform.scale - 2) < 1e-6;
            return {pass, detail: `same=${a === b} name=${a.name} mult=${a.transform.scale}`};
        }
    },
    {
        name: 'editor: showSelectionLabel anchors a name label above the object',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const g = new THREE.Group();
            const mesh = new THREE.Mesh(
                new THREE.BoxGeometry(4, 6, 4), new THREE.MeshBasicMaterial());
            mesh.position.y = 3; // Box spans y 0..6.
            g.add(mesh);
            const added = [];
            const self = {
                THREE, scene: {add: (o) => added.push(o), remove: () => {}},
                selLabel: null, palette: {primary: 0x00e5ff},
                // Stub makeLabel so the test needs no font/canvas.
                makeLabel: (t, c, s) => {
                    const sp = new THREE.Sprite(new THREE.SpriteMaterial());
                    sp.userData.text = t;
                    sp.scale.set(4 * s, 1 * s, 1);
                    return sp;
                },
                showSelectionLabel: CS.prototype.showSelectionLabel,
                positionSelLabel: CS.prototype.positionSelLabel
            };
            self.showSelectionLabel({group: g, name: 'Assignment 1'});
            const lbl = self.selLabel;
            const pass = !!lbl && lbl.userData.text === 'Assignment 1' &&
                lbl.position.y > 6 && lbl.material.depthTest === false &&
                lbl.renderOrder === 999 && added.indexOf(lbl) !== -1;
            return {pass, detail: `label=${!!lbl} y=${lbl && lbl.position.y.toFixed(2)}`};
        }
    },
    {
        name: 'editor: showSelectionLabel clears and skips surfaces (no group)',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const removed = [];
            const stale = new THREE.Sprite(new THREE.SpriteMaterial());
            const self = {
                THREE, scene: {add: () => {}, remove: (o) => removed.push(o)},
                selLabel: stale, palette: {primary: 0x00e5ff},
                makeLabel: () => new THREE.Sprite(new THREE.SpriteMaterial()),
                showSelectionLabel: CS.prototype.showSelectionLabel,
                positionSelLabel: CS.prototype.positionSelLabel
            };
            // A surface editable (group null) clears the stale label, adds none.
            self.showSelectionLabel({group: null, name: 'Road surface'});
            const pass = self.selLabel === null && removed[0] === stale;
            return {pass, detail: `cleared=${self.selLabel === null} removed=${removed.length}`};
        }
    },
    {
        name: 'editor: applyTransform counter-rotates the sign to keep it street-facing',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const g = new THREE.Group();
            const sign = new THREE.Group();
            g.add(sign);
            const self = {THREE, selBox: null, selLabel: null, selected: null, renderer: null};
            const ed = {
                group: g, sign: sign, baseX: 0, baseY: 0, baseZ: 0, baseRotY: 0,
                transform: {scale: 1, x: 0, y: 0, z: 0, rot: 90}
            };
            CS.prototype.applyTransform.call(self, ed);
            // Group turns +90°, the sign's own rotation cancels it, so the sign's
            // world orientation stays at 0 (the street it was placed to face).
            const worldRot = g.rotation.y + sign.rotation.y;
            const pass = Math.abs(g.rotation.y - Math.PI / 2) < 1e-6 &&
                Math.abs(worldRot) < 1e-6;
            return {pass, detail: `group=${g.rotation.y.toFixed(3)} sign=${sign.rotation.y.toFixed(3)}`};
        }
    },
    {
        name: 'editor: snapValue aligns absolute position, rotation and scale',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const ed = {baseX: 12.37, baseY: 0, baseZ: -4.8};
            const on = {snap: true, gridStep: 1, snapValue: CS.prototype.snapValue};
            const off = {snap: false, gridStep: 1, snapValue: CS.prototype.snapValue};
            // Absolute x = base + offset snaps to the 1-unit grid: 12.37 + 0.9
            // = 13.27 -> 13, so the stored offset becomes 13 - 12.37 = 0.63.
            const x = on.snapValue('x', 0.9, ed);
            const absX = ed.baseX + x;
            const rot = on.snapValue('rot', 52, ed);   // -> 45
            const scale = on.snapValue('scale', 1.11, ed); // -> 1.0
            const passthru = off.snapValue('x', 0.9, ed); // snap off: unchanged
            const bright = on.snapValue('brightness', 1.37, ed); // never snapped
            const pass = Math.abs(absX - 13) < 1e-6 && rot === 45 &&
                Math.abs(scale - 1.0) < 1e-6 && passthru === 0.9 &&
                Math.abs(bright - 1.37) < 1e-6;
            return {pass, detail: `absX=${absX} rot=${rot} scale=${scale} off=${passthru}`};
        }
    },
    {
        name: 'placer: snapCoord rounds a coordinate to the layout grid',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {gridStep: 2, snapCoord: CS.prototype.snapCoord};
            const a = self.snapCoord(3.2);   // -> 4
            const b = self.snapCoord(7);     // 3.5 -> 4 -> 8
            const c = self.snapCoord(-3.2);  // -1.6 -> -2 -> -4
            const pass = a === 4 && b === 8 && c === -4;
            return {pass, detail: `a=${a} b=${b} c=${c}`};
        }
    },
    {
        name: 'placer: snapBase snaps defaults but preserves edited bases',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {gridStep: 2, snapCoord: CS.prototype.snapCoord,
                snapBase: CS.prototype.snapBase};
            // No stored transform -> snap to grid (-11 rounds to -10).
            const def = self.snapBase(-11, null);
            // A stored transform -> keep the original base so the saved offset
            // is not re-applied from a shifted origin.
            const edited = self.snapBase(-11, {scale: 1, x: 3});
            const pass = def === -10 && edited === -11;
            return {pass, detail: `def=${def} edited=${edited}`};
        }
    },
    {
        name: 'placer: placeProp builds, registers and records a placed prop',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tpl = new THREE.Group();
            tpl.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
            const added = [];
            const self = {
                THREE, scene: {add: (o) => added.push(o), remove: () => {}},
                editables: [], sceneObjects: {}, placedObjects: [],
                config: {canedit: true, strings: {}}, propTemplates: {lamp: tpl},
                selBox: null, renderer: null, lampLights: 0, palette: {primary: 0x00e5ff},
                snapSurface: false,
                placedBaseY: CS.prototype.placedBaseY,
                propLabel: CS.prototype.propLabel,
                setShadow: CS.prototype.setShadow,
                addLampLight: CS.prototype.addLampLight,
                addPickProxy: CS.prototype.addPickProxy,
                registerSceneEditable: CS.prototype.registerSceneEditable,
                applyTransform: CS.prototype.applyTransform,
                applyBrightness: CS.prototype.applyBrightness,
                placeProp: CS.prototype.placeProp
            };
            self.placeProp('lamp', 7, 4, -6);
            const ed = self.editables[0];
            const g = ed && ed.group;
            const pass = self.placedObjects.length === 1 && self.placedObjects[0].id === 7 &&
                ed && ed.objkey === 'placed:7' && ed.emits === true && self.lampLights === 1 &&
                added.indexOf(g) !== -1 &&
                Math.abs(g.position.x - 4) < 1e-6 && Math.abs(g.position.z + 6) < 1e-6;
            return {pass, detail: `objkey=${ed && ed.objkey} placed=${self.placedObjects.length}`};
        }
    },
    {
        name: 'placer: buildPlacedObjectsOfType builds only the matching type',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tpl = new THREE.Group();
            tpl.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
            const self = {
                THREE, scene: {add: () => {}, remove: () => {}},
                editables: [], sceneObjects: {}, config: {canedit: true, strings: {}},
                placedObjects: [
                    {id: 3, type: 'kiosk', x: 2, z: 2},
                    {id: 4, type: 'lamp', x: 0, z: 0}
                ],
                placedBaseY: CS.prototype.placedBaseY,
                propLabel: CS.prototype.propLabel,
                setShadow: CS.prototype.setShadow,
                addPickProxy: CS.prototype.addPickProxy,
                registerSceneEditable: CS.prototype.registerSceneEditable,
                applyTransform: CS.prototype.applyTransform,
                applyBrightness: CS.prototype.applyBrightness,
                buildPlacedObjectsOfType: CS.prototype.buildPlacedObjectsOfType
            };
            self.buildPlacedObjectsOfType('kiosk', tpl);
            const pass = self.editables.length === 1 && self.editables[0].objkey === 'placed:3' &&
                self.editables[0].emits === false; // kiosk does not emit light
            return {pass, detail: `count=${self.editables.length} key=${self.editables[0] && self.editables[0].objkey}`};
        }
    },
    {
        name: 'placer: removePlacedFromScene detaches, delists and clears selection',
        fn: () => {
            const THREE = window.__mnemoModule._Cyberspace ? window.__mnemoTest.THREE : null;
            const CS = window.__mnemoModule._Cyberspace;
            const group = new THREE.Group();
            const ed = {objkey: 'placed:9', group: group};
            const removed = [];
            const self = {
                scene: {add: () => {}, remove: (o) => removed.push(o)},
                editables: [ed], placedObjects: [{id: 9, type: 'barrier', x: 0, z: 0}],
                selected: ed, selBox: null, selLabel: null, editorPanel: null,
                THREE,
                deselectEditable: CS.prototype.deselectEditable,
                showSelectionLabel: CS.prototype.showSelectionLabel,
                removePlacedFromScene: CS.prototype.removePlacedFromScene
            };
            self.removePlacedFromScene(ed, 9);
            const pass = removed[0] === group && self.editables.length === 0 &&
                self.placedObjects.length === 0 && self.selected === null;
            return {pass, detail: `removed=${removed.length} eds=${self.editables.length} sel=${self.selected}`};
        }
    },
    {
        name: 'editor: applyTransform applies non-uniform width/height/depth',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const g = new THREE.Group();
            const self = {THREE, selBox: null, selLabel: null, selected: null, renderer: null};
            const ed = {
                group: g, baseX: 0, baseY: 0, baseZ: 0, baseRotY: 0,
                transform: {scale: 2, sx: 1.5, sy: 0.5, sz: 1, x: 0, y: 0, z: 0, rot: 0}
            };
            CS.prototype.applyTransform.call(self, ed);
            // Final scale is the uniform scale times each axis multiplier.
            const pass = Math.abs(g.scale.x - 3) < 1e-6 &&
                Math.abs(g.scale.y - 1) < 1e-6 && Math.abs(g.scale.z - 2) < 1e-6;
            return {pass, detail: `scale=${g.scale.x},${g.scale.y},${g.scale.z}`};
        }
    },
    {
        name: 'editor: a scale node takes the stretch so the sign is not sheared',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const g = new THREE.Group();
            const node = new THREE.Group();
            const sign = new THREE.Group();
            g.add(node);
            g.add(sign);
            const self = {THREE, selBox: null, selLabel: null, selected: null, renderer: null};
            const ed = {
                group: g, scaleNode: node, sign: sign, signBaseZ: 2,
                baseX: 0, baseY: 0, baseZ: 0, baseRotY: 0,
                transform: {scale: 2, sx: 1.5, sy: 1, sz: 0.5, x: 0, y: 0, z: 0, rot: 30}
            };
            CS.prototype.applyTransform.call(self, ed);
            // The group carries only the uniform scale (so the sign, its child,
            // is never anisotropically scaled); the node carries the stretch.
            const pass = Math.abs(g.scale.x - 2) < 1e-6 && Math.abs(g.scale.z - 2) < 1e-6 &&
                Math.abs(node.scale.x - 1.5) < 1e-6 && Math.abs(node.scale.z - 0.5) < 1e-6 &&
                Math.abs(sign.scale.x - 1) < 1e-6 &&
                Math.abs(sign.position.z - 1) < 1e-6; // signBaseZ(2) * sz(0.5).
            return {pass, detail: `g=${g.scale.x} node=${node.scale.x} signz=${sign.position.z}`};
        }
    },
    {
        name: 'surface: sidewalk registers a singleton editable and retiles',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tex = new THREE.Texture();
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(10, 80), new THREE.MeshStandardMaterial());
            const self = {
                THREE, roadMeshes: [], groundMeshes: [], sidewalkMeshes: [],
                surfaceEditables: {}, surfacePickMeshes: [],
                config: {canedit: true, strings: {editsidewalksurface: 'SW'}},
                roadTexture: null, groundTexture: null, sidewalkTexture: tex,
                roadScale: 8, groundScale: 8, sidewalkScale: 4,
                roadTexMult: 1, groundTexMult: 1, sidewalkTexMult: 2,
                tiledClone: CS.prototype.tiledClone,
                surfaceMeshList: CS.prototype.surfaceMeshList,
                surfaceParams: CS.prototype.surfaceParams,
                surfaceEditable: CS.prototype.surfaceEditable,
                registerSurfaceMesh: CS.prototype.registerSurfaceMesh,
                retileSurface: CS.prototype.retileSurface
            };
            self.registerSurfaceMesh('sidewalk', mesh, 10, 80);
            const ed = self.surfaceEditables.sidewalk;
            self.retileSurface(ed);
            // div = sidewalkScale * mult = 4 * 2 = 8 -> repeat y = 80 / 8 = 10.
            const pass = ed.objkey === 'sidewalk:0' && ed.name === 'SW' &&
                Math.abs(ed.transform.scale - 2) < 1e-6 && self.sidewalkMeshes.length === 1 &&
                mesh.userData.mnemoEditable === ed && mesh.material.map.repeat.y === 10;
            return {pass, detail: `key=${ed.objkey} rep=${mesh.material.map.repeat.y}`};
        }
    },
    {
        name: 'lighting: addLampLight adds a capped point light to a lamp group',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const self = {THREE, lampLights: 0, palette: {primary: 0x00e5ff},
                addLampLight: CS.prototype.addLampLight};
            const g = new THREE.Group();
            self.addLampLight(g);
            const light = g.children.filter(function(c) {
                return c.isLight;
            })[0];
            const added = !!light && light.isPointLight && self.lampLights === 1 &&
                Math.abs(light.position.y - 3.4) < 1e-6 && light.castShadow === false;
            // At the cap, no further light is attached.
            const g2 = new THREE.Group();
            self.lampLights = 24;
            self.addLampLight(g2);
            const capped = g2.children.length === 0 && self.lampLights === 24;
            return {pass: added && capped, detail: `added=${added} capped=${capped}`};
        }
    },
    {
        name: 'activity: openActivity shows an in-scene panel when not presenting',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const url = 'https://moodle.example/mod/quiz/view.php?id=5';
            const self = {
                renderer: {xr: {isPresenting: false}},
                config: {strings: {activityclose: 'Close', activityopen: 'Open'}},
                root: document.createElement('div'),
                videos: [], activityOverlay: null,
                openActivity: CS.prototype.openActivity,
                showActivityOverlay: CS.prototype.showActivityOverlay,
                buildActivityOverlay: CS.prototype.buildActivityOverlay,
                setOverlayInert: CS.prototype.setOverlayInert,
                pauseVideos: CS.prototype.pauseVideos
            };
            document.body.appendChild(self.root);
            self.openActivity(url, 'My Quiz');
            const o = self.activityOverlay;
            const pass = !!o && o.el.hidden === false &&
                o.frame.getAttribute('src') === url && o.full.getAttribute('href') === url &&
                o.title.textContent === 'My Quiz' && self.root.contains(o.el);
            document.body.removeChild(self.root);
            return {pass, detail: `built=${!!o} src=${o && o.frame.getAttribute('src')}`};
        }
    },
    {
        name: 'activity: openActivity navigates (no panel) inside an immersive session',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            let opened = null;
            const self = {
                renderer: {xr: {isPresenting: true}},
                config: {strings: {}}, root: document.createElement('div'),
                videos: [], activityOverlay: null,
                openActivity: CS.prototype.openActivity,
                showActivityOverlay: CS.prototype.showActivityOverlay,
                buildActivityOverlay: CS.prototype.buildActivityOverlay,
                pauseVideos: CS.prototype.pauseVideos,
                open: (u) => { opened = u; }
            };
            self.openActivity('https://moodle.example/mod/assign/view.php?id=9', 'Essay');
            const pass = opened === 'https://moodle.example/mod/assign/view.php?id=9' &&
                self.activityOverlay === null;
            return {pass, detail: `opened=${opened} overlay=${self.activityOverlay}`};
        }
    },
    {
        name: 'activity: closeActivityOverlay hides the panel and stops the framed page',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {
                renderer: {xr: {isPresenting: false}},
                config: {strings: {}}, root: document.createElement('div'),
                videos: [], activityOverlay: null,
                openActivity: CS.prototype.openActivity,
                showActivityOverlay: CS.prototype.showActivityOverlay,
                buildActivityOverlay: CS.prototype.buildActivityOverlay,
                closeActivityOverlay: CS.prototype.closeActivityOverlay,
                refreshActivityStates: CS.prototype.refreshActivityStates,
                setOverlayInert: CS.prototype.setOverlayInert,
                pauseVideos: CS.prototype.pauseVideos
            };
            document.body.appendChild(self.root);
            self.openActivity('https://moodle.example/mod/page/view.php?id=3', 'Notes');
            self.closeActivityOverlay();
            const o = self.activityOverlay;
            const pass = o.el.hidden === true && /about:blank$/.test(o.frame.getAttribute('src'));
            document.body.removeChild(self.root);
            return {pass, detail: `hidden=${o.el.hidden} src=${o.frame.getAttribute('src')}`};
        }
    },
    {
        name: 'activity: overlay makes the background inert and reverts on close',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const container = document.createElement('div');
            container.className = 'format-mnemo';
            const bar = document.createElement('div'); // A sibling of the stage.
            const root = document.createElement('div'); // The stage.
            const canvas = document.createElement('canvas'); // A stage child.
            root.appendChild(canvas);
            container.appendChild(bar);
            container.appendChild(root);
            document.body.appendChild(container);
            const self = {
                renderer: {xr: {isPresenting: false}},
                config: {strings: {}}, root: root, videos: [], activityOverlay: null,
                openActivity: CS.prototype.openActivity,
                showActivityOverlay: CS.prototype.showActivityOverlay,
                buildActivityOverlay: CS.prototype.buildActivityOverlay,
                closeActivityOverlay: CS.prototype.closeActivityOverlay,
                refreshActivityStates: CS.prototype.refreshActivityStates,
                setOverlayInert: CS.prototype.setOverlayInert,
                pauseVideos: CS.prototype.pauseVideos
            };
            self.openActivity('https://moodle.example/x', 'X');
            const openInert = canvas.inert === true && bar.inert === true &&
                self.activityOverlay.el.inert !== true;
            self.closeActivityOverlay();
            const reverted = canvas.inert === false && bar.inert === false;
            document.body.removeChild(container);
            return {pass: openInert && reverted, detail: `open=${openInert} reverted=${reverted}`};
        }
    },
    {
        name: 'surface: surfaceHeightAt returns the topmost surface at a point',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const mk = (y) => {
                const m = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial());
                m.rotation.x = -Math.PI / 2;
                m.position.y = y;
                m.updateMatrixWorld(true);
                return m;
            };
            const self = {THREE, surfaces: [mk(0.02), mk(0.19)],
                surfaceHeightAt: CS.prototype.surfaceHeightAt};
            const over = self.surfaceHeightAt(1, 1); // Both planes cover (1,1).
            const off = ({THREE, surfaces: [], surfaceHeightAt: CS.prototype.surfaceHeightAt})
                .surfaceHeightAt(1, 1); // No surfaces -> ground datum.
            const pass = Math.abs(over - 0.19) < 1e-6 && off === 0;
            return {pass, detail: `over=${over.toFixed(3)} off=${off}`};
        }
    },
    {
        name: 'surface: dropToSurface rests a prop on the surface, but not a vehicle',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const top = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial());
            top.rotation.x = -Math.PI / 2;
            top.position.y = 0.19;
            top.updateMatrixWorld(true);
            const self = {THREE, surfaces: [top], placedObjects: [],
                surfaceHeightAt: CS.prototype.surfaceHeightAt,
                propType: CS.prototype.propType,
                dropToSurface: CS.prototype.dropToSurface};
            // A lamp at ground base gets a y-offset lifting it onto the kerb.
            const lamp = {objkey: 'lamp:0', baseX: 4, baseY: 0, baseZ: 4,
                transform: {x: 0, y: 0, z: 0}};
            self.dropToSurface(lamp);
            // A vehicle hovers: dropToSurface leaves it alone.
            self.placedObjects = [{id: 5, type: 'av', x: 0, z: 0}];
            const av = {objkey: 'placed:5', baseX: 0, baseY: 6, baseZ: 0,
                transform: {x: 0, y: 0, z: 0}};
            self.dropToSurface(av);
            const pass = Math.abs(lamp.transform.y - 0.19) < 1e-6 && av.transform.y === 0;
            return {pass, detail: `lampY=${lamp.transform.y.toFixed(3)} avY=${av.transform.y}`};
        }
    },
    {
        name: 'surface: propType reads scattered and placed prop types',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {propType: CS.prototype.propType,
                placedObjects: [{id: 7, type: 'barrier', x: 0, z: 0}]};
            const pass = self.propType({objkey: 'lamp:3'}) === 'lamp' &&
                self.propType({objkey: 'placed:7'}) === 'barrier' &&
                self.propType({objkey: 'gate:1'}) === null &&
                self.propType({cmid: 5}) === null;
            return {pass, detail: `lamp=${self.propType({objkey: 'lamp:3'})}`};
        }
    },
    {
        name: 'editor: addPickProxy adds an invisible but raycastable box to a prop',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            // A low, thin barrier-like model that is otherwise hard to hit.
            const group = new THREE.Group();
            group.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.6),
                new THREE.MeshStandardMaterial()));
            group.position.set(3, 0, -3);
            const self = {THREE, addPickProxy: CS.prototype.addPickProxy};
            self.addPickProxy(group);
            const proxy = group.children.filter((c) => c.userData && c.userData.mnemoProxy)[0];
            // A ray from above through the proxy hits it even though it is invisible.
            const ray = new THREE.Raycaster(new THREE.Vector3(3, 5, -3), new THREE.Vector3(0, -1, 0));
            group.updateMatrixWorld(true);
            const hit = ray.intersectObject(group, true).length > 0;
            const pass = !!proxy && proxy.visible === false && proxy.geometry.parameters.height >= 1.4 &&
                hit;
            return {pass, detail: `proxy=${!!proxy} h=${proxy && proxy.geometry.parameters.height} hit=${hit}`};
        }
    },
    {
        name: 'lighting: computeLampSlots spaces lamps on avenue, streets and corners',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const base = {
                roadHalf: 5.5, gridStep: 2,
                snapCoord: CS.prototype.snapCoord,
                computeLampSlots: CS.prototype.computeLampSlots
            };
            // Avenue (roads[0]) plus one side street branching right at z=-40.
            const roads = [
                {xMin: -7.9, xMax: 7.9, zMin: -60, zMax: 12},
                {xMin: 5.5, xMax: 25.5, zMin: -44.5, zMax: -35.5, section: 0}
            ];
            const on = Object.assign({}, base, {lampSpacing: 20, lampCorners: true, roads});
            on.computeLampSlots();
            const hasAvenue = on.lampSlots.some((s) => Math.abs(s.x + 6.1) < 1e-6) &&
                on.lampSlots.some((s) => Math.abs(s.x - 6.1) < 1e-6);
            const hasStreet = on.lampSlots.some((s) => s.x > 6 && Math.abs(s.rotY) === Math.PI / 2);
            // Two corner lamps at the mouth, offset from the pylon (x ≈ 5.5+1.8→8).
            const corners = on.lampSlots.filter((s) => Math.abs(s.x - 8) < 1.0 &&
                (Math.abs(s.z + 34) < 4 || Math.abs(s.z + 46) < 4));
            // Interleaved: a side-street lamp appears among the first few slots
            // rather than after every avenue lamp (so the light cap is shared).
            const earlyStreet = on.lampSlots.slice(0, 8).some((s) => s.x > 7);
            // Off clears the slots.
            const off = Object.assign({}, base, {lampSpacing: 0, lampCorners: true, roads});
            off.computeLampSlots();
            const pass = hasAvenue && hasStreet && corners.length >= 2 && earlyStreet &&
                off.lampSlots.length === 0;
            return {pass, detail: `n=${on.lampSlots.length} avenue=${hasAvenue} street=${hasStreet} corners=${corners.length} early=${earlyStreet} off=${off.lampSlots.length}`};
        }
    },
    {
        name: 'lighting: placeLampSlots builds, lights and registers lamps, skipping footprints',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tpl = new THREE.Group();
            tpl.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), new THREE.MeshStandardMaterial()));
            const added = [];
            const self = {
                THREE, config: {canedit: true, strings: {placelamp: 'Street lamp'}},
                sceneObjects: {}, editables: [], lampLights: 0, palette: {primary: 0x00e5ff},
                scene: {add: (o) => added.push(o)},
                lampSlots: [
                    {x: 6, z: 4, rotY: 0},
                    {x: 6, z: -6, rotY: Math.PI}, // This one sits on a footprint.
                    {x: -6, z: 4, rotY: Math.PI}
                ],
                footprints: [{xMin: 4, xMax: 8, zMin: -8, zMax: -4}],
                surfaces: [], surfaceHeightAt: CS.prototype.surfaceHeightAt,
                isHidden: CS.prototype.isHidden,
                snapBase: CS.prototype.snapBase, snapCoord: CS.prototype.snapCoord,
                gridStep: 2, footprintClear: CS.prototype.footprintClear,
                addLampLight: CS.prototype.addLampLight, setShadow: CS.prototype.setShadow,
                addPickProxy: CS.prototype.addPickProxy,
                registerSceneEditable: CS.prototype.registerSceneEditable,
                applyTransform: CS.prototype.applyTransform,
                applyBrightness: CS.prototype.applyBrightness,
                placeLampSlots: CS.prototype.placeLampSlots
            };
            self.placeLampSlots(tpl);
            const keys = self.editables.map((e) => e.objkey);
            // The middle slot (on the footprint) is skipped; the other two build.
            const pass = self.editables.length === 2 &&
                keys.indexOf('lamp:0') !== -1 && keys.indexOf('lamp:2') !== -1 &&
                keys.indexOf('lamp:1') === -1 && self.lampLights === 2;
            return {pass, detail: `keys=${keys.join(',')} lights=${self.lampLights}`};
        }
    },
    {
        name: 'space: makePlanet uses an uploaded map, else a procedural surface',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const added = [];
            const self = {THREE, scene: {add: (o) => added.push(o)},
                newCanvasCtx: CS.prototype.newCanvasCtx, makePlanet: CS.prototype.makePlanet};
            const tex = new THREE.Texture();
            self.makePlanet(20, {x: 0, y: 0, z: -100}, [0x888888, 0x333333], false, tex);
            self.makePlanet(20, {x: 40, y: 0, z: -100}, [0x888888, 0x333333], false);
            const withTex = added[0];
            const proc = added[1];
            const pass = withTex.material.map === tex &&
                withTex.material.emissiveMap === tex &&
                proc.material.map && proc.material.map !== tex;
            return {pass, detail: `mapIsTex=${withTex.material.map === tex} procHasOwn=${!!proc.material.map}`};
        }
    },
    {
        name: 'space: buildPlanets draws one planet per texture (capped), else three',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const mk = (textures) => {
                const self = {THREE, scene: {add: () => {}}, planetTextures: textures,
                    planetField: null,
                    newCanvasCtx: CS.prototype.newCanvasCtx, makePlanet: CS.prototype.makePlanet,
                    buildPlanets: CS.prototype.buildPlanets};
                self.buildPlanets();
                // Planets live under the revolving field group now.
                let spheres = 0;
                const pos = [];
                self.planetField.traverse((o) => {
                    if (o.geometry && o.geometry.type === 'SphereGeometry') {
                        spheres++;
                        pos.push(o.position.clone());
                    }
                });
                return {spheres, pos};
            };
            const none = mk([]);
            const two = mk([new THREE.Texture(), new THREE.Texture()]);
            const many = mk(Array.from({length: 12}, () => new THREE.Texture()));
            // Spread in azimuth: the two planets sit well apart (here opposite).
            const spread = two.pos[0].distanceTo(two.pos[1]) > 100;
            const pass = none.spheres === 3 && two.spheres === 2 && many.spheres === 9 && spread;
            return {pass, detail: `none=${none.spheres} two=${two.spheres} many=${many.spheres} spread=${spread}`};
        }
    },
    {
        name: 'space: spinPlanets revolves the field once per hour',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const field = new THREE.Group();
            const self = {planetField: field, spinPlanets: CS.prototype.spinPlanets};
            self.spinPlanets(3600); // One hour -> one full turn.
            const full = Math.abs(field.rotation.y - Math.PI * 2) < 1e-3;
            // With no field it is a no-op and must not throw.
            ({planetField: null, spinPlanets: CS.prototype.spinPlanets}).spinPlanets(1);
            return {pass: full, detail: `y=${field.rotation.y.toFixed(4)}`};
        }
    },
    {
        name: 'space: buildSpace uses an uploaded sky, else the procedural starfield',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const mk = (spaceTexture) => {
                let starfield = 0;
                const self = {
                    THREE, scene: {background: null, add: () => {}},
                    spaceTexture,
                    buildStarfield: () => { starfield++; },
                    buildPlanets: () => {},
                    buildSpace: CS.prototype.buildSpace
                };
                self.buildSpace();
                return {bg: self.scene.background, starfield};
            };
            const tex = new THREE.Texture();
            const withSky = mk(tex);
            const without = mk(null);
            const pass = withSky.bg === tex && withSky.starfield === 0 &&
                without.starfield === 1;
            return {pass, detail: `skyBg=${withSky.bg === tex} skyStar=${withSky.starfield} procStar=${without.starfield}`};
        }
    },
    {
        name: 'delete: isHidden and isDeletable classify slots',
        fn: () => {
            const CS = window.__mnemoModule._Cyberspace;
            const self = {
                sceneObjects: {'lamp:2': {hidden: true}, 'lamp:3': {}},
                placedObjects: [{id: 5, type: 'lamp', x: 0, z: 0}],
                isHidden: CS.prototype.isHidden, isDeletable: CS.prototype.isDeletable,
                propType: CS.prototype.propType
            };
            const pass = self.isHidden('lamp:2') === true && self.isHidden('lamp:3') === false &&
                self.isHidden('lamp:9') === false &&
                self.isDeletable({objkey: 'lamp:1'}) === true &&
                self.isDeletable({objkey: 'kiosk:0'}) === true &&
                self.isDeletable({objkey: 'placed:5'}) === true &&
                self.isDeletable({objkey: 'gate:0'}) === false &&
                self.isDeletable({cmid: 1}) === false;
            return {pass, detail: `hid2=${self.isHidden('lamp:2')} gate=${self.isDeletable({objkey: 'gate:0'})}`};
        }
    },
    {
        name: 'delete: placeLampSlots skips a hidden lamp slot',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tpl = new THREE.Group();
            tpl.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 0.4), new THREE.MeshStandardMaterial()));
            const self = {
                THREE, config: {canedit: true, strings: {placelamp: 'Street lamp'}},
                sceneObjects: {'lamp:0': {hidden: true}}, editables: [], lampLights: 0,
                palette: {primary: 0x00e5ff}, scene: {add: () => {}},
                lampSlots: [{x: 6, z: 4, rotY: 0}, {x: -6, z: 4, rotY: Math.PI}],
                footprints: [], surfaces: [], surfaceHeightAt: CS.prototype.surfaceHeightAt,
                snapBase: CS.prototype.snapBase, snapCoord: CS.prototype.snapCoord, gridStep: 2,
                footprintClear: CS.prototype.footprintClear, isHidden: CS.prototype.isHidden,
                addLampLight: CS.prototype.addLampLight, setShadow: CS.prototype.setShadow,
                addPickProxy: CS.prototype.addPickProxy,
                registerSceneEditable: CS.prototype.registerSceneEditable,
                applyTransform: CS.prototype.applyTransform, applyBrightness: CS.prototype.applyBrightness,
                placeLampSlots: CS.prototype.placeLampSlots
            };
            self.placeLampSlots(tpl);
            const keys = self.editables.map((e) => e.objkey);
            const pass = self.editables.length === 1 && keys[0] === 'lamp:1';
            return {pass, detail: `keys=${keys.join(',')}`};
        }
    },
    {
        name: 'delete: deleteSelected hides a generated prop in-scene',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const group = new THREE.Group();
            const ed = {objkey: 'lamp:4', group};
            const removed = [];
            let deselected = 0;
            const self = {
                selected: ed, sceneObjects: {}, placedObjects: [], editables: [ed],
                scene: {remove: (o) => removed.push(o)}, config: {courseid: 1, strings: {}},
                deselectEditable: () => { deselected++; },
                propType: CS.prototype.propType, isDeletable: CS.prototype.isDeletable,
                deletePlaced: () => { self.placedCalled = true; },
                deleteGeneratedProp: CS.prototype.deleteGeneratedProp,
                deleteSelected: CS.prototype.deleteSelected
            };
            // No window.require in the harness, so the hide applies synchronously.
            self.deleteSelected();
            const o = self.sceneObjects['lamp:4'];
            const pass = !!(o && o.hidden === true) && removed.indexOf(group) !== -1 &&
                self.editables.length === 0 && deselected === 1 && !self.placedCalled;
            return {pass, detail: `hidden=${o && o.hidden} removed=${removed.length} eds=${self.editables.length}`};
        }
    },
    {
        name: 'completion: makeTick builds a green on-top sprite',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const self = {THREE, newCanvasCtx: CS.prototype.newCanvasCtx, makeTick: CS.prototype.makeTick};
            const t = self.makeTick();
            const pass = !!t.isSprite && !!t.material.map && t.material.depthTest === false &&
                t.renderOrder === 6;
            return {pass, detail: `sprite=${!!t.isSprite} depthTest=${t.material.depthTest} order=${t.renderOrder}`};
        }
    },
    {
        name: 'completion: registerActivity records a tick shown only when complete',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const mk = () => ({THREE, activities: {}, newCanvasCtx: CS.prototype.newCanvasCtx,
                makeTick: CS.prototype.makeTick, registerActivity: CS.prototype.registerActivity});
            const done = mk();
            const group = new THREE.Group();
            const sign = new THREE.Group();
            sign.position.set(0, 2, 1);
            sign.userData = {frameMat: new THREE.MeshBasicMaterial()};
            done.registerActivity({group}, {id: 7, state: 'complete'}, sign);
            const rec = done.activities[7];
            // The tick is parented to the sign (so it follows a depth edit).
            const inSign = sign.children.some((c) => c.isSprite);
            // A video screen has no sign: the frame material comes from the
            // interactive panel instead, and the tick sits on the group.
            const vid = mk();
            const vgroup = new THREE.Group();
            const vmat = new THREE.MeshBasicMaterial();
            const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
            screen.userData = {material: vmat, baseColour: 0x111111};
            vid.registerActivity({group: vgroup}, {id: 9, state: 'available'}, null, screen);
            const vrec = vid.activities[9];
            const notdone = mk();
            notdone.registerActivity({group: new THREE.Group()}, {id: 8, state: 'available'}, null);
            const pass = !!rec && rec.tick.visible === true && rec.frameMat === sign.userData.frameMat &&
                inSign && notdone.activities[8].tick.visible === false &&
                vrec.frameMat === vmat && vrec.panel === screen &&
                vgroup.children.some((c) => c.isSprite);
            return {pass, detail: `done=${rec && rec.tick.visible} inSign=${inSign} ` +
                `vidMat=${vrec.frameMat === vmat} open=${notdone.activities[8].tick.visible}`};
        }
    },
    {
        name: 'completion: applyStates toggles ticks and recolours signs',
        fn: () => {
            const THREE = window.__mnemoTest.THREE;
            const CS = window.__mnemoModule._Cyberspace;
            const tick11 = {visible: false};
            const tick12 = {visible: true};
            const tick13 = {visible: false};
            const frameMat = new THREE.MeshBasicMaterial({color: 0x123456});
            const panel11 = {userData: {baseColour: 0x123456}};
            const frame13 = new THREE.MeshBasicMaterial({color: 0x39ff14});
            const self = {
                renderer: null, applyStates: CS.prototype.applyStates,
                activities: {
                    11: {tick: tick11, frameMat: frameMat, panel: panel11, state: 'available'},
                    12: {tick: tick12, frameMat: null, state: 'complete'},
                    // Present at build, omitted by the refresh: became unavailable.
                    13: {tick: tick13, frameMat: frame13, state: 'complete'}
                }
            };
            self.applyStates([
                {cmid: 11, state: 'complete'},
                {cmid: 12, state: 'available'},
                {cmid: 99, state: 'complete'} // Unknown cmid: ignored.
            ]);
            const pass = tick11.visible === true && self.activities[11].state === 'complete' &&
                frameMat.color.getHex() === 0x39ff14 &&
                // Hover-restore colour tracks the refreshed state.
                panel11.userData.baseColour === 0x39ff14 &&
                tick12.visible === false &&
                // The omitted activity is invalidated to restricted, red, no tick.
                self.activities[13].state === 'restricted' && tick13.visible === false &&
                frame13.color.getHex() === 0xff3b6b;
            return {pass, detail: `t11=${tick11.visible} hex=${frameMat.color.getHex().toString(16)} ` +
                `base=${panel11.userData.baseColour.toString(16)} a13=${self.activities[13].state}`};
        }
    }
];

const launchOpts = {args: ['--no-sandbox', '--use-gl=swiftshader']};
if (exe) {
    launchOpts.executablePath = exe;
}
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
    if (m.type() === 'error') {
        errors.push(m.text());
    }
});

await page.goto(harness);
try {
    await page.waitForFunction(() => window.__mnemoReady === true, {timeout: 15000});
} catch (e) {
    console.error('Harness failed to initialise.');
    errors.forEach((x) => console.error('  ' + x));
    await browser.close();
    process.exit(2);
}

let failed = 0;
for (const sc of scenarios) {
    let res;
    try {
        res = await page.evaluate(sc.fn);
    } catch (e) {
        res = {pass: false, detail: 'threw: ' + String(e)};
    }
    const tag = res.pass ? 'PASS' : 'FAIL';
    if (!res.pass) {
        failed++;
    }
    console.log(`  [${tag}] ${sc.name}  (${res.detail})`);
}

await browser.close();
server.close();
console.log(`\n${scenarios.length - failed}/${scenarios.length} gesture scenarios passed.`);
process.exit(failed === 0 ? 0 : 1);
