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
