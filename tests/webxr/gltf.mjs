// glTF loader test.
//
// Builds textured binary-glTF (.glb) models in Node, opens tests/webxr/
// harness.html in headless Chromium, and drives the real loader in vr.js
// (Cyberspace.prototype.parseGlb, using the real bundled Three.js) to assert
// the full common glTF scope is honoured: PBR textures and their colour
// spaces, all five map slots, multiple accessor component types, normalised
// vertex colours, UVs, samplers, alpha/blend, double-sidedness, the
// emissive-strength extension, data-URI images, and Draco rejection.
//
// Runs headless (no headset, no Moodle). Exits non-zero on any failure so it
// can gate CI. Run with: node gltf.mjs  (or npm test, which runs it after the
// gesture smoke test).

import {chromium} from 'playwright';
import {fileURLToPath} from 'url';
import {dirname, join, extname, normalize} from 'path';
import {createServer} from 'http';
import {readFile} from 'fs/promises';
import {deflateSync} from 'zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = normalize(join(here, '..', '..'));
const exe = process.env.PW_CHROMIUM || null;

// --- Minimal PNG encoder (so the test image is guaranteed valid) -------------

const CRC_TABLE = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed), 0);
    return Buffer.concat([len, typed, crc]);
}

// A tiny w*h RGBA PNG from an array of [r,g,b,a] pixels.
function makePng(w, h, pixels) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;  // Bit depth.
    ihdr[9] = 6;  // Colour type 6 = RGBA.
    const raw = Buffer.alloc(h * (1 + w * 4));
    let o = 0;
    for (let y = 0; y < h; y++) {
        raw[o++] = 0; // Filter: none.
        for (let x = 0; x < w; x++) {
            const p = pixels[y * w + x];
            raw[o++] = p[0];
            raw[o++] = p[1];
            raw[o++] = p[2];
            raw[o++] = p[3];
        }
    }
    return Buffer.concat([
        sig,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', deflateSync(raw)),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

// --- Minimal .glb assembler --------------------------------------------------

function f32(arr) {
    const b = Buffer.alloc(arr.length * 4);
    arr.forEach((v, i) => b.writeFloatLE(v, i * 4));
    return b;
}
function u32(arr) {
    const b = Buffer.alloc(arr.length * 4);
    arr.forEach((v, i) => b.writeUInt32LE(v, i * 4));
    return b;
}

// Wrap a glTF JSON object and a BIN buffer into a .glb ArrayBuffer (Buffer).
function wrapGlb(gltf, bin) {
    const enc = new TextEncoder();
    let json = Buffer.from(enc.encode(JSON.stringify(gltf)));
    while (json.length % 4 !== 0) {
        json = Buffer.concat([json, Buffer.from([0x20])]);
    }
    let binp = bin;
    while (binp.length % 4 !== 0) {
        binp = Buffer.concat([binp, Buffer.from([0])]);
    }
    const total = 12 + 8 + json.length + 8 + binp.length;
    const out = Buffer.alloc(total);
    let o = 0;
    out.writeUInt32LE(0x46546c67, o); o += 4; // "glTF"
    out.writeUInt32LE(2, o); o += 4;
    out.writeUInt32LE(total, o); o += 4;
    out.writeUInt32LE(json.length, o); o += 4;
    out.writeUInt32LE(0x4e4f534a, o); o += 4; // "JSON"
    json.copy(out, o); o += json.length;
    out.writeUInt32LE(binp.length, o); o += 4;
    out.writeUInt32LE(0x004e4942, o); o += 4; // "BIN\0"
    binp.copy(out, o);
    return out;
}

// Build a textured quad .glb exercising the full scope. opts.imageAsDataUri
// references the image by a data: URI instead of a bufferView; opts.alphaMode
// overrides the material alpha mode (default BLEND).
function buildTexturedGlb(opts) {
    opts = opts || {};
    const imageAsDataUri = !!opts.imageAsDataUri;
    const alphaMode = opts.alphaMode || 'BLEND';
    const bin = [];
    const bufferViews = [];
    const accessors = [];
    let offset = 0;
    const addView = (buf, target) => {
        while (offset % 4 !== 0) {
            bin.push(Buffer.from([0]));
            offset += 1;
        }
        const start = offset;
        bin.push(buf);
        offset += buf.length;
        const view = {buffer: 0, byteOffset: start, byteLength: buf.length};
        if (target) {
            view.target = target;
        }
        bufferViews.push(view);
        return bufferViews.length - 1;
    };

    // Geometry: a quad in the XY plane.
    const positions = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
    const normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
    // Vertex colours as UNSIGNED_BYTE-normalised VEC4 (exercises normalisation).
    const colors = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255]);
    const indices = [0, 1, 2, 0, 2, 3]; // UNSIGNED_INT (exercises 5125).

    const posView = addView(f32(positions), 34962);
    accessors.push({bufferView: posView, componentType: 5126, count: 4, type: 'VEC3',
        min: [-1, -1, 0], max: [1, 1, 0]});
    const posAcc = accessors.length - 1;

    const nrmView = addView(f32(normals), 34962);
    accessors.push({bufferView: nrmView, componentType: 5126, count: 4, type: 'VEC3'});
    const nrmAcc = accessors.length - 1;

    const uvView = addView(f32(uvs), 34962);
    accessors.push({bufferView: uvView, componentType: 5126, count: 4, type: 'VEC2'});
    const uvAcc = accessors.length - 1;

    // A second UV set (TEXCOORD_1), used by the occlusion texture below.
    const uv1View = addView(f32(uvs), 34962);
    accessors.push({bufferView: uv1View, componentType: 5126, count: 4, type: 'VEC2'});
    const uv1Acc = accessors.length - 1;

    const colView = addView(colors, 34962);
    accessors.push({bufferView: colView, componentType: 5121, normalized: true, count: 4, type: 'VEC4'});
    const colAcc = accessors.length - 1;

    const idxView = addView(u32(indices), 34963);
    accessors.push({bufferView: idxView, componentType: 5125, count: 6, type: 'SCALAR'});
    const idxAcc = accessors.length - 1;

    // A 2x2 magenta-ish PNG image.
    const png = makePng(2, 2, [
        [255, 0, 255, 255], [0, 255, 255, 255],
        [255, 255, 0, 255], [255, 255, 255, 255]
    ]);
    const images = [];
    if (imageAsDataUri) {
        images.push({uri: 'data:image/png;base64,' + png.toString('base64')});
    } else {
        const imgView = addView(png, 0);
        images.push({bufferView: imgView, mimeType: 'image/png'});
    }

    const gltf = {
        asset: {version: '2.0', generator: 'format_mnemo gltf-test'},
        extensionsUsed: ['KHR_materials_emissive_strength'],
        scene: 0,
        scenes: [{nodes: [0]}],
        nodes: [{mesh: 0}],
        meshes: [{
            primitives: [{
                attributes: {
                    POSITION: posAcc, NORMAL: nrmAcc, TEXCOORD_0: uvAcc,
                    TEXCOORD_1: uv1Acc, COLOR_0: colAcc
                },
                indices: idxAcc,
                material: 0
            }]
        }],
        materials: [{
            pbrMetallicRoughness: {
                baseColorFactor: [1, 1, 1, 0.5],
                baseColorTexture: {index: 0},
                metallicRoughnessTexture: {index: 0},
                metallicFactor: 1,
                roughnessFactor: 1
            },
            normalTexture: {index: 0, scale: 0.8},
            occlusionTexture: {index: 0, strength: 0.7, texCoord: 1},
            emissiveTexture: {index: 0},
            emissiveFactor: [1, 1, 1],
            alphaMode: alphaMode,
            doubleSided: true,
            extensions: {KHR_materials_emissive_strength: {emissiveStrength: 3}}
        }],
        textures: [{source: 0, sampler: 0}],
        samplers: [{wrapS: 10497, wrapT: 10497, magFilter: 9729, minFilter: 9987}],
        images: images,
        accessors: accessors,
        bufferViews: bufferViews,
        buffers: [{byteLength: offset}]
    };
    return wrapGlb(gltf, Buffer.concat(bin));
}

