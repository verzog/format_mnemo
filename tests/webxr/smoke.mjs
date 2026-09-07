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
            }, toggleVideo: CS.prototype.toggleVideo, activate: CS.prototype.activate};
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
