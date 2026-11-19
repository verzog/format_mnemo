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
    // End caps (a triangle fan around a centre vertex) so the cylinder is a
    // solid disc from top and bottom, not an open tube - e.g. the lamp's
    // downlight lens must read as a lit disc when seen from the street below.
    [hy, -hy].forEach(function(cy) {
        var up = cy > 0 ? 1 : -1;
        var centre = pos.length / 3;
        pos.push(0, cy, 0);
        nrm.push(0, up, 0);
        var ring = [];
        for (var j = 0; j < seg; j++) {
            var a = (j / seg) * Math.PI * 2;
            ring.push(pos.length / 3);
            pos.push(Math.cos(a) * radius, cy, Math.sin(a) * radius);
            nrm.push(0, up, 0);
        }
        for (var k = 0; k < seg; k++) {
            var nx = (k + 1) % seg;
            // Wind so the face points outward (+Y up, -Y down).
            if (up > 0) {
                idx.push(centre, ring[k], ring[nx]);
            } else {
                idx.push(centre, ring[nx], ring[k]);
            }
        }
    });
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
    // A sleeker cyberspace street lamp: a tapered pole on a stepped base, with a
    // neon collar and a thin neon strip up the pole, topped by a CENTRED
    // luminaire whose lit disc faces straight down (coaxial with the pole, so
    // the light pool sits directly under it - the scene's point light and glow
    // cone are placed at this centred head, see addLampLight/lampCone).
    var neon = {color: [0, 0, 0, 1], emissive: [0.18, 1.05, 1.35]}; // Subtle cyan accent.
    var down = {color: [0, 0, 0, 1], emissive: [2.4, 2.0, 1.3]};    // Warm downlight lens.
    return [
        // Stepped base plinth.
        {g: place(cylinder(0.42, 0.3, 16), {t: [0, 0.15, 0]}), m: METAL},
        {g: place(cylinder(0.3, 0.22, 16), {t: [0, 0.42, 0]}), m: METAL},
        // Tapered pole: a wider lower segment and a slimmer upper one.
        {g: place(cylinder(0.17, 3.4, 16), {t: [0, 2.0, 0]}), m: METAL},
        {g: place(cylinder(0.11, 2.6, 16), {t: [0, 5.0, 0]}), m: METAL},
        // Neon collar ring partway up, and a thin neon strip running up the pole.
        {g: place(cylinder(0.23, 0.16, 20), {t: [0, 1.9, 0]}), m: neon},
        {g: place(box(0.04, 4.8, 0.04), {t: [0.18, 2.6, 0]}), m: neon},
        // Luminaire crown on top of the pole (a wider rim and a neon ring).
        {g: place(cylinder(0.5, 0.22, 20), {t: [0, 6.35, 0]}), m: METAL},
        {g: place(cylinder(0.46, 0.14, 20), {t: [0, 6.18, 0]}), m: neon},
        // Warm downlight lens on the underside - the lit head, centred over the
        // pole so the light reads straight down.
        {g: place(cylinder(0.4, 0.08, 20), {t: [0, 6.08, 0]}), m: down},
        // Small finial cap on the very top.
        {g: place(cylinder(0.12, 0.18, 12), {t: [0, 6.55, 0]}), m: METAL}
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

// Quiz building: a stepped neo-noir tower (front faces +Z) with warm lit
// windows, cyan neon corner edges and a magenta crown. Kept well inside the
// 20,000-triangle building budget, in four materials.
var FACADE = {color: [0.06, 0.07, 0.09, 1], metallic: 0.4, roughness: 0.55};
var WINDOW = {color: [0, 0, 0, 1], emissive: [1.6, 1.15, 0.45]};
var NEON = {color: [0, 0, 0, 1], emissive: [0, 1.6, 1.9]};
var CROWN = {color: [0, 0, 0, 1], emissive: [1.8, 0.2, 1.3]};

// Lit windows on all four faces of a w x d block: cols per face, one row per
// floor from y0 upwards. Each pane sits just proud of its face. Some panes are
// left dark (a fixed pattern) so the tower does not look uniformly lit.
function windows(w, d, y0, floors, cols, floorh) {
    var parts = [];
    var faces = [
        {ry: 0, half: d / 2, span: w},
        {ry: Math.PI, half: d / 2, span: w},
        {ry: Math.PI / 2, half: w / 2, span: d},
        {ry: -Math.PI / 2, half: w / 2, span: d}
    ];
    faces.forEach(function(f, fi) {
        var pitch = f.span / cols;
        for (var r = 0; r < floors; r++) {
            for (var c = 0; c < cols; c++) {
                if ((r * 7 + c * 3 + fi * 5) % 5 === 0) {
                    continue;
                }
                var x = -f.span / 2 + pitch * (c + 0.5);
                var y = y0 + floorh * (r + 0.5);
                // Place on the +Z face, then turn the pane round to its face.
                var cs = Math.cos(f.ry);
                var sn = Math.sin(f.ry);
                parts.push({g: place(box(pitch * 0.62, floorh * 0.5, 0.06), {
                    t: [x * cs + f.half * sn, y, -x * sn + f.half * cs], ry: f.ry
                }), m: WINDOW});
            }
        }
    });
    return parts;
}

// Neon strips up the four vertical corners of a w x d block.
function cornerEdges(w, d, y0, h) {
    var parts = [];
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function(k) {
        parts.push({g: place(box(0.14, h, 0.14), {t: [k[0] * w / 2, y0 + h / 2, k[1] * d / 2]}), m: NEON});
    });
    return parts;
}