// A .glb whose primitive claims Draco compression; the loader must reject it.
function buildDracoGlb() {
    const gltf = {
        asset: {version: '2.0'},
        scene: 0,
        scenes: [{nodes: [0]}],
        nodes: [{mesh: 0}],
        meshes: [{primitives: [{attributes: {}, extensions: {KHR_draco_mesh_compression: {}}}]}],
        buffers: []
    };
    return wrapGlb(gltf, Buffer.alloc(0));
}

// --- Static server + browser -------------------------------------------------

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.map': 'application/json', '.json': 'application/json'
};
const server = createServer(async (req, res) => {
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
const harness = `http://127.0.0.1:${port}/tests/webxr/harness.html`;

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
    server.close();
    process.exit(2);
}

// Parse a base64 .glb in the page and report material/geometry facts.
const inspect = async (b64) => page.evaluate(async (data) => {
    const THREE = window.__mnemoTest.THREE;
    const CS = window.__mnemoModule._Cyberspace;
    const obj = Object.create(CS.prototype);
    obj.THREE = THREE;
    obj.day = {night: 1};
    obj.modelCache = {};

    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    const group = await obj.parseGlb(bytes.buffer, '');
    let mesh = null;
    group.traverse((o) => {
        if (o.isMesh) {
            mesh = o;
        }
    });
    if (!mesh) {
        return {error: 'no mesh'};
    }
    const m = mesh.material;
    const g = mesh.geometry;
    const col = g.getAttribute('color');
    const idx = g.getIndex();
    return {
        hasMap: !!(m.map && m.map.image),
        mapSrgb: m.map ? m.map.colorSpace === THREE.SRGBColorSpace : false,
        mapFlipY: m.map ? m.map.flipY === false : false,
        mapRepeat: m.map ? m.map.wrapS === THREE.RepeatWrapping : false,
        mrShared: !!(m.metalnessMap && m.metalnessMap === m.roughnessMap),
        mrLinear: m.metalnessMap ? m.metalnessMap.colorSpace === THREE.NoColorSpace : false,
        normalMap: !!m.normalMap,
        normalScale: m.normalMap ? Math.abs(m.normalScale.x - 0.8) < 1e-6 : false,
        aoMap: !!m.aoMap,
        aoStrength: m.aoMap ? Math.abs(m.aoMapIntensity - 0.7) < 1e-6 : false,
        aoChannel: m.aoMap ? m.aoMap.channel === 1 : false,
        emissiveMap: !!m.emissiveMap,
        emissiveGlow: m.emissiveIntensity > 0,
        emissiveStrength: Math.abs(m.emissiveIntensity - (0.7 + 1) * 3) < 1e-6,
        transparent: m.transparent === true && Math.abs(m.opacity - 0.5) < 1e-6,
        rawTransparent: m.transparent === true,
        rawOpacity: m.opacity,
        doubleSided: m.side === THREE.DoubleSide,
        vertexColors: m.vertexColors === true && !!col,
        colorNormalized: col ? col.normalized === true : false,
        hasUv: !!g.getAttribute('uv'),
        hasUv1: !!g.getAttribute('uv1'),
        indexUint: !!(idx && idx.array instanceof Uint32Array)
    };
}, b64);

const dracoRejects = async (b64) => page.evaluate(async (data) => {
    const THREE = window.__mnemoTest.THREE;
    const CS = window.__mnemoModule._Cyberspace;
    const obj = Object.create(CS.prototype);
    obj.THREE = THREE;
    obj.day = {night: 1};
    obj.modelCache = {};
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
    }
    try {
        await obj.parseGlb(bytes.buffer, '');
        return false;
    } catch (e) {
        return true;
    }
}, b64);

