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
                config: {canedit: false}, roadMeshes: [],
                tiledClone: CS.prototype.tiledClone,
                registerSurfaceMesh: CS.prototype.registerSurfaceMesh,
                scene: {add: (o) => added.push(o)},
                paveStrip: CS.prototype.paveStrip
            };
            self.paveStrip(0, 0, 16, 32, 0);
            const map = added[0].material.map;
            const pass = !!map && map.repeat.x === 2 && map.repeat.y === 4 &&
                map.wrapS === THREE.RepeatWrapping;
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
                THREE, roadTexture: null, roadScale: 8,
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
                config: {canedit: false}, groundMeshes: [],
                tiledClone: CS.prototype.tiledClone,
                registerSurfaceMesh: CS.prototype.registerSurfaceMesh,
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
                THREE, editables: [], selBox: null, renderer: null,
                registerEditable: CS.prototype.registerEditable,
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
                tiledClone: CS.prototype.tiledClone,
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
                selBox: null, renderer: null,
                placedBaseY: CS.prototype.placedBaseY,
                propLabel: CS.prototype.propLabel,
                setShadow: CS.prototype.setShadow,
                registerSceneEditable: CS.prototype.registerSceneEditable,
                applyTransform: CS.prototype.applyTransform,
                applyBrightness: CS.prototype.applyBrightness,
                placeProp: CS.prototype.placeProp
            };
            self.placeProp('lamp', 7, 4, -6);
            const ed = self.editables[0];
            const g = ed && ed.group;
            const pass = self.placedObjects.length === 1 && self.placedObjects[0].id === 7 &&
                ed && ed.objkey === 'placed:7' && ed.emits === true &&
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