function buildingQuiz() {
    var parts = [
        // Podium, shaft and setback crown block.
        {g: place(box(12, 3, 12), {t: [0, 1.5, 0]}), m: FACADE},
        {g: place(box(9, 21, 9), {t: [0, 13.5, 0]}), m: FACADE},
        {g: place(box(6.5, 5, 6.5), {t: [0, 26.5, 0]}), m: FACADE},
        // Antenna mast and its beacon.
        {g: place(cylinder(0.12, 4, 8), {t: [0, 31, 0]}), m: FACADE},
        {g: place(box(0.4, 0.4, 0.4), {t: [0, 33.2, 0]}), m: CROWN},
        // Lit entrance and a neon canopy over it, on the front (+Z).
        {g: place(box(3.2, 2.2, 0.06), {t: [0, 1.1, 6.03]}), m: WINDOW},
        {g: place(box(5, 0.12, 1.2), {t: [0, 2.6, 6.5]}), m: NEON},
        // Neon trim round the podium roof edge, and the crown bands.
        {g: place(box(12.2, 0.14, 0.14), {t: [0, 3.0, 6.03]}), m: NEON},
        {g: place(box(12.2, 0.14, 0.14), {t: [0, 3.0, -6.03]}), m: NEON},
        {g: place(box(0.14, 0.14, 12.2), {t: [6.03, 3.0, 0]}), m: NEON},
        {g: place(box(0.14, 0.14, 12.2), {t: [-6.03, 3.0, 0]}), m: NEON},
        {g: place(box(9.2, 0.5, 9.2), {t: [0, 24.0, 0]}), m: CROWN},
        {g: place(box(6.7, 0.3, 6.7), {t: [0, 29.0, 0]}), m: CROWN}
    ];
    return parts
        .concat(windows(9, 9, 3, 10, 4, 2))
        .concat(windows(6.5, 6.5, 24, 2, 3, 2.2))
        .concat(cornerEdges(9, 9, 3, 21))
        .concat(cornerEdges(6.5, 6.5, 24, 5));
}

const props = {
    av: av(),
    lamp: lamp(),
    kiosk: kiosk(),
    'building-quiz': buildingQuiz()
};

await mkdir(outDir, {recursive: true});
for (const [name, parts] of Object.entries(props)) {
    const glb = buildGlb(parts);
    await writeFile(join(outDir, name + '.glb'), glb);
    console.log(`wrote ${name}.glb (${glb.length} bytes)`);
}