// --- Run the checks ----------------------------------------------------------

let failed = 0;
const check = (name, cond, detail) => {
    const tag = cond ? 'PASS' : 'FAIL';
    if (!cond) {
        failed++;
    }
    console.log(`  [${tag}] ${name}${detail ? '  (' + detail + ')' : ''}`);
};

const embedded = await inspect(buildTexturedGlb().toString('base64'));
if (embedded.error) {
    console.error('embedded model failed to parse: ' + embedded.error);
    errors.forEach((x) => console.error('  ' + x));
    await browser.close();
    server.close();
    process.exit(2);
}

check('base-colour texture loads with an image', embedded.hasMap);
check('base-colour texture is sRGB', embedded.mapSrgb);
check('textures are not Y-flipped (glTF convention)', embedded.mapFlipY);
check('sampler REPEAT wrap is applied', embedded.mapRepeat);
check('metallic-roughness texture shared by both slots', embedded.mrShared);
check('data textures stay linear (no colour space)', embedded.mrLinear);
check('normal map loads', embedded.normalMap);
check('normal scale is applied', embedded.normalScale);
check('occlusion map loads', embedded.aoMap);
check('occlusion strength is applied', embedded.aoStrength);
check('second UV set (TEXCOORD_1) is read', embedded.hasUv1);
check('occlusion samples its declared UV channel', embedded.aoChannel);
check('emissive map loads', embedded.emissiveMap);
check('emissive glows after dark', embedded.emissiveGlow);
check('emissive-strength extension is applied', embedded.emissiveStrength);
check('alpha BLEND + factor gives transparency', embedded.transparent);
check('double-sided material renders both faces', embedded.doubleSided);
check('vertex colours enabled with a colour attribute', embedded.vertexColors);
check('normalised UBYTE colours kept normalised', embedded.colorNormalized);
check('UV set is read', embedded.hasUv);
check('UNSIGNED_INT indices are read', embedded.indexUint);

