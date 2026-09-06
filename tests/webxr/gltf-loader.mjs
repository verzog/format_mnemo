// Addon glTF-loader test.
//
// Opens tests/webxr/loader-harness.html in headless Chromium — which loads the
// bundled Three.js and its addon loader stack (GLTFLoader + Draco/KTX2/meshopt)
// through the same import map the plugin uses — then drives the real
// Cyberspace.loadModel() against uncompressed, Draco- and meshopt-compressed
// .glb fixtures to prove the compressed-asset pipeline works end to end.
//
// Runs headless (no headset, no Moodle). Exits non-zero on any failure so it
// can gate CI. Run with: node gltf-loader.mjs  (or npm test).

import {chromium} from 'playwright';
import {fileURLToPath} from 'url';
import {dirname, join, extname, normalize} from 'path';
import {createServer} from 'http';
import {readFile} from 'fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = normalize(join(here, '..', '..'));
const exe = process.env.PW_CHROMIUM || null;

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.map': 'application/json', '.json': 'application/json', '.wasm': 'application/wasm',
    '.glb': 'model/gltf-binary'
};
const server = createServer(async(req, res) => {
    try {
        const p = normalize(join(repoRoot, decodeURIComponent(req.url.split('?')[0])));
        if (!p.startsWith(repoRoot)) {
            res.writeHead(403);
            res.end();
            return;
        }
        const body = await readFile(p);
        res.writeHead(200, {'Content-Type': MIME[extname(p)] || 'application/octet-stream'});
        res.end(body);
    } catch (e) {
        res.writeHead(404);
        res.end();
    }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const launchOpts = {
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
};
if (exe) {
    launchOpts.executablePath = exe;
}
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', String(e)));

let failed = 0;
const check = (name, pass, detail) => {
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? '  (' + detail + ')' : ''}`);
    if (!pass) {
        failed++;
    }
};

await page.goto(`http://127.0.0.1:${port}/tests/webxr/loader-harness.html`);
try {
    await page.waitForFunction(() => window.__loaderReady === true, {timeout: 20000});
} catch (e) {
    console.error('FATAL: addon loader stack did not load (import map / addons failed).');
    await browser.close();
    server.close();
    process.exit(1);
}

// Load a fixture through the real Cyberspace.loadModel() with the real addons.
async function loadFixture(name) {
    return page.evaluate(async(url) => {
        const CS = window.__mnemoModule._Cyberspace;
        const boot = window.__mnemoLoader;
        const obj = {
            THREE: boot.THREE,
            loaders: boot.loaders,
            config: {addonsbaseurl: '../../thirdparty/jsm/'},
            renderer: null, // No renderer here; KTX2 support detection is skipped.
            modelCache: {},
            day: {night: 0.5},
            gltf: CS.prototype.gltf,
            loadModel: CS.prototype.loadModel,
            dressLoadedModel: CS.prototype.dressLoadedModel
        };
        try {
            const group = await obj.loadModel(url);
            let meshes = 0, verts = 0;
            group.traverse((o) => {
                if (o.isMesh) {
                    meshes++;
                    if (o.geometry && o.geometry.attributes.position) {
                        verts += o.geometry.attributes.position.count;
                    }
                }
            });
            // A second call returns the cached promise (same group instance).
            const again = await obj.loadModel(url);
            return {ok: true, meshes, verts, cached: again === group};
        } catch (e) {
            return {ok: false, err: String(e && e.message || e)};
        }
    }, `http://127.0.0.1:${port}/tests/webxr/fixtures/${name}`);
}

const plain = await loadFixture('av.glb');
check('uncompressed .glb loads via GLTFLoader', plain.ok && plain.meshes > 0 && plain.verts > 0,
    plain.ok ? `meshes=${plain.meshes} verts=${plain.verts}` : plain.err);
check('loadModel caches per URL', plain.ok && plain.cached === true);

const draco = await loadFixture('av-draco.glb');
check('Draco-compressed .glb decodes', draco.ok && draco.meshes > 0 && draco.verts > 0,
    draco.ok ? `meshes=${draco.meshes} verts=${draco.verts}` : draco.err);

const meshopt = await loadFixture('av-meshopt.glb');
check('meshopt-compressed .glb decodes', meshopt.ok && meshopt.meshes > 0 && meshopt.verts > 0,
    meshopt.ok ? `meshes=${meshopt.meshes} verts=${meshopt.verts}` : meshopt.err);

// dressLoadedModel raises emissiveIntensity for an emissive material at night,
// but keeps an intentionally disabled emission (intensity 0) off.
const dressed = await page.evaluate(() => {
    const THREE = window.__mnemoLoader.THREE;
    const CS = window.__mnemoModule._Cyberspace;
    const g = new THREE.Group();
    const glow = new THREE.MeshStandardMaterial({emissive: new THREE.Color(1, 0, 0)});
    const off = new THREE.MeshStandardMaterial({emissive: new THREE.Color(1, 0, 0)});
    off.emissiveIntensity = 0;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glow));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), off));
    CS.prototype.dressLoadedModel.call({day: {night: 1}}, g);
    return {glow: glow.emissiveIntensity, off: off.emissiveIntensity};
});
check('dressLoadedModel boosts emissive at night', Math.abs(dressed.glow - 1.7) < 1e-6, `glow=${dressed.glow}`);
check('dressLoadedModel keeps disabled emission off', dressed.off === 0, `off=${dressed.off}`);

const total = 6;
console.log(`\n${total - failed}/${total} addon glTF loader checks passed.`);

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
