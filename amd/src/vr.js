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
            edge: 0x8a5a2b, glow: 0xffa042, body: 0x9c8b72, lit: 0xffb454,
            rough: 0.95, metal: 0.05, density: 0.32, wireframe: true,
            form: 'block', footprint: [4.2, 4.4], height: [5, 9]
        },
        kitsch: {
            edge: 0xff3cc7, glow: 0x00e5ff, body: 0x7d6690, lit: 0xff7bd8,
            rough: 0.5, metal: 0.15, density: 0.62, wireframe: false,
            form: 'shop', footprint: [5.2, 4.4], height: [4.5, 6.5]
        },
        neomilitarism: {
            edge: 0x394452, glow: 0xff2b4e, body: 0x6b727c, lit: 0xaec4dc,
            rough: 0.5, metal: 0.6, density: 0.14, wireframe: false,
            form: 'tower', footprint: [3.2, 3.2], height: [15, 24]
        },
        neokitsch: {
            edge: 0xffe6a8, glow: 0xffcf7a, body: 0xb8ad96, lit: 0xfff2cf,
            rough: 0.3, metal: 0.35, density: 0.28, wireframe: false,
            form: 'pavilion', footprint: [4.6, 4.4], height: [8, 12]
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
     * @param {Object} loaders Optional addon classes (GLTFLoader, DRACOLoader,
     *     KTX2Loader, MeshoptDecoder); absent when only the built-in parser is
     *     available.
     * @param {Object} assets Optional site-wide sign assets loaded before
     *     construction: {signFontFamily, signTexture, roadTexture,
     *     groundTexture} (each nullable).
     */
    function Cyberspace(THREE, root, config, loaders, assets) {
        this.THREE = THREE;
        this.root = root;
        this.config = config;
        this.loaders = loaders || {};
        assets = assets || {};
        // Optional site-wide assets, loaded before construction (see
        // loadSceneAssets): a custom CSS font-family for neon text, a texture
        // tinted onto every sign frame, and tiled road/ground textures. Any may
        // be null, in which case the bundled neon look is used.
        this.signFontFamily = assets.signFontFamily || null;
        this.signTexture = assets.signTexture || null;
        this.roadTexture = assets.roadTexture || null;
        this.groundTexture = assets.groundTexture || null;
        // Tiling scale (world units per texture tile) and the size of the
        // textured ground patch laid around each building. Admin-configurable.
        this.roadScale = config.roadtexturescale > 0 ? config.roadtexturescale : 8;
        this.groundScale = config.groundtexturescale > 0 ? config.groundtexturescale : 8;
        this.groundPatch = config.groundpatchsize > 0 ? config.groundpatchsize : 0;
        // World-space XZ footprints of placed buildings, so scattered props
        // (kiosks, lamps, barriers) can avoid dropping on top of a building.
        this.footprints = [];
        this.gltfLoader = null; // Lazily built addon GLTFLoader, when available.
        this.palette = PALETTES[config.palette] || PALETTES.cyan;
        STATE_COLOURS.available = this.palette.primary;
        // Hour of day (0-24) from the site clock; drives the day/night cycle.
        this.hour = (typeof config.hour === 'number') ? config.hour : 20;
        this.day = null; // Daylight parameters, computed in build().

        this.interactive = []; // Meshes that can be gazed/clicked to open.
        this.videos = []; // HTMLVideoElements driving in-world screens.
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
        this.texCache = {}; // Cached canvas textures, keyed by string.
        this.matCache = {}; // Cached facade materials, keyed by style + repeat.
        this.roads = []; // Walkable road corridors (rects in the XZ plane).
        this.flyThreshold = 1.2; // Rig height above which movement is free-flight.
        this.captureMargin = 3; // Only clamp to a road within this distance.
        this.postfx = null; // On-screen bloom pipeline (built after the scene).
        this.sun = null; // Shadow-casting sun (non-void), followed to the learner.
        this.sunDir = null; // Sun direction unit vector.
        this.lastShadowPos = new THREE.Vector3(1e9, 0, 1e9); // Last shadow recentre.
        this.modelCache = {}; // Loaded .glb templates, keyed by URL.
        this.traffic = []; // Flying-car instances animated each frame.

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
        // Filmic tone mapping turns the flat WebGL output cinematic; it applies
        // in both the desktop and headset render paths.
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        // Soft sun shadows for grounding depth. The scene is static, so the
        // shadow map is only re-rendered when the shadow frustum follows the
        // learner (see tick), not every frame.
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = true;
        this.root.appendChild(renderer.domElement);
        this.renderer = renderer;

        // Work out where the sun is for the site's current hour, then paint the
        // sky and smog to match. Void is always deep space, so its lighting is a
        // fixed night-like preset rather than the site clock.
        this.day = this.computeDaylight(this.hour);
        if (this.config.environment === 'void') {
            this.day.day = 0;
            this.day.night = 1;
            this.day.neon = 1.2;
            this.day.windowEmissive = 1.3;
            this.day.adOpacity = 0.85;
            this.day.starOpacity = 1;
        }

        // Scene, camera, player rig.
        var scene = new THREE.Scene();
        scene.background = this.day.skyTop.clone();
        if (this.config.environment !== 'void') {
            // A hazy, coloured fog band is what gives the city its smoggy,
            // light-bleeding depth; its colour and thickness follow the time.
            scene.fog = new THREE.FogExp2(this.day.fog.getHex(), this.day.fogDensity);
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
        // Original glTF props (lamps, kiosks, barriers, flying traffic); loads
        // asynchronously and falls back cleanly if models are unavailable.
        this.buildProps();
        this.buildControllers();
        this.gestures = new GestureManager(this);
        this.buildVrButton();
        this.buildFullscreenButton();
        this.bindDesktopControls();
        this.bindMediaPause();
        // Cinematic post pipeline (bloom) for the on-screen view.
        this.buildPostFX();

        window.addEventListener('resize', this.onResize.bind(this));

        // Drive everything from the XR-aware animation loop.
        renderer.setAnimationLoop(this.tick.bind(this));
    };

    Cyberspace.prototype.aspect = function() {
        return (this.root.clientWidth || 1) / (this.root.clientHeight || 480);
    };

    /**
     * Work out the daylight state for an hour of day: sun direction, sky and
     * fog colours, light intensities and how strongly the neon reads. Everything
     * downstream (sky, lights, materials, signs) is coloured from this, so the
     * scene matches the Moodle site clock - bright and hazy by day, dark and
     * neon-lit by night, warm at dawn and dusk.
     *
     * @param {Number} hour Hour of day, 0-24 (minutes as a fraction).
     * @return {Object} The daylight parameters.
     */
    Cyberspace.prototype.computeDaylight = function(hour) {
        var THREE = this.THREE;
        var ang = ((hour - 6) / 12) * Math.PI; // 0 at 06:00, PI at 18:00.
        var elev = (hour >= 6 && hour <= 18) ? Math.sin(ang) : -0.25;
        var day = Math.max(0, Math.min(1, elev * 1.25));
        var night = 1 - day;
        // Warm band peaks when the sun is near the horizon (dawn / dusk).
        var warm = elev > 0 ? Math.max(0, 1 - Math.abs(elev - 0.12) / 0.32) : 0;

        var sunDir = new THREE.Vector3(
            Math.cos(ang), Math.max(0.06, Math.sin(ang)), -0.35
        ).normalize();

        var haze = new THREE.Color(this.palette.haze);
        var skyNight = new THREE.Color(0x05070f).lerp(haze, 0.5);
        var horizonNight = new THREE.Color(0x0b1222).lerp(haze, 0.6);
        var skyDay = new THREE.Color(0x8fb2d4);
        var horizonDay = new THREE.Color(0xccd7dd);
        var dusk = new THREE.Color(0xff8a4d);

        var skyTop = skyNight.clone().lerp(skyDay, day);
        var horizon = horizonNight.clone().lerp(horizonDay, day).lerp(dusk, warm * 0.6);

        var sunWarm = new THREE.Color(0xfff2d8).lerp(new THREE.Color(0xff9550), warm);
        var moon = new THREE.Color(0x93b0ff);

        return {
            hour: hour, day: day, night: night, warm: warm, sunDir: sunDir,
            skyTop: skyTop, horizon: horizon,
            sunColor: day > 0.03 ? sunWarm : moon,
            sunIntensity: 0.12 + day * 1.2,
            hemiIntensity: 0.28 + day * 0.72,
            fog: horizon.clone(),
            fogDensity: 0.011 + day * 0.006 + warm * 0.006,
            neon: 0.3 + night * 0.9, // Neon accent strength.
            windowEmissive: 0.05 + night * 1.25, // Lit-window glow (near off by day).
            adOpacity: 0.32 + night * 0.5, // Holographic ad strength.
            starOpacity: Math.max(0, night - 0.35)
        };
    };

    /**
     * Add the sun (or moon), a hazy sky fill and a soft opposite fill light,
     * all coloured and scaled for the current time of day.
     */
    Cyberspace.prototype.buildLights = function() {
        var THREE = this.THREE;
        var d = this.day;

        var hemi = new THREE.HemisphereLight(
            d.skyTop.getHex(), new THREE.Color(0x3a3d44).lerp(d.horizon, 0.4).getHex(),
            d.hemiIntensity
        );
        this.scene.add(hemi);

        var sun = new THREE.DirectionalLight(d.sunColor.getHex(), d.sunIntensity);
        sun.position.copy(d.sunDir).multiplyScalar(220);
        // The sun casts shadows over the streets nearest the learner. A tight
        // frustum keeps the shadow map crisp where it counts.
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 40;
        sun.shadow.camera.far = 460;
        sun.shadow.camera.left = -90;
        sun.shadow.camera.right = 90;
        sun.shadow.camera.top = 90;
        sun.shadow.camera.bottom = -90;
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.6;
        this.scene.add(sun);
        this.scene.add(sun.target); // Aim followed to the learner in tick().
        this.sun = sun;
        this.sunDir = d.sunDir.clone();

        // A fill from the opposite side so shadowed faces keep some form.
        var fill = new THREE.DirectionalLight(d.horizon.getHex(), 0.25 + d.day * 0.25);
        fill.position.set(-d.sunDir.x * 140, 50, -d.sunDir.z * 140 + 60);
        this.scene.add(fill);
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
        var d = this.day;

        // Void is a different backdrop entirely: the streets float in deep space
        // among planets and nebulae, so it builds its own lights and sky.
        if (this.config.environment === 'void') {
            this.buildSpace();
            return;
        }

        // Sun / moon and sky fill, so lit materials read as real volumes.
        this.buildLights();

        if (this.config.environment !== 'void') {
            // Wet asphalt: a lit, slightly reflective ground that catches the
            // sun by day and the neon by night.
            var ground = new THREE.Mesh(
                new THREE.PlaneGeometry(1400, 1400),
                new THREE.MeshStandardMaterial({
                    color: 0x14161c, roughness: 0.35 + d.day * 0.4, metalness: 0.55
                })
            );
            ground.rotation.x = -Math.PI / 2;
            ground.position.y = -0.02;
            ground.receiveShadow = true;
            this.scene.add(ground);

            // Faint kerb grid; a neon accent, so it fades out in daylight.
            var grid = new THREE.GridHelper(600, 240, primary, secondary);
            grid.material.opacity = 0.05 + d.night * 0.14;
            grid.material.transparent = true;
            this.scene.add(grid);
        }

        // Gradient sky dome and the sun/moon disc.
        this.buildSky();

        // Smog particles / stars, only really visible at night.
        if (d.starOpacity > 0.01) {
            var count = this.config.environment === 'void' ? 900 : 1400;
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
                transparent: true, opacity: d.starOpacity, fog: false
            }));
            this.scene.add(stars);
        }

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
     * A gradient sky dome (horizon to zenith) and the sun or moon disc, placed
     * and coloured for the current time of day.
     */
    Cyberspace.prototype.buildSky = function() {
        var THREE = this.THREE;
        var d = this.day;

        // Vertical gradient dome: horizon colour at the bottom, sky at the top.
        var canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 256;
        var ctx = canvas.getContext('2d');
        var g = ctx.createLinearGradient(0, 256, 0, 0);
        g.addColorStop(0, '#' + d.horizon.getHexString());
        g.addColorStop(0.45, '#' + d.horizon.clone().lerp(d.skyTop, 0.5).getHexString());
        g.addColorStop(1, '#' + d.skyTop.getHexString());
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 8, 256);
        var tex = new THREE.CanvasTexture(canvas);
        var dome = new THREE.Mesh(
            new THREE.SphereGeometry(600, 24, 16),
            new THREE.MeshBasicMaterial({
                map: tex, side: THREE.BackSide, depthWrite: false, fog: false
            })
        );
        this.scene.add(dome);

        // The sun (or moon) disc with a soft halo.
        var disc = document.createElement('canvas');
        disc.width = 128;
        disc.height = 128;
        var dctx = disc.getContext('2d');
        var col = d.sunColor;
        var rgb = Math.round(col.r * 255) + ',' + Math.round(col.g * 255) + ',' + Math.round(col.b * 255);
        var rg = dctx.createRadialGradient(64, 64, 4, 64, 64, 64);
        rg.addColorStop(0, 'rgba(' + rgb + ',1)');
        rg.addColorStop(0.25, 'rgba(' + rgb + ',0.8)');
        rg.addColorStop(1, 'rgba(' + rgb + ',0)');
        dctx.fillStyle = rg;
        dctx.fillRect(0, 0, 128, 128);
        var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(disc), transparent: true,
            depthWrite: false, fog: false, opacity: 0.95
        }));
        var size = 60 + d.day * 40;
        sprite.scale.set(size, size, 1);
        sprite.position.copy(d.sunDir).multiplyScalar(480);
        this.scene.add(sprite);
    };

    /**
     * Build the Void backdrop: deep space with a dense starfield, drifting
     * nebulae, a bright distant star that lights the scene, and a few planets,
     * so the streets appear to float in orbit.
     */
    Cyberspace.prototype.buildSpace = function() {
        var THREE = this.THREE;
        this.scene.background = new THREE.Color(0x03040a);

        // A cold key light from the distant star, plus a dim fill so the far
        // side of buildings and planets is not pure black.
        var starDir = new THREE.Vector3(0.5, 0.35, -0.6).normalize();
        var key = new THREE.DirectionalLight(0xdfe8ff, 1.15);
        key.position.copy(starDir).multiplyScalar(300);
        this.scene.add(key);
        this.scene.add(new THREE.HemisphereLight(0x223046, 0x05060c, 0.35));

        // Dense starfield on a fixed far shell.
        var count = 2600;
        var pos = new Float32Array(count * 3);
        for (var i = 0; i < count; i++) {
            var r = 300 + Math.random() * 240;
            var th = Math.random() * Math.PI * 2;
            var ph = Math.acos(2 * Math.random() - 1);
            pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
            pos[i * 3 + 1] = r * Math.cos(ph);
            pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xffffff, size: 1.1, sizeAttenuation: true,
            transparent: true, opacity: 0.9, fog: false
        })));

        // Nebulae: big soft additive clouds tinted by the palette.
        var nebColours = [this.palette.primary, this.palette.secondary, 0xff3b6b];
        for (var nb = 0; nb < 3; nb++) {
            var neb = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.radialTexture(nebColours[nb % nebColours.length]),
                transparent: true, opacity: 0.16, depthWrite: false,
                blending: THREE.AdditiveBlending, fog: false
            }));
            var ns = 240 + Math.random() * 220;
            neb.scale.set(ns, ns * 0.6, 1);
            neb.position.set(
                (Math.random() - 0.5) * 500, 60 + Math.random() * 160,
                -260 - Math.random() * 200
            );
            this.scene.add(neb);
        }

        // The star itself as a bright halo sprite.
        var star = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.radialTexture(0xfff4e0), transparent: true, opacity: 0.95,
            depthWrite: false, blending: THREE.AdditiveBlending, fog: false
        }));
        star.scale.set(70, 70, 1);
        star.position.copy(starDir).multiplyScalar(520);
        this.scene.add(star);

        // A handful of planets, spread out, lit by the star and gently
        // self-illuminated so they read as distant worlds rather than holes.
        this.makePlanet(72, {x: -195, y: 110, z: -340}, [0xc9975f, 0x7d5a37], true);
        this.makePlanet(54, {x: 205, y: 150, z: -430}, [0x5680bb, 0x223b63], false);
        this.makePlanet(24, {x: 150, y: 66, z: -270}, [0x9aa0a8, 0x4b5058], false);
    };

    /**
     * A soft radial-gradient sprite texture (opaque centre to transparent edge).
     *
     * @param {Number} colour Hex int colour.
     * @return {Object} A Three.CanvasTexture.
     */
    Cyberspace.prototype.radialTexture = function(colour) {
        var THREE = this.THREE;
        var c = new THREE.Color(colour);
        var rgb = Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255);
        var ctx = this.newCanvasCtx(128);
        var grd = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
        grd.addColorStop(0, 'rgba(' + rgb + ',1)');
        grd.addColorStop(0.4, 'rgba(' + rgb + ',0.5)');
        grd.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 128, 128);
        var t = new THREE.CanvasTexture(ctx.canvas);
        if (t.colorSpace !== undefined) {
            t.colorSpace = THREE.SRGBColorSpace;
        }
        return t;
    };

    /**
     * Build a lit planet sphere with a banded surface, optionally ringed.
     *
     * @param {Number} radius Planet radius.
     * @param {Object} at Position {x, y, z}.
     * @param {Array} colours [band A, band B] hex ints.
     * @param {Boolean} ringed Whether to add a ring.
     */
    Cyberspace.prototype.makePlanet = function(radius, at, colours, ringed) {
        var THREE = this.THREE;
        var ctx = this.newCanvasCtx(256);
        var a = new THREE.Color(colours[0]);
        var b = new THREE.Color(colours[1]);
        ctx.fillStyle = '#' + a.getHexString();
        ctx.fillRect(0, 0, 256, 256);
        // Horizontal bands with a little turbulence.
        for (var y = 0; y < 256; y += 4) {
            var t = 0.5 + 0.5 * Math.sin(y * 0.05 + Math.random() * 0.4);
            ctx.fillStyle = '#' + a.clone().lerp(b, t).getHexString();
            ctx.fillRect(0, y, 256, 4 + Math.random() * 3);
        }
        var tex = new THREE.CanvasTexture(ctx.canvas);
        if (tex.colorSpace !== undefined) {
            tex.colorSpace = THREE.SRGBColorSpace;
        }
        var planet = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 32, 24),
            new THREE.MeshStandardMaterial({
                map: tex, roughness: 1, metalness: 0,
                emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28
            })
        );
        planet.position.set(at.x, at.y, at.z);
        this.scene.add(planet);

        if (ringed) {
            var ring = new THREE.Mesh(
                new THREE.RingGeometry(radius * 1.4, radius * 2.1, 48),
                new THREE.MeshBasicMaterial({
                    color: 0xcbb78a, transparent: true, opacity: 0.5,
                    side: THREE.DoubleSide, depthWrite: false, fog: false
                })
            );
            ring.rotation.x = Math.PI / 2.6;
            ring.position.copy(planet.position);
            this.scene.add(ring);
        }
    };

    // A window module is roughly this many metres, so repeat counts keep the
    // window grid a consistent real size across buildings of any dimension.
    var MODULE_W = 8; // Four window columns.
    var MODULE_H = 11; // Six floors.

    /**
     * Build the seamless, tileable facade texture set for a style once (surface
     * colour, bump relief, roughness and emissive windows), cached per style.
     * The tile is a small block of floors and window columns; facadeMaterial
     * repeats it across a face so the windows stay crisp at any building size.
     *
     * @param {Object} style One of the STYLES recipes.
     * @return {Object} {map, bump, rough, emissive} base Three.CanvasTextures.
     */
    Cyberspace.prototype.facadeTextures = function(style) {
        var key = 'facbase_' + style.body + '_' + style.lit + '_' + style.rough;
        if (this.texCache[key]) {
            return this.texCache[key];
        }
        var THREE = this.THREE;
        var SIZE = 512;
        var cols = 4;
        var rows = 6;
        var cw = SIZE / cols;
        var ch = SIZE / rows;
        var frame = Math.min(cw, ch) * 0.16; // Concrete gutter around a window.

        var g = this.newCanvasCtx(SIZE); // Colour/surface map.
        var b = this.newCanvasCtx(SIZE); // Bump relief.
        var r = this.newCanvasCtx(SIZE); // Roughness.
        var e = this.newCanvasCtx(SIZE); // Emissive windows.

        var base = new THREE.Color(style.body);
        var mullion = base.clone().multiplyScalar(0.55);
        var ledge = base.clone().multiplyScalar(1.18);
        var glassTop = new THREE.Color(0x0c1119);
        var glassBot = base.clone().multiplyScalar(0.42).lerp(new THREE.Color(0x121a24), 0.6);
        var lit = new THREE.Color(style.lit);
        var concreteRough = Math.round(style.rough * 255);

        // Bases.
        g.fillStyle = '#' + base.getHexString();
        g.fillRect(0, 0, SIZE, SIZE);
        b.fillStyle = 'rgb(120,120,120)';
        b.fillRect(0, 0, SIZE, SIZE);
        r.fillStyle = 'rgb(' + concreteRough + ',' + concreteRough + ',' + concreteRough + ')';
        r.fillRect(0, 0, SIZE, SIZE);
        e.fillStyle = '#000000';
        e.fillRect(0, 0, SIZE, SIZE);

        // Concrete mottling on the colour and bump maps.
        for (var s = 0; s < 1400; s++) {
            var sh = (Math.random() - 0.5) * 0.16;
            g.fillStyle = (sh < 0 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + Math.abs(sh).toFixed(3) + ')';
            g.fillRect(Math.random() * SIZE, Math.random() * SIZE, 3, 3);
        }

        var y;
        var x;
        // Windows: glass inset into each cell, with a mullion frame drawn as a
        // border (not a full-cell fill) so the concrete, mottling and the floor
        // ledges added afterwards all survive on the colour and height maps.
        for (y = 0; y < rows; y++) {
            for (x = 0; x < cols; x++) {
                var wx = x * cw + frame;
                var wy = y * ch + frame + 4;
                var ww = cw - frame * 2;
                var wh = ch - frame * 2 - 4;

                // Glass: a vertical gradient plus a diagonal reflection streak.
                var grd = g.createLinearGradient(wx, wy, wx, wy + wh);
                grd.addColorStop(0, '#' + glassTop.getHexString());
                grd.addColorStop(1, '#' + glassBot.getHexString());
                g.fillStyle = grd;
                g.fillRect(wx, wy, ww, wh);
                g.fillStyle = 'rgba(255,255,255,0.06)';
                g.beginPath();
                g.moveTo(wx, wy + wh * 0.7);
                g.lineTo(wx + ww * 0.5, wy);
                g.lineTo(wx + ww, wy);
                g.lineTo(wx, wy + wh);
                g.closePath();
                g.fill();

                // Mullion frame border around the glass (raised on the height map).
                g.strokeStyle = '#' + mullion.getHexString();
                g.lineWidth = 3;
                g.strokeRect(wx - 1.5, wy - 1.5, ww + 3, wh + 3);
                b.strokeStyle = 'rgb(180,180,180)';
                b.lineWidth = 3;
                b.strokeRect(wx - 1.5, wy - 1.5, ww + 3, wh + 3);

                // Windows sit deeper (height) and read as glossy glass (rough).
                b.fillStyle = 'rgb(70,70,70)';
                b.fillRect(wx, wy, ww, wh);
                r.fillStyle = 'rgb(45,45,45)';
                r.fillRect(wx, wy, ww, wh);

                // Some windows are lit at night.
                if (Math.random() < style.density) {
                    var dim = style.wireframe && Math.random() < 0.5;
                    e.globalAlpha = dim ? 0.35 : 0.9;
                    e.fillStyle = '#' + lit.getHexString();
                    e.fillRect(wx, wy, ww, wh);
                    e.globalAlpha = 1;
                }
            }
        }

        // Floor ledges (spandrels): a raised band with an ambient-occlusion
        // shadow beneath, drawn after the windows so they read on the colour and
        // height (normal) maps, and tiling vertically every floor.
        for (y = 0; y < rows; y++) {
            var ly = y * ch;
            g.fillStyle = '#' + ledge.getHexString();
            g.fillRect(0, ly, SIZE, 4);
            g.fillStyle = 'rgba(0,0,0,0.28)';
            g.fillRect(0, ly + 4, SIZE, 3);
            b.fillStyle = 'rgb(205,205,205)';
            b.fillRect(0, ly, SIZE, 4);
            b.fillStyle = 'rgb(55,55,55)';
            b.fillRect(0, ly + 4, SIZE, 3);
        }

        // Rust patches - heavy on Entropism, a light bloom elsewhere - on the
        // colour map, and rougher there.
        var rust = new THREE.Color(0x71401f);
        var worn = !!style.wireframe;
        var rr = Math.round(rust.r * 255) + ',' + Math.round(rust.g * 255) + ',' + Math.round(rust.b * 255);
        var patches = worn ? 26 : 8;
        for (var p = 0; p < patches; p++) {
            var px = Math.random() * SIZE;
            var py = Math.random() * SIZE;
            var pr = 6 + Math.random() * (worn ? 34 : 16);
            var rgd = g.createRadialGradient(px, py, 0, px, py, pr);
            rgd.addColorStop(0, 'rgba(' + rr + ',' + (worn ? 0.5 : 0.26) + ')');
            rgd.addColorStop(1, 'rgba(' + rr + ',0)');
            g.fillStyle = rgd;
            g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
            r.globalAlpha = worn ? 0.5 : 0.3;
            r.fillStyle = 'rgb(240,240,240)';
            r.beginPath();
            r.arc(px, py, pr * 0.8, 0, Math.PI * 2);
            r.fill();
            r.globalAlpha = 1;
        }

        // Fine scratches: bright on roughness, a faint groove on the height map.
        for (var sc = 0; sc < 70; sc++) {
            var sx = Math.random() * SIZE;
            var sy = Math.random() * SIZE;
            var sa = Math.random() * Math.PI;
            var sl = 5 + Math.random() * 26;
            var ex = sx + Math.cos(sa) * sl;
            var ey = sy + Math.sin(sa) * sl;
            r.strokeStyle = 'rgba(255,255,255,0.3)';
            r.lineWidth = 1;
            r.beginPath();
            r.moveTo(sx, sy);
            r.lineTo(ex, ey);
            r.stroke();
            b.strokeStyle = 'rgba(95,95,95,0.6)';
            b.beginPath();
            b.moveTo(sx, sy);
            b.lineTo(ex, ey);
            b.stroke();
        }

        // Water streaks weeping down from ledges (darker colour, shinier rough).
        for (var k = 0; k < 10; k++) {
            var wsx = Math.random() * SIZE;
            var wsw = 3 + Math.random() * 9;
            var wtop = Math.floor(Math.random() * rows) * ch;
            var wgd = g.createLinearGradient(0, wtop, 0, SIZE);
            wgd.addColorStop(0, 'rgba(0,0,0,0.2)');
            wgd.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = wgd;
            g.fillRect(wsx, wtop, wsw, SIZE - wtop);
            r.fillStyle = 'rgba(20,20,20,0.5)';
            r.fillRect(wsx, wtop, wsw, SIZE - wtop);
        }

        // A neon cornice strip along a floor line (repeats as a lit band).
        var neon = new THREE.Color(style.glow);
        e.fillStyle = '#' + neon.getHexString();
        e.globalAlpha = 0.85;
        e.fillRect(0, ch - 7, SIZE, 5);
        e.globalAlpha = 1;

        var out = {
            map: this.canvasTexture(g.canvas, true),
            normal: this.canvasTexture(this.heightToNormal(b.canvas, 2.2), false),
            rough: this.canvasTexture(r.canvas, false),
            emissive: this.canvasTexture(e.canvas, true)
        };
        this.texCache[key] = out;
        return out;
    };

    /**
     * Convert a grayscale height canvas into a tangent-space normal map, so the
     * relief (ledges, mullions, recessed windows, scratches) catches light.
     *
     * @param {Object} height The height canvas (its light = high).
     * @param {Number} strength Slope multiplier.
     * @return {Object} A new canvas holding the normal map.
     */
    Cyberspace.prototype.heightToNormal = function(height, strength) {
        var n = height.width;
        var src = height.getContext('2d').getImageData(0, 0, n, n).data;
        var out = this.newCanvasCtx(n);
        var img = out.createImageData(n, n);
        var d = img.data;
        var at = function(x, y) {
            var xx = (x + n) % n;
            var yy = (y + n) % n;
            return src[(yy * n + xx) * 4]; // Red channel = height.
        };
        for (var y = 0; y < n; y++) {
            for (var x = 0; x < n; x++) {
                var dx = (at(x - 1, y) - at(x + 1, y)) / 255 * strength;
                var dy = (at(x, y - 1) - at(x, y + 1)) / 255 * strength;
                var len = Math.sqrt(dx * dx + dy * dy + 1);
                var i = (y * n + x) * 4;
                d[i] = Math.round((dx / len * 0.5 + 0.5) * 255);
                d[i + 1] = Math.round((dy / len * 0.5 + 0.5) * 255);
                d[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
                d[i + 3] = 255;
            }
        }
        out.putImageData(img, 0, 0);
        return out.canvas;
    };

    /**
     * A fresh 2D canvas context of a given square size.
     *
     * @param {Number} size Canvas edge in pixels.
     * @return {Object} The 2D context (its .canvas is the element).
     */
    Cyberspace.prototype.newCanvasCtx = function(size) {
        var c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        return c.getContext('2d');
    };

    /**
     * Wrap a canvas as a repeating texture.
     *
     * @param {Object} canvas The source canvas.
     * @param {Boolean} srgb True for colour maps, false for data (bump/rough).
     * @return {Object} A Three.CanvasTexture set to repeat.
     */
    Cyberspace.prototype.canvasTexture = function(canvas, srgb) {
        var THREE = this.THREE;
        var t = new THREE.CanvasTexture(canvas);
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        if (srgb && t.colorSpace !== undefined) {
            t.colorSpace = THREE.SRGBColorSpace;
        }
        return t;
    };

    /**
     * A lit, textured building-body material for a style at a given size. The
     * facade tile repeats to keep windows a consistent size; the result is
     * cached per style and repeat so buildings share GPU textures.
     *
     * @param {Object} style One of the STYLES recipes.
     * @param {Number} width Body width in metres.
     * @param {Number} height Body height in metres.
     * @return {Object} A Three.MeshStandardMaterial.
     */
    Cyberspace.prototype.facadeMaterial = function(style, width, height) {
        var THREE = this.THREE;
        var rx = Math.max(1, Math.round(width / MODULE_W));
        var ry = Math.max(1, Math.round(height / MODULE_H));
        var key = style.body + '|' + style.lit + '|' + rx + 'x' + ry;
        if (this.matCache[key]) {
            return this.matCache[key];
        }
        var tex = this.facadeTextures(style);
        var map = tex.map.clone();
        var normal = tex.normal.clone();
        var rough = tex.rough.clone();
        var emissive = tex.emissive.clone();
        [map, normal, rough, emissive].forEach(function(t) {
            t.repeat.set(rx, ry);
            t.needsUpdate = true;
        });
        var mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: map,
            normalMap: normal,
            normalScale: new THREE.Vector2(0.8, 0.8),
            roughnessMap: rough,
            roughness: 1,
            metalness: style.metal,
            emissive: new THREE.Color(style.lit),
            emissiveMap: emissive,
            emissiveIntensity: this.day.windowEmissive
        });
        this.matCache[key] = mat;
        return mat;
    };

    /**
     * Build the trim sheet for a style: one texture packing four reusable
     * greeble details in a 2x2 grid - vent louvers, a pipe bundle, a bolted
     * panel and an air-handling unit - with matching normal, roughness and
     * emissive maps. Cached per style.
     *
     * @param {Object} style One of the STYLES recipes.
     * @return {Object} {map, normal, rough, emissive} base Three.CanvasTextures.
     */
    Cyberspace.prototype.trimSheet = function(style) {
        var key = 'trim_' + style.body;
        if (this.texCache[key]) {
            return this.texCache[key];
        }
        var THREE = this.THREE;
        var SIZE = 256;
        var cell = 128;
        var g = this.newCanvasCtx(SIZE);
        var b = this.newCanvasCtx(SIZE);
        var r = this.newCanvasCtx(SIZE);
        var e = this.newCanvasCtx(SIZE);
        var metal = new THREE.Color(style.body).multiplyScalar(0.7);

        g.fillStyle = '#' + metal.getHexString();
        g.fillRect(0, 0, SIZE, SIZE);
        b.fillStyle = 'rgb(128,128,128)';
        b.fillRect(0, 0, SIZE, SIZE);
        r.fillStyle = 'rgb(150,150,150)';
        r.fillRect(0, 0, SIZE, SIZE);
        e.fillStyle = '#000000';
        e.fillRect(0, 0, SIZE, SIZE);

        var dark = metal.clone().multiplyScalar(0.5).getStyle();
        var lite = metal.clone().multiplyScalar(1.4).getStyle();
        var i;

        // Vent louvers (0,0): horizontal slats.
        for (i = 0; i < 9; i++) {
            var vy = 14 + i * 12;
            g.fillStyle = dark;
            g.fillRect(12, vy, cell - 24, 7);
            g.fillStyle = lite;
            g.fillRect(12, vy, cell - 24, 2);
            b.fillStyle = 'rgb(70,70,70)';
            b.fillRect(12, vy, cell - 24, 7);
            b.fillStyle = 'rgb(190,190,190)';
            b.fillRect(12, vy, cell - 24, 2);
        }

        // Pipe bundle (1,0): vertical rounded pipes.
        for (i = 0; i < 4; i++) {
            var pxc = cell + 22 + i * 22;
            var pgd = g.createLinearGradient(pxc - 8, 0, pxc + 8, 0);
            pgd.addColorStop(0, dark);
            pgd.addColorStop(0.5, lite);
            pgd.addColorStop(1, dark);
            g.fillStyle = pgd;
            g.fillRect(pxc - 8, 8, 16, cell - 16);
            b.fillStyle = 'rgb(180,180,180)';
            b.fillRect(pxc - 3, 8, 4, cell - 16);
        }

        // Bolted panel (0,1): seams and corner rivets.
        g.strokeStyle = dark;
        g.lineWidth = 2;
        g.strokeRect(10, cell + 10, cell - 20, cell - 20);
        for (i = 0; i < 4; i++) {
            var bx = 18 + (i % 2) * (cell - 36);
            var by = cell + 18 + Math.floor(i / 2) * (cell - 36);
            g.fillStyle = lite;
            g.beginPath();
            g.arc(bx, by, 3, 0, Math.PI * 2);
            g.fill();
            b.fillStyle = 'rgb(210,210,210)';
            b.beginPath();
            b.arc(bx, by, 3, 0, Math.PI * 2);
            b.fill();
        }

        // Air-handling unit (1,1): housing, fan grille and a warning light.
        g.fillStyle = dark;
        g.fillRect(cell + 14, cell + 14, cell - 28, cell - 28);
        g.strokeStyle = lite;
        g.lineWidth = 2;
        var fcx = cell + cell / 2;
        var fcy = cell + cell / 2;
        g.beginPath();
        g.arc(fcx, fcy, 34, 0, Math.PI * 2);
        g.stroke();
        for (i = 0; i < 8; i++) {
            var an = (i / 8) * Math.PI * 2;
            g.beginPath();
            g.moveTo(fcx, fcy);
            g.lineTo(fcx + Math.cos(an) * 34, fcy + Math.sin(an) * 34);
            g.stroke();
        }
        e.fillStyle = '#ff3b3b';
        e.fillRect(cell + 20, cell + 20, 6, 6);

        var out = {
            map: this.canvasTexture(g.canvas, true),
            normal: this.canvasTexture(this.heightToNormal(b.canvas, 1.6), false),
            rough: this.canvasTexture(r.canvas, false),
            emissive: this.canvasTexture(e.canvas, true)
        };
        this.texCache[key] = out;
        return out;
    };

    /**
     * A material that shows one cell of a style's trim sheet.
     *
     * @param {Object} style One of the STYLES recipes.
     * @param {Number} cx Cell column (0 or 1).
     * @param {Number} cy Cell row (0 or 1).
     * @return {Object} A Three.MeshStandardMaterial, cached per style + cell.
     */
    Cyberspace.prototype.trimMaterial = function(style, cx, cy) {
        var THREE = this.THREE;
        var key = 'trimmat_' + style.body + '_' + cx + cy;
        if (this.matCache[key]) {
            return this.matCache[key];
        }
        var tex = this.trimSheet(style);
        var parts = {};
        ['map', 'normal', 'rough', 'emissive'].forEach(function(name) {
            var t = tex[name].clone();
            t.wrapS = THREE.ClampToEdgeWrapping;
            t.wrapT = THREE.ClampToEdgeWrapping;
            t.repeat.set(0.5, 0.5);
            t.offset.set(cx * 0.5, (1 - cy) * 0.5);
            t.needsUpdate = true;
            parts[name] = t;
        });
        var mat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            map: parts.map,
            normalMap: parts.normal,
            roughnessMap: parts.rough,
            roughness: 1,
            metalness: 0.5,
            emissive: 0xffffff,
            emissiveMap: parts.emissive,
            emissiveIntensity: Math.max(0.35, this.day.windowEmissive)
        });
        this.matCache[key] = mat;
        return mat;
    };

    /**
     * Bolt lived-in greebles onto a building from its style trim sheet: a base
     * vent, a wall access panel, a corner pipe run and a rooftop unit.
     *
     * @param {Object} group The building group to add to.
     * @param {Object} style The STYLES recipe.
     * @param {Number} w Body width.
     * @param {Number} d Body depth.
     * @param {Number} h Body height.
     */
    Cyberspace.prototype.addGreebles = function(group, style, w, d, h) {
        var THREE = this.THREE;
        var vent = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.82, 1.1, 0.35), this.trimMaterial(style, 0, 0)
        );
        vent.position.set(0, 0.75, d / 2 + 0.16);
        group.add(vent);

        // Access panel on the right side wall, clear of the front signboard.
        var panel = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 1.6, 1.2), this.trimMaterial(style, 0, 1)
        );
        panel.position.set(w / 2 + 0.06, 1.7, -d * 0.12);
        group.add(panel);

        var pipe = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, h * 0.9, 0.4), this.trimMaterial(style, 1, 0)
        );
        pipe.position.set(w / 2 - 0.3, h * 0.45, d / 2 - 0.3);
        group.add(pipe);

        var unit = new THREE.Mesh(
            new THREE.BoxGeometry(1.7, 1.1, 1.7), this.trimMaterial(style, 1, 1)
        );
        unit.position.set((Math.random() - 0.5) * w * 0.4, h + 0.55, (Math.random() - 0.5) * d * 0.4);
        group.add(unit);
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

            // Lit slab with a wall of windows on every face.
            var body = new THREE.Mesh(
                new THREE.BoxGeometry(w, h, d),
                this.facadeMaterial(style, w, h)
            );
            body.position.set(x, h / 2, z);
            body.castShadow = true;
            body.receiveShadow = true;
            this.scene.add(body);

            // Crown edge glow (a neon accent, so it fades by day) and an
            // occasional blinking aviation beacon.
            var edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
                new THREE.LineBasicMaterial({
                    color: style.edge, transparent: true, opacity: 0.2 + this.day.neon * 0.4
                })
            );
            edges.position.copy(body.position);
            this.scene.add(edges);

            if (Math.random() < 0.5) {
                var beacon = new THREE.Sprite(new THREE.SpriteMaterial({
                    color: 0xff2b4e, transparent: true, depthWrite: false,
                    opacity: 0.4 + this.day.neon * 0.55
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
        var mat = this.facadeMaterial(style, 4, 5);
        var y = 0;
        var boxes = 3 + Math.floor(Math.random() * 4);
        for (var b = 0; b < boxes; b++) {
            var w = 2.4 + Math.random() * 2.2;
            var d = 2.4 + Math.random() * 2.2;
            var h = 2 + Math.random() * 2.4;
            var jx = (Math.random() - 0.5) * 2.2;
            var jz = (Math.random() - 0.5) * 2.2;
            var box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            box.position.set(cx + jx, y + h / 2, cz + jz);
            box.rotation.y = Math.random() * 0.5;
            this.scene.add(box);
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
            var base = this.day.adOpacity;
            var mat = new THREE.MeshBasicMaterial({
                map: tex, transparent: true, opacity: base,
                depthWrite: false, blending: THREE.AdditiveBlending, fog: false
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
            this.ads.push({mat: mat, base: base, phase: Math.random() * 6.28});
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
        // Search beams only cut through the dark, so they fade out by day.
        var opacity = 0.02 + this.day.night * 0.06;
        for (var i = 0; i < 8; i++) {
            var colour = Math.random() < 0.5 ? this.palette.primary : this.palette.secondary;
            var beam = new THREE.Mesh(
                new THREE.CylinderGeometry(0.15, 1.6, 90, 6, 1, true),
                new THREE.MeshBasicMaterial({
                    color: colour, transparent: true, opacity: opacity,
                    side: THREE.DoubleSide, depthWrite: false,
                    blending: THREE.AdditiveBlending, fog: false
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
     * Load a glTF model (binary .glb or JSON .gltf), cached per URL. Returns a
     * template group; callers clone it for each instance.
     *
     * When the addon glTF loader stack is available (the common case), Three's
     * GLTFLoader is used with the Draco, KTX2/Basis and meshopt decoders, so
     * compressed authored asset packs load. When the addons could not be loaded
     * (e.g. a strict CSP blocked the import map), it falls back to the plugin's
     * built-in uncompressed-glTF parser (parseGlb).
     *
     * @param {String} url The .glb or .gltf URL.
     * @return {Promise} Resolves with a Three.Group template.
     */
    Cyberspace.prototype.loadModel = function(url) {
        if (this.modelCache[url]) {
            return this.modelCache[url];
        }
        var self = this;
        var promise;
        if (this.loaders.GLTFLoader) {
            promise = this.gltf().loadAsync(url).then(function(gltf) {
                self.dressLoadedModel(gltf.scene);
                return gltf.scene;
            });
        } else {
            var base = url.replace(/[^/]*$/, '');
            promise = fetch(url).then(function(res) {
                if (!res.ok) {
                    throw new Error('model fetch failed: ' + res.status);
                }
                return res.arrayBuffer();
            }).then(function(buffer) {
                return self.parseGlb(buffer, base);
            });
        }
        this.modelCache[url] = promise;
        return promise;
    };

    /**
     * Lazily build and configure the addon GLTFLoader with the Draco, KTX2 and
     * meshopt decoders (served from the plugin's bundled addons directory).
     *
     * @return {Object} The configured GLTFLoader.
     */
    Cyberspace.prototype.gltf = function() {
        if (this.gltfLoader) {
            return this.gltfLoader;
        }
        var addons = this.loaders;
        var base = this.config.addonsbaseurl;
        var loader = new addons.GLTFLoader();
        if (addons.DRACOLoader && base) {
            loader.setDRACOLoader(new addons.DRACOLoader().setDecoderPath(base + 'libs/draco/gltf/'));
        }
        if (addons.KTX2Loader && base && this.renderer) {
            try {
                loader.setKTX2Loader(
                    new addons.KTX2Loader().setTranscoderPath(base + 'libs/basis/').detectSupport(this.renderer)
                );
            } catch (e) {
                // KTX2/Basis support unavailable on this GPU; other formats still load.
            }
        }
        if (addons.MeshoptDecoder) {
            loader.setMeshoptDecoder(addons.MeshoptDecoder);
        }
        this.gltfLoader = loader;
        return loader;
    };

    /**
     * Fold an addon-loaded model into the scene's day/night look: emissive
     * materials glow more strongly after dark, matching the built-in parser.
     *
     * @param {Object} group The loaded Three.Group (gltf.scene).
     */
    Cyberspace.prototype.dressLoadedModel = function(group) {
        var night = (this.day && this.day.night) || 0;
        group.traverse(function(o) {
            if (!o.isMesh || !o.material) {
                return;
            }
            var mats = Array.isArray(o.material) ? o.material : [o.material];
            for (var i = 0; i < mats.length; i++) {
                var m = mats[i];
                var em = m.emissive;
                var glows = !!m.emissiveMap || (em && (em.r + em.g + em.b) > 0);
                if (glows) {
                    // Keep an intentionally disabled emission (emissiveIntensity
                    // 0, e.g. KHR_materials_emissive_strength 0) off; only default
                    // when the loader left it unset.
                    var base = (typeof m.emissiveIntensity === 'number') ? m.emissiveIntensity : 1;
                    m.emissiveIntensity = (0.7 + night) * base;
                }
            }
        });
    };

    /**
     * Parse a glTF container (binary .glb or JSON .gltf) into a Three.Group.
     * Returns a promise because images and external buffers may be fetched and
     * decoded before the group is complete.
     *
     * @param {ArrayBuffer} buffer The model bytes.
     * @param {String} baseUrl The URL the model was loaded from, used to resolve
     *     external buffers and images (or '' when there is none).
     * @return {Promise} Resolves with a Three.Group.
     */
    Cyberspace.prototype.parseGlb = function(buffer, baseUrl) {
        var json = null;
        var bin = null;
        var dv = new DataView(buffer);
        if (dv.getUint32(0, true) === 0x46546c67) {
            var offset = 12;
            while (offset < dv.byteLength) {
                var len = dv.getUint32(offset, true);
                var type = dv.getUint32(offset + 4, true);
                var start = offset + 8;
                if (type === 0x4e4f534a) {
                    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
                } else if (type === 0x004e4942) {
                    bin = new Uint8Array(buffer, start, len);
                }
                offset = start + len + ((4 - (len % 4)) % 4);
            }
        } else {
            // A plain-text .gltf file: the whole buffer is the JSON document.
            json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer)));
        }
        if (!json) {
            throw new Error('glb has no JSON chunk');
        }
        return this.buildGltf(json, bin, baseUrl || '');
    };

    /**
     * Resolve a glTF's buffers and images, then build its scene graph.
     *
     * @param {Object} json The parsed glTF JSON.
     * @param {Object} bin The GLB binary chunk (Uint8Array), or null for .gltf.
     * @param {String} baseUrl Base URL for external resources.
     * @return {Promise} Resolves with a Three.Group.
     */
    Cyberspace.prototype.buildGltf = function(json, bin, baseUrl) {
        var self = this;
        var THREE = this.THREE;
        var buffers;
        return this.glbBuffers(json, bin, baseUrl).then(function(resolved) {
            buffers = resolved;
            return self.glbImages(json, buffers, baseUrl);
        }).then(function(images) {
            var ctx = {
                json: json, buffers: buffers, images: images,
                baseUrl: baseUrl, texCache: {}
            };
            var group = new THREE.Group();
            var scene = json.scenes[json.scene || 0];
            for (var i = 0; i < scene.nodes.length; i++) {
                group.add(self.glbNode(ctx, scene.nodes[i]));
            }
            return group;
        });
    };

    /**
     * Resolve every glTF buffer to a Uint8Array. Buffer 0 of a .glb is the
     * embedded BIN chunk; others (and all .gltf buffers) come from data URIs or
     * external files relative to the model.
     *
     * @param {Object} json The parsed glTF.
     * @param {Object} bin The GLB binary chunk, or null.
     * @param {String} baseUrl Base URL for external buffers.
     * @return {Promise} Resolves with an array of Uint8Array.
     */
    Cyberspace.prototype.glbBuffers = function(json, bin, baseUrl) {
        var self = this;
        var list = json.buffers || [];
        return Promise.all(list.map(function(buf) {
            if (!buf.uri) {
                return bin;
            }
            if (buf.uri.indexOf('data:') === 0) {
                return self.dataUri(buf.uri);
            }
            return fetch(self.resolveUrl(buf.uri, baseUrl)).then(function(r) {
                return r.arrayBuffer();
            }).then(function(ab) {
                return new Uint8Array(ab);
            });
        }));
    };

    /**
     * Decode all glTF images to ImageBitmaps (or null when one fails), in
     * parallel. Each image comes from a bufferView + mimeType, a data URI, or an
     * external file relative to the model.
     *
     * @param {Object} json The parsed glTF.
     * @param {Array} buffers The resolved buffers.
     * @param {String} baseUrl Base URL for external images.
     * @return {Promise} Resolves with an array of ImageBitmap|null.
     */
    Cyberspace.prototype.glbImages = function(json, buffers, baseUrl) {
        var self = this;
        var list = json.images || [];
        return Promise.all(list.map(function(img) {
            return self.glbImage(img, json, buffers, baseUrl).catch(function() {
                return null;
            });
        }));
    };

    /**
     * Decode one glTF image to an ImageBitmap.
     *
     * @param {Object} img The glTF image entry.
     * @param {Object} json The parsed glTF.
     * @param {Array} buffers The resolved buffers.
     * @param {String} baseUrl Base URL for an external image.
     * @return {Promise} Resolves with an ImageBitmap.
     */
    Cyberspace.prototype.glbImage = function(img, json, buffers, baseUrl) {
        // Texture data is straight-alpha in its own colour space, so the browser
        // must not premultiply alpha or colour-convert it on decode.
        var opts = {premultiplyAlpha: 'none', colorSpaceConversion: 'none'};
        if (img.uri) {
            var src = img.uri.indexOf('data:') === 0 ? img.uri : this.resolveUrl(img.uri, baseUrl);
            return fetch(src).then(function(r) {
                return r.blob();
            }).then(function(b) {
                return createImageBitmap(b, opts);
            });
        }
        var view = json.bufferViews[img.bufferView];
        var buf = buffers[view.buffer || 0];
        var bytes = new Uint8Array(buf.buffer, buf.byteOffset + (view.byteOffset || 0), view.byteLength);
        var blob = new Blob([bytes], {type: img.mimeType || 'image/png'});
        return createImageBitmap(blob, opts);
    };

    /**
     * Resolve a possibly-relative glTF resource URI against the model's URL,
     * using URL-reference semantics (so root-relative and absolute URIs work,
     * not just names in the same directory). Data URIs are returned unchanged.
     *
     * @param {String} uri The resource URI from the glTF.
     * @param {String} baseUrl The URL the model was loaded from.
     * @return {String} The resolved absolute URL.
     */
    Cyberspace.prototype.resolveUrl = function(uri, baseUrl) {
        if (uri.indexOf('data:') === 0) {
            return uri;
        }
        var base = baseUrl || (window.location && window.location.href) || undefined;
        try {
            return new URL(uri, base).href;
        } catch (e) {
            // Last-resort fallback if URL or the base is unusable.
            return (baseUrl || '') + uri;
        }
    };

    /**
     * Decode a data: URI to a Uint8Array (base64 or URL-encoded payload).
     *
     * @param {String} uri The data URI.
     * @return {Object} A Uint8Array of the decoded bytes.
     */
    Cyberspace.prototype.dataUri = function(uri) {
        var comma = uri.indexOf(',');
        var meta = uri.slice(5, comma);
        var data = uri.slice(comma + 1);
        if (meta.indexOf('base64') >= 0) {
            var str = atob(data);
            var out = new Uint8Array(str.length);
            for (var i = 0; i < str.length; i++) {
                out[i] = str.charCodeAt(i);
            }
            return out;
        }
        return new TextEncoder().encode(decodeURIComponent(data));
    };

    /**
     * Build one glTF node (and its children) into a Three.Object3D.
     *
     * @param {Object} ctx The parse context (json, buffers, images, texCache).
     * @param {Number} index The node index.
     * @return {Object} A Three.Object3D.
     */
    Cyberspace.prototype.glbNode = function(ctx, index) {
        var THREE = this.THREE;
        var node = ctx.json.nodes[index];
        var obj = node.mesh !== undefined ? this.glbMesh(ctx, node.mesh) : new THREE.Object3D();
        if (node.matrix) {
            obj.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
        } else {
            if (node.translation) {
                obj.position.fromArray(node.translation);
            }
            if (node.rotation) {
                obj.quaternion.fromArray(node.rotation);
            }
            if (node.scale) {
                obj.scale.fromArray(node.scale);
            }
        }
        if (node.children) {
            for (var i = 0; i < node.children.length; i++) {
                obj.add(this.glbNode(ctx, node.children[i]));
            }
        }
        return obj;
    };

    /**
     * Build a glTF mesh into a Three.Group of primitive meshes.
     *
     * @param {Object} ctx The parse context.
     * @param {Number} index The mesh index.
     * @return {Object} A Three.Group for the mesh.
     */
    Cyberspace.prototype.glbMesh = function(ctx, index) {
        var THREE = this.THREE;
        var mesh = ctx.json.meshes[index];
        var out = new THREE.Group();
        for (var p = 0; p < mesh.primitives.length; p++) {
            out.add(this.glbPrimitive(ctx, mesh.primitives[p]));
        }
        return out;
    };

    /**
     * Build one mesh primitive (geometry attributes + material) into a mesh.
     *
     * @param {Object} ctx The parse context.
     * @param {Object} prim The glTF primitive.
     * @return {Object} A Three.Mesh.
     */
    Cyberspace.prototype.glbPrimitive = function(ctx, prim) {
        var THREE = this.THREE;
        if (prim.extensions && prim.extensions.KHR_draco_mesh_compression) {
            throw new Error('Draco compression is not supported');
        }
        var geo = new THREE.BufferGeometry();
        var attr = prim.attributes;
        geo.setAttribute('position', this.glbAttribute(ctx, attr.POSITION));
        if (attr.NORMAL !== undefined) {
            geo.setAttribute('normal', this.glbAttribute(ctx, attr.NORMAL));
        }
        if (attr.TANGENT !== undefined) {
            geo.setAttribute('tangent', this.glbAttribute(ctx, attr.TANGENT));
        }
        // Map every TEXCOORD_n to Three's matching uv set: 0 -> "uv", n -> "uvN".
        // A texture channel that finds no uv set would sample missing data.
        for (var n = 0; attr['TEXCOORD_' + n] !== undefined; n++) {
            geo.setAttribute(n === 0 ? 'uv' : 'uv' + n, this.glbAttribute(ctx, attr['TEXCOORD_' + n]));
        }
        if (attr.COLOR_0 !== undefined) {
            geo.setAttribute('color', this.glbAttribute(ctx, attr.COLOR_0));
        }
        if (prim.indices !== undefined) {
            geo.setIndex(this.glbAttribute(ctx, prim.indices));
        }
        if (attr.NORMAL === undefined) {
            geo.computeVertexNormals();
        }
        return new THREE.Mesh(geo, this.glbMaterial(ctx, prim.material, attr.COLOR_0 !== undefined));
    };

    /**
     * Read a glTF accessor into a Three.BufferAttribute.
     *
     * @param {Object} ctx The parse context.
     * @param {Number} index The accessor index.
     * @return {Object} A Three.BufferAttribute.
     */
    Cyberspace.prototype.glbAttribute = function(ctx, index) {
        var acc = this.glbAccessor(ctx, index);
        return new this.THREE.BufferAttribute(acc.array, acc.itemSize, acc.normalized);
    };

    /**
     * Build a Three.MeshStandardMaterial from a glTF material: PBR factors and
     * textures, vertex colours, alpha mode, double-sidedness, and emissive glow
     * (scaled by the day/night cycle and the emissive-strength extension).
     *
     * @param {Object} ctx The parse context.
     * @param {Number} index The material index (may be undefined).
     * @param {Boolean} hasVertexColor Whether the primitive supplies COLOR_0.
     * @return {Object} A Three.MeshStandardMaterial.
     */
    Cyberspace.prototype.glbMaterial = function(ctx, index, hasVertexColor) {
        var THREE = this.THREE;
        var mat = (index !== undefined && ctx.json.materials) ? ctx.json.materials[index] : {};
        var pbr = mat.pbrMetallicRoughness || {};
        var col = pbr.baseColorFactor || [1, 1, 1, 1];
        var hasMr = !!pbr.metallicRoughnessTexture;
        // Fall back to the plugin's softer defaults only when neither a factor
        // nor a metallic-roughness texture is given (spec default is 1 for both).
        var metalness = hasMr ? 1 : 0.1;
        if (pbr.metallicFactor !== undefined) {
            metalness = pbr.metallicFactor;
        }
        var roughness = hasMr ? 1 : 0.8;
        if (pbr.roughnessFactor !== undefined) {
            roughness = pbr.roughnessFactor;
        }
        var m = new THREE.MeshStandardMaterial({
            color: new THREE.Color(col[0], col[1], col[2]),
            metalness: metalness,
            roughness: roughness,
            vertexColors: !!hasVertexColor
        });
        // The base-colour alpha multiplier applies, but only BLEND actually
        // blends; glbAlpha() enables transparency for BLEND (and cutoff for
        // MASK), so an OPAQUE prop with alpha < 1 still renders opaque.
        if (col[3] !== undefined) {
            m.opacity = col[3];
        }
        this.glbTextures(ctx, mat, pbr, m);
        this.glbEmissive(mat, m);
        this.glbAlpha(mat, m);
        return m;
    };

    /**
     * Attach the glTF material's textures to a Three material.
     *
     * @param {Object} ctx The parse context.
     * @param {Object} mat The glTF material.
     * @param {Object} pbr The material's pbrMetallicRoughness block.
     * @param {Object} m The Three.MeshStandardMaterial to populate.
     */
    Cyberspace.prototype.glbTextures = function(ctx, mat, pbr, m) {
        var THREE = this.THREE;
        var t;
        if (pbr.baseColorTexture && (t = this.glbTexture(ctx, pbr.baseColorTexture, true))) {
            m.map = t;
        }
        if (pbr.metallicRoughnessTexture && (t = this.glbTexture(ctx, pbr.metallicRoughnessTexture, false))) {
            m.metalnessMap = t;
            m.roughnessMap = t;
        }
        if (mat.normalTexture && (t = this.glbTexture(ctx, mat.normalTexture, false))) {
            m.normalMap = t;
            if (mat.normalTexture.scale !== undefined) {
                m.normalScale = new THREE.Vector2(mat.normalTexture.scale, mat.normalTexture.scale);
            }
        }
        if (mat.occlusionTexture && (t = this.glbTexture(ctx, mat.occlusionTexture, false))) {
            m.aoMap = t;
            if (mat.occlusionTexture.strength !== undefined) {
                m.aoMapIntensity = mat.occlusionTexture.strength;
            }
        }
        if (mat.emissiveTexture && (t = this.glbTexture(ctx, mat.emissiveTexture, true))) {
            m.emissiveMap = t;
        }
    };

    /**
     * Set a material's emissive colour and its day/night-scaled glow intensity.
     *
     * @param {Object} mat The glTF material.
     * @param {Object} m The Three material.
     */
    Cyberspace.prototype.glbEmissive = function(mat, m) {
        var THREE = this.THREE;
        var em = mat.emissiveFactor || [0, 0, 0];
        var emMax = Math.max(em[0], em[1], em[2]);
        m.emissive = new THREE.Color(Math.min(1, em[0]), Math.min(1, em[1]), Math.min(1, em[2]));
        // An emissive map with no factor still glows: treat the factor as white.
        if (m.emissiveMap && emMax === 0) {
            m.emissive = new THREE.Color(1, 1, 1);
        }
        var strength = 1;
        var ext = mat.extensions && mat.extensions.KHR_materials_emissive_strength;
        if (ext && ext.emissiveStrength !== undefined) {
            strength = ext.emissiveStrength;
        }
        var glows = emMax > 0 || !!m.emissiveMap;
        m.emissiveIntensity = glows ? (0.7 + this.day.night) * strength : 0;
    };

    /**
     * Apply a glTF material's alpha mode and double-sidedness.
     *
     * @param {Object} mat The glTF material.
     * @param {Object} m The Three material.
     */
    Cyberspace.prototype.glbAlpha = function(mat, m) {
        if (mat.alphaMode === 'BLEND') {
            m.transparent = true;
        } else if (mat.alphaMode === 'MASK') {
            m.alphaTest = mat.alphaCutoff !== undefined ? mat.alphaCutoff : 0.5;
        }
        if (mat.doubleSided) {
            m.side = this.THREE.DoubleSide;
        }
    };

    /**
     * Build a Three.Texture from a glTF textureInfo, or null when its image is
     * unavailable. Cached per (texture, colour-space) in the parse context.
     *
     * @param {Object} ctx The parse context.
     * @param {Object} info The glTF textureInfo (index, texCoord, extensions).
     * @param {Boolean} srgb Whether the texture holds colour (sRGB) or data (linear).
     * @return {Object} A Three.Texture, or null.
     */
    Cyberspace.prototype.glbTexture = function(ctx, info, srgb) {
        var THREE = this.THREE;
        if (!ctx.json.textures) {
            return null;
        }
        var tex = ctx.json.textures[info.index];
        var img = tex ? ctx.images[tex.source] : null;
        if (!img) {
            return null;
        }
        // The cache key must capture everything that varies per reference (the
        // UV channel and any texture transform), or one reference's settings
        // would leak to another that shares the same image.
        var transform = (info.extensions && info.extensions.KHR_texture_transform) || 0;
        var key = info.index + (srgb ? '|s' : '|l') + '|' + (info.texCoord || 0) +
            '|' + JSON.stringify(transform);
        if (ctx.texCache[key]) {
            return ctx.texCache[key];
        }
        var texture = new THREE.Texture(img);
        // Textures use glTF's top-left image origin, so Three must not flip them.
        texture.flipY = false;
        texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        this.glbSampler(ctx, tex, texture);
        if (info.texCoord) {
            texture.channel = info.texCoord;
        }
        this.glbTexTransform(info, texture);
        texture.needsUpdate = true;
        ctx.texCache[key] = texture;
        return texture;
    };

    /**
     * Apply a glTF sampler's wrap and filter modes to a Three.Texture.
     *
     * @param {Object} ctx The parse context.
     * @param {Object} tex The glTF texture entry.
     * @param {Object} texture The Three.Texture to configure.
     */
    Cyberspace.prototype.glbSampler = function(ctx, tex, texture) {
        var THREE = this.THREE;
        var wrap = {
            '33071': THREE.ClampToEdgeWrapping,
            '33648': THREE.MirroredRepeatWrapping,
            '10497': THREE.RepeatWrapping
        };
        var mag = {'9728': THREE.NearestFilter, '9729': THREE.LinearFilter};
        var min = {
            '9728': THREE.NearestFilter, '9729': THREE.LinearFilter,
            '9984': THREE.NearestMipmapNearestFilter, '9985': THREE.LinearMipmapNearestFilter,
            '9986': THREE.NearestMipmapLinearFilter, '9987': THREE.LinearMipmapLinearFilter
        };
        var s = (ctx.json.samplers && tex.sampler !== undefined) ? ctx.json.samplers[tex.sampler] : {};
        texture.wrapS = wrap[s.wrapS] || THREE.RepeatWrapping;
        texture.wrapT = wrap[s.wrapT] || THREE.RepeatWrapping;
        if (s.magFilter) {
            texture.magFilter = mag[s.magFilter] || THREE.LinearFilter;
        }
        if (s.minFilter) {
            texture.minFilter = min[s.minFilter] || THREE.LinearMipmapLinearFilter;
        }
    };

    /**
     * Apply the KHR_texture_transform extension (offset/scale/rotation) to a
     * Three.Texture, when present on the textureInfo.
     *
     * @param {Object} info The glTF textureInfo.
     * @param {Object} texture The Three.Texture.
     */
    Cyberspace.prototype.glbTexTransform = function(info, texture) {
        var tt = info.extensions && info.extensions.KHR_texture_transform;
        if (!tt) {
            return;
        }
        if (tt.offset) {
            texture.offset.set(tt.offset[0], tt.offset[1]);
        }
        if (tt.scale) {
            texture.repeat.set(tt.scale[0], tt.scale[1]);
        }
        if (tt.rotation !== undefined) {
            texture.rotation = tt.rotation;
        }
        if (tt.texCoord !== undefined) {
            texture.channel = tt.texCoord;
        }
    };

    /**
     * Read a glTF accessor into a typed array, de-interleaving any byte stride
     * and applying sparse substitutions. Supports every glTF component type.
     *
     * @param {Object} ctx The parse context.
     * @param {Number} index The accessor index.
     * @return {Object} {array, itemSize, normalized}.
     */
    Cyberspace.prototype.glbAccessor = function(ctx, index) {
        var acc = ctx.json.accessors[index];
        var comps = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16}[acc.type];
        var spec = this.glbComponent(acc.componentType);
        var out = new spec.array(acc.count * comps);
        if (acc.bufferView !== undefined) {
            var view = ctx.json.bufferViews[acc.bufferView];
            var buf = ctx.buffers[view.buffer || 0];
            var dv = new DataView(buf.buffer, buf.byteOffset);
            var stride = view.byteStride || comps * spec.bytes;
            var base = (view.byteOffset || 0) + (acc.byteOffset || 0);
            for (var e = 0; e < acc.count; e++) {
                for (var c = 0; c < comps; c++) {
                    out[e * comps + c] = dv[spec.get](base + e * stride + c * spec.bytes, true);
                }
            }
        }
        if (acc.sparse) {
            this.glbSparse(ctx, acc, out, comps);
        }
        return {array: out, itemSize: comps, normalized: !!acc.normalized};
    };

    /**
     * Map a glTF componentType to its typed-array class, byte size and DataView
     * getter.
     *
     * @param {Number} type The glTF componentType constant.
     * @return {Object} {array, bytes, get}.
     */
    Cyberspace.prototype.glbComponent = function(type) {
        var map = {
            '5120': {array: Int8Array, bytes: 1, get: 'getInt8'},
            '5121': {array: Uint8Array, bytes: 1, get: 'getUint8'},
            '5122': {array: Int16Array, bytes: 2, get: 'getInt16'},
            '5123': {array: Uint16Array, bytes: 2, get: 'getUint16'},
            '5125': {array: Uint32Array, bytes: 4, get: 'getUint32'},
            '5126': {array: Float32Array, bytes: 4, get: 'getFloat32'}
        };
        if (!map[type]) {
            throw new Error('unsupported accessor componentType ' + type);
        }
        return map[type];
    };

    /**
     * Apply a glTF accessor's sparse substitutions onto an already-read array.
     *
     * @param {Object} ctx The parse context.
     * @param {Object} acc The accessor carrying a sparse block.
     * @param {Object} out The dense typed array to patch in place.
     * @param {Number} comps Components per element.
     */
    Cyberspace.prototype.glbSparse = function(ctx, acc, out, comps) {
        var s = acc.sparse;
        var idxSpec = this.glbComponent(s.indices.componentType);
        var valSpec = this.glbComponent(acc.componentType);
        var iv = ctx.json.bufferViews[s.indices.bufferView];
        var vv = ctx.json.bufferViews[s.values.bufferView];
        var ibuf = ctx.buffers[iv.buffer || 0];
        var vbuf = ctx.buffers[vv.buffer || 0];
        var idv = new DataView(ibuf.buffer, ibuf.byteOffset);
        var vdv = new DataView(vbuf.buffer, vbuf.byteOffset);
        var ib = (iv.byteOffset || 0) + (s.indices.byteOffset || 0);
        var vb = (vv.byteOffset || 0) + (s.values.byteOffset || 0);
        for (var i = 0; i < s.count; i++) {
            var target = idv[idxSpec.get](ib + i * idxSpec.bytes, true);
            for (var c = 0; c < comps; c++) {
                out[target * comps + c] = vdv[valSpec.get](vb + (i * comps + c) * valSpec.bytes, true);
            }
        }
    };

    /**
     * Load the original prop models and scatter them through the city: street
     * lamps and barriers along the roads, kiosks at some side-street mouths, and
     * flying-car traffic above the streets. Skipped (with a clean fallback to
     * the procedural scene) when no model base URL is configured or a load
     * fails.
     */
    Cyberspace.prototype.buildProps = function() {
        if (!this.config.modelsbaseurl) {
            return;
        }
        var self = this;
        var load = function(name, onReady) {
            self.loadProp(name).then(function(tpl) {
                onReady(tpl);
                return null;
            }).catch(function(e) {
                if (window.console) {
                    window.console.warn('format_mnemo: prop ' + name + ' unavailable', e);
                }
            });
        };

        load('lamp', function(tpl) {
            self.scatterStreetProps(tpl, 'lamp');
        });
        load('barrier', function(tpl) {
            self.scatterStreetProps(tpl, 'barrier');
        });
        load('kiosk', function(tpl) {
            self.scatterKiosks(tpl);
        });
        load('av', function(tpl) {
            self.spawnTraffic(tpl);
        });
    };

    /**
     * Load a named prop model from the configured pack, falling back to the
     * plugin's bundled models when the pack does not provide it. This lets a
     * partial asset pack (only some props) keep the bundled models for the rest.
     *
     * @param {String} name The prop base name (lamp, barrier, kiosk, av).
     * @return {Promise} Resolves with a Three.Group template.
     */
    Cyberspace.prototype.loadProp = function(name) {
        var self = this;
        var base = this.config.modelsbaseurl;
        var fallback = this.config.modelsfallbackurl;
        var p = this.loadModel(this.joinBase(base, name + '.glb'));
        if (fallback && fallback !== base) {
            p = p.catch(function() {
                return self.loadModel(self.joinBase(fallback, name + '.glb'));
            });
        }
        return p;
    };

    /**
     * Place a repeated static prop (lamp or barrier) along the avenue kerbs.
     *
     * @param {Object} tpl The model template group.
     * @param {String} kind "lamp" or "barrier".
     */
    Cyberspace.prototype.scatterStreetProps = function(tpl, kind) {
        var road = this.roads[0];
        if (!road) {
            return;
        }
        var step = kind === 'lamp' ? 24 : 16;
        var edge = road.xMax + (kind === 'lamp' ? 0.6 : 0.2);
        for (var z = road.zMax - 6; z > road.zMin + 6; z -= step) {
            for (var s = -1; s <= 1; s += 2) {
                // Skip a prop that would drop on a building footprint.
                if (!this.footprintClear(s * edge, z, 0.8)) {
                    continue;
                }
                var m = tpl.clone();
                m.position.set(s * edge, 0, z);
                if (s < 0 && kind === 'lamp') {
                    m.rotation.y = Math.PI; // Arm faces the road on both sides.
                }
                this.setShadow(m, true);
                this.scene.add(m);
            }
        }
    };

    /**
     * Drop a kiosk near the mouth of each side street.
     *
     * @param {Object} tpl The kiosk template group.
     */
    Cyberspace.prototype.scatterKiosks = function(tpl) {
        for (var i = 1; i < this.roads.length; i++) {
            var r = this.roads[i];
            var innerX = r.xMin < 0 ? r.xMax : r.xMin;
            var dir = r.xMin < 0 ? -1 : 1;
            var kx = innerX + dir * 2;
            // Nudge the kiosk further from the mouth until it clears the nearby
            // buildings' footprints, so it no longer drops on top of one.
            var kz = r.zMin - 2;
            var placed = false;
            for (var t = 0; t < 4; t++) {
                if (this.footprintClear(kx, kz - t * 1.5, 1.6)) {
                    kz = kz - t * 1.5;
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                continue; // No clear spot near this mouth; skip the kiosk.
            }
            var m = tpl.clone();
            m.position.set(kx, 0, kz);
            m.rotation.y = r.xMin < 0 ? -Math.PI / 2 : Math.PI / 2;
            this.setShadow(m, true);
            this.scene.add(m);
        }
    };

    /**
     * Spawn flying-car traffic gliding above the avenue and highways; animated
     * each frame in updateTraffic().
     *
     * @param {Object} tpl The AV template group.
     */
    Cyberspace.prototype.spawnTraffic = function(tpl) {
        var road = this.roads[0];
        if (!road) {
            return;
        }
        var lanes = this.config.environment === 'void' ? 6 : 10;
        for (var i = 0; i < lanes; i++) {
            var car = tpl.clone();
            var dir = i % 2 === 0 ? 1 : -1;
            car.scale.setScalar(0.9 + Math.random() * 0.5);
            car.rotation.y = dir > 0 ? 0 : Math.PI;
            var laneX = (Math.random() - 0.5) * 40;
            var y = 13 + Math.random() * 20;
            var z = road.zMin + Math.random() * (road.zMax - road.zMin);
            car.position.set(laneX, y, z);
            this.scene.add(car);
            this.traffic.push({
                mesh: car, dir: dir, speed: 10 + Math.random() * 16,
                zMin: road.zMin - 20, zMax: road.zMax + 20,
                bob: Math.random() * 6.28
            });
        }
    };

    /**
     * Advance flying traffic, wrapping cars around the avenue ends.
     *
     * @param {Number} dt Delta time in seconds.
     */
    Cyberspace.prototype.updateTraffic = function(dt) {
        for (var i = 0; i < this.traffic.length; i++) {
            var t = this.traffic[i];
            t.mesh.position.z += t.dir * t.speed * dt;
            t.mesh.position.y += Math.sin(this.time * 0.8 + t.bob) * 0.02;
            if (t.dir > 0 && t.mesh.position.z > t.zMax) {
                t.mesh.position.z = t.zMin;
            } else if (t.dir < 0 && t.mesh.position.z < t.zMin) {
                t.mesh.position.z = t.zMax;
            }
        }
    };

    /**
     * Enable shadow casting/receiving on every mesh under an object.
     *
     * @param {Object} obj The root object.
     * @param {Boolean} on Whether to cast/receive.
     */
    Cyberspace.prototype.setShadow = function(obj, on) {
        obj.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow = on;
                child.receiveShadow = on;
            }
        });
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

        // Road corridors for movement: the avenue, plus each side street (filled
        // in by buildSideStreet). On foot the player is kept within these; only
        // flying lifts the constraint.
        this.roads = [{xMin: -roadHalf, xMax: roadHalf, zMin: endZ, zMax: 12}];

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

        // Record this street as a walkable corridor (overlapping the avenue at
        // the mouth so the player can flow between them on foot).
        var xa = mouthX;
        var xb = mouthX + side * streetLen;
        this.roads.push({
            xMin: Math.min(xa, xb), xMax: Math.max(xa, xb),
            zMin: z - streetHalf, zMax: z + streetHalf
        });

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
            // A video activity is a large screen instead of a building.
            if (act.video) {
                var vscreen = self.makeVideoScreen(act);
                vscreen.group.position.set(bx, 3.2, bz);
                vscreen.group.lookAt(bx, 3.2, z);
                self.scene.add(vscreen.group);
                return;
            }
            var built = self.makeStructure(act, style);
            built.group.position.set(bx, 0, bz);
            // Face the street centreline so the signboard reads from the street.
            built.group.lookAt(bx, built.group.position.y, z);
            self.scene.add(built.group);
            // A textured ground patch (plaza) under the building, then record
            // its footprint so props avoid it.
            self.groundPatchAt(bx, bz);
            self.recordFootprint(bx, bz, built.w, built.d);
            // Swap in an attached building model for this activity, if any.
            self.applyBuildingModel(act, built);
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
        // A lit (dark, wet-looking) asphalt strip that receives the sun's
        // shadows, so buildings are grounded on the streets the learner walks.
        // A site-wide road texture, if uploaded, tiles across it at the admin's
        // chosen scale; otherwise the flat wet-asphalt colour is kept.
        var mat = new THREE.MeshStandardMaterial({
            color: this.roadTexture ? 0xffffff : 0x05070d,
            roughness: 0.5, metalness: 0.5
        });
        if (this.roadTexture) {
            mat.map = this.tiledClone(this.roadTexture, w / this.roadScale, d / this.roadScale);
        }
        var road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(cx, y + 0.02, cz);
        road.receiveShadow = true;
        this.scene.add(road);
    };

    /**
     * Clone a tiling texture and set its wrap/repeat, so several surfaces of
     * different sizes can share one uploaded image while each tiles it at the
     * right density (a texture's repeat is per-texture, not per-mesh).
     *
     * @param {Object} texture The source Three.Texture (already RepeatWrapping).
     * @param {Number} repeatX Horizontal tile count.
     * @param {Number} repeatY Vertical tile count.
     * @return {Object} The cloned texture.
     */
    Cyberspace.prototype.tiledClone = function(texture, repeatX, repeatY) {
        var clone = texture.clone();
        clone.wrapS = this.THREE.RepeatWrapping;
        clone.wrapT = this.THREE.RepeatWrapping;
        clone.repeat.set(Math.max(1, Math.round(repeatX)), Math.max(1, Math.round(repeatY)));
        clone.needsUpdate = true;
        return clone;
    };

    /**
     * Lay a textured ground patch of a fixed size, centred on (cx, cz), when a
     * site-wide ground texture is configured. Used to give each building a
     * grounded plaza that reads against the dark floor. No-op without a texture
     * or when the patch size is zero.
     *
     * @param {Number} cx Centre x.
     * @param {Number} cz Centre z.
     */
    Cyberspace.prototype.groundPatchAt = function(cx, cz) {
        if (!this.groundTexture || this.groundPatch <= 0) {
            return;
        }
        var THREE = this.THREE;
        var size = this.groundPatch;
        var mat = new THREE.MeshStandardMaterial({
            map: this.tiledClone(this.groundTexture, size / this.groundScale, size / this.groundScale),
            roughness: 0.8, metalness: 0.2
        });
        var patch = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
        patch.rotation.x = -Math.PI / 2;
        // Just above the road strips (y+0.02) so the plaza reads over them.
        patch.position.set(cx, 0.035, cz);
        patch.receiveShadow = true;
        this.scene.add(patch);
    };

    /**
     * Record a building's world-space XZ footprint so scattered props can avoid
     * dropping on top of it.
     *
     * @param {Number} cx Centre x.
     * @param {Number} cz Centre z.
     * @param {Number} w Footprint width (x).
     * @param {Number} d Footprint depth (z).
     */
    Cyberspace.prototype.recordFootprint = function(cx, cz, w, d) {
        this.footprints.push({
            xMin: cx - w / 2, xMax: cx + w / 2,
            zMin: cz - d / 2, zMax: cz + d / 2
        });
    };

    /**
     * Whether the point (x, z) is clear of every recorded building footprint,
     * expanded by a margin. Used to keep scattered props off buildings.
     *
     * @param {Number} x Point x.
     * @param {Number} z Point z.
     * @param {Number} margin Clearance to require around each footprint.
     * @return {Boolean} True when the point sits on no footprint.
     */
    Cyberspace.prototype.footprintClear = function(x, z, margin) {
        for (var i = 0; i < this.footprints.length; i++) {
            var f = this.footprints[i];
            if (x >= f.xMin - margin && x <= f.xMax + margin &&
                    z >= f.zMin - margin && z <= f.zMax + margin) {
                return false;
            }
        }
        return true;
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
            this.frameMaterial(colour, 0.5)
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
        // The procedural mass lives in its own sub-group so an attached building
        // model (buildingModelUrl) can hide it while the sign stays.
        var body = new THREE.Group();
        group.add(body);
        var w = style.footprint[0];
        var d = style.footprint[1];
        var h = style.height[0] + Math.random() * (style.height[1] - style.height[0]);

        // Mass: a lit concrete/steel volume whose windows glow at night, with a
        // crisp neon edge outline that reads strongest after dark.
        var mass = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            this.facadeMaterial(style, w, h)
        );
        mass.position.y = h / 2;
        mass.castShadow = true;
        mass.receiveShadow = true;
        body.add(mass);

        var edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)),
            new THREE.LineBasicMaterial({
                color: style.edge, transparent: true, opacity: 0.3 + this.day.neon * 0.55
            })
        );
        edges.position.y = h / 2;
        body.add(edges);

        // Entropism buildings wear a broken, weathered wireframe overlay.
        if (style.wireframe) {
            var rust = new THREE.Mesh(
                new THREE.BoxGeometry(w * 1.02, h * 1.01, d * 1.02),
                new THREE.MeshBasicMaterial({
                    color: style.glow, wireframe: true, transparent: true,
                    opacity: 0.08 + this.day.neon * 0.12
                })
            );
            rust.position.y = h / 2;
            body.add(rust);
        }

        // Style-specific silhouette and roofline.
        this.dressRoof(body, style, w, d, h);
        // Lived-in greebles from the style's trim sheet.
        this.addGreebles(body, style, w, d, h);

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

        return {group: group, panel: sign.panel, body: body, sign: sign.group, w: w, d: d, h: h};
    };

    /**
     * The URL of a building model to attach to an activity, or null to keep the
     * procedural building. A per-activity override (act.building) wins — either a
     * full URL/data URI or a filename resolved against the models base URL.
     * Otherwise a type-based model (building-<modname>.glb) is used, but only for
     * module types the server confirmed a model exists for (config.buildingmodels).
     *
     * @param {Object} act The activity node (modname, building).
     * @return {String|null} The model URL, or null.
     */
    Cyberspace.prototype.buildingModelUrl = function(act) {
        var base = this.config.modelsbaseurl;
        if (act.building) {
            if (/^https?:/.test(act.building) || act.building.charAt(0) === '/' ||
                act.building.indexOf('data:') === 0) {
                return act.building;
            }
            return base ? this.joinBase(base, act.building) : act.building;
        }
        var list = this.config.buildingmodels || [];
        if (base && act.modname && list.indexOf(act.modname) !== -1) {
            return this.joinBase(base, 'building-' + act.modname + '.glb');
        }
        return null;
    };

    /**
     * Join a base URL and a file name with exactly one separating slash.
     *
     * @param {String} base The base URL.
     * @param {String} name The file name.
     * @return {String} The joined URL.
     */
    Cyberspace.prototype.joinBase = function(base, name) {
        return (base.charAt(base.length - 1) === '/' ? base : base + '/') + name;
    };

    /**
     * Attach an activity's building model, if any: load it, fit it to the
     * procedural building's footprint, hide the procedural mass (keeping the
     * sign), and drop it into the structure. A missing/failed model leaves the
     * procedural building in place.
     *
     * @param {Object} act The activity node.
     * @param {Object} built The makeStructure() result (group, body, w, d, h).
     */
    Cyberspace.prototype.applyBuildingModel = function(act, built) {
        var url = this.buildingModelUrl(act);
        if (!url) {
            return null;
        }
        var self = this;
        return this.loadModel(url).then(function(tpl) {
            var model = tpl.clone();
            // A model that parses but has no renderable geometry gives an empty
            // Box3 (infinite bounds -> NaN placement); keep the procedural
            // building rather than hiding it and leaving only the sign.
            if (new self.THREE.Box3().setFromObject(model).isEmpty()) {
                return null;
            }
            // Fit within 90% of the footprint so a solid imported building keeps
            // a gap to its neighbours (procedural footprints are placed close
            // together) rather than appearing to merge with them.
            self.fitModel(model, built.w * 0.9, built.d * 0.9, built.h);
            self.setShadow(model, true);
            // Measure the fitted model (still parentless, so its box is local)
            // and move the retained activity sign clear of its front face, so
            // the sign does not embed in the imported building.
            var mbox = new self.THREE.Box3().setFromObject(model);
            if (built.sign && isFinite(mbox.max.z)) {
                built.sign.position.z = mbox.max.z + 0.2;
            }
            built.body.visible = false;
            built.group.add(model);
            // The scene uses a static shadow map (autoUpdate off, refreshed only
            // as the player moves), so force one refresh now that the geometry
            // changed or the swap leaves a stale shadow for a still viewer.
            if (self.renderer && self.renderer.shadowMap) {
                self.renderer.shadowMap.needsUpdate = true;
            }
            return null;
        }).catch(function(e) {
            if (window.console) {
                window.console.warn('format_mnemo: building model ' + url + ' unavailable', e);
            }
        });
    };

    /**
     * Scale a loaded model to fit within a w x d x h box, then sit its base on
     * the ground centred on the local x/z origin.
     *
     * @param {Object} model The Three.Object3D to fit.
     * @param {Number} w Target width (x).
     * @param {Number} d Target depth (z).
     * @param {Number} h Target height (y).
     */
    Cyberspace.prototype.fitModel = function(model, w, d, h) {
        var THREE = this.THREE;
        var box = new THREE.Box3().setFromObject(model);
        var size = new THREE.Vector3();
        box.getSize(size);
        var s = Math.min(w / (size.x || 1), d / (size.z || 1), h / (size.y || 1));
        if (!isFinite(s) || s <= 0) {
            s = 1;
        }
        model.scale.setScalar(s);
        box.setFromObject(model);
        model.position.x -= (box.min.x + box.max.x) / 2;
        model.position.z -= (box.min.z + box.max.z) / 2;
        model.position.y -= box.min.y;
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
                    new THREE.MeshStandardMaterial({
                        color: style.body, roughness: 0.9, metalness: 0.3
                    })
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

        // Neon frame glow (slightly larger, behind the panel). frameMaterial()
        // applies a site-wide sign frame texture when one is uploaded.
        var frameMat = this.frameMaterial(opts.colour, 0.9);
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
     * Build a large interactive video screen for a video activity. Every screen
     * starts as a poster (so no media — and no third-party request — loads until
     * the learner acts). Clicking a direct-file screen loads and plays the video
     * in-world (a user gesture, so with sound); clicking an embed (or a file that
     * fails to decode) opens the activity. The frame colour reflects the
     * activity state, like a building's sign.
     *
     * @param {Object} act The activity node (name, url, state, video:{kind, src}).
     * @return {Object} {group, panel} — the screen group and its raycast target.
     */
    Cyberspace.prototype.makeVideoScreen = function(act) {
        var THREE = this.THREE;
        var group = new THREE.Group();
        var w = 5.2;
        var h = 2.95; // Roughly 16:9.
        var colour = STATE_COLOURS[act.state] || this.palette.primary;

        // Neon frame (glow behind the screen); also the hover-highlight target.
        var frameMat = this.frameMaterial(colour, 0.9);
        var frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.4, h + 0.4), frameMat);

        var screenMat = new THREE.MeshBasicMaterial({map: this.makePosterTexture(act.name)});
        var screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat);
        screen.position.z = 0.05;
        frame.add(screen);

        // A support post to the ground so the screen reads as a street fixture.
        var post = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 24, 0.16),
            new THREE.MeshBasicMaterial({color: colour, transparent: true, opacity: 0.5})
        );
        post.position.set(0, -h / 2 - 12, -0.05);
        frame.add(post);
        group.add(frame);

        screen.userData = {
            name: act.name,
            material: frameMat,
            baseColour: colour,
            interactive: true
        };
        if (act.video.kind === 'file') {
            // Deferred: the video is created and fetched only on activation.
            screen.userData.videoSrc = act.video.src;
            screen.userData.viewUrl = act.url;
            screen.userData.screenMat = screenMat;
        } else {
            screen.userData.url = act.url;
        }
        this.interactive.push(screen);

        return {group: group, panel: screen};
    };

    /**
     * Start a deferred file video on its screen: create the element, swap the
     * poster for a live VideoTexture, play it (from a click, so with sound), and
     * record the module view so completion-on-view still fires. A file that
     * cannot be decoded falls back to the poster + open behaviour.
     *
     * @param {Object} screen The screen mesh whose userData carries videoSrc.
     */
    Cyberspace.prototype.startVideo = function(screen) {
        var THREE = this.THREE;
        var self = this;
        var ud = screen.userData;
        var video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.src = ud.videoSrc;
        var vtex = new THREE.VideoTexture(video);
        vtex.colorSpace = THREE.SRGBColorSpace;
        ud.screenMat.map = vtex;
        ud.screenMat.needsUpdate = true;
        video.addEventListener('error', function() {
            ud.screenMat.map = self.makePosterTexture(ud.name);
            ud.screenMat.needsUpdate = true;
            delete ud.videoToggle;
            ud.url = ud.viewUrl;
        });
        var playing = video.play();
        if (playing && playing.catch) {
            playing.catch(function() {
                // Play was rejected; the viewer can click again to retry.
            });
        }
        ud.videoToggle = video;
        delete ud.videoSrc; // Subsequent clicks toggle play/pause.
        this.videos.push(video);
        this.recordView(ud.viewUrl);
    };

    /**
     * Record a module view (best-effort) so a video watched in-world still
     * satisfies view-based completion, without navigating away. redirect:'manual'
     * avoids following the module's redirect to (and downloading) the media.
     *
     * @param {String} url The activity view URL.
     */
    Cyberspace.prototype.recordView = function(url) {
        if (!url || !window.fetch) {
            return;
        }
        try {
            window.fetch(url, {credentials: 'same-origin', redirect: 'manual'}).catch(function() {
                // Best-effort view ping; nothing to do on failure.
            });
        } catch (e) {
            // Fetch unavailable or blocked; skip the view ping.
        }
    };

    /**
     * Build a poster texture for a video screen: a dark panel with a neon play
     * triangle and the activity name.
     *
     * @param {String} name The activity name.
     * @return {Object} Three.CanvasTexture.
     */
    Cyberspace.prototype.makePosterTexture = function(name) {
        var THREE = this.THREE;
        var canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 576;
        var ctx = canvas.getContext('2d');
        var hex = '#' + ('000000' + this.palette.primary.toString(16)).slice(-6);

        ctx.fillStyle = '#05070d';
        ctx.fillRect(0, 0, 1024, 576);

        // Play triangle.
        ctx.fillStyle = hex;
        ctx.shadowColor = hex;
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.moveTo(430, 210);
        ctx.lineTo(430, 366);
        ctx.lineTo(610, 288);
        ctx.closePath();
        ctx.fill();

        // Activity name.
        ctx.shadowBlur = 16;
        ctx.font = 'bold 46px ' + this.signFontStack();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = hex;
        var clipped = name.length > 28 ? name.slice(0, 27) + '…' : name;
        ctx.fillText(clipped, 512, 470);

        var texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        return texture;
    };

    /**
     * Act on an interactive node: start or toggle a video screen, or open an
     * activity URL.
     *
     * @param {Object} target The intersected mesh.
     */
    Cyberspace.prototype.activate = function(target) {
        if (!target || !target.userData) {
            return;
        }
        var ud = target.userData;
        if (ud.videoToggle) {
            this.toggleVideo(ud.videoToggle);
        } else if (ud.videoSrc) {
            this.startVideo(target);
        } else if (ud.url) {
            this.open(ud.url);
        }
    };

    /**
     * Toggle an already-started screen video between playing and paused.
     *
     * @param {Object} video The HTMLVideoElement.
     */
    Cyberspace.prototype.toggleVideo = function(video) {
        if (video.paused) {
            var playing = video.play();
            if (playing && playing.catch) {
                playing.catch(function() {
                    // Play was rejected; nothing to do.
                });
            }
        } else {
            video.pause();
        }
    };

    /**
     * Pause all screen videos (when the 3D stage is hidden — list view or a
     * hidden tab — so audio does not keep playing out of sight).
     */
    Cyberspace.prototype.pauseVideos = function() {
        for (var i = 0; i < this.videos.length; i++) {
            this.videos[i].pause();
        }
    };

    /**
     * Pause screen videos when the learner switches to the list view or hides
     * the tab, so a playing video does not keep sounding while out of sight.
     */
    Cyberspace.prototype.bindMediaPause = function() {
        var self = this;
        var container = this.root.closest ? this.root.closest('.format-mnemo') : null;
        if (container) {
            var toggle = container.querySelector('[data-mnemo-toggle]');
            if (toggle) {
                toggle.addEventListener('click', function() {
                    if (container.classList.contains('format-mnemo--listview')) {
                        self.pauseVideos();
                    }
                });
            }
        }
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                self.pauseVideos();
            }
        });
    };

    /**
     * The CSS font-family stack used when drawing neon sign text to a canvas.
     * A site-wide custom sign font (loaded by loadSceneAssets) takes precedence;
     * otherwise the bundled monospace stack is used.
     *
     * @return {String} A CSS font-family value.
     */
    Cyberspace.prototype.signFontStack = function() {
        return this.signFontFamily || '"Courier New", monospace';
    };

    /**
     * Build the neon frame material shared by every sign-like frame (building
     * signboards, video screens and corner pylon blades). A site-wide sign
     * frame texture, if uploaded, tints the frame; the neon colour multiplies
     * over it so state colours still read.
     *
     * @param {Number} colour Hex int neon colour.
     * @param {Number} opacity Frame opacity.
     * @return {Object} Three.MeshBasicMaterial.
     */
    Cyberspace.prototype.frameMaterial = function(colour, opacity) {
        var mat = new this.THREE.MeshBasicMaterial({
            color: colour, transparent: true, opacity: opacity
        });
        if (this.signTexture) {
            mat.map = this.signTexture;
        }
        return mat;
    };

    /**
     * Wrap text to fit a maximum pixel width, breaking on word boundaries with
     * the canvas context's current font. A word too wide to fit a line on its
     * own is hard-broken by characters, so no line ever overflows.
     *
     * @param {Object} ctx A 2D canvas context (its font is used to measure).
     * @param {String} text The text to wrap.
     * @param {Number} maxWidth The maximum line width in pixels.
     * @return {Array} The wrapped lines.
     */
    Cyberspace.prototype.wrapLines = function(ctx, text, maxWidth) {
        var tokens = String(text).split(/\s+/).filter(Boolean);
        var lines = [];
        var current = '';
        for (var i = 0; i < tokens.length; i++) {
            var word = tokens[i];
            // Hard-break any single word too wide to fit a line on its own.
            while (word.length > 1 && ctx.measureText(word).width > maxWidth) {
                if (current) {
                    lines.push(current);
                    current = '';
                }
                var fit = 1;
                while (fit < word.length &&
                        ctx.measureText(word.slice(0, fit + 1)).width <= maxWidth) {
                    fit++;
                }
                lines.push(word.slice(0, fit));
                word = word.slice(fit);
            }
            if (!current) {
                current = word;
            } else if (ctx.measureText(current + ' ' + word).width <= maxWidth) {
                current += ' ' + word;
            } else {
                lines.push(current);
                current = word;
            }
        }
        if (current) {
            lines.push(current);
        }
        return lines;
    };

    /**
     * Build a horizontal neon text texture for a signboard. The text is wrapped
     * on word boundaries and the font auto-shrinks so the whole name fits the
     * sign face; a name too long even at the smallest size is clipped to the
     * lines that fit, with an ellipsis on the last one.
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
        var family = this.signFontStack();
        var maxWidth = canvas.width * 0.92;
        var maxHeight = canvas.height * 0.9;

        // Pick the largest font (56 -> 20px) at which the wrapped block fits the
        // face, so short names stay big and bold while long ones wrap smaller.
        var lines = [];
        var fontSize = 56;
        var lineHeight = fontSize * 1.18;
        for (; fontSize >= 20; fontSize -= 2) {
            ctx.font = 'bold ' + fontSize + 'px ' + family;
            lines = this.wrapLines(ctx, text, maxWidth);
            lineHeight = fontSize * 1.18;
            if (lines.length * lineHeight <= maxHeight) {
                break;
            }
        }
        ctx.font = 'bold ' + fontSize + 'px ' + family;

        // Guard against an extreme name that still overflows at the minimum
        // size: keep only the lines that fit and ellipsise the last of them.
        var maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
        if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            var last = lines[maxLines - 1];
            lines[maxLines - 1] = (last.length > 1 ? last.slice(0, -1) : last) + '…';
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = hex;
        ctx.shadowBlur = 22;
        ctx.fillStyle = hex;
        var startY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
        for (var l = 0; l < lines.length; l++) {
            var y = startY + l * lineHeight;
            // Double-draw thickens the cheap neon glow.
            ctx.fillText(lines[l], 256, y);
            ctx.fillText(lines[l], 256, y);
        }

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
        ctx.font = 'bold 62px ' + this.signFontStack();
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

        ctx.font = 'bold 54px ' + this.signFontStack();
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
        if (target && target.userData && (target.userData.url || target.userData.videoToggle)) {
            // A firm confirmation buzz before acting on the node.
            if (this.gestures) {
                this.gestures.pulse(controller.userData.handedness, 0.6, 40);
            }
            this.activate(target);
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
        if (hits.length) {
            this.activate(hits[0].object);
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

        // Glide the flying-car traffic.
        this.updateTraffic(dt);

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
        this.constrainToRoad();
        this.followShadow();

        // Headset rendering must go straight to the XR framebuffer (the post
        // pipeline's render targets cannot present to it); tone mapping and
        // shadows still apply there. The on-screen view gets the bloom pass.
        if (presenting || !this.postfx) {
            this.renderer.render(this.scene, this.camera);
        } else {
            this.renderPostFX();
        }
    };

    /**
     * Build the on-screen post-processing pipeline: a threshold + separable
     * blur bloom composited back over the scene. Hand-rolled on core Three.js
     * (render targets + fullscreen shader passes) so it needs no addon modules,
     * keeping the same-origin, single-bundle loading the plugin relies on.
     */
    Cyberspace.prototype.buildPostFX = function() {
        var THREE = this.THREE;
        var w = Math.max(1, this.root.clientWidth);
        var h = Math.max(1, this.root.clientHeight || 480);
        // Multisample the scene target so geometry/neon edges stay smooth; the
        // plain default framebuffer's antialias no longer applies once we render
        // through an offscreen target.
        var full = {depthBuffer: true, samples: 4};
        var half = {depthBuffer: false};

        // All post targets stay linear: tone mapping is applied writing the
        // scene here, bloom is summed in linear light, and the final composite
        // encodes to sRGB for display (see compositeMat).
        var scene = new THREE.WebGLRenderTarget(w, h, full);
        var bright = new THREE.WebGLRenderTarget(w / 2, h / 2, half);
        var blurA = new THREE.WebGLRenderTarget(w / 2, h / 2, half);
        var blurB = new THREE.WebGLRenderTarget(w / 2, h / 2, half);

        var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        var quadScene = new THREE.Scene();
        var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
        quadScene.add(quad);

        var vert = [
            'varying vec2 vUv;',
            'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
        ].join('\n');

        var thresholdMat = new THREE.ShaderMaterial({
            uniforms: {tDiffuse: {value: null}, threshold: {value: 0.62}, knee: {value: 0.2}},
            toneMapped: false,
            vertexShader: vert,
            fragmentShader: [
                'varying vec2 vUv;',
                'uniform sampler2D tDiffuse;',
                'uniform float threshold; uniform float knee;',
                'void main(){',
                '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
                '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
                '  float f = smoothstep(threshold, threshold + knee, l);',
                '  gl_FragColor = vec4(c * f, 1.0);',
                '}'
            ].join('\n')
        });

        var blurMat = new THREE.ShaderMaterial({
            uniforms: {tDiffuse: {value: null}, dir: {value: new THREE.Vector2()},
                texel: {value: new THREE.Vector2(1 / (w / 2), 1 / (h / 2))}},
            toneMapped: false,
            vertexShader: vert,
            fragmentShader: [
                'varying vec2 vUv;',
                'uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 texel;',
                'void main(){',
                '  vec2 o1 = dir * texel * 1.3846153846;',
                '  vec2 o2 = dir * texel * 3.2307692308;',
                '  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;',
                '  s += texture2D(tDiffuse, vUv + o1).rgb * 0.3162162162;',
                '  s += texture2D(tDiffuse, vUv - o1).rgb * 0.3162162162;',
                '  s += texture2D(tDiffuse, vUv + o2).rgb * 0.0702702703;',
                '  s += texture2D(tDiffuse, vUv - o2).rgb * 0.0702702703;',
                '  gl_FragColor = vec4(s, 1.0);',
                '}'
            ].join('\n')
        });

        // Bloom is subtle by day (so the bright sky does not wash out) and
        // strong after dark, when neon and lit windows should blaze.
        var bloomStrength = 0.12 + 0.9 * this.day.night;
        var compositeMat = new THREE.ShaderMaterial({
            uniforms: {tScene: {value: null}, tBloom: {value: null}, strength: {value: bloomStrength}},
            toneMapped: false,
            vertexShader: vert,
            fragmentShader: [
                'varying vec2 vUv;',
                'uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength;',
                '// Encode linear light to sRGB for the display (the intermediate',
                '// targets are linear, and this raw shader is not auto-encoded).',
                'vec3 lin2srgb(vec3 c){',
                '  vec3 lo = c * 12.92;',
                '  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;',
                '  return mix(hi, lo, step(c, vec3(0.0031308)));',
                '}',
                'void main(){',
                '  vec3 base = texture2D(tScene, vUv).rgb;',
                '  vec3 bloom = texture2D(tBloom, vUv).rgb;',
                '  gl_FragColor = vec4(lin2srgb(base + bloom * strength), 1.0);',
                '}'
            ].join('\n')
        });

        this.postfx = {
            scene: scene, bright: bright, blurA: blurA, blurB: blurB,
            quadCam: quadCam, quadScene: quadScene, quad: quad,
            thresholdMat: thresholdMat, blurMat: blurMat, compositeMat: compositeMat
        };
    };

    /**
     * Render the scene through the bloom pipeline to the screen.
     */
    Cyberspace.prototype.renderPostFX = function() {
        var fx = this.postfx;
        var r = this.renderer;

        // 1. Scene to an offscreen target (tone-mapped, sRGB).
        r.setRenderTarget(fx.scene);
        r.render(this.scene, this.camera);

        // 2. Threshold the bright areas into a half-res target.
        this.drawQuad(fx.thresholdMat, {tDiffuse: fx.scene.texture}, fx.bright);

        // 3. Separable Gaussian blur (two ping-pong passes for a wide glow).
        fx.blurMat.uniforms.texel.value.set(
            1 / fx.bright.width, 1 / fx.bright.height
        );
        var src = fx.bright;
        var dirs = [[1, 0], [0, 1], [1, 0], [0, 1]];
        var dests = [fx.blurA, fx.blurB, fx.blurA, fx.blurB];
        for (var i = 0; i < dirs.length; i++) {
            fx.blurMat.uniforms.dir.value.set(dirs[i][0], dirs[i][1]);
            this.drawQuad(fx.blurMat, {tDiffuse: src.texture}, dests[i]);
            src = dests[i];
        }

        // 4. Composite bloom over the scene, to the screen.
        r.setRenderTarget(null);
        this.drawQuad(fx.compositeMat, {tScene: fx.scene.texture, tBloom: src.texture}, null);
    };

    /**
     * Draw a fullscreen quad with a material and uniform values into a target.
     *
     * @param {Object} material The ShaderMaterial to draw with.
     * @param {Object} uniforms Uniform name -> value to set before drawing.
     * @param {Object|null} target The render target, or null for the screen.
     */
    Cyberspace.prototype.drawQuad = function(material, uniforms, target) {
        var fx = this.postfx;
        var names = Object.keys(uniforms);
        for (var i = 0; i < names.length; i++) {
            material.uniforms[names[i]].value = uniforms[names[i]];
        }
        fx.quad.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(fx.quadScene, fx.quadCam);
    };

    /**
     * Recentre the sun's shadow frustum on the learner as they travel, so
     * shadows cover wherever they are (not just the avenue start). The static
     * shadow map is only re-rendered on the frames the frustum actually moves.
     */
    Cyberspace.prototype.followShadow = function() {
        if (!this.sun) {
            return;
        }
        var p = this.player.position;
        if (this.lastShadowPos.distanceToSquared(p) < 64) {
            return; // Moved less than ~8 units; keep the current shadow map.
        }
        this.lastShadowPos.copy(p);
        this.sun.target.position.set(p.x, 0, p.z);
        this.sun.position.set(p.x, 0, p.z).addScaledVector(this.sunDir, 220);
        this.renderer.shadowMap.needsUpdate = true;
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
     * Keep ground-level movement on the roads: while not flying, clamp the rig
     * into the nearest road corridor (avenue or a side street). Lifting off the
     * ground (flying) releases the constraint so the whole city is reachable.
     */
    Cyberspace.prototype.constrainToRoad = function() {
        if (!this.roads || !this.roads.length) {
            return;
        }
        // Flying = risen clear of the street; then movement is unconstrained.
        if (this.player.position.y > this.flyThreshold) {
            return;
        }
        var px = this.player.position.x;
        var pz = this.player.position.z;
        var bestX = px;
        var bestZ = pz;
        var bestDist = Infinity;
        for (var i = 0; i < this.roads.length; i++) {
            var r = this.roads[i];
            var cx = Math.max(r.xMin, Math.min(r.xMax, px));
            var cz = Math.max(r.zMin, Math.min(r.zMax, pz));
            var dist = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
            if (dist < bestDist) {
                bestDist = dist;
                bestX = cx;
                bestZ = cz;
            }
        }
        // Only capture movement that is already at/near a road. On-foot steps
        // are tiny, so this holds walkers on the road; but someone who flew far
        // away and descends off-road is left free rather than being teleported
        // across the scene (they are recaptured once they walk near a road).
        if (bestDist > this.captureMargin * this.captureMargin) {
            return;
        }
        this.player.position.x = bestX;
        this.player.position.z = bestZ;
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
        if (this.postfx) {
            var fx = this.postfx;
            fx.scene.setSize(w, h);
            fx.bright.setSize(w / 2, h / 2);
            fx.blurA.setSize(w / 2, h / 2);
            fx.blurB.setSize(w / 2, h / 2);
        }
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
        this.grabCount = 0; // How many grips were active last frame.
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
            // Either stick glides forward/back; the right stick's X is reserved
            // for snap-turning, while the left (or an unhanded) stick's X
            // strafes. This keeps the "either hand glides" mapping true, and a
            // right-only controller can still both glide and turn.
            out.glideZ += stick.y;
            if (src.handedness === 'right') {
                out.turnX = stick.x;
            } else {
                out.glideX += stick.x;
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
            this.grabCount = 0;
            return;
        }
        this.vSum.multiplyScalar(1 / grabCount);
        // Starting a grab, or changing how many hands are gripping, re-anchors:
        // the averaged point jumps when a grip is added or released, so a delta
        // against the old anchor would fling the rig even if no hand moved.
        if (!this.grabbing || grabCount !== this.grabCount) {
            this.grabbing = true;
            this.grabCount = grabCount;
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
        // When the hand disconnects or the session is hidden, the XR manager
        // hides the hand group but can leave each joint's last `visible` flag
        // set. Rejecting a hidden hand stops a stale open-palm pose from
        // latching the brake on after a switch back to controllers.
        if (!hand || hand.visible === false) {
            return null;
        }
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
     * Put the viewer at the avenue mouth facing down the street. In a
     * room-scale session the headset sits at an offset and heading within the
     * rig, so we compensate for the current camera pose rather than just
     * zeroing the rig - otherwise the view lands at home plus the physical
     * offset, still facing the physical heading.
     */
    GestureManager.prototype.recenter = function() {
        var player = this.player;
        player.position.set(0, 0, 0);
        player.rotation.set(0, 0, 0);
        player.updateMatrixWorld(true);

        // Turn the rig so the camera's world heading faces down the avenue (-Z).
        this.camera.getWorldDirection(this.vForward);
        this.vForward.y = 0;
        if (this.vForward.lengthSq() > 1e-4) {
            this.vForward.normalize();
            var yaw = Math.atan2(this.vForward.x, -this.vForward.z);
            player.rotateOnWorldAxis(this.up, -yaw);
            player.updateMatrixWorld(true);
        }

        // Slide the rig so the camera sits over the avenue mouth on the ground.
        this.camera.getWorldPosition(this.vRight);
        player.position.x += this.home.x - this.vRight.x;
        player.position.z += this.home.z - this.vRight.z;
        player.position.y = 0;

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

            // Import map so the addon glTF loaders resolve the bare 'three'
            // specifier to the same module the client uses, and 'three/addons/'
            // to the bundled example modules. Must precede the loader script.
            // Only skipped when a page already maps 'three' itself (so we do not
            // fight an existing three provider); an unrelated import map does not
            // stop us — modern browsers apply multiple maps, and if not, the
            // client falls back to its built-in glTF parser.
            var mapsThree = false;
            var existingmaps = document.querySelectorAll('script[type="importmap"]');
            for (var mi = 0; mi < existingmaps.length; mi++) {
                try {
                    var parsed = JSON.parse(existingmaps[mi].textContent || '{}');
                    if (parsed.imports && parsed.imports.three) {
                        mapsThree = true;
                    }
                } catch (e) {
                    // Ignore an unparseable import map.
                }
            }
            if (config.addonsbaseurl && !mapsThree) {
                try {
                    var importmap = document.createElement('script');
                    importmap.type = 'importmap';
                    importmap.textContent = JSON.stringify({
                        imports: {
                            'three': config.threeurl,
                            'three/addons/': config.addonsbaseurl
                        }
                    });
                    document.head.appendChild(importmap);
                } catch (e) {
                    // Import map unsupported/blocked; the built-in parser is used.
                }
            }

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

    /**
     * Load one image URL into a Three texture, downscaled to a bounded canvas
     * before it reaches WebGL so an oversized upload cannot exceed the GPU's max
     * texture size or exhaust memory on mobile/headset browsers. crossOrigin
     * lets a CORS-enabled remote image be drawn without tainting the canvas.
     * Best-effort: resolves either way and calls assign(texture) on success.
     *
     * @param {String} url The image URL.
     * @param {Object} THREE The Three.js module namespace.
     * @param {Boolean} repeat Whether the texture will tile (RepeatWrapping).
     * @param {Function} assign Called with the loaded texture on success.
     * @return {Promise} Resolves when the image loads, fails or errors.
     */
    function loadBoundedTexture(url, THREE, repeat, assign) {
        return new Promise(function(resolve) {
            var image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = function() {
                try {
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
                    if (repeat) {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                    }
                    assign(texture);
                } catch (e) {
                    // A tainted (non-CORS) or unusable image; keep the fallback.
                }
                resolve();
            };
            image.onerror = function() {
                // Texture failed to load; keep the fallback look.
                resolve();
            };
            image.src = url;
        });
    }

    /**
     * Load the optional site-wide scene assets before the scene is built, so it
     * renders with them from the first frame: a neon webfont and sign frame
     * texture, and tiled road and ground textures. All are best-effort — a
     * failed or absent asset leaves the client on its bundled neon look — and
     * the returned promise never rejects.
     *
     * @param {Object} config The scene configuration (signfonturl,
     *     signtextureurl, roadtextureurl, groundtextureurl).
     * @param {Object} THREE The Three.js module namespace.
     * @return {Promise} Resolves with {signFontFamily, signTexture,
     *     roadTexture, groundTexture} (each nullable).
     */
    function loadSceneAssets(config, THREE) {
        var assets = {
            signFontFamily: null, signTexture: null,
            roadTexture: null, groundTexture: null
        };
        var jobs = [];

        // Custom sign font, loaded via the CSS Font Loading API so canvas text
        // can use it. The URL is serialised as a quoted CSS string so a valid
        // URL containing CSS-significant characters (parentheses, spaces) is
        // still parsed correctly. The family name is private to the plugin.
        if (config.signfonturl && typeof window.FontFace === 'function' && document.fonts) {
            try {
                var src = 'url(' + JSON.stringify(config.signfonturl) + ')';
                var face = new window.FontFace('MnemoSign', src);
                jobs.push(face.load().then(function(loadedface) {
                    document.fonts.add(loadedface);
                    assets.signFontFamily = '"MnemoSign", "Courier New", monospace';
                    return loadedface;
                }).catch(function() {
                    // Font failed to load; keep the monospace fallback.
                }));
            } catch (e) {
                // FontFace rejected the URL; keep the monospace fallback.
            }
        }

        // Sign frame texture (not tiled), and the tiled road and ground
        // textures, each downscaled to a bounded canvas before WebGL.
        if (config.signtextureurl) {
            jobs.push(loadBoundedTexture(config.signtextureurl, THREE, false, function(tex) {
                assets.signTexture = tex;
            }));
        }
        if (config.roadtextureurl) {
            jobs.push(loadBoundedTexture(config.roadtextureurl, THREE, true, function(tex) {
                assets.roadTexture = tex;
            }));
        }
        if (config.groundtextureurl) {
            jobs.push(loadBoundedTexture(config.groundtextureurl, THREE, true, function(tex) {
                assets.groundTexture = tex;
            }));
        }

        // Never block scene construction on a hung asset request: an external
        // font/texture URL that accepts the connection but never completes has
        // no load timeout of its own, so race the jobs against one. Whatever is
        // ready wins; the rest falls back to the bundled look.
        return Promise.race([
            Promise.all(jobs).then(function() {
                return assets;
            }),
            new Promise(function(resolve) {
                window.setTimeout(function() {
                    resolve(assets);
                }, 8000);
            })
        ]);
    }

    return {
        // Exposed for the headless tests (tests/webxr): the gesture manager so
        // its input->action mapping can be driven with scripted input, and the
        // scene class so a render harness can screenshot it. Not used by the
        // plugin itself.
        _GestureManager: GestureManager,
        _Cyberspace: Cyberspace,

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

            // Load Three.js as a native ES module (see loadThree), then the
            // optional scene assets (font/textures), then build the scene. The
            // chain is kept flat (loaded is carried in a closure variable) so
            // there is no nested promise; loadSceneAssets never rejects, so a
            // missing asset does not block the build. Kept out of the AMD graph
            // on purpose.
            var loaded = null;
            loadThree(config).then(function(three) {
                loaded = three;
                var loading = root.querySelector('[data-mnemo-loading]');
                if (loading) {
                    loading.remove();
                }
                return loadSceneAssets(config, three.THREE);
            }).then(function(assets) {
                try {
                    new Cyberspace(loaded.THREE, root, config, loaded, assets);
                } catch (e) {
                    failGracefully(container, root, config.strings.failed);
                    if (window.console) {
                        window.console.error(e);
                    }
                }
                return assets;
            }).catch(function(e) {
                failGracefully(container, root, config.strings.failed);
                if (window.console) {
                    window.console.error(e);
                }
            });
        }
    };
});