const dataUri = await inspect(buildTexturedGlb({imageAsDataUri: true}).toString('base64'));
check('data-URI image path loads a texture', !dataUri.error && dataUri.hasMap);

// An OPAQUE material with a sub-1 base-colour alpha must stay opaque.
const opaque = await inspect(buildTexturedGlb({alphaMode: 'OPAQUE'}).toString('base64'));
check('OPAQUE material with alpha < 1 stays opaque',
    !opaque.error && opaque.rawTransparent === false && Math.abs(opaque.rawOpacity - 0.5) < 1e-6);

const draco = await dracoRejects(buildDracoGlb().toString('base64'));
check('Draco-compressed primitive is rejected', draco);

// URL-reference resolution for external resources (Codex P2).
const urls = await page.evaluate(() => {
    const CS = window.__mnemoModule._Cyberspace;
    const obj = Object.create(CS.prototype);
    return {
        rootRelative: obj.resolveUrl('/shared/tex.png', 'https://host/pack/models/'),
        relative: obj.resolveUrl('tex.png', 'https://host/pack/models/'),
        absolute: obj.resolveUrl('https://cdn.example/tex.png', 'https://host/pack/'),
        data: obj.resolveUrl('data:image/png;base64,AAAA', 'https://host/pack/')
    };
});
check('root-relative URI resolves against the origin',
    urls.rootRelative === 'https://host/shared/tex.png');
check('relative URI resolves against the model directory',
    urls.relative === 'https://host/pack/models/tex.png');
check('absolute URI is kept as-is', urls.absolute === 'https://cdn.example/tex.png');
check('data URI is kept as-is', urls.data === 'data:image/png;base64,AAAA');

// One image referenced twice with different texCoord must yield distinct
// textures with the right channels (per-reference cache key, Codex P2).
const cache = await page.evaluate(() => {
    const THREE = window.__mnemoTest.THREE;
    const CS = window.__mnemoModule._Cyberspace;
    const obj = Object.create(CS.prototype);
    obj.THREE = THREE;
    // A plain truthy object is enough as the texture "image" here.
    const ctx = {
        json: {textures: [{source: 0}], samplers: []},
        images: [{width: 1, height: 1}], texCache: {}
    };
    const a = obj.glbTexture(ctx, {index: 0, texCoord: 0}, false);
    const b = obj.glbTexture(ctx, {index: 0, texCoord: 1}, false);
    return {distinct: a !== b, chanA: a.channel || 0, chanB: b.channel};
});
check('same image, different texCoord => distinct cached textures',
    cache.distinct && cache.chanA === 0 && cache.chanB === 1);

await browser.close();
server.close();

const total = 29;
console.log(`\n${total - failed}/${total} glTF loader checks passed.`);
if (errors.length) {
    errors.forEach((x) => console.error('page error: ' + x));
}
process.exit(failed === 0 ? 0 : 1);
