// Prop model generator (dev-only, not shipped/loaded at runtime).
//
// Hand-writes standard binary glTF (.glb) files for the plugin's original
// street/traffic props into models/. Dependency-free: it builds primitive
// geometry (boxes, cylinders), bakes each part's transform into vertices,
// groups parts by material into one mesh, and packs a valid .glb container.
//
// Run: node tools/gen-models.mjs   (regenerate after editing a prop below)

import {writeFile, mkdir} from 'fs/promises';
import {fileURLToPath} from 'url';
import {dirname, join} from 'path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'models');

// --- Primitive geometry (local space, centred at origin) ---------------------

function box(w, h, d) {
    var x = w / 2;
    var y = h / 2;
    var z = d / 2;
    // 6 faces, 4 verts each, with per-face normals.
    var faces = [
        {n: [0, 0, 1], v: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]},
        {n: [0, 0, -1], v: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]},
        {n: [1, 0, 0], v: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]]},
        {n: [-1, 0, 0], v: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]]},
        {n: [0, 1, 0], v: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]]},
        {n: [0, -1, 0], v: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]]}
    ];
    var pos = [];
    var nrm = [];
    var idx = [];
    faces.forEach(function(f, fi) {
        f.v.forEach(function(v) {
            pos.push(v[0], v[1], v[2]);
            nrm.push(f.n[0], f.n[1], f.n[2]);
        });
        var b = fi * 4;
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    return {pos: pos, nrm: nrm, idx: idx};
}

function cylinder(radius, height, seg) {
    var pos = [];
    var nrm = [];
    var idx = [];
    var hy = height / 2;
    for (var i = 0; i < seg; i++) {
        var a0 = (i / seg) * Math.PI * 2;
        var a1 = ((i + 1) / seg) * Math.PI * 2;
        var x0 = Math.cos(a0);
        var z0 = Math.sin(a0);
        var x1 = Math.cos(a1);
        var z1 = Math.sin(a1);
        var b = pos.length / 3;
        pos.push(x0 * radius, -hy, z0 * radius, x1 * radius, -hy, z1 * radius,
            x1 * radius, hy, z1 * radius, x0 * radius, hy, z0 * radius);
        nrm.push(x0, 0, z0, x1, 0, z1, x1, 0, z1, x0, 0, z0);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    return {pos: pos, nrm: nrm, idx: idx};
}

// Bake a translate + Y-rotation + scale into a geometry's vertices.
function place(geom, opts) {
    var t = opts.t || [0, 0, 0];
    var s = opts.s || [1, 1, 1];
    var ry = opts.ry || 0;
    var c = Math.cos(ry);
    var sn = Math.sin(ry);
    var out = {pos: [], nrm: [], idx: geom.idx.slice()};
    for (var i = 0; i < geom.pos.length; i += 3) {
        var px = geom.pos[i] * s[0];
        var py = geom.pos[i + 1] * s[1];
        var pz = geom.pos[i + 2] * s[2];
        out.pos.push(px * c + pz * sn + t[0], py + t[1], -px * sn + pz * c + t[2]);
        var nx = geom.nrm[i];
        var nz = geom.nrm[i + 2];
        out.nrm.push(nx * c + nz * sn, geom.nrm[i + 1], -nx * sn + nz * c);
    }
    return out;
}

// --- glTF assembly -----------------------------------------------------------

function buildGlb(parts) {
    // Group parts by material signature so each material is one primitive.
    var mats = [];
    var byMat = {};
    parts.forEach(function(p) {
        var key = JSON.stringify(p.m);
        if (byMat[key] === undefined) {
            byMat[key] = mats.length;
            mats.push(p.m);
        }
        p.mi = byMat[key];
    });

    var chunks = []; // {pos:[], nrm:[], idx:[], mi}
    mats.forEach(function(_, mi) {
        chunks.push({pos: [], nrm: [], idx: [], mi: mi});
    });
    parts.forEach(function(p) {
        var ch = chunks[p.mi];
        var base = ch.pos.length / 3;
        ch.pos = ch.pos.concat(p.g.pos);
        ch.nrm = ch.nrm.concat(p.g.nrm);
        p.g.idx.forEach(function(v) {
            ch.idx.push(v + base);
        });
    });

    var bin = [];
    var bufferViews = [];
    var accessors = [];
    var primitives = [];

    var pushView = function(bytes, target) {
        while (bin.length % 4 !== 0) {
            bin.push(0);
        }
        var offset = bin.length;
        for (var i = 0; i < bytes.length; i++) {
            bin.push(bytes[i]);
        }
        bufferViews.push({buffer: 0, byteOffset: offset, byteLength: bytes.length, target: target});
        return bufferViews.length - 1;
    };
    var f32 = function(arr) {
        var b = new Uint8Array(new Float32Array(arr).buffer);
        return Array.from(b);
    };
    var u16 = function(arr) {
        var b = new Uint8Array(new Uint16Array(arr).buffer);
        return Array.from(b);
    };
    var minmax = function(arr) {
        var mn = [Infinity, Infinity, Infinity];
        var mx = [-Infinity, -Infinity, -Infinity];
        for (var i = 0; i < arr.length; i += 3) {
            for (var k = 0; k < 3; k++) {
                mn[k] = Math.min(mn[k], arr[i + k]);
                mx[k] = Math.max(mx[k], arr[i + k]);
            }
        }
        return {min: mn, max: mx};
    };

    chunks.forEach(function(ch) {
        var pv = pushView(f32(ch.pos), 34962);
        var mm = minmax(ch.pos);
        accessors.push({bufferView: pv, componentType: 5126, count: ch.pos.length / 3,
            type: 'VEC3', min: mm.min, max: mm.max});
        var posAcc = accessors.length - 1;
        var nv = pushView(f32(ch.nrm), 34962);
        accessors.push({bufferView: nv, componentType: 5126, count: ch.nrm.length / 3, type: 'VEC3'});
        var nrmAcc = accessors.length - 1;
        var iv = pushView(u16(ch.idx), 34963);
        accessors.push({bufferView: iv, componentType: 5123, count: ch.idx.length, type: 'SCALAR'});
        var idxAcc = accessors.length - 1;
        primitives.push({attributes: {POSITION: posAcc, NORMAL: nrmAcc}, indices: idxAcc, material: ch.mi});
    });

    var gltf = {
        asset: {version: '2.0', generator: 'format_mnemo gen-models'},
        scene: 0,
        scenes: [{nodes: [0]}],
        nodes: [{mesh: 0}],
        meshes: [{primitives: primitives}],
        materials: mats.map(function(m) {
            return {
                pbrMetallicRoughness: {
                    baseColorFactor: m.color || [0.8, 0.8, 0.8, 1],
                    metallicFactor: m.metallic === undefined ? 0.1 : m.metallic,
                    roughnessFactor: m.roughness === undefined ? 0.8 : m.roughness
                },
                emissiveFactor: m.emissive || [0, 0, 0]
            };
        }),
        accessors: accessors,
        bufferViews: bufferViews,
        buffers: [{byteLength: bin.length}]
    };

    // Pack the GLB container.
    var enc = new TextEncoder();
    var jsonBytes = Array.from(enc.encode(JSON.stringify(gltf)));
    while (jsonBytes.length % 4 !== 0) {
        jsonBytes.push(0x20);
    }
    while (bin.length % 4 !== 0) {
        bin.push(0);
    }
    var total = 12 + 8 + jsonBytes.length + 8 + bin.length;
    var out = new Uint8Array(total);
    var dv = new DataView(out.buffer);
    var o = 0;
    dv.setUint32(o, 0x46546c67, true); o += 4; // "glTF"
    dv.setUint32(o, 2, true); o += 4;
    dv.setUint32(o, total, true); o += 4;
    dv.setUint32(o, jsonBytes.length, true); o += 4;
    dv.setUint32(o, 0x4e4f534a, true); o += 4; // "JSON"
    out.set(jsonBytes, o); o += jsonBytes.length;
    dv.setUint32(o, bin.length, true); o += 4;
    dv.setUint32(o, 0x004e4942, true); o += 4; // "BIN\0"
    out.set(bin, o);
    return out;
}

// --- Props -------------------------------------------------------------------

var METAL = {color: [0.05, 0.06, 0.08, 1], metallic: 0.9, roughness: 0.35};
var GLASS = {color: [0.08, 0.13, 0.18, 1], metallic: 0.3, roughness: 0.12, emissive: [0.02, 0.05, 0.08]};
var CONCRETE = {color: [0.5, 0.5, 0.52, 1], metallic: 0.0, roughness: 0.95};

function av() {
    return [
        {g: place(box(4, 0.7, 1.8), {t: [0, 0, 0]}), m: METAL},
        {g: place(box(1.9, 0.6, 1.5), {t: [-0.2, 0.6, 0]}), m: GLASS},
        {g: place(box(3.6, 0.12, 1.4), {t: [0, -0.42, 0]}), m: {color: [0, 0, 0, 1], emissive: [0, 1.6, 1.9]}},
        {g: place(box(0.12, 0.22, 1.7), {t: [2.05, 0.12, 0]}), m: {color: [0, 0, 0, 1], emissive: [1.8, 0.1, 0.1]}},
        {g: place(box(0.6, 0.5, 0.12), {t: [1.7, 0.3, 0.85]}), m: METAL},
        {g: place(box(0.6, 0.5, 0.12), {t: [1.7, 0.3, -0.85]}), m: METAL}
    ];
}

function lamp() {
    return [
        {g: place(cylinder(0.12, 6, 10), {t: [0, 3, 0]}), m: METAL},
        {g: place(box(1.4, 0.12, 0.12), {t: [0.6, 5.9, 0]}), m: METAL},
        {g: place(box(0.8, 0.25, 0.42), {t: [1.2, 5.78, 0]}), m: METAL},
        {g: place(box(0.62, 0.09, 0.3), {t: [1.2, 5.63, 0]}), m: {color: [0, 0, 0, 1], emissive: [2.2, 1.7, 0.9]}}
    ];
}

function kiosk() {
    return [
        {g: place(box(3, 2.4, 2), {t: [0, 1.2, 0]}), m: {color: [0.09, 0.08, 0.11, 1], roughness: 0.7, metallic: 0.2}},
        {g: place(box(3.4, 0.12, 1.0), {t: [0, 2.5, 1.1]}), m: {color: [0.6, 0.1, 0.3, 1], roughness: 0.5}},
        {g: place(box(2.2, 1.2, 0.08), {t: [0, 1.55, 1.02]}), m: {color: [0, 0, 0, 1], emissive: [1.8, 0.2, 1.3]}},
        {g: place(box(2.8, 0.07, 0.1), {t: [0, 0.7, 1.0]}), m: {color: [0, 0, 0, 1], emissive: [0, 1.4, 1.7]}}
    ];
}

function barrier() {
    return [
        {g: place(box(2, 0.9, 0.5), {t: [0, 0.45, 0]}), m: CONCRETE},
        {g: place(box(2.02, 0.22, 0.52), {t: [0, 0.62, 0]}), m: {color: [0, 0, 0, 1], emissive: [1.6, 0.9, 0]}}
    ];
}

const props = {av: av(), lamp: lamp(), kiosk: kiosk(), barrier: barrier()};

await mkdir(outDir, {recursive: true});
for (const [name, parts] of Object.entries(props)) {
    const glb = buildGlb(parts);
    await writeFile(join(outDir, name + '.glb'), glb);
    console.log(`wrote ${name}.glb (${glb.length} bytes)`);
}
