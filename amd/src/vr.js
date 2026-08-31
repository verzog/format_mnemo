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

/**
 * Mnemo course format - WebXR cyberspace renderer.
 *
 * Hand-rolled Three.js (no framework) scene that lays out the course as a
 * Night-City-style megalopolis. The course is a main avenue; each topic is a
 * neon side street branching off it, and each activity is a building or shop
 * lining that street, styled after Cyberpunk's architectural movements
 * (Entropism, Kitsch, Neo-Militarism, Neo-Kitsch) according to what kind of
 * activity it is. The skyline behind is dressed with corporate mega-buildings,
 * elevated highways over shadowed vertical slums, and giant holographic ads.
 *
 * Learners fly through it on screen (drag + WASD, click to open) or in a WebXR
 * headset with gestural navigation: point and pinch / squeeze the trigger to
 * glide toward what you are looking at, and pinch on a node to open it.
 *
 * Three.js is loaded as an ES module via dynamic import from an admin
 * configurable URL, so this file has no build-time dependency on it.
 *
 * @module     format_mnemo/vr
 * @copyright  2026 format_mnemo contributors
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
define('format_mnemo/vr', [], function() {

    // Neon palettes: [primary, secondary] hex ints. Drives wayfinding colour
    // (topic gates, interactive highlights) so the admin choice still reads
    // through the architectural styling.
    var PALETTES = {
        cyan: {primary: 0x00e5ff, secondary: 0x0066ff, sky: 0x03060f, haze: 0x0a1830},
        amber: {primary: 0xffb300, secondary: 0xff5722, sky: 0x0a0600, haze: 0x2a1400},
        magenta: {primary: 0xff2bd6, secondary: 0x7c1fff, sky: 0x0a0210, haze: 0x24072a},
        green: {primary: 0x39ff14, secondary: 0x00b3a4, sky: 0x00080a, haze: 0x04241c}
    };

    // Activity state colours.
    var STATE_COLOURS = {
        complete: 0x39ff14,
        available: null, // Filled from the palette primary at build time.
        restricted: 0xff3b6b
    };

    // The four Night-City architectural movements, each a small material recipe.
    //   entropism      - poverty/survival: weathered, rusted, outdated, patched.
    //   kitsch         - a faded hopeful era: bright neon, cheap plastic, busy.
    //   neomilitarism  - mega-corp power: cold black steel, titanium, imposing.
    //   neokitsch      - the wealthy elite: smooth curves, warm marble and wood.
    var STYLES = {
        entropism: {
            edge: 0x8a5a2b, glow: 0xffa042, face: 0x0b0805, faceOpacity: 0.92,
            lit: 0xffb454, density: 0.32, wireframe: true, form: 'block',
            footprint: [4.2, 4.4], height: [5, 9]
        },
        kitsch: {
            edge: 0xff3cc7, glow: 0x00e5ff, face: 0x11041a, faceOpacity: 0.82,
            lit: 0xff5bd0, density: 0.62, wireframe: false, form: 'shop',
            footprint: [5.2, 4.4], height: [4.5, 6.5]
        },
        neomilitarism: {
            edge: 0x33404e, glow: 0xff2b4e, face: 0x04060a, faceOpacity: 0.97,
            lit: 0x9fb4c9, density: 0.14, wireframe: false, form: 'tower',
            footprint: [3.2, 3.2], height: [15, 24]
        },
        neokitsch: {
            edge: 0xffe6a8, glow: 0xffcf7a, face: 0x14100a, faceOpacity: 0.86,
            lit: 0xfff2cf, density: 0.28, wireframe: false, form: 'pavilion',
            footprint: [4.6, 4.4], height: [8, 12]
        }
    };

    // Which architectural style an activity's module speaks in. Assessment and
    // "serious" tools read as cold corporate towers; social/communication tools
    // as bright plastic kitsch shops; content/reference as elite neo-kitsch
    // pavilions; anything else falls to survival-era entropism.
    var MOD_STYLE = {
        quiz: 'neomilitarism', assign: 'neomilitarism', workshop: 'neomilitarism',
        lesson: 'neomilitarism', scorm: 'neomilitarism', bigbluebuttonbn: 'neomilitarism',
        forum: 'kitsch', chat: 'kitsch', choice: 'kitsch', feedback: 'kitsch',
        wiki: 'kitsch', glossary: 'kitsch', data: 'kitsch', survey: 'kitsch',
        page: 'neokitsch', book: 'neokitsch', resource: 'neokitsch', url: 'neokitsch',
        folder: 'neokitsch', imscp: 'neokitsch', h5pactivity: 'neokitsch', lti: 'neokitsch'
    };

    /**
     * The running scene instance. Encapsulates all Three.js state so multiple
     * inits (unlikely, but defensive) do not clash.
     *
     * @param {Object} THREE The imported Three.js module namespace.
     * @param {HTMLElement} root The scene mount element.
     * @param {Object} config The scene configuration from PHP.
     */
    function Cyberspace(THREE, root, config) {
        this.THREE = THREE;
        this.root = root;
        this.config = config;
        this.palette = PALETTES[config.palette] || PALETTES.cyan;
        STATE_COLOURS.available = this.palette.primary;

        this.interactive = []; // Meshes that can be gazed/clicked to open.
        this.hovered = null; // Currently highlighted mesh.
        this.controllers = []; // XR controller target-ray spaces.
        this.keys = {}; // Held keyboard keys.
        this.yaw = 0; // Desktop look yaw.
        this.pitch = 0; // Desktop look pitch.
        this.invertlook = !!config.invertlook; // Invert drag-to-look direction.
        this.dragging = false;
        this.pointerMoved = 0;
        this.lastPointer = {x: 0, y: 0};
        this.tmp = new THREE.Vector3();
        this.tmp2 = new THREE.Vector3(); // Scratch for measuring per-frame motion.
        this.pointerNdc = new THREE.Vector2(-2, -2); // Off-screen by default.
        this.clock = new THREE.Clock();
        this.time = 0; // Accumulated seconds, for cheap animation.
        this.brake = false; // Open-palm brake: suppress locomotion this frame.
        this.gestures = null; // XR gesture manager (built after the renderer).

        this.spinners = []; // Rooftop holo elements that rotate.
        this.ads = []; // Holographic billboards that flicker.
        this.beacons = []; // Rooftop lights that blink.
        this.texCache = {}; // Cached window/ad canvas textures, keyed by string.

        this.build();
    }

    Cyberspace.prototype.build = function() {
        var THREE = this.THREE;

        // Renderer.
        var renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        // Do not let Three.js write inline width/height on the canvas; the
        // stylesheet sizes it responsively to the stage instead.
        renderer.setSize(this.root.clientWidth, this.root.clientHeight || 480, false);
        renderer.xr.enabled = true;
        this.root.appendChild(renderer.domElement);
        this.renderer = renderer;

        // Scene, camera, player rig.
        var scene = new THREE.Scene();
        scene.background = new THREE.Color(this.palette.sky);
        if (this.config.environment !== 'void') {
            // A hazy, coloured fog band is what gives the city its smoggy,
            // light-bleeding depth.
            scene.fog = new THREE.FogExp2(this.palette.haze, 0.016);
        }
        this.scene = scene;

        var camera = new THREE.PerspectiveCamera(
            72, this.aspect(), 0.1, 600
        );
        camera.position.set(0, 1.6, 0);
        this.camera = camera;

        // The rig is moved for locomotion; the camera pose within it comes from
        // the headset in XR and from yaw/pitch on screen.
        var player = new THREE.Group();
        player.add(camera);
        scene.add(player);
        this.player = player;

        this.buildEnvironment();
        this.buildRaycaster();
        this.buildCity();
        this.buildControllers();
        this.gestures = new GestureManager(this);
        this.buildVrButton();
        this.buildFullscreenButton();
        this.bindDesktopControls();

        window.addEventListener('resize', this.onResize.bind(this));

        // Drive everything from the XR-aware animation loop.
        renderer.setAnimationLoop(this.tick.bind(this));
    };

    Cyberspace.prototype.aspect = function() {
        return (this.root.clientWidth || 1) / (this.root.clientHeight || 480);
    };

    /**
     * Build the world around the streets: the wet neon ground, a smoggy sky
     * with a low corporate moon, the corporate mega-building skyline, elevated
     * highways over shadowed vertical slums, giant holographic ads and distant
     * search beams. The density scales with the chosen environment.
     */
    Cyberspace.prototype.buildEnvironment = function() {
        var THREE = this.THREE;
        var primary = this.palette.primary;
        var secondary = this.palette.secondary;
        var dense = this.config.environment === 'cyberspace';

        if (this.config.environment !== 'void') {
            // Wet, near-black ground so the neon reads as reflected light. A
            // faint grid gives the surface scale without stealing contrast.
            var ground = new THREE.Mesh(
                new THREE.PlaneGeometry(1200, 1200),
                new THREE.MeshBasicMaterial({color: 0x020306})
            );
            ground.rotation.x = -Math.PI / 2;
            ground.position.y = -0.02;
            this.scene.add(ground);

            var grid = new THREE.GridHelper(600, 240, primary, secondary);
            grid.material.opacity = 0.18;
            grid.material.transparent = true;
            this.scene.add(grid);

            if (dense) {
                var ceiling = new THREE.GridHelper(600, 120, secondary, secondary);
                ceiling.material.opacity = 0.06;
                ceiling.material.transparent = true;
                ceiling.position.y = 60;
                this.scene.add(ceiling);
            }
        }

        // Low corporate moon on the horizon, and a soft horizon glow.
        this.buildSky();

        // Smog particles / distant lights.
        var count = this.config.environment === 'void' ? 900 : 1600;
        var positions = new Float32Array(count * 3);
        for (var i = 0; i < count; i++) {
            var r = 140 + Math.random() * 220;
            var theta = Math.random() * Math.PI * 2;
            var phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6;
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        var stars = new THREE.Points(geo, new THREE.PointsMaterial({
            color: primary, size: 0.6, sizeAttenuation: true,
            transparent: true, opacity: 0.6
        }));
        this.scene.add(stars);

        // The full city skyline belongs to Cyberspace only. Grid stays a clean,
        // flat data-plane (just the lit ground and the streets), and Void keeps
        // only the streets in the dark, so each environment matches what the
        // course setting promises.
        if (!dense) {
            return;
        }

        // The city proper: corporate mega-towers behind the streets, elevated
        // highways casting the slums below into shadow, and giant holo-ads.
        this.buildMegaTowers(30);
        this.buildElevatedHighways();
        this.buildHoloAds();
        this.buildBeams();
    };

    /**
     * A low, hazy corporate moon and a bleed of horizon light. Purely
     * atmospheric; not interactive.
     */
    Cyberspace.prototype.buildSky = function() {
        var THREE = this.THREE;
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        var ctx = canvas.getContext('2d');
        var g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
        g.addColorStop(0, 'rgba(255,240,220,0.95)');
        g.addColorStop(0.35, 'rgba(255,190,150,0.45)');
        g.addColorStop(1, 'rgba(255,120,80,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);
        var tex = new THREE.CanvasTexture(canvas);
        var moon = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false, opacity: 0.9
        }));
        moon.scale.set(90, 90, 1);
        moon.position.set(-120, 70, -320);
        this.scene.add(moon);
    };

    /**
     * A canvas texture of a lit window grid for a building facade, cached per
     * style/scale so many buildings share one GPU texture.
     *
     * @param {Object} style One of the STYLES recipes.
     * @param {Number} cols Approximate window columns.
     * @param {Number} rows Approximate window rows.
     * @return {Object} Three.CanvasTexture.
     */
    Cyberspace.prototype.windowTexture = function(style, cols, rows) {
        var key = 'win_' + style.face + '_' + style.lit + '_' + cols + 'x' + rows;
        if (this.texCache[key]) {
            return this.texCache[key];
        }
        var THREE = this.THREE;
        var canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 256;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#' + ('000000' + style.face.toString(16)).slice(-6);
        ctx.fillRect(0, 0, 128, 256);

        var lit = '#' + ('000000' + style.lit.toString(16)).slice(-6);
        var cw = 128 / cols;
        var ch = 256 / rows;
        var pad = Math.min(cw, ch) * 0.22;
        for (var y = 0; y < rows; y++) {
            for (var x = 0; x < cols; x++) {
                var on = Math.random() < style.density;
                if (!on) {
                    continue;
                }
                // Entropism has broken, dim and mismatched panes.
                var dim = style.wireframe && Math.random() < 0.5;
                ctx.globalAlpha = dim ? 0.3 : 0.85;
                ctx.shadowColor = lit;
                ctx.shadowBlur = dim ? 0 : 6;
                ctx.fillStyle = lit;
                ctx.fillRect(x * cw + pad, y * ch + pad, cw - pad * 2, ch - pad * 2);
            }
        }
        ctx.globalAlpha = 1;
        var tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        this.texCache[key] = tex;
        return tex;
    };

    /**
     * Corporate mega-buildings: massive slab apartment complexes far behind the
     * streets, their faces a wall of tiny window lights receding into smog.
     *
     * @param {Number} n How many slabs to raise.
     */
    Cyberspace.prototype.buildMegaTowers = function(n) {
        var THREE = this.THREE;
        // Alternate the two coldest, most monumental styles.
        var styleKeys = ['neomilitarism', 'entropism'];
        for (var i = 0; i < n; i++) {
            var style = STYLES[styleKeys[i % styleKeys.length]];
            var side = Math.random() < 0.5 ? -1 : 1;
            var x = side * (34 + Math.random() * 120);
            var z = 30 - Math.random() * 320;
            var w = 8 + Math.random() * 16;
            var d = 8 + Math.random() * 16;
            var h = 26 + Math.random() * 60;

            var body = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                new THREE.MeshBasicMaterial({
                    color: style.face, transparent: true, opacity: 0.96
                })
            );
            body.position.set(x, h / 2, z);
            this.scene.add(body);

            // Window wall on the two faces most likely to be seen.
            var winTex = this.windowTexture(style, 10, 22);
            var facing = [
                {rot: 0, off: [0, 0, d / 2 + 0.05]},
                {rot: side < 0 ? Math.PI / 2 : -Math.PI / 2,
                    off: [side < 0 ? w / 2 + 0.05 : -w / 2 - 0.05, 0, 0]}
            ];
            for (var f = 0; f < facing.length; f++) {
                var wall = new THREE.Mesh(
                    new THREE.PlaneGeometry(f === 0 ? w : d, h),
                    new THREE.MeshBasicMaterial({
                        map: winTex, transparent: true, opacity: 0.9, depthWrite: false
                    })
                );
                wall.position.set(
                    x + facing[f].off[0], h / 2, z + facing[f].off[2]
                );
                wall.rotation.y = facing[f].rot;
                this.scene.add(wall);
            }

            // Crown edge glow and an occasional blinking aviation beacon.
            var edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
                new THREE.LineBasicMaterial({
                    color: style.edge, transparent: true, opacity: 0.5
                })
            );
            edges.position.copy(body.position);
            this.scene.add(edges);

            if (Math.random() < 0.5) {
                var beacon = new THREE.Sprite(new THREE.SpriteMaterial({
                    color: 0xff2b4e, transparent: true, depthWrite: false, opacity: 0.9
                }));
                beacon.scale.set(1.4, 1.4, 1);
                beacon.position.set(x, h + 0.6, z);
                this.beacons.push(beacon);
                this.scene.add(beacon);
            }
        }
    };

    /**
     * Elevated highways slung over the avenue on pillars, with cramped vertical
     * slums huddled in the shadow beneath them.
     */
    Cyberspace.prototype.buildElevatedHighways = function() {
        var THREE = this.THREE;
        var self = this;
        var primary = this.palette.primary;

        // A couple of ribbons crossing the avenue at different heights.
        var ribbons = [
            {y: 15, z: -30, len: 220, dir: 'x'},
            {y: 22, z: -150, len: 260, dir: 'x'}
        ];
        ribbons.forEach(function(r) {
            var deck = new THREE.Mesh(
                new THREE.BoxGeometry(r.len, 1.2, 7),
                new THREE.MeshBasicMaterial({color: 0x05070c})
            );
            deck.position.set(0, r.y, r.z);
            self.scene.add(deck);
            // Neon underglow tube lines along both edges.
            [-3.2, 3.2].forEach(function(zoff) {
                var line = new THREE.Mesh(
                    new THREE.BoxGeometry(r.len, 0.12, 0.12),
                    new THREE.MeshBasicMaterial({
                        color: primary, transparent: true, opacity: 0.8
                    })
                );
                line.position.set(0, r.y - 0.55, r.z + zoff);
                self.scene.add(line);
            });
            // Support pillars every ~40 units, straddling the avenue.
            for (var px = -r.len / 2 + 20; px < r.len / 2; px += 42) {
                if (Math.abs(px) < 10) {
                    continue; // Keep the avenue mouth clear.
                }
                var pillar = new THREE.Mesh(
                    new THREE.BoxGeometry(1.6, r.y, 1.6),
                    new THREE.MeshBasicMaterial({color: 0x04050a})
                );
                pillar.position.set(px, r.y / 2, r.z);
                self.scene.add(pillar);
                // A knot of slum boxes crammed against the pillar's shadow.
                self.buildSlumCluster(px, r.z);
            }
        });
    };

    /**
     * A cramped stack of weathered entropism boxes - a vertical slum - built in
     * deep shadow at the given ground spot.
     *
     * @param {Number} cx Ground x.
     * @param {Number} cz Ground z.
     */
    Cyberspace.prototype.buildSlumCluster = function(cx, cz) {
        var THREE = this.THREE;
        var style = STYLES.entropism;
        var winTex = this.windowTexture(style, 4, 6);
        var y = 0;
        var boxes = 3 + Math.floor(Math.random() * 4);
        for (var b = 0; b < boxes; b++) {
            var w = 2.4 + Math.random() * 2.2;
            var d = 2.4 + Math.random() * 2.2;
            var h = 2 + Math.random() * 2.4;
            var jx = (Math.random() - 0.5) * 2.2;
            var jz = (Math.random() - 0.5) * 2.2;
            var box = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                new THREE.MeshBasicMaterial({
                    color: style.face, transparent: true, opacity: 0.95
                })
            );
            box.position.set(cx + jx, y + h / 2, cz + jz);
            box.rotation.y = Math.random() * 0.5;
            this.scene.add(box);
            var face = new THREE.Mesh(
                new THREE.PlaneGeometry(w, h),
                new THREE.MeshBasicMaterial({
                    map: winTex, transparent: true, opacity: 0.7, depthWrite: false
                })
            );
            face.position.set(cx + jx, y + h / 2, cz + jz + d / 2 + 0.03);
            face.rotation.y = box.rotation.y;
            this.scene.add(face);
            y += h * (0.7 + Math.random() * 0.2);
        }
    };

    /**
     * Giant holographic advertisements: huge emissive banners plastered on the
     * skyline, blaring corporate colour. Registered for a flicker in tick().
     */
    Cyberspace.prototype.buildHoloAds = function() {
        var THREE = this.THREE;
        var adColours = [0xff2bd6, 0x00e5ff, 0xffb300, 0x39ff14, 0xff3b6b];
        var glyphs = 'アキサナ企正力未来電';
        for (var i = 0; i < 8; i++) {
            var colour = adColours[i % adColours.length];
            var tex = this.adTexture(colour, glyphs, i);
            var vertical = Math.random() < 0.5;
            var w = vertical ? 6 : 16;
            var h = vertical ? 20 : 9;
            var mat = new THREE.MeshBasicMaterial({
                map: tex, transparent: true, opacity: 0.85,
                depthWrite: false, blending: THREE.AdditiveBlending
            });
            var ad = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            var side = Math.random() < 0.5 ? -1 : 1;
            ad.position.set(
                side * (24 + Math.random() * 70),
                12 + Math.random() * 34,
                -20 - Math.random() * 220
            );
            ad.lookAt(0, ad.position.y, ad.position.z + 10);
            this.scene.add(ad);
            this.ads.push({mat: mat, base: 0.85, phase: Math.random() * 6.28});
        }
    };

    /**
     * A canvas texture for a holographic ad: bands of neon and stacked glyphs.
     *
     * @param {Number} colour Hex int neon colour.
     * @param {String} glyphs A pool of glyphs to stamp.
     * @param {Number} seed Variation seed.
     * @return {Object} Three.CanvasTexture.
     */
    Cyberspace.prototype.adTexture = function(colour, glyphs, seed) {
        var THREE = this.THREE;
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 384;
        var ctx = canvas.getContext('2d');
        var hex = '#' + ('000000' + colour.toString(16)).slice(-6);
        ctx.fillStyle = 'rgba(4,2,10,0.9)';
        ctx.fillRect(0, 0, 256, 384);

        // Scanline bands.
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = hex;
        for (var y = 0; y < 384; y += 6) {
            ctx.fillRect(0, y, 256, 2);
        }
        ctx.globalAlpha = 1;

        // Frame.
        ctx.strokeStyle = hex;
        ctx.lineWidth = 8;
        ctx.shadowColor = hex;
        ctx.shadowBlur = 24;
        ctx.strokeRect(8, 8, 240, 368);

        // A stack of glyphs down the centre.
        ctx.fillStyle = hex;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 64px "Noto Sans JP", "Yu Gothic", sans-serif';
        var n = 4 + (seed % 3);
        for (var i = 0; i < n; i++) {
            var ch = glyphs.charAt((seed * 3 + i * 2) % glyphs.length);
            ctx.fillText(ch, 128, 70 + i * 74);
        }
        var tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = 4;
        return tex;
    };

    /**
     * Distant vertical search beams that rake the smog above the skyline.
     */
    Cyberspace.prototype.buildBeams = function() {
        var THREE = this.THREE;
        for (var i = 0; i < 8; i++) {
            var colour = Math.random() < 0.5 ? this.palette.primary : this.palette.secondary;
            var beam = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 1.6, 90, 6, 1, true),
                new THREE.MeshBasicMaterial({
                    color: colour, transparent: true, opacity: 0.06,
                    side: THREE.DoubleSide, depthWrite: false,
                    blending: THREE.AdditiveBlending
                })
            );
            var side = Math.random() < 0.5 ? -1 : 1;
            beam.position.set(
                side * (30 + Math.random() * 90), 45,
                -40 - Math.random() * 240
            );
            beam.rotation.z = (Math.random() - 0.5) * 0.5;
            this.scene.add(beam);
        }
    };

    Cyberspace.prototype.buildRaycaster = function() {
        this.raycaster = new this.THREE.Raycaster();
    };

    /**
     * Build the city grid: a main avenue the learner flies down, with each
     * topic branching off as its own neon side street. A glowing gate and a
     * tall Japanese-style pylon stand at the mouth of each side street, and the
     * topic's activities line both sides of it as buildings and shops.
     */
    Cyberspace.prototype.buildCity = function() {
        var sections = this.config.sections || [];
        var self = this;

        // Start at the mouth of the avenue, looking down it (-Z).
        this.player.position.set(0, 0, 12);

        var roadHalf = 5.5;
        var spacing = 26; // Distance between side-street mouths down the avenue.
        var startZ = -20;
        var endZ = startZ - Math.max(1, sections.length) * spacing - 10;

        // Main avenue surface with glowing edge lines.
        this.paveStrip(0, (12 + endZ) / 2, roadHalf * 2, 12 - endZ, 0);
        [-roadHalf, roadHalf].forEach(function(x) {
            self.neonEdge(x, 0.05, 12, x, 0.05, endZ);
        });
        // A few reflected-light streaks down the wet avenue.
        for (var s = 0; s < 5; s++) {
            var sx = (Math.random() - 0.5) * roadHalf * 1.4;
            self.wetStreak(sx, (12 + endZ) / 2 + (Math.random() - 0.5) * 40, 0.5 + Math.random());
        }

        sections.forEach(function(section, i) {
            var z = startZ - i * spacing;
            var side = (i % 2 === 0) ? -1 : 1;
            self.buildSideStreet(section, z, side, roadHalf);
        });
    };

    /**
     * Build one topic as a side street branching off the avenue.
     *
     * @param {Object} section The section node (name, current, image, activities).
     * @param {Number} z The avenue z at which this street branches.
     * @param {Number} side -1 for the left of the avenue, +1 for the right.
     * @param {Number} roadHalf Half-width of the main avenue.
     */
    Cyberspace.prototype.buildSideStreet = function(section, z, side, roadHalf) {
        var self = this;
        var activities = section.activities || [];
        var streetHalf = 4.5; // Half-width of the side street (along z).
        var first = 5; // X-offset (past the mouth) of the first building.
        var step = 6.5; // X-spacing between building slots down the street.
        var slots = Math.ceil(activities.length / 2);
        var streetLen = first + Math.max(1, slots) * step + 3;
        var mouthX = side * roadHalf;
        var midX = mouthX + side * streetLen / 2;

        // Side-street road surface + neon kerb lines.
        this.paveStrip(midX, z, streetLen, streetHalf * 2, 0);
        [-streetHalf, streetHalf].forEach(function(zoff) {
            self.neonEdge(mouthX, 0.05, z + zoff, mouthX + side * streetLen, 0.05, z + zoff);
        });

        // Topic gate spanning the mouth, plus a tall vertical pylon at the corner.
        var wayColour = section.current ? 0xffffff : this.palette.primary;
        this.buildGate(section, mouthX + side * 1.2, z, side, streetHalf, wayColour);
        this.buildPylon(section.name, mouthX + side * 0.6, z - streetHalf - 0.8, wayColour);

        // Activities line both sides of the street, receding down it.
        activities.forEach(function(act, k) {
            var zside = (k % 2 === 0) ? -1 : 1; // Near or far kerb.
            var along = Math.floor(k / 2);
            var bx = mouthX + side * (first + along * step);
            var style = STYLES[MOD_STYLE[act.modname] || 'entropism'];
            var depth = style.footprint[1];
            var bz = z + zside * (streetHalf + depth / 2 + 0.4);
            var built = self.makeStructure(act, style);
            built.group.position.set(bx, 0, bz);
            // Face the street centreline so the signboard reads from the street.
            built.group.lookAt(bx, built.group.position.y, z);
            self.scene.add(built.group);
        });
    };

    /**
     * Pave a flat road strip.
     *
     * @param {Number} cx Centre x.
     * @param {Number} cz Centre z.
     * @param {Number} w Width along x.
     * @param {Number} d Depth along z.
     * @param {Number} y Height of the surface.
     */
    Cyberspace.prototype.paveStrip = function(cx, cz, w, d, y) {
        var THREE = this.THREE;
        var road = new THREE.Mesh(
            new THREE.PlaneGeometry(w, d),
            new THREE.MeshBasicMaterial({color: 0x04060c, transparent: true, opacity: 0.9})
        );
        road.rotation.x = -Math.PI / 2;
        road.position.set(cx, y + 0.02, cz);
        this.scene.add(road);
    };

    /**
     * A glowing neon line on the ground between two points.
     *
     * @param {Number} x1 Start x.
     * @param {Number} y1 Start y.
     * @param {Number} z1 Start z.
     * @param {Number} x2 End x.
     * @param {Number} y2 End y.
     * @param {Number} z2 End z.
     */
    Cyberspace.prototype.neonEdge = function(x1, y1, z1, x2, y2, z2) {
        var THREE = this.THREE;
        var geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x1, y1, z1),
            new THREE.Vector3(x2, y2, z2)
        ]);
        this.scene.add(new THREE.Line(
            geo, new THREE.LineBasicMaterial({color: this.palette.primary})
        ));
    };

    /**
     * A soft reflected-light streak on the wet ground.
     *
     * @param {Number} cx Centre x.
     * @param {Number} cz Centre z.
     * @param {Number} w Streak width.
     */
    Cyberspace.prototype.wetStreak = function(cx, cz, w) {
        var THREE = this.THREE;
        var colour = Math.random() < 0.5 ? this.palette.primary : this.palette.secondary;
        var streak = new THREE.Mesh(
            new THREE.PlaneGeometry(w, 14 + Math.random() * 18),
            new THREE.MeshBasicMaterial({
                color: colour, transparent: true, opacity: 0.08,
                depthWrite: false, blending: THREE.AdditiveBlending
            })
        );
        streak.rotation.x = -Math.PI / 2;
        streak.position.set(cx, 0.03, cz);
        this.scene.add(streak);
    };

    /**
     * A neon gate (a torii-like arch) spanning the mouth of a side street,
     * carrying the topic name. Not interactive; it is pure wayfinding.
     *
     * @param {Object} section The section node.
     * @param {Number} x The gate x (just inside the mouth).
     * @param {Number} z The street centre z.
     * @param {Number} side Avenue side (-1/+1).
     * @param {Number} streetHalf Half-width of the street.
     * @param {Number} colour Wayfinding colour.
     */
    Cyberspace.prototype.buildGate = function(section, x, z, side, streetHalf, colour) {
        var THREE = this.THREE;
        var group = new THREE.Group();
        var postMat = new THREE.MeshBasicMaterial({
            color: colour, transparent: true, opacity: 0.85
        });
        var top = 7.5;
        // Two posts either side of the street.
        [-streetHalf - 0.6, streetHalf + 0.6].forEach(function(zoff) {
            var post = new THREE.Mesh(new THREE.BoxGeometry(0.35, top, 0.35), postMat);
            post.position.set(0, top / 2, zoff);
            group.add(post);
        });
        // Crossbar.
        var bar = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.5, (streetHalf + 0.9) * 2), postMat
        );
        bar.position.set(0, top, 0);
        group.add(bar);

        // Topic nameplate hanging from the crossbar, facing back up the avenue.
        var plate = this.makeSign({
            text: section.name,
            colour: colour,
            width: streetHalf * 1.7,
            height: 2.4,
            imageurl: section.image || null,
            post: false
        });
        plate.group.position.set(0.25 * side, top - 1.9, 0);
        group.add(plate.group);

        group.position.set(x, 0, z);
        // Orient the gate to face back up the avenue (toward +Z at the mouth).
        group.lookAt(x, 0, z + side * 0.0001 + 10);
        this.scene.add(group);
    };

    /**
     * A tall Japanese-style vertical neon pylon standing at the street corner.
     *
     * @param {String} name The topic name.
     * @param {Number} x Pylon x.
     * @param {Number} z Pylon z.
     * @param {Number} colour Neon colour.
     */
    Cyberspace.prototype.buildPylon = function(name, x, z, colour) {
        var THREE = this.THREE;
        var group = new THREE.Group();
        var h = 16;
        var mast = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, h, 0.16),
            new THREE.MeshBasicMaterial({color: colour, transparent: true, opacity: 0.6})
        );
        mast.position.y = h / 2;
        group.add(mast);

        // Vertical text blade near the top.
        var tex = this.verticalTextTexture(name, colour);
        var blade = new THREE.Mesh(
            new THREE.PlaneGeometry(1.1, 5.5),
            new THREE.MeshBasicMaterial({
                map: tex, transparent: true, depthWrite: false
            })
        );
        blade.position.set(0.5, h - 3.2, 0);
        group.add(blade);
        var frame = new THREE.Mesh(
            new THREE.PlaneGeometry(1.3, 5.7),
            new THREE.MeshBasicMaterial({color: colour, transparent: true, opacity: 0.5})
        );
        frame.position.set(0.5, h - 3.2, -0.02);
        group.add(frame);

        group.position.set(x, 0, z);
        this.scene.add(group);
    };

    /**
     * Build an activity as a building or shop in a given architectural style.
     * The lit signboard on its facade is the interactive raycast target.
     *
     * @param {Object} act The activity node (name, url, state, modname).
     * @param {Object} style One of the STYLES recipes.
     * @return {Object} {group, panel} where panel is the raycast target.
     */
    Cyberspace.prototype.makeStructure = function(act, style) {
        var THREE = this.THREE;
        var group = new THREE.Group();
        var w = style.footprint[0];
        var d = style.footprint[1];
        var h = style.height[0] + Math.random() * (style.height[1] - style.height[0]);

        // Body: a dark solid mass with a crisp neon edge outline.
        var body = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            new THREE.MeshBasicMaterial({
                color: style.face, transparent: true, opacity: style.faceOpacity,
                wireframe: false
            })
        );
        body.position.y = h / 2;
        group.add(body);

        var edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
            new THREE.LineBasicMaterial({
                color: style.edge, transparent: true, opacity: 0.85
            })
        );
        edges.position.y = h / 2;
        group.add(edges);

        // Entropism buildings wear a broken, weathered wireframe overlay.
        if (style.wireframe) {
            var rust = new THREE.Mesh(
                new THREE.BoxGeometry(w * 1.02, h * 1.01, d * 1.02),
                new THREE.MeshBasicMaterial({
                    color: style.glow, wireframe: true, transparent: true, opacity: 0.16
                })
            );
            rust.position.y = h / 2;
            group.add(rust);
        }

        // Window wall on the facade (the +z face, which is turned to the street).
        var winTex = this.windowTexture(style, 6, Math.max(4, Math.round(h / 2)));
        var wall = new THREE.Mesh(
            new THREE.PlaneGeometry(w * 0.96, h * 0.96),
            new THREE.MeshBasicMaterial({
                map: winTex, transparent: true, opacity: 0.85, depthWrite: false
            })
        );
        wall.position.set(0, h / 2, d / 2 + 0.04);
        group.add(wall);

        // Style-specific silhouette and roofline.
        this.dressRoof(group, style, w, d, h);

        // The lit signboard: the clickable face. State colour tints its frame so
        // completion/restriction still reads at a glance.
        var stateColour = STATE_COLOURS[act.state] || STATE_COLOURS.available;
        var sign = this.makeSign({
            text: act.name,
            colour: stateColour,
            width: Math.min(w * 0.92, 3.4),
            height: 1.4,
            url: act.url,
            post: false
        });
        sign.group.position.set(0, Math.min(h - 1.1, 2.6), d / 2 + 0.12);
        group.add(sign.group);

        return {group: group, panel: sign.panel};
    };

    /**
     * Add the style's rooftop character: corporate antennae, plastic kitsch
     * loops, an elite luxury crown, or slum clutter.
     *
     * @param {Object} group The building group.
     * @param {Object} style The STYLES recipe.
     * @param {Number} w Body width.
     * @param {Number} d Body depth.
     * @param {Number} h Body height.
     */
    Cyberspace.prototype.dressRoof = function(group, style, w, d, h) {
        var THREE = this.THREE;
        if (style.form === 'tower') {
            // Neo-militarism: a hard antenna and a cold blinking beacon.
            var mast = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 4, 0.12),
                new THREE.MeshBasicMaterial({color: style.edge})
            );
            mast.position.set(0, h + 2, 0);
            group.add(mast);
            var beacon = new THREE.Sprite(new THREE.SpriteMaterial({
                color: style.glow, transparent: true, depthWrite: false, opacity: 0.9
            }));
            beacon.scale.set(0.9, 0.9, 1);
            beacon.position.set(0, h + 4, 0);
            this.beacons.push(beacon);
            group.add(beacon);
        } else if (style.form === 'shop') {
            // Kitsch: a bright plastic awning and a spinning neon ring.
            var awning = new THREE.Mesh(
                new THREE.PlaneGeometry(w * 1.02, 1.1),
                new THREE.MeshBasicMaterial({
                    color: style.edge, transparent: true, opacity: 0.7,
                    side: THREE.DoubleSide
                })
            );
            awning.position.set(0, h * 0.5 + 1.6, d / 2 + 0.5);
            awning.rotation.x = Math.PI / 3;
            group.add(awning);
            var ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.8, 0.09, 8, 20),
                new THREE.MeshBasicMaterial({color: style.glow})
            );
            ring.position.set(0, h + 0.9, 0);
            ring.userData.spin = 1.2;
            this.spinners.push(ring);
            group.add(ring);
        } else if (style.form === 'pavilion') {
            // Neo-kitsch: a smooth luxury crown and a slow holo disc.
            var crown = new THREE.Mesh(
                new THREE.TorusGeometry(w * 0.5, 0.14, 10, 24),
                new THREE.MeshBasicMaterial({
                    color: style.glow, transparent: true, opacity: 0.9
                })
            );
            crown.rotation.x = Math.PI / 2;
            crown.position.set(0, h + 0.3, 0);
            group.add(crown);
            var disc = new THREE.Mesh(
                new THREE.CircleGeometry(w * 0.4, 24),
                new THREE.MeshBasicMaterial({
                    color: style.lit, transparent: true, opacity: 0.25,
                    side: THREE.DoubleSide, depthWrite: false
                })
            );
            disc.position.set(0, h + 1.4, 0);
            disc.userData.spin = 0.4;
            this.spinners.push(disc);
            group.add(disc);
        } else {
            // Entropism: rooftop clutter - tanks and a sagging cable.
            for (var i = 0; i < 3; i++) {
                var junk = new THREE.Mesh(
                    new THREE.BoxGeometry(0.6 + Math.random(), 0.8 + Math.random(), 0.6 + Math.random()),
                    new THREE.MeshBasicMaterial({color: style.face})
                );
                junk.position.set(
                    (Math.random() - 0.5) * w * 0.7, h + 0.4,
                    (Math.random() - 0.5) * d * 0.7
                );
                var jedge = new THREE.LineSegments(
                    new THREE.EdgesGeometry(junk.geometry),
                    new THREE.LineBasicMaterial({color: style.edge, transparent: true, opacity: 0.6})
                );
                junk.add(jedge);
                group.add(junk);
            }
        }
    };

    /**
     * Load a topic image, downscaled to a safe maximum dimension, as a texture.
     *
     * @param {String} url The image URL.
     * @param {Function} onReady Called with (texture, naturalWidth, naturalHeight).
     */
    Cyberspace.prototype.loadSignImage = function(url, onReady) {
        var THREE = this.THREE;
        var image = new Image();
        image.onload = function() {
            var max = 1024;
            var scale = Math.min(1, max / Math.max(image.width, image.height));
            var cw = Math.max(1, Math.round(image.width * scale));
            var ch = Math.max(1, Math.round(image.height * scale));
            var canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            canvas.getContext('2d').drawImage(image, 0, 0, cw, ch);
            var texture = new THREE.CanvasTexture(canvas);
            if (texture.colorSpace !== undefined) {
                texture.colorSpace = THREE.SRGBColorSpace;
            }
            onReady(texture, image.width, image.height);
        };
        image.onerror = function() {
            // Ignore a broken topic image; the sign still shows its name.
        };
        image.src = url;
    };

    /**
     * Build a neon signboard: a dark panel with a glowing frame, the text, an
     * optional image, and (optionally) a support post. Interactive signs (with
     * a url) are registered for raycasting.
     *
     * @param {Object} opts {text, colour, width, height, imageurl?, url?, post?}
     * @return {Object} {group, panel} where panel is the raycast target.
     */
    Cyberspace.prototype.makeSign = function(opts) {
        var THREE = this.THREE;
        var group = new THREE.Group();
        var w = opts.width;
        var h = opts.height;

        // Neon frame glow (slightly larger, behind the panel).
        var frameMat = new THREE.MeshBasicMaterial({
            color: opts.colour, transparent: true, opacity: 0.9
        });
        var frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, h + 0.3), frameMat);

        // Dark readable face; also the raycast target.
        var panel = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({color: 0x05070d, transparent: true, opacity: 0.92})
        );
        panel.position.z = 0.03;
        frame.add(panel);

        // Optional topic image occupies the upper part of the panel. It is
        // downscaled on load and contained within its slot, so arbitrary
        // uploads neither distort nor exceed the GPU's max texture size.
        var hasimage = !!opts.imageurl;
        if (hasimage) {
            var imgH = h * 0.55;
            var slotW = w * 0.9;
            var imgMat = new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0
            });
            var img = new THREE.Mesh(new THREE.PlaneGeometry(slotW, imgH), imgMat);
            img.position.set(0, h * 0.5 - imgH * 0.5 - 0.15, 0.03);
            panel.add(img);
            this.loadSignImage(opts.imageurl, function(texture, iw, ih) {
                imgMat.map = texture;
                imgMat.opacity = 1;
                imgMat.needsUpdate = true;
                var fit = Math.min(slotW / iw, imgH / ih);
                img.scale.set((iw * fit) / slotW, (ih * fit) / imgH, 1);
            });
        }

        // Text plane.
        var textMat = new THREE.MeshBasicMaterial({
            map: this.makeTextTexture(opts.text, opts.colour),
            transparent: true,
            depthWrite: false
        });
        var textPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(w * 0.92, Math.min(h, 1.0)),
            textMat
        );
        textPlane.position.set(0, hasimage ? -h * 0.3 : 0, 0.05);
        panel.add(textPlane);

        // Optional support post down to the ground (used by free-standing signs;
        // facade-mounted signs on buildings pass post:false).
        if (opts.post !== false) {
            var post = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 24, 0.12),
                new THREE.MeshBasicMaterial({color: opts.colour, transparent: true, opacity: 0.5})
            );
            post.position.set(0, -h / 2 - 12, -0.05);
            frame.add(post);
        }

        group.add(frame);

        if (opts.url) {
            panel.userData = {
                url: opts.url,
                name: opts.text,
                material: frameMat,
                baseColour: opts.colour,
                interactive: true
            };
            this.interactive.push(panel);
        }
        return {group: group, panel: panel};
    };

    /**
     * Build a neon text texture on a transparent canvas for a sign face.
     *
     * @param {String} text The label text.
     * @param {Number} colour Hex int colour.
     * @return {Object} Three.CanvasTexture.
     */
    Cyberspace.prototype.makeTextTexture = function(text, colour) {
        var THREE = this.THREE;
        var canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        var ctx = canvas.getContext('2d');
        var hex = '#' + ('000000' + colour.toString(16)).slice(-6);

        ctx.font = 'bold 52px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = hex;
        ctx.shadowBlur = 22;
        ctx.fillStyle = hex;
        var clipped = text.length > 24 ? text.slice(0, 23) + '…' : text;
        ctx.fillText(clipped, 256, 64);
        ctx.fillText(clipped, 256, 64);

        var texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;
        return texture;
    };

    /**
     * Build a vertical (stacked) neon text texture for a corner pylon blade.
     *
     * @param {String} text The label text.
     * @param {Number} colour Hex int colour.
     * @return {Object} Three.CanvasTexture.
     */
    Cyberspace.prototype.verticalTextTexture = function(text, colour) {
        var THREE = this.THREE;
        var canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 512;
        var ctx = canvas.getContext('2d');
        var hex = '#' + ('000000' + colour.toString(16)).slice(-6);
        ctx.font = 'bold 62px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = hex;
        ctx.shadowBlur = 18;
        ctx.fillStyle = hex;
        var chars = text.replace(/\s+/g, '').slice(0, 7);
        var step = 512 / (chars.length + 1);
        for (var i = 0; i < chars.length; i++) {
            ctx.fillText(chars.charAt(i), 64, step * (i + 1));
        }
        var texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;
        return texture;
    };

    /**
     * Build a text sprite from a canvas texture.
     *
     * @param {String} text The label text.
     * @param {Number} colour Hex int colour.
     * @param {Number} scale World scale multiplier.
     * @return {Object} Three.Sprite.
     */
    Cyberspace.prototype.makeLabel = function(text, colour, scale) {
        var THREE = this.THREE;
        var canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        var ctx = canvas.getContext('2d');
        var hex = '#' + ('000000' + colour.toString(16)).slice(-6);

        ctx.font = 'bold 54px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Cheap neon glow.
        ctx.shadowColor = hex;
        ctx.shadowBlur = 24;
        ctx.fillStyle = hex;
        var clipped = text.length > 26 ? text.slice(0, 25) + '…' : text;
        ctx.fillText(clipped, 256, 64);
        ctx.fillText(clipped, 256, 64);

        var texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;
        var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: texture, transparent: true, depthWrite: false
        }));
        sprite.scale.set(4 * scale, 1 * scale, 1);
        return sprite;
    };

    /**
     * Build the two XR controllers / hands with pointing rays.
     */
    Cyberspace.prototype.buildControllers = function() {
        var THREE = this.THREE;
        var self = this;

        var rayGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
        ]);

        for (var i = 0; i < 2; i++) {
            var controller = this.renderer.xr.getController(i);
            var ray = new THREE.Line(
                rayGeo,
                new THREE.LineBasicMaterial({
                    color: this.palette.primary, transparent: true, opacity: 0.8
                })
            );
            ray.scale.z = 8;
            controller.add(ray);
            controller.userData.selecting = false;
            controller.userData.onNode = null;

            controller.addEventListener('selectstart', function(e) {
                self.onSelectStart(e.target);
            });
            controller.addEventListener('selectend', function(e) {
                self.onSelectEnd(e.target);
            });
            // Remember which physical input source (and hand) drives this
            // controller, so the gesture manager can read its thumbstick,
            // buttons and haptics and tell left from right.
            controller.addEventListener('connected', function(e) {
                e.target.userData.inputSource = e.data;
                e.target.userData.handedness = e.data && e.data.handedness;
            });
            controller.addEventListener('disconnected', function(e) {
                e.target.userData.inputSource = null;
                e.target.userData.handedness = null;
            });

            // A small glowing marker so the hand/controller is visible.
            var grip = this.renderer.xr.getControllerGrip(i);
            var marker = new THREE.Mesh(
                new THREE.IcosahedronGeometry(0.04, 0),
                new THREE.MeshBasicMaterial({color: this.palette.primary, wireframe: true})
            );
            grip.add(marker);

            this.player.add(controller);
            this.player.add(grip);
            this.controllers.push(controller);
        }
    };

    Cyberspace.prototype.onSelectStart = function(controller) {
        controller.userData.selecting = true;
        var hit = this.intersectController(controller);
        controller.userData.onNode = hit ? hit.object : null;
    };

    Cyberspace.prototype.onSelectEnd = function(controller) {
        controller.userData.selecting = false;
        // A pinch/trigger that started (or ended) on a node opens it; otherwise
        // it was a flight gesture and we simply stop thrusting.
        var hit = this.intersectController(controller);
        var target = (hit && hit.object) || controller.userData.onNode;
        controller.userData.onNode = null;
        if (target && target.userData && target.userData.url) {
            // A firm confirmation buzz before navigating away.
            if (this.gestures) {
                this.gestures.pulse(controller.userData.handedness, 0.6, 40);
            }
            this.open(target.userData.url);
        }
    };

    /**
     * Raycast from a controller's target ray against the interactive nodes.
     *
     * @param {Object} controller The XR controller.
     * @return {Object|null} The closest intersection or null.
     */
    Cyberspace.prototype.intersectController = function(controller) {
        var THREE = this.THREE;
        this.tmp.set(0, 0, 0).applyMatrix4(controller.matrixWorld);
        var dir = new THREE.Vector3(0, 0, -1)
            .applyQuaternion(controller.getWorldQuaternion(new THREE.Quaternion()));
        this.raycaster.set(this.tmp, dir.normalize());
        var hits = this.raycaster.intersectObjects(this.interactive, false);
        return hits.length ? hits[0] : null;
    };

    /**
     * Build a fullscreen toggle button for the scene stage.
     */
    Cyberspace.prototype.buildFullscreenButton = function() {
        var self = this;
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'format-mnemo__fs-btn';
        button.textContent = '⛶';
        button.title = this.config.strings.fullscreen;
        button.setAttribute('aria-label', this.config.strings.fullscreen);
        this.root.appendChild(button);

        button.addEventListener('click', function() {
            if (document.fullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            } else if (self.root.requestFullscreen) {
                var req = self.root.requestFullscreen();
                if (req && req.catch) {
                    req.catch(function() {
                        // Fullscreen request was rejected; nothing to do.
                    });
                }
            }
        });

        document.addEventListener('fullscreenchange', function() {
            var full = document.fullscreenElement === self.root;
            button.title = full ? self.config.strings.exitfullscreen : self.config.strings.fullscreen;
            button.setAttribute('aria-label', button.title);
            self.onResize();
        });
    };

    /**
     * Build the "Enter VR" button and wire up session lifecycle.
     */
    Cyberspace.prototype.buildVrButton = function() {
        var self = this;
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'format-mnemo__vr-btn';
        button.textContent = this.config.strings.entervr;
        button.disabled = true;
        this.root.appendChild(button);
        this.vrButton = button;

        if (!navigator.xr || !navigator.xr.isSessionSupported) {
            button.textContent = this.config.strings.vrnotsupported;
            return;
        }

        navigator.xr.isSessionSupported('immersive-vr').then(function(supported) {
            if (!supported) {
                button.textContent = self.config.strings.vrnotsupported;
                return null;
            }
            button.disabled = false;
            button.addEventListener('click', function() {
                if (self.renderer.xr.isPresenting) {
                    var s = self.renderer.xr.getSession();
                    if (s) {
                        s.end();
                    }
                } else {
                    self.enterVr();
                }
            });
            return null;
        }).catch(function() {
            button.textContent = self.config.strings.vrnotsupported;
        });
    };

    Cyberspace.prototype.enterVr = function() {
        var self = this;
        navigator.xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
        }).then(function(session) {
            self.renderer.xr.setReferenceSpaceType('local-floor');
            session.addEventListener('end', function() {
                self.vrButton.textContent = self.config.strings.entervr;
            });
            self.vrButton.textContent = self.config.strings.exitvr;
            return self.renderer.xr.setSession(session);
        }).catch(function() {
            self.vrButton.textContent = self.config.strings.vrnotsupported;
        });
    };

    /**
     * Desktop pointer + keyboard controls.
     */
    Cyberspace.prototype.bindDesktopControls = function() {
        var self = this;
        var el = this.renderer.domElement;
        el.style.touchAction = 'none';

        el.addEventListener('pointerdown', function(e) {
            self.dragging = true;
            self.pointerMoved = 0;
            self.lastPointer.x = e.clientX;
            self.lastPointer.y = e.clientY;
            el.setPointerCapture(e.pointerId);
        });
        el.addEventListener('pointermove', function(e) {
            self.updatePointerNdc(e);
            if (self.dragging && !self.renderer.xr.isPresenting) {
                var dx = e.clientX - self.lastPointer.x;
                var dy = e.clientY - self.lastPointer.y;
                self.lastPointer.x = e.clientX;
                self.lastPointer.y = e.clientY;
                self.pointerMoved += Math.abs(dx) + Math.abs(dy);
                // Drag to look. The direction is configurable per course (and via
                // a site default) so it can be changed without editing code.
                var sign = self.invertlook ? 1 : -1;
                self.yaw += dx * 0.0032 * sign;
                self.pitch += dy * 0.0032 * sign;
                var lim = Math.PI / 2 - 0.05;
                self.pitch = Math.max(-lim, Math.min(lim, self.pitch));
            }
        });
        var endDrag = function(e) {
            if (self.dragging && self.pointerMoved < 6 && !self.renderer.xr.isPresenting) {
                self.clickOpen();
            }
            self.dragging = false;
            if (e.pointerId !== undefined && el.hasPointerCapture(e.pointerId)) {
                el.releasePointerCapture(e.pointerId);
            }
        };
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', function() {
            self.dragging = false;
        });

        window.addEventListener('keydown', function(e) {
            self.keys[e.code] = true;
        });
        window.addEventListener('keyup', function(e) {
            self.keys[e.code] = false;
        });
    };

    Cyberspace.prototype.updatePointerNdc = function(e) {
        var rect = this.renderer.domElement.getBoundingClientRect();
        this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    /**
     * Handle a desktop click: open whatever node is under the pointer.
     */
    Cyberspace.prototype.clickOpen = function() {
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        var hits = this.raycaster.intersectObjects(this.interactive, false);
        if (hits.length && hits[0].object.userData.url) {
            this.open(hits[0].object.userData.url);
        }
    };

    /**
     * Navigate to an activity.
     *
     * @param {String} url The activity view URL.
     */
    Cyberspace.prototype.open = function(url) {
        if (this.navigating) {
            return;
        }
        this.navigating = true;
        window.location.assign(url);
    };

    /**
     * Per-frame update: locomotion, spinning, flicker, highlighting, rendering.
     */
    Cyberspace.prototype.tick = function() {
        var dt = Math.min(0.05, this.clock.getDelta());
        this.time += dt;
        var presenting = this.renderer.xr.isPresenting;

        // Spin the rooftop holo elements.
        for (var i = 0; i < this.spinners.length; i++) {
            this.spinners[i].rotation.y += this.spinners[i].userData.spin * dt;
            this.spinners[i].rotation.x += this.spinners[i].userData.spin * 0.4 * dt;
        }

        // Flicker the holographic ads.
        for (var a = 0; a < this.ads.length; a++) {
            var ad = this.ads[a];
            var flick = Math.sin(this.time * 3 + ad.phase);
            ad.mat.opacity = ad.base * (0.72 + 0.28 * flick);
        }

        // Blink the rooftop beacons roughly once a second.
        var on = (Math.floor(this.time * 1.3) % 2) === 0;
        for (var b = 0; b < this.beacons.length; b++) {
            this.beacons[b].material.opacity = on ? 0.95 : 0.12;
        }

        if (presenting) {
            // Measure how far the rig travels this frame so the comfort
            // vignette can respond to real motion from every locomotion path.
            this.tmp2.copy(this.player.position);
            this.brake = false;
            if (this.gestures) {
                this.gestures.update(dt);
            }
            this.updateXrLocomotion(dt);
            this.updateXrHighlight();
            if (this.gestures) {
                var travelled = this.player.position.distanceTo(this.tmp2);
                this.gestures.updateVignette(travelled / Math.max(dt, 0.0001), dt);
            }
        } else {
            this.updateDesktop(dt);
            this.updateDesktopHighlight();
            if (this.gestures) {
                this.gestures.updateVignette(0, dt);
            }
        }

        this.clampToWorld();

        this.renderer.render(this.scene, this.camera);
    };

    /**
     * Keep the player rig inside the world: never below the neon floor (so the
     * view cannot sink through the ground) nor above the ceiling grid. The floor
     * sits at y = 0, so pinning the rig at 0 keeps the eye at standing height
     * above it in both desktop and XR.
     */
    Cyberspace.prototype.clampToWorld = function() {
        if (this.player.position.y < 0) {
            this.player.position.y = 0;
        } else if (this.player.position.y > 45) {
            this.player.position.y = 45;
        }
    };

    /**
     * Gestural flight: while a controller/hand is selecting and not aimed at a
     * node, glide the player toward where it points.
     *
     * @param {Number} dt Delta time in seconds.
     */
    Cyberspace.prototype.updateXrLocomotion = function(dt) {
        var THREE = this.THREE;
        var speed = 6;
        if (this.brake) {
            // An open palm this frame is an explicit stop; hold position.
            return;
        }
        for (var i = 0; i < this.controllers.length; i++) {
            var c = this.controllers[i];
            if (!c.userData.selecting) {
                continue;
            }
            // If aimed at a node, treat the gesture as "select", not "fly".
            if (this.intersectController(c)) {
                continue;
            }
            var dir = new THREE.Vector3(0, 0, -1)
                .applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()));
            this.player.position.addScaledVector(dir.normalize(), speed * dt);
        }
    };

    /**
     * Highlight whichever node either controller is aimed at in XR.
     */
    Cyberspace.prototype.updateXrHighlight = function() {
        var hit = null;
        for (var i = 0; i < this.controllers.length && !hit; i++) {
            var h = this.intersectController(this.controllers[i]);
            if (h) {
                hit = h.object;
            }
        }
        this.setHovered(hit);
    };

    /**
     * Desktop locomotion: WASD to fly, R/F for vertical, arrow keys too.
     *
     * @param {Number} dt Delta time in seconds.
     */
    Cyberspace.prototype.updateDesktop = function(dt) {
        var THREE = this.THREE;
        // Apply look.
        this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

        var speed = (this.keys.ShiftLeft || this.keys.ShiftRight ? 14 : 7) * dt;
        var forward = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
        var right = new THREE.Vector3(1, 0, 0).applyEuler(this.camera.rotation);

        if (this.keys.KeyW || this.keys.ArrowUp) {
            this.player.position.addScaledVector(forward, speed);
        }
        if (this.keys.KeyS || this.keys.ArrowDown) {
            this.player.position.addScaledVector(forward, -speed);
        }
        if (this.keys.KeyA || this.keys.ArrowLeft) {
            this.player.position.addScaledVector(right, -speed);
        }
        if (this.keys.KeyD || this.keys.ArrowRight) {
            this.player.position.addScaledVector(right, speed);
        }
        if (this.keys.KeyR || this.keys.Space) {
            this.player.position.y += speed;
        }
        if (this.keys.KeyF) {
            this.player.position.y -= speed;
        }
    };

    /**
     * Highlight whatever node is under the desktop pointer.
     */
    Cyberspace.prototype.updateDesktopHighlight = function() {
        if (this.pointerNdc.x < -1.5) {
            this.setHovered(null);
            return;
        }
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        var hits = this.raycaster.intersectObjects(this.interactive, false);
        this.setHovered(hits.length ? hits[0].object : null);
    };

    /**
     * Apply/remove the hover highlight, updating the cursor for affordance.
     *
     * @param {Object|null} mesh The mesh to highlight, or null to clear.
     */
    Cyberspace.prototype.setHovered = function(mesh) {
        if (this.hovered === mesh) {
            return;
        }
        if (this.hovered) {
            this.hovered.scale.setScalar(1);
            this.hovered.userData.material.color.setHex(this.hovered.userData.baseColour);
        }
        this.hovered = mesh;
        if (mesh) {
            mesh.scale.setScalar(1.12);
            mesh.userData.material.color.setHex(0xffffff);
            this.renderer.domElement.style.cursor = 'pointer';
            // A light tick when a node first lights up under the pointer/ray.
            if (this.gestures && this.renderer.xr.isPresenting) {
                this.gestures.pulse(null, 0.3, 18);
            }
        } else {
            this.renderer.domElement.style.cursor = 'grab';
        }
    };

    Cyberspace.prototype.onResize = function() {
        var w = this.root.clientWidth;
        var h = this.root.clientHeight || 480;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h, false);
    };

    /**
     * Central manager for immersive (XR) gestures. It owns the one place where
     * raw input - thumbsticks, buttons and haptics on controllers, and tracked
     * hand joints - is read each frame and mapped to actions, plus the comfort
     * features (snap turn and a motion vignette).
     *
     * Input map:
     *   - Thumbstick (either hand): glide, head-relative.
     *   - Right thumbstick X: snap-turn in fixed steps.
     *   - Grip button / closed fist: "grab the world" and pull yourself along.
     *   - Open palm: brake - an explicit stop.
     *   - Trigger / pinch: open the node you are pointing at (handled by the
     *     existing select events; this class only adds the confirming haptic).
     *   - Both thumbstick clicks together: recenter to the avenue mouth.
     *
     * Everything is feature-detected, so controller-only, hand-only and plain
     * desktop sessions all degrade gracefully.
     *
     * @param {Object} cs The owning Cyberspace instance.
     */
    function GestureManager(cs) {
        var THREE = cs.THREE;
        this.cs = cs;
        this.THREE = THREE;
        this.renderer = cs.renderer;
        this.player = cs.player;
        this.camera = cs.camera;

        // Tunables.
        this.deadzone = 0.15; // Thumbstick centre deadzone.
        this.glideSpeed = 4.5; // Metres per second at full stick.
        this.snapAngle = Math.PI / 6; // 30 degrees per snap.
        this.snapThreshold = 0.7; // Stick X magnitude that triggers a snap.
        this.snapRelease = 0.3; // Fall back below this to re-arm the snap.
        this.pinchDist = 0.025; // Not used directly (pinch = select event).
        this.fistDist = 0.075; // Fingertip-to-wrist under this reads as a fist.
        this.palmDist = 0.13; // Fingertip-to-wrist over this reads as open.

        // State.
        this.snapArmed = true; // Debounce so one flick is one snap.
        this.recenterArmed = true; // Debounce the recenter chord.
        this.grabbing = false; // Mid grab-the-world pull.
        this.grabAnchor = new THREE.Vector3();
        this.vignetteOpacity = 0; // Smoothed current vignette strength.
        this.home = new THREE.Vector3(0, 0, 12); // Avenue mouth.

        // Scratch vectors, reused to avoid per-frame allocation.
        this.vForward = new THREE.Vector3();
        this.vRight = new THREE.Vector3();
        this.vSum = new THREE.Vector3();
        this.vDelta = new THREE.Vector3();
        this.vTip = new THREE.Vector3();
        this.up = new THREE.Vector3(0, 1, 0);
        this.handWrist = [new THREE.Vector3(), new THREE.Vector3()];
        this.ctrlPos = [new THREE.Vector3(), new THREE.Vector3()];

        this.hands = [];
        this.buildHands();
        this.buildVignette();
    }

    /**
     * Attach the two tracked-hand objects so their joints update each frame.
     */
    GestureManager.prototype.buildHands = function() {
        for (var i = 0; i < 2; i++) {
            var hand = this.renderer.xr.getHand(i);
            this.player.add(hand);
            this.hands.push(hand);
        }
    };

    /**
     * Build the comfort vignette: a soft dark ring fixed to the camera that
     * fades in with motion to shrink the field of view and reduce sim sickness.
     */
    GestureManager.prototype.buildVignette = function() {
        var THREE = this.THREE;
        var canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        var ctx = canvas.getContext('2d');
        var g = ctx.createRadialGradient(128, 128, 128 * 0.5, 128, 128, 128);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.7, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 256, 256);

        var tex = new THREE.CanvasTexture(canvas);
        var mat = new THREE.MeshBasicMaterial({
            map: tex, transparent: true, opacity: 0,
            depthTest: false, depthWrite: false
        });
        var mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), mat);
        mesh.position.set(0, 0, -1);
        mesh.renderOrder = 999;
        mesh.frustumCulled = false;
        this.camera.add(mesh);
        this.vignette = mesh;
        this.vignetteMat = mat;
    };

    /**
     * Read and act on all XR input for this frame.
     *
     * @param {Number} dt Delta time in seconds.
     */
    GestureManager.prototype.update = function(dt) {
        var session = this.renderer.xr.getSession();
        if (!session) {
            return;
        }

        // Reset the grab accumulator, then gather input from hands and
        // controllers. An open palm on either hand brakes the whole frame.
        this.vSum.set(0, 0, 0);
        var hands = this.readHandGestures();
        this.cs.brake = hands.palm;
        var ctrl = this.readControllers();
        var grabCount = hands.grabCount + ctrl.grabCount;

        this.handleRecenter(ctrl.thumbClicks);
        this.handleSnapTurn(ctrl.turnX);

        if (this.cs.brake) {
            // Braking cancels translation this frame; a fresh grab must re-anchor.
            this.grabbing = false;
            return;
        }

        this.applyGrab(grabCount);
        this.applyGlide(ctrl.glideX, ctrl.glideZ, dt);
    };

    /**
     * Scan both tracked hands for the brake (open palm) and grab (fist)
     * gestures, accumulating fist wrist positions into the grab sum.
     *
     * @return {Object} {palm, grabCount}.
     */
    GestureManager.prototype.readHandGestures = function() {
        var palm = false;
        var grabCount = 0;
        for (var h = 0; h < this.hands.length; h++) {
            var g = this.handGesture(this.hands[h], h);
            if (!g) {
                continue;
            }
            if (g.palm) {
                palm = true;
            }
            if (g.fist) {
                this.vSum.add(this.handWrist[h]);
                grabCount++;
            }
        }
        return {palm: palm, grabCount: grabCount};
    };

    /**
     * Read both controllers' thumbsticks, thumbstick clicks and grip buttons,
     * accumulating grip world positions into the grab sum.
     *
     * @return {Object} {glideX, glideZ, turnX, thumbClicks, grabCount}.
     */
    GestureManager.prototype.readControllers = function() {
        var out = {glideX: 0, glideZ: 0, turnX: 0, thumbClicks: 0, grabCount: 0};
        var controllers = this.cs.controllers;
        for (var c = 0; c < controllers.length; c++) {
            var ctrl = controllers[c];
            var src = ctrl.userData.inputSource;
            var gp = src && src.gamepad;
            if (!gp) {
                continue;
            }
            var stick = this.readStick(gp);
            if (src.handedness === 'right') {
                out.turnX = stick.x;
            } else {
                out.glideX += stick.x;
                out.glideZ += stick.y;
            }
            if (this.buttonPressed(gp, 3)) {
                out.thumbClicks++;
            }
            if (this.buttonPressed(gp, 1)) { // Grip.
                ctrl.getWorldPosition(this.ctrlPos[c]);
                this.vSum.add(this.ctrlPos[c]);
                out.grabCount++;
            }
        }
        return out;
    };

    /**
     * Recenter when both thumbsticks are clicked together, debounced so the
     * chord fires once per press.
     *
     * @param {Number} thumbClicks How many thumbsticks are currently clicked.
     */
    GestureManager.prototype.handleRecenter = function(thumbClicks) {
        if (thumbClicks >= 2 && this.recenterArmed) {
            this.recenter();
            this.recenterArmed = false;
        } else if (thumbClicks === 0) {
            this.recenterArmed = true;
        }
    };

    /**
     * Snap-turn on a firm right-stick flick, debounced so one flick is one snap.
     *
     * @param {Number} turnX The right thumbstick X value.
     */
    GestureManager.prototype.handleSnapTurn = function(turnX) {
        if (Math.abs(turnX) > this.snapThreshold && this.snapArmed) {
            this.rotatePlayer(turnX < 0 ? this.snapAngle : -this.snapAngle);
            this.snapArmed = false;
        } else if (Math.abs(turnX) < this.snapRelease) {
            this.snapArmed = true;
        }
    };

    /**
     * Grab-the-world pull: keep the average grabbed point under the hand(s),
     * which moves the player the opposite way.
     *
     * @param {Number} grabCount How many hands/controllers are gripping.
     */
    GestureManager.prototype.applyGrab = function(grabCount) {
        if (grabCount <= 0) {
            this.grabbing = false;
            return;
        }
        this.vSum.multiplyScalar(1 / grabCount);
        if (!this.grabbing) {
            this.grabbing = true;
            this.grabAnchor.copy(this.vSum);
            return;
        }
        this.vDelta.subVectors(this.vSum, this.grabAnchor);
        this.player.position.sub(this.vDelta);
        // The grabbed objects moved with the rig; predict their new pose.
        this.grabAnchor.copy(this.vSum).sub(this.vDelta);
    };

    /**
     * Thumbstick glide, head-relative and level with the ground.
     *
     * @param {Number} glideX Strafe axis in [-1, 1].
     * @param {Number} glideZ Forward axis in [-1, 1] (stick up is negative).
     * @param {Number} dt Delta time in seconds.
     */
    GestureManager.prototype.applyGlide = function(glideX, glideZ, dt) {
        if (glideX === 0 && glideZ === 0) {
            return;
        }
        this.camera.getWorldDirection(this.vForward);
        this.vForward.y = 0;
        if (this.vForward.lengthSq() < 1e-4) {
            this.vForward.set(0, 0, -1);
        }
        this.vForward.normalize();
        this.vRight.crossVectors(this.vForward, this.up).normalize();
        var step = this.glideSpeed * dt;
        this.player.position.addScaledVector(this.vForward, -glideZ * step);
        this.player.position.addScaledVector(this.vRight, glideX * step);
    };

    /**
     * Read a thumbstick (or trackpad) pair from a gamepad, with deadzone.
     *
     * @param {Object} gp The XR input source gamepad.
     * @return {Object} {x, y} in the range [-1, 1], centred at 0.
     */
    GestureManager.prototype.readStick = function(gp) {
        var ax = gp.axes || [];
        // Prefer the thumbstick pair (2,3); fall back to a trackpad (0,1).
        var x = ax.length > 3 ? ax[2] : (ax[0] || 0);
        var y = ax.length > 3 ? ax[3] : (ax[1] || 0);
        if (Math.abs(x) < this.deadzone) {
            x = 0;
        }
        if (Math.abs(y) < this.deadzone) {
            y = 0;
        }
        return {x: x, y: y};
    };

    /**
     * Whether a gamepad button index is currently pressed.
     *
     * @param {Object} gp The XR input source gamepad.
     * @param {Number} index The button index.
     * @return {Boolean} True when that button reports pressed.
     */
    GestureManager.prototype.buttonPressed = function(gp, index) {
        var b = gp.buttons && gp.buttons[index];
        return !!(b && b.pressed);
    };

    /**
     * Classify a tracked hand as a fist and/or an open palm, and record its
     * wrist world position for grab-the-world locomotion.
     *
     * @param {Object} hand The tracked-hand object from the XR manager.
     * @param {Number} index The hand index (0 or 1), selecting a scratch slot.
     * @return {Object|null} {fist, palm} or null when the hand is not tracked.
     */
    GestureManager.prototype.handGesture = function(hand, index) {
        var wrist = this.jointPos(hand, 'wrist', this.handWrist[index]);
        if (!wrist) {
            return null;
        }
        var tips = [
            'index-finger-tip', 'middle-finger-tip',
            'ring-finger-tip', 'pinky-finger-tip'
        ];
        var near = 0;
        var far = 0;
        var count = 0;
        for (var i = 0; i < tips.length; i++) {
            var p = this.jointPos(hand, tips[i], this.vTip);
            if (!p) {
                continue;
            }
            count++;
            var d = p.distanceTo(wrist);
            if (d < this.fistDist) {
                near++;
            } else if (d > this.palmDist) {
                far++;
            }
        }
        if (count < 3) {
            return null;
        }
        return {fist: near >= count, palm: far >= count};
    };

    /**
     * World position of a named hand joint, or null when it is not tracked.
     *
     * @param {Object} hand The tracked-hand object.
     * @param {String} name The joint name (e.g. "index-finger-tip").
     * @param {Object} out A Three.Vector3 to write into.
     * @return {Object|null} The out vector, or null when unavailable.
     */
    GestureManager.prototype.jointPos = function(hand, name, out) {
        var joints = hand && hand.joints;
        var j = joints && joints[name];
        if (!j || j.visible === false) {
            return null;
        }
        return j.getWorldPosition(out);
    };

    /**
     * Rotate the player rig around the head by an angle, so a snap turn pivots
     * about the viewer rather than the world origin.
     *
     * @param {Number} angle Radians to rotate (positive is left).
     */
    GestureManager.prototype.rotatePlayer = function(angle) {
        var pivot = this.camera.getWorldPosition(this.vForward);
        this.player.position.sub(pivot);
        this.player.position.applyAxisAngle(this.up, angle);
        this.player.position.add(pivot);
        this.player.rotateOnWorldAxis(this.up, angle);
        // A turn is motion too; give the vignette a brief pulse.
        this.vignetteOpacity = Math.max(this.vignetteOpacity, 0.4);
    };

    /**
     * Return the player to the avenue mouth, upright and facing down the street.
     */
    GestureManager.prototype.recenter = function() {
        this.player.position.copy(this.home);
        this.player.rotation.set(0, 0, 0);
        this.grabbing = false;
        this.vignetteOpacity = Math.max(this.vignetteOpacity, 0.5);
        this.pulse(null, 0.5, 40);
    };

    /**
     * Fire a short haptic pulse on matching controllers.
     *
     * @param {String|null} handedness "left"/"right" to target one hand, or
     *     null for any controller that supports haptics.
     * @param {Number} intensity Pulse strength in [0, 1].
     * @param {Number} ms Duration in milliseconds.
     */
    GestureManager.prototype.pulse = function(handedness, intensity, ms) {
        var controllers = this.cs.controllers;
        for (var c = 0; c < controllers.length; c++) {
            var src = controllers[c].userData.inputSource;
            if (!src || (handedness && src.handedness !== handedness)) {
                continue;
            }
            var gp = src.gamepad;
            var act = gp && gp.hapticActuators && gp.hapticActuators[0];
            if (act && act.pulse) {
                act.pulse(intensity, ms);
            }
        }
    };

    /**
     * Ease the comfort vignette toward a strength set by the current speed.
     *
     * @param {Number} speed Metres per second the rig moved this frame.
     * @param {Number} dt Delta time in seconds.
     */
    GestureManager.prototype.updateVignette = function(speed, dt) {
        if (!this.vignetteMat) {
            return;
        }
        // Ramp in over the first few m/s, capped so peripheral vision stays.
        var target = Math.min(0.6, speed * 0.12);
        // Ease toward the target, and let a turn pulse decay smoothly.
        var k = Math.min(1, dt * 8);
        this.vignetteOpacity += (target - this.vignetteOpacity) * k;
        if (this.vignetteOpacity < 0.01) {
            this.vignetteOpacity = 0;
        }
        this.vignetteMat.opacity = this.vignetteOpacity;
    };

    /**
     * Wire up the list / 3D view toggle (works even if the scene fails).
     *
     * @param {HTMLElement} container The outer .format-mnemo element.
     */
    function bindToggle(container) {
        var button = container.querySelector('[data-mnemo-toggle]');
        if (!button) {
            return;
        }
        button.addEventListener('click', function() {
            var listing = container.classList.toggle('format-mnemo--listview');
            button.setAttribute('aria-pressed', listing ? 'true' : 'false');
        });
    }

    /**
     * Reveal the fallback list and surface an error message.
     *
     * @param {HTMLElement} container The outer .format-mnemo element.
     * @param {HTMLElement} root The scene mount element.
     * @param {String} message The failure message.
     */
    function failGracefully(container, root, message) {
        container.classList.add('format-mnemo--listview');
        container.classList.add('format-mnemo--failed');
        var loading = root.querySelector('[data-mnemo-loading]');
        if (loading) {
            loading.textContent = message;
        }
    }

    /**
     * Load Three.js as a native ES module.
     *
     * Moodle's JS build rewrites a literal import() into a RequireJS call,
     * which cannot load a real ES module. So instead of importing here, inject
     * the plain (unbuilt) loader script as a native module; it performs the
     * dynamic import and hands the module namespace back via a window event.
     *
     * @param {Object} config The scene configuration (needs loaderurl, threeurl).
     * @return {Promise} Resolves with the Three.js module namespace.
     */
    function loadThree(config) {
        return new Promise(function(resolve, reject) {
            var settled = false;
            var onReady = function(e) {
                settled = true;
                resolve(e.detail);
            };
            var onError = function(e) {
                settled = true;
                reject((e && e.detail) || new Error('Three.js failed to load'));
            };
            window.addEventListener('format_mnemo:three-ready', onReady, {once: true});
            window.addEventListener('format_mnemo:three-error', onError, {once: true});

            var separator = config.loaderurl.indexOf('?') >= 0 ? '&' : '?';
            var script = document.createElement('script');
            script.type = 'module';
            script.src = config.loaderurl + separator + 'src=' + encodeURIComponent(config.threeurl);
            script.onerror = function() {
                if (!settled) {
                    settled = true;
                    reject(new Error('Three.js loader script failed to load'));
                }
            };
            document.head.appendChild(script);

            window.setTimeout(function() {
                if (!settled) {
                    settled = true;
                    reject(new Error('Three.js load timed out'));
                }
            }, 20000);
        });
    }

    return {
        /**
         * Entry point invoked from PHP with the scene root's DOM id.
         *
         * The scene configuration itself is read from the root element's
         * data-mnemo-config attribute rather than passed as an argument, to
         * avoid shipping a large payload through js_call_amd.
         *
         * @param {String} rootid The DOM id of the scene root element.
         */
        init: function(rootid) {
            var root = document.getElementById(rootid);
            if (!root) {
                return;
            }
            var config;
            try {
                config = JSON.parse(root.getAttribute('data-mnemo-config') || '{}');
            } catch (e) {
                return;
            }
            var container = root.closest('.format-mnemo') || root.parentNode;
            container.classList.add('format-mnemo--active');
            bindToggle(container);

            // Load Three.js as a native ES module (see loadThree), then build
            // the scene. Kept out of the AMD dependency graph on purpose.
            loadThree(config).then(function(THREE) {
                var loading = root.querySelector('[data-mnemo-loading]');
                if (loading) {
                    loading.remove();
                }
                try {
                    new Cyberspace(THREE, root, config);
                } catch (e) {
                    failGracefully(container, root, config.strings.failed);
                    if (window.console) {
                        window.console.error(e);
                    }
                }
                return THREE;
            }).catch(function(e) {
                failGracefully(container, root, config.strings.failed);
                if (window.console) {
                    window.console.error(e);
                }
            });
        }
    };
});
