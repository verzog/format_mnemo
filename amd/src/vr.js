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

    // Height of the raised sidewalk kerb (world units). Shared so the alignment
    // grid can sit clearly above the sidewalk tops rather than being hidden
    // under them, and so surface-snapping rests objects on the right level.
    var SIDEWALK_HEIGHT = 0.18;

    // Per-planet size, distance from the scene centre and elevation for the
    // Void's planets, plus ring/band. Their azimuth is spread evenly around the
    // full sky by planet index at build time (see buildPlanets), so only two or
    // three fall within the view at once, and the whole field slowly revolves
    // (PLANET_SPIN). Up to nine are used, one per uploaded planet texture.
    var PLANET_SLOTS = [
        {r: 72, dist: 392, y: 110, ring: true, band: [0xc9975f, 0x7d5a37]},
        {r: 54, dist: 474, y: 150, ring: false, band: [0x5680bb, 0x223b63]},
        {r: 24, dist: 310, y: 66, ring: false, band: [0x9aa0a8, 0x4b5058]},
        {r: 40, dist: 396, y: 60, ring: false, band: [0xb06a4a, 0x5c2f22]},
        {r: 90, dist: 543, y: 190, ring: true, band: [0x6fae8c, 0x2f5a49]},
        {r: 30, dist: 468, y: 44, ring: false, band: [0x8f8fb8, 0x3d3d63]},
        {r: 48, dist: 485, y: 205, ring: false, band: [0xc0b070, 0x615636]},
        {r: 20, dist: 238, y: 92, ring: false, band: [0x9a9aa2, 0x4b4b52]},
        {r: 64, dist: 565, y: 120, ring: true, band: [0xb5734f, 0x5a3626]}
    ];

    // Angular speed of the Void's planet field: one full revolution per hour, so
    // the planets drift slowly in and out of view.
    var PLANET_SPIN = (2 * Math.PI) / 3600;

    // Each planet also turns on its own axis, roughly one revolution every two
    // minutes, so a textured world visibly rotates.
    var PLANET_SELF_SPIN = (2 * Math.PI) / 120;

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
        // World-space XZ footprints of placed buildings, so scattered props
        // (kiosks, lamps, barriers) can avoid dropping on top of a building.
        this.footprints = [];
        // Number of real point lights attached to street lamps so far, capped
        // so a very long avenue does not spawn an unbounded number of lights.
        this.lampLights = 0;
        // In-view object editor state (only wired up when config.canedit): the
        // editable objects (buildings and video screens), the current selection,
        // and whether edit mode is on.
        this.editables = [];
        this.selected = null;
        this.selBox = null; // BoxHelper around the current selection.
        this.selLabel = null; // Floating name label over the current selection.
        this.editMode = false;
        // The grid the generated layout snaps to and the editor/placer use.
        this.gridStep = config.gridsize > 0 ? config.gridsize : 2;
        // Street lighting: the resolved spacing (world units between street
        // lamps, 0 = no auto lamps) and whether to add a lamp at each side-street
        // corner. Resolved server-side from the site default and the per-course
        // override (see scene.php). Drives the uniform lamp layout.
        this.lampSpacing = config.lightingspacing > 0 ? config.lightingspacing : 0;
        this.lampCorners = !!config.lightingcorners;
        // World positions computed for the street lamps (avenue + side streets +
        // corners); filled in buildCity and instantiated when the lamp model loads.
        this.lampSlots = [];
        // Snap-to-grid for the editor: when on, absolute positions snap to the
        // grid, rotations to 15 degrees and scale to 0.25 steps, so objects
        // align consistently. Remembered per viewer (best-effort).
        this.snap = false;
        try {
            this.snap = window.localStorage.getItem('format_mnemo_snap') === '1';
        } catch (e) {
            this.snap = false;
        }
        // Snap-to-surface: when on, moving (or placing) an object rests it on
        // the road/sidewalk/ground surface beneath it, so a prop stands on a
        // raised sidewalk rather than sinking to road level. Remembered per
        // viewer; the resulting vertical offset is saved so every learner sees
        // the object at that level. `surfaces` are the raycast targets.
        this.snapSurface = false;
        try {
            this.snapSurface = window.localStorage.getItem('format_mnemo_snapsurface') === '1';
        } catch (e) {
            this.snapSurface = false;
        }
        this.surfaces = [];
        // In-view object placer: teacher-placed props, the loaded model
        // templates to clone when placing, and the current placement state.
        this.placedObjects = config.placedobjects || [];
        this.propTemplates = {};
        this.placeMode = false;
        this.placeType = 'lamp';
        this.groundGrid = null;
        // Stored per-course transforms for non-activity scene objects, keyed by
        // a course-stable slot key (section number, or a physical avenue slot).
        this.sceneObjects = config.sceneobjects || {};
        // Site-wide textures, tiling scales and the surface-mesh registries
        // (kept out of the constructor to keep its complexity in check).
        this.initSurfaces(config, assets);
        this.gltfLoader = null; // Lazily built addon GLTFLoader, when available.
        this.palette = PALETTES[config.palette] || PALETTES.cyan;
        STATE_COLOURS.available = this.palette.primary;
        // Hour of day (0-24) from the site clock; drives the day/night cycle.
        this.hour = (typeof config.hour === 'number') ? config.hour : 20;
        this.day = null; // Daylight parameters, computed in build().

        this.interactive = []; // Meshes that can be gazed/clicked to open.
        this.activityOverlay = null; // In-scene activity panel (built on demand).
        this.overlayReturnFocus = null; // Element to refocus when the panel closes.
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
        this.planets = []; // The Void's planet spheres, each self-rotating.
        // Activities keyed by course-module id, each with its group, sign,
        // completion tick and sign frame material, so their state can be
        // refreshed live (colour + tick) when the learner finishes one.
        this.activities = {};
        // Bumped on each live state refresh so a slower earlier response cannot
        // overwrite a newer one (overlays closed in quick succession).
        this.stateRefreshSeq = 0;
        // The native in-headset reader panel (built lazily); readerOpen gates
        // thumbstick scrolling and locomotion while it is up.
        this.reader = null;
        this.readerOpen = false;
        // Bumped on each reader fetch so a late response for a closed or
        // superseded reader is dropped.
        this.readerSeq = 0;
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
        this.planetField = null; // Void planet group; revolves slowly each frame.

        this.build();
    }

    /**
     * Initialise the site-wide textures, their tiling scales and per-course
     * size multipliers, and the surface-mesh registries. Any texture may be
     * null (the bundled neon look is used). Kept out of the constructor so its
     * cyclomatic complexity stays within lint limits.
     *
     * @param {Object} config The scene configuration from PHP.
     * @param {Object} assets Optional preloaded site-wide assets.
     */
    Cyberspace.prototype.initSurfaces = function(config, assets) {
        // A custom neon font, the sign-frame texture, and the tiled road,
        // ground and sidewalk textures. Any may be null.
        this.signFontFamily = assets.signFontFamily || null;
        this.signTexture = assets.signTexture || null;
        this.roadTexture = assets.roadTexture || null;
        this.groundTexture = assets.groundTexture || null;
        this.sidewalkTexture = assets.sidewalkTexture || null;
        // Void backdrop: an optional equirectangular sky/starfield that replaces
        // the procedural stars, and up to nine planet-surface maps applied to
        // the planets (each an equirectangular lat-long image). Only loaded for
        // the void environment. Empty/absent keeps the procedural look.
        this.spaceTexture = assets.spaceTexture || null;
        this.planetTextures = assets.planetTextures || [];
        // Which uploaded planets are ringed (by filename marker), and an optional
        // ring image (a radial strip) that skins the rings in place of the flat
        // procedural band.
        this.planetRings = config.planetrings || [];
        this.ringTexture = assets.ringTexture || null;
        // Tiling scales (world units per tile) and the size of the ground patch
        // laid around each building. Admin-configurable.
        this.roadScale = config.roadtexturescale > 0 ? config.roadtexturescale : 8;
        this.groundScale = config.groundtexturescale > 0 ? config.groundtexturescale : 8;
        this.sidewalkScale = config.sidewalktexturescale > 0 ? config.sidewalktexturescale : 4;
        this.groundPatch = config.groundpatchsize > 0 ? config.groundpatchsize : 0;
        // Per-course texture-size multipliers, stored in the scene-object store
        // under the singleton keys road:0 / ground:0 / sidewalk:0 (their scale
        // field). A larger multiplier makes each texture tile bigger.
        var mult = function(o) {
            return (o && o.scale > 0) ? o.scale : 1;
        };
        this.roadTexMult = mult(this.sceneObjects['road:0']);
        this.groundTexMult = mult(this.sceneObjects['ground:0']);
        this.sidewalkTexMult = mult(this.sceneObjects['sidewalk:0']);
        // Textured surfaces placed in the scene (with the dimensions needed to
        // re-tile them) and the shared "surface" editables they select.
        this.roadMeshes = [];
        this.groundMeshes = [];
        this.sidewalkMeshes = [];
        this.surfaceEditables = {};
        this.surfacePickMeshes = [];
    };

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
        if (this.config.canedit) {
            this.buildEditor();
        }
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

        // A cold key light from the distant star, plus a dim fill so the far
        // side of buildings and planets is not pure black.
        var starDir = new THREE.Vector3(0.5, 0.35, -0.6).normalize();
        var key = new THREE.DirectionalLight(0xdfe8ff, 1.15);
        key.position.copy(starDir).multiplyScalar(300);
        this.scene.add(key);
        this.scene.add(new THREE.HemisphereLight(0x223046, 0x05060c, 0.35));

        // An uploaded equirectangular sky replaces the procedural starfield,
        // nebulae and star sprite; otherwise the bundled procedural backdrop is
        // built. Planets are drawn either way.
        if (this.spaceTexture) {
            this.spaceTexture.mapping = THREE.EquirectangularReflectionMapping;
            this.scene.background = this.spaceTexture;
        } else {
            this.buildStarfield(starDir);
        }

        this.buildPlanets();
    };

    /**
     * Build the procedural Void backdrop used when no sky image is uploaded: a
     * near-black sky, a dense starfield on a far shell, palette-tinted nebulae
     * and a bright star halo.
     *
     * @param {Object} starDir The unit direction to the star.
     */
    Cyberspace.prototype.buildStarfield = function(starDir) {
        var THREE = this.THREE;
        this.scene.background = new THREE.Color(0x03040a);

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
    };

    /**
     * Place the Void's planets. With planet textures uploaded, one planet per
     * texture (up to nine) takes its surface from the matching map; otherwise
     * the original three procedurally-banded planets are drawn. All are lit by
     * the star and gently self-illuminated so they read as distant worlds.
     */
    Cyberspace.prototype.buildPlanets = function() {
        var texs = this.planetTextures || [];
        var count = texs.length > 0 ? Math.min(texs.length, PLANET_SLOTS.length) : 3;
        // A parent group holds every planet so the whole field can revolve
        // slowly about the vertical axis (see spinPlanets). Planets are added
        // to it rather than straight to the scene.
        this.planetField = new this.THREE.Group();
        this.scene.add(this.planetField);
        this.planets = [];
        var textured = texs.length > 0;
        for (var i = 0; i < count; i++) {
            var s = PLANET_SLOTS[i];
            // Spread the planets evenly around the full sky by index, so only
            // two or three sit within the view at once; planet 0 starts ahead
            // (-Z) and the rest fan out around it.
            var az = (i / count) * Math.PI * 2;
            var at = {
                x: s.dist * Math.sin(az),
                y: s.y,
                z: -s.dist * Math.cos(az)
            };
            // With uploaded planets, a ring is chosen per texture by its filename
            // (planetRings, from the server); the procedural default keeps the
            // slot's own ring flag.
            var ringed = textured ? !!this.planetRings[i] : s.ring;
            this.makePlanet(s.r, at, s.band, ringed, texs[i] || null);
        }
    };

    /**
     * Advance the slow revolution of the Void's planet field (a no-op in the
     * other environments, where there is no field). One turn per hour.
     *
     * @param {Number} dt Delta time in seconds.
     */
    Cyberspace.prototype.spinPlanets = function(dt) {
        if (!this.planetField) {
            return;
        }
        this.planetField.rotation.y += PLANET_SPIN * dt;
        // Each planet also turns on its own axis (the ring, a sibling, stays put).
        for (var i = 0; i < this.planets.length; i++) {
            this.planets[i].rotation.y += PLANET_SELF_SPIN * dt;
        }
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
     * @param {Array} colours [band A, band B] hex ints (procedural fallback).
     * @param {Boolean} ringed Whether to add a ring.
     * @param {Object} texture Optional equirectangular surface map; when given
     *     it is used instead of the procedural banded texture.
     */
    Cyberspace.prototype.makePlanet = function(radius, at, colours, ringed, texture) {
        var THREE = this.THREE;
        var tex = texture;
        if (!tex) {
            // No uploaded map: paint a procedural banded surface.
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
            tex = new THREE.CanvasTexture(ctx.canvas);
            if (tex.colorSpace !== undefined) {
                tex.colorSpace = THREE.SRGBColorSpace;
            }
        }
        var planet = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 32, 24),
            new THREE.MeshStandardMaterial({
                map: tex, roughness: 1, metalness: 0,
                emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28
            })
        );
        planet.position.set(at.x, at.y, at.z);
        // Add to the revolving planet field when there is one, so the planet
        // drifts with it; otherwise straight to the scene.
        var parent = this.planetField || this.scene;
        parent.add(planet);
        // Track the sphere so it can turn on its own axis (see spinPlanets).
        this.planets.push(planet);

        if (ringed) {
            var ring = new THREE.Mesh(
                this.ringGeometry(radius * 1.4, radius * 2.1),
                this.ringMaterial()
            );
            ring.rotation.x = Math.PI / 2.6;
            ring.position.copy(planet.position);
            parent.add(ring);
        }
    };

    /**
     * A ring geometry whose UVs map the radius (inner to outer edge) across the
     * texture's horizontal axis and the angle once around its vertical axis, so
     * a radial-strip ring image reads as concentric bands.
     *
     * @param {Number} inner Inner radius.
     * @param {Number} outer Outer radius.
     * @return {Object} A Three.RingGeometry with radial UVs.
     */
    Cyberspace.prototype.ringGeometry = function(inner, outer) {
        var THREE = this.THREE;
        var thetaseg = 64;
        var phiseg = 1;
        var geo = new THREE.RingGeometry(inner, outer, thetaseg, phiseg);
        var uv = geo.attributes.uv;
        var cols = thetaseg + 1;
        // Derive UVs from the vertex generation order (RingGeometry emits
        // phiseg+1 radial rows of thetaseg+1 angular columns) rather than from
        // atan2 of the position: that keeps the angular V strictly increasing
        // 0..1 with its one discontinuity on the geometry's own duplicated
        // start/end seam, so the texture does not compress into a wedge there.
        for (var v = 0; v < uv.count; v++) {
            var i = v % cols; // Angular column: 0 at the seam, thetaseg at the seam's twin.
            var j = Math.floor(v / cols); // Radial row: 0 inner, phiseg outer.
            uv.setXY(v, j / phiseg, i / thetaseg);
        }
        uv.needsUpdate = true;
        return geo;
    };

    /**
     * The material for a planet ring: the uploaded ring image (a radial strip)
     * when one is set, otherwise the flat procedural sandy band.
     *
     * @return {Object} A Three.MeshBasicMaterial.
     */
    Cyberspace.prototype.ringMaterial = function() {
        var THREE = this.THREE;
        var opts = {side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false};
        if (this.ringTexture) {
            opts.map = this.ringTexture;
            opts.opacity = 0.92;
        } else {
            opts.color = 0xcbb78a;
            opts.opacity = 0.5;
        }
        return new THREE.MeshBasicMaterial(opts);
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
                // Cache the template so the in-view placer can clone it, and
                // build any teacher-placed props of this type.
                self.propTemplates[name] = tpl;
                onReady(tpl);
                self.buildPlacedObjectsOfType(name, tpl);
                return null;
            }).catch(function(e) {
                if (window.console) {
                    window.console.warn('format_mnemo: prop ' + name + ' unavailable', e);
                }
            });
        };

        load('lamp', function(tpl) {
            self.placeLampSlots(tpl);
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
     * The default resting height for a placed prop of a given type: props sit
     * on the ground, but a placed vehicle hovers above its grid square like the
     * flying traffic.
     *
     * @param {String} type The prop model name (lamp, barrier, kiosk, av).
     * @return {Number} The world-y to place it at.
     */
    Cyberspace.prototype.placedBaseY = function(type) {
        return type === 'av' ? 6 : 0;
    };

    /**
     * A human label for a placed prop type, from the localised placer strings.
     *
     * @param {String} type The prop model name.
     * @return {String} The label.
     */
    Cyberspace.prototype.propLabel = function(type) {
        var s = this.config.strings || {};
        var labels = {
            lamp: s.placelamp || 'Street lamp',
            barrier: s.placebarrier || 'Barrier',
            kiosk: s.placekiosk || 'Kiosk',
            av: s.placevehicle || 'Vehicle'
        };
        return labels[type] || type;
    };

    /**
     * Build every teacher-placed prop of a given type from its template,
     * registering each as an editable keyed placed:&lt;id&gt; so its transform
     * and brightness persist and it can be selected, moved and deleted.
     *
     * @param {String} type The prop model name.
     * @param {Object} tpl The loaded template group.
     */
    Cyberspace.prototype.buildPlacedObjectsOfType = function(type, tpl) {
        var y = this.placedBaseY(type);
        for (var i = 0; i < this.placedObjects.length; i++) {
            var p = this.placedObjects[i];
            if (p.type !== type) {
                continue;
            }
            var m = tpl.clone();
            m.position.set(p.x, y, p.z);
            if (type === 'lamp') {
                this.addLampLight(m);
            }
            this.setShadow(m, true);
            this.scene.add(m);
            this.addPickProxy(m);
            this.registerSceneEditable('placed:' + p.id, this.propLabel(type),
                m, p.x, y, p.z, type === 'lamp' || type === 'av');
        }
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
    /**
     * Attach a real point light to a street lamp so it actually illuminates the
     * reflective road, ground and sidewalks around it (a warm pool with a
     * specular glint), rather than only glowing at the bulb. The light is a
     * child of the lamp group, so the editor's brightness slider dims it too.
     * No shadows (kept cheap), and capped so a long avenue stays performant.
     *
     * @param {Object} group The lamp's group.
     */
    Cyberspace.prototype.addLampLight = function(group) {
        if (this.lampLights >= 24) {
            return;
        }
        this.lampLights++;
        var THREE = this.THREE;
        // Tie the pool to the course's neon palette so it matches the signage;
        // physically-based falloff (decay 2) keeps it local to the lamp.
        var light = new THREE.PointLight(this.palette.primary, 14, 18, 2);
        light.position.set(0, 3.4, 0);
        light.castShadow = false;
        group.add(light);
    };

    Cyberspace.prototype.scatterStreetProps = function(tpl, kind) {
        var road = this.roads[0];
        if (!road) {
            return;
        }
        var step = kind === 'lamp' ? 24 : 16;
        var edge = road.xMax + (kind === 'lamp' ? 0.6 : 0.2);
        var label = kind === 'lamp' ? 'Street lamp' : 'Barrier';
        // A physical slot index, advanced for every candidate position along the
        // avenue (from a fixed start, by a fixed step) whether or not the prop is
        // actually placed. This keeps each prop's key tied to its physical spot
        // and stable across viewers, even though footprint skipping (which
        // depends on per-viewer activities) changes which slots are filled.
        var slot = 0;
        for (var z = road.zMax - 6; z > road.zMin + 6; z -= step) {
            for (var s = -1; s <= 1; s += 2) {
                var objkey = kind + ':' + slot;
                slot++;
                // A prop a teacher deleted stays gone.
                if (this.isHidden(objkey)) {
                    continue;
                }
                var stored = this.sceneObjects[objkey];
                var px = this.snapBase(s * edge, stored);
                var pz = this.snapBase(z, stored);
                // Skip a prop that would drop on a building footprint.
                if (!this.footprintClear(px, pz, 0.8)) {
                    continue;
                }
                var m = tpl.clone();
                m.position.set(px, 0, pz);
                if (s < 0 && kind === 'lamp') {
                    m.rotation.y = Math.PI; // Arm faces the road on both sides.
                }
                if (kind === 'lamp') {
                    this.addLampLight(m);
                }
                this.setShadow(m, true);
                this.scene.add(m);
                this.addPickProxy(m);
                this.registerSceneEditable(objkey, label, m, px, 0, pz, kind === 'lamp');
            }
        }
    };

    /**
     * Work out where the street lamps stand: evenly spaced down both kerbs of
     * the avenue and of every side street, plus a lamp at each side-street
     * corner (when corners are enabled). Positions are grid-snapped and stored
     * as slots; placeLampSlots() instantiates them once the lamp model loads.
     * A spacing of 0 (lighting off) clears the slots. Derived from this.roads,
     * so it must run after every street has been built.
     */
    Cyberspace.prototype.computeLampSlots = function() {
        this.lampSlots = [];
        var spacing = this.lampSpacing;
        if (!(spacing > 0) || !this.roads.length) {
            return;
        }
        var roadHalf = this.roadHalf || 5.5;
        var avenue = this.roads[0];

        // The lamps' actual point lights are capped for performance, so the
        // avenue and side streets are collected as separate streams and then
        // interleaved: this spreads the first (lit) lamps across the whole
        // layout instead of spending the whole budget on the avenue.
        var avenueStream = [];
        // Avenue: a lamp on each kerb, stepping down z. Left kerb (-x) turns to
        // face the road; the right kerb keeps the model's default facing.
        for (var z = avenue.zMax - 4; z >= avenue.zMin + 4; z -= spacing) {
            var az = this.snapCoord(z);
            avenueStream.push({x: -(roadHalf + 0.6), z: az, rotY: Math.PI});
            avenueStream.push({x: roadHalf + 0.6, z: az, rotY: 0});
        }
        var streams = [avenueStream];

        // Each side street: a lamp on each kerb stepping along x, plus the two
        // mouth corners when enabled. r.zMin/zMax bound the street width; the
        // mouth is the kerb-side end (nearest x=0), the far end is the other.
        // The near (lower-z) kerb faces +Z toward the street centre and the far
        // kerb faces -Z (the model's arm points -X, so +/-PI/2 aim it inward).
        for (var i = 1; i < this.roads.length; i++) {
            var r = this.roads[i];
            var zc = (r.zMin + r.zMax) / 2;
            var streetHalf = (r.zMax - r.zMin) / 2;
            var mouthX = Math.abs(r.xMin) < Math.abs(r.xMax) ? r.xMin : r.xMax;
            var endX = mouthX === r.xMin ? r.xMax : r.xMin;
            var side = endX >= mouthX ? 1 : -1;
            var zNear = this.snapCoord(zc - streetHalf - 0.6);
            var zFar = this.snapCoord(zc + streetHalf + 0.6);
            var stream = [];
            if (this.lampCorners) {
                // Offset from the mouth so the corner lamp does not land on the
                // topic pylon (which stands at mouthX + side*0.6).
                var cornerX = this.snapCoord(mouthX + side * 1.8);
                stream.push({x: cornerX, z: zNear, rotY: Math.PI / 2});
                stream.push({x: cornerX, z: zFar, rotY: -Math.PI / 2});
            }
            for (var x = mouthX + side * spacing;
                side > 0 ? x <= endX : x >= endX; x += side * spacing) {
                var sx = this.snapCoord(x);
                stream.push({x: sx, z: zNear, rotY: Math.PI / 2});
                stream.push({x: sx, z: zFar, rotY: -Math.PI / 2});
            }
            streams.push(stream);
        }

        // Round-robin merge the streams so lit lamps are distributed.
        var longest = 0;
        streams.forEach(function(s) {
            longest = Math.max(longest, s.length);
        });
        for (var k = 0; k < longest; k++) {
            for (var si = 0; si < streams.length; si++) {
                if (streams[si][k]) {
                    this.lampSlots.push(streams[si][k]);
                }
            }
        }
    };

    /**
     * Instantiate the street lamps from the slots computed by computeLampSlots:
     * clone the model at each slot (skipping any that would drop on a building),
     * attach its light, and register it as an editable keyed lamp:&lt;slot&gt;.
     * The slot index is stable across viewers for a given layout and lighting
     * setting; changing the lighting spacing renumbers the slots (documented).
     *
     * @param {Object} tpl The lamp model template group.
     */
    Cyberspace.prototype.placeLampSlots = function(tpl) {
        var label = (this.config.strings && this.config.strings.placelamp) || 'Street lamp';
        for (var i = 0; i < this.lampSlots.length; i++) {
            var slot = this.lampSlots[i];
            var objkey = 'lamp:' + i;
            // A lamp a teacher deleted stays gone.
            if (this.isHidden(objkey)) {
                continue;
            }
            var stored = this.sceneObjects[objkey];
            var px = this.snapBase(slot.x, stored);
            var pz = this.snapBase(slot.z, stored);
            // Skip a lamp that would stand on a building footprint. A stored row
            // only exempts it when it carries a positional move (a
            // brightness/scale/rotation-only edit still respects the footprint).
            var moved = stored && (stored.x || stored.y || stored.z);
            if (!moved && !this.footprintClear(px, pz, 0.8)) {
                continue;
            }
            // Rest the lamp on the surface beneath it so an avenue lamp on the
            // raised sidewalk stands on the slab rather than sinking into it.
            var py = this.surfaceHeightAt(px, pz);
            var m = tpl.clone();
            m.position.set(px, py, pz);
            m.rotation.y = slot.rotY;
            this.addLampLight(m);
            this.setShadow(m, true);
            this.scene.add(m);
            this.addPickProxy(m);
            this.registerSceneEditable(objkey, label, m, px, py, pz, true);
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
            // A kiosk a teacher deleted stays gone.
            if (this.isHidden('kiosk:' + r.section)) {
                continue;
            }
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
            var kioskstored = this.sceneObjects['kiosk:' + r.section];
            kx = this.snapBase(kx, kioskstored);
            kz = this.snapBase(kz, kioskstored);
            var m = tpl.clone();
            m.position.set(kx, 0, kz);
            m.rotation.y = r.xMin < 0 ? -Math.PI / 2 : Math.PI / 2;
            this.setShadow(m, true);
            this.scene.add(m);
            this.addPickProxy(m);
            // Key by the side street's section number (course-stable across
            // viewers), not a filtered ordinal.
            this.registerSceneEditable('kiosk:' + r.section, 'Kiosk', m, kx, 0, kz, false);
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
        this.roadHalf = roadHalf;
        var spacing = 26; // Distance between side-street mouths down the avenue.
        var startZ = -20;
        var endZ = startZ - Math.max(1, sections.length) * spacing - 10;

        // Every side street is built to one uniform length (sized to the topic
        // with the most activities) so the city reads as a regular grid rather
        // than a ragged mix of long and short branches.
        var slotStep = 7.5; // X-spacing between building slots (see buildSideStreet).
        var maxSlots = 1;
        sections.forEach(function(section) {
            maxSlots = Math.max(maxSlots, Math.ceil((section.activities || []).length / 2));
        });
        var uniformStreetLen = 5.5 + maxSlots * slotStep + 3;

        // Road corridors for movement: the avenue, plus each side street (filled
        // in by buildSideStreet). On foot the player is kept within these; only
        // flying lifts the constraint.
        // The walkable avenue corridor includes the raised sidewalks flanking
        // it, so a learner can step onto them rather than being clamped off.
        var swWidth = 2.4;
        this.roads = [{xMin: -(roadHalf + swWidth), xMax: roadHalf + swWidth, zMin: endZ, zMax: 12}];

        // Main avenue surface with glowing edge lines.
        this.paveStrip(0, (12 + endZ) / 2, roadHalf * 2, 12 - endZ, 0);
        [-roadHalf, roadHalf].forEach(function(x) {
            self.neonEdge(x, 0.05, 12, x, 0.05, endZ);
        });
        // Slightly raised sidewalks flanking the avenue, textured (or plain
        // concrete when no sidewalk texture is set), built in segments that
        // leave a gap at each side-street mouth on the matching side so a
        // sidewalk never runs a kerb across a branch entrance.
        var swX = roadHalf + swWidth / 2;
        var swGap = 4.9; // Half-width of the opening at each mouth (streetHalf + margin).
        [-1, 1].forEach(function(sdir) {
            var blocks = [];
            sections.forEach(function(section, i) {
                if (((i % 2 === 0) ? -1 : 1) === sdir) {
                    blocks.push(startZ - i * spacing);
                }
            });
            blocks.sort(function(a, b) {
                return a - b;
            });
            var cursor = endZ;
            for (var b = 0; b < blocks.length; b++) {
                var gapStart = blocks[b] - swGap;
                if (gapStart > cursor) {
                    self.buildSidewalk(sdir * swX, (cursor + gapStart) / 2, swWidth, gapStart - cursor);
                }
                cursor = Math.max(cursor, blocks[b] + swGap);
            }
            if (cursor < 12) {
                self.buildSidewalk(sdir * swX, (cursor + 12) / 2, swWidth, 12 - cursor);
            }
        });
        // A few reflected-light streaks down the wet avenue.
        for (var s = 0; s < 5; s++) {
            var sx = (Math.random() - 0.5) * roadHalf * 1.4;
            self.wetStreak(sx, (12 + endZ) / 2 + (Math.random() - 0.5) * 40, 0.5 + Math.random());
        }

        sections.forEach(function(section, i) {
            var z = startZ - i * spacing;
            var side = (i % 2 === 0) ? -1 : 1;
            self.buildSideStreet(section, z, side, roadHalf, uniformStreetLen);
        });

        // With the streets and their footprints known, work out where the street
        // lamps go (even spacing along the avenue and each side street, plus the
        // corners). The lamps themselves are instantiated when the model loads.
        this.computeLampSlots();
    };

    /**
     * Build one topic as a side street branching off the avenue.
     *
     * @param {Object} section The section node (name, current, image, activities).
     * @param {Number} z The avenue z at which this street branches.
     * @param {Number} side -1 for the left of the avenue, +1 for the right.
     * @param {Number} roadHalf Half-width of the main avenue.
     * @param {Number} streetLen Uniform side-street length (shared by every
     *     street so the layout is regular); falls back to a per-street fit.
     */
    Cyberspace.prototype.buildSideStreet = function(section, z, side, roadHalf, streetLen) {
        var self = this;
        var activities = section.activities || [];
        var streetHalf = 4.5; // Half-width of the side street (along z).
        var first = 5.5; // X-offset (past the mouth) of the first building.
        var step = 7.5; // X-spacing between building slots down the street.
        var slots = Math.ceil(activities.length / 2);
        if (!(streetLen > 0)) {
            streetLen = first + Math.max(1, slots) * step + 3;
        }
        var mouthX = side * roadHalf;
        var midX = mouthX + side * streetLen / 2;

        // Record this street as a walkable corridor (overlapping the avenue at
        // the mouth so the player can flow between them on foot).
        var xa = mouthX;
        var xb = mouthX + side * streetLen;
        this.roads.push({
            xMin: Math.min(xa, xb), xMax: Math.max(xa, xb),
            zMin: z - streetHalf, zMax: z + streetHalf,
            section: section.number
        });

        // Side-street road surface + neon kerb lines.
        this.paveStrip(midX, z, streetLen, streetHalf * 2, 0);
        [-streetHalf, streetHalf].forEach(function(zoff) {
            self.neonEdge(mouthX, 0.05, z + zoff, mouthX + side * streetLen, 0.05, z + zoff);
        });

        // Topic gate spanning the mouth, plus a tall vertical pylon at the corner.
        var wayColour = section.current ? 0xffffff : this.palette.primary;
        var gatekey = 'gate:' + section.number;
        var pylonkey = 'pylon:' + section.number;
        this.buildGate(section, this.snapBase(mouthX + side * 1.2, this.sceneObjects[gatekey]),
            this.snapBase(z, this.sceneObjects[gatekey]), side, streetHalf, wayColour, gatekey);
        this.buildPylon(section.name, this.snapBase(mouthX + side * 0.6, this.sceneObjects[pylonkey]),
            this.snapBase(z - streetHalf - 0.8, this.sceneObjects[pylonkey]), wayColour, pylonkey);

        // Activities line both sides of the street, receding down it.
        activities.forEach(function(act, k) {
            var zside = (k % 2 === 0) ? -1 : 1; // Near or far kerb.
            var along = Math.floor(k / 2);
            var style = STYLES[MOD_STYLE[act.modname] || 'entropism'];
            var depth = style.footprint[1];
            // Snap the default placement to the layout grid so buildings line
            // up from the start (the editor and placer share this grid). An
            // object a teacher already positioned keeps its original base, so a
            // stored offset is not re-applied from a shifted origin on upgrade.
            var bx = self.snapBase(mouthX + side * (first + along * step), act.transform);
            var bz = self.snapBase(z + zside * (streetHalf + depth / 2 + 0.4), act.transform);
            // A video activity is a large screen instead of a building.
            if (act.video) {
                var vscreen = self.makeVideoScreen(act);
                vscreen.group.position.set(bx, 3.2, bz);
                vscreen.group.lookAt(bx, 3.2, z);
                self.scene.add(vscreen.group);
                self.registerEditable(act, vscreen.group, bx, 3.2, bz, null, null, vscreen.panel);
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
            // Record the footprint at the building's final placement (a stored
            // transform may move/scale it), so the later-scattered props avoid
            // where it actually stands rather than its default slot.
            var tf = act.transform || {};
            var ts = tf.scale > 0 ? tf.scale : 1;
            // Include the per-axis width/depth multipliers so a widened or
            // deepened building's footprint keeps scattered props clear of it.
            var tsx = tf.sx > 0 ? tf.sx : 1;
            var tsz = tf.sz > 0 ? tf.sz : 1;
            self.recordFootprint(bx + (tf.x || 0), bz + (tf.z || 0),
                built.w * ts * tsx, built.d * ts * tsz);
            // Swap in an attached building model for this activity, if any.
            self.applyBuildingModel(act, built);
            // Pass the signboard (kept street-facing) and the scale node, which
            // takes the non-uniform width/height/depth so the sign never shears.
            self.registerEditable(act, built.group, bx, 0, bz, built.sign, built.scalenode, built.panel);
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
            var rdiv = this.roadScale * this.roadTexMult;
            this.showSurfaceTexture(mat, this.tiledClone(this.roadTexture, w / rdiv, d / rdiv));
        }
        var road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(cx, y + 0.02, cz);
        road.receiveShadow = true;
        this.scene.add(road);
        // A snap target so objects can rest on the road surface.
        this.surfaces.push(road);
        if (this.roadTexture) {
            this.registerSurfaceMesh('road', road, w, d);
        }
    };

    /**
     * Build a slightly raised sidewalk slab centred on (cx, cz): a concrete
     * kerb body with a walking surface on top. When a site-wide sidewalk
     * texture is set, the top tiles it (and is texture-size editable); otherwise
     * a plain concrete top is used. The kerb's height reads as a low step up
     * from the road.
     *
     * @param {Number} cx Centre x.
     * @param {Number} cz Centre z.
     * @param {Number} w Width along x.
     * @param {Number} d Depth along z.
     */
    Cyberspace.prototype.buildSidewalk = function(cx, cz, w, d) {
        var THREE = this.THREE;
        var height = SIDEWALK_HEIGHT;
        // The kerb body: a low concrete slab that gives the sidewalk a visible
        // raised edge above the road.
        var body = new THREE.Mesh(
            new THREE.BoxGeometry(w, height, d),
            new THREE.MeshStandardMaterial({color: 0x2a2f38, roughness: 0.9, metalness: 0.1})
        );
        body.position.set(cx, height / 2, cz);
        body.castShadow = true;
        body.receiveShadow = true;
        this.scene.add(body);
        // The walking surface on top, textured when a sidewalk texture is set.
        var topmat = new THREE.MeshStandardMaterial({
            color: this.sidewalkTexture ? 0xffffff : 0x3a414c,
            roughness: 0.85, metalness: 0.1
        });
        if (this.sidewalkTexture) {
            var div = this.sidewalkScale * this.sidewalkTexMult;
            this.showSurfaceTexture(topmat, this.tiledClone(this.sidewalkTexture, w / div, d / div));
        }
        var top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), topmat);
        top.rotation.x = -Math.PI / 2;
        top.position.set(cx, height + 0.01, cz);
        top.receiveShadow = true;
        this.scene.add(top);
        // The walking surface is a snap target so objects rest on the raised
        // sidewalk rather than sinking to road level.
        this.surfaces.push(top);
        // Only a textured sidewalk offers the texture-size control (matching
        // road/ground); a plain concrete top has nothing to retune.
        if (this.sidewalkTexture) {
            this.registerSurfaceMesh('sidewalk', top, w, d);
        }
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
     * Apply an uploaded surface texture to a material so it reads in every
     * environment and time of day. A road/ground/sidewalk texture that an admin
     * takes the trouble to upload should be visible whether the scene is the
     * neon city at night, the bright grid, or the dark void - so the albedo is
     * shown (low metalness, which otherwise trades the texture colour for a
     * reflection of the near-black surroundings) and a gentle self-lit floor
     * from the same map keeps it from sinking to black when the lighting is dim.
     * The untextured surfaces (which keep their wet-asphalt look) never call
     * this, so the default appearance is unchanged.
     *
     * @param {Object} mat The Three.MeshStandardMaterial for the surface.
     * @param {Object} map The tiled texture to show (from tiledClone).
     */
    Cyberspace.prototype.showSurfaceTexture = function(mat, map) {
        mat.map = map;
        mat.metalness = Math.min(mat.metalness, 0.15);
        mat.emissive = new this.THREE.Color(0xffffff);
        mat.emissiveMap = map;
        mat.emissiveIntensity = 0.3;
        mat.needsUpdate = true;
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
        var gdiv = this.groundScale * this.groundTexMult;
        var mat = new THREE.MeshStandardMaterial({roughness: 0.8, metalness: 0.2});
        this.showSurfaceTexture(mat, this.tiledClone(this.groundTexture, size / gdiv, size / gdiv));
        var patch = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
        patch.rotation.x = -Math.PI / 2;
        // Just above the road strips (y+0.02) so the plaza reads over them.
        patch.position.set(cx, 0.035, cz);
        patch.receiveShadow = true;
        this.scene.add(patch);
        this.surfaces.push(patch);
        this.registerSurfaceMesh('ground', patch, size, size);
    };

    /**
     * Track a textured surface mesh so it can be re-tiled when its texture size
     * is edited, and (for course editors) make it selectable as its shared
     * per-type surface editable. Road strips and ground patches of a given type
     * all resolve to one editable, so retuning the texture size retiles them
     * together and the course sees a single consistent surface.
     *
     * @param {String} type Either 'road' or 'ground'.
     * @param {Object} mesh The Three.Mesh laid for the surface.
     * @param {Number} w Plane width (x), for recomputing the tile repeat.
     * @param {Number} d Plane depth (z), for recomputing the tile repeat.
     */
    Cyberspace.prototype.registerSurfaceMesh = function(type, mesh, w, d) {
        this.surfaceMeshList(type).push({mesh: mesh, w: w, d: d});
        if (this.config.canedit) {
            mesh.userData.mnemoEditable = this.surfaceEditable(type);
            this.surfacePickMeshes.push(mesh);
        }
    };

    /**
     * The recorded mesh list for a surface type (road, ground or sidewalk).
     *
     * @param {String} type The surface type.
     * @return {Array} The list of {mesh, w, d} records.
     */
    Cyberspace.prototype.surfaceMeshList = function(type) {
        if (type === 'ground') {
            return this.groundMeshes;
        }
        if (type === 'sidewalk') {
            return this.sidewalkMeshes;
        }
        return this.roadMeshes;
    };

    /**
     * The source texture, base tiling scale and stored size-multiplier for a
     * surface type, as {tex, base, mult}.
     *
     * @param {String} type The surface type.
     * @return {Object} The surface's texture parameters.
     */
    Cyberspace.prototype.surfaceParams = function(type) {
        if (type === 'ground') {
            return {tex: this.groundTexture, base: this.groundScale, mult: this.groundTexMult};
        }
        if (type === 'sidewalk') {
            return {tex: this.sidewalkTexture, base: this.sidewalkScale, mult: this.sidewalkTexMult};
        }
        return {tex: this.roadTexture, base: this.roadScale, mult: this.roadTexMult};
    };

    /**
     * Get (creating once) the shared editable for a surface type. Unlike object
     * editables it has no single group; picking any of its meshes selects it and
     * the editor offers only a texture-size control, persisted per course under
     * the singleton key road:0 / ground:0 / sidewalk:0 (reusing the scale field).
     *
     * @param {String} type The surface type: road, ground or sidewalk.
     * @return {Object} The shared surface editable record.
     */
    Cyberspace.prototype.surfaceEditable = function(type) {
        if (this.surfaceEditables[type]) {
            return this.surfaceEditables[type];
        }
        var s = this.config.strings || {};
        var names = {
            road: s.editroadsurface || 'Road surface',
            ground: s.editgroundsurface || 'Ground surface',
            sidewalk: s.editsidewalksurface || 'Sidewalk surface'
        };
        var mult = this.surfaceParams(type).mult;
        var editable = {
            cmid: null,
            objkey: type + ':0',
            kind: 'surface',
            surfaceType: type,
            group: null,
            emits: false,
            name: names[type] || type,
            transform: {scale: mult > 0 ? mult : 1, x: 0, y: 0, z: 0, rot: 0, brightness: 1}
        };
        this.surfaceEditables[type] = editable;
        return editable;
    };

    /**
     * Re-tile every mesh of a surface type from its editable's current
     * multiplier, disposing the replaced texture clones so live dragging does
     * not leak GPU memory. A larger multiplier means bigger tiles.
     *
     * @param {Object} editable The shared surface editable.
     */
    Cyberspace.prototype.retileSurface = function(editable) {
        var type = editable.surfaceType;
        var params = this.surfaceParams(type);
        var tex = params.tex;
        if (!tex) {
            return;
        }
        var list = this.surfaceMeshList(type);
        var base = params.base;
        var mult = editable.transform.scale > 0 ? editable.transform.scale : 1;
        var div = base * mult;
        for (var i = 0; i < list.length; i++) {
            var rec = list[i];
            if (rec.mesh.material.map) {
                rec.mesh.material.map.dispose();
            }
            var clone = this.tiledClone(tex, rec.w / div, rec.d / div);
            rec.mesh.material.map = clone;
            // The self-lit floor shares the albedo map (see showSurfaceTexture),
            // so keep it on the same freshly tiled clone rather than the one
            // just disposed.
            if (rec.mesh.material.emissiveMap) {
                rec.mesh.material.emissiveMap = clone;
            }
            rec.mesh.material.needsUpdate = true;
        }
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
     * @param {String} objkey The editor slot key for this gate.
     */
    Cyberspace.prototype.buildGate = function(section, x, z, side, streetHalf, colour, objkey) {
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
        this.registerSceneEditable(objkey, section.name + ' gate', group, x, 0, z, true);
    };

    /**
     * A tall Japanese-style vertical neon pylon standing at the street corner.
     *
     * @param {String} name The topic name.
     * @param {Number} x Pylon x.
     * @param {Number} z Pylon z.
     * @param {Number} colour Neon colour.
     * @param {String} objkey The editor slot key for this pylon.
     */
    Cyberspace.prototype.buildPylon = function(name, x, z, colour, objkey) {
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
        this.registerSceneEditable(objkey, name + ' pylon', group, x, 0, z, true);
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
        // A scale node holds everything that stretches with the editor's
        // width/height/depth (the body and the click-proxy) but NOT the sign,
        // so an anisotropic scale never shears the sign - it keeps facing the
        // street. The procedural mass lives in its own sub-group so an attached
        // building model (buildingModelUrl) can hide it while the sign stays.
        var scalenode = new THREE.Group();
        group.add(scalenode);
        var body = new THREE.Group();
        scalenode.add(body);
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
            cmid: act.id,
            reader: act.reader,
            post: false
        });
        sign.group.position.set(0, Math.min(h - 1.1, 2.6), d / 2 + 0.12);
        group.add(sign.group);

        // Invisible full-footprint click-proxy so the in-view editor can select
        // this building immediately - before any attached model has loaded, and
        // whatever the model's geometry or scale (e.g. a very small model). It
        // is never rendered (visible=false, casts no shadow), but Three still
        // raycasts it, giving a reliable selection target.
        scalenode.add(this.editProxy(w, h, d));

        return {group: group, scalenode: scalenode, panel: sign.panel, body: body,
            sign: sign.group, w: w, d: d, h: h};
    };

    /**
     * Build the invisible box used as a reliable editor selection target for an
     * object, covering roughly its footprint and height. Not rendered, but
     * raycast by the editor's picker.
     *
     * @param {Number} w Box width (x).
     * @param {Number} h Box height (y); the box sits from the ground up.
     * @param {Number} d Box depth (z).
     * @return {Object} Three.Mesh (visible=false).
     */
    Cyberspace.prototype.editProxy = function(w, h, d) {
        var proxy = new this.THREE.Mesh(
            new this.THREE.BoxGeometry(w, h, d),
            new this.THREE.MeshBasicMaterial()
        );
        proxy.position.y = h / 2;
        proxy.visible = false;
        proxy.castShadow = false;
        proxy.receiveShadow = false;
        proxy.userData.mnemoProxy = true;
        return proxy;
    };

    /**
     * Add an invisible box around a loaded prop model so it is as easy to select
     * in the editor as a tall building - without one, a low or thin prop (a
     * barrier, a kerbside kiosk) is hard to hit and reads as uneditable, while a
     * tall lamp is easy. Sized to the model's bounds with a minimum clickable
     * volume, and parented to the group so it moves and scales with it. Not
     * rendered (visible=false) but still raycast, like a building's editProxy.
     *
     * @param {Object} group The prop group (a loaded model clone).
     */
    Cyberspace.prototype.addPickProxy = function(group) {
        var THREE = this.THREE;
        group.updateWorldMatrix(true, true);
        var box = new THREE.Box3().setFromObject(group);
        if (box.isEmpty()) {
            return;
        }
        var size = box.getSize(new THREE.Vector3());
        var center = box.getCenter(new THREE.Vector3());
        var proxy = new THREE.Mesh(
            new THREE.BoxGeometry(
                Math.max(size.x, 1.2), Math.max(size.y, 1.4), Math.max(size.z, 1.2)),
            new THREE.MeshBasicMaterial()
        );
        // Convert the world-space centre into the group's local frame so the box
        // sits over the model whatever the group's position/rotation.
        proxy.position.copy(group.worldToLocal(center));
        proxy.visible = false;
        proxy.castShadow = false;
        proxy.receiveShadow = false;
        proxy.userData.mnemoProxy = true;
        group.add(proxy);
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
        // Expose the frame material so the activity's state colour can be
        // refreshed live (see applyStates) from the sign group.
        group.userData.frameMat = frameMat;

        if (opts.url) {
            panel.userData = {
                url: opts.url,
                name: opts.text,
                cmid: opts.cmid || null,
                reader: !!opts.reader,
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

        // Invisible click-proxy centred on the screen (the group origin), a
        // little thicker than the panel so the editor can select the screen
        // reliably, from either side. Not rendered, but raycast by the picker.
        var proxy = new THREE.Mesh(
            new THREE.BoxGeometry(w + 0.4, h + 0.4, 0.4),
            new THREE.MeshBasicMaterial()
        );
        proxy.visible = false;
        proxy.castShadow = false;
        proxy.receiveShadow = false;
        proxy.userData.mnemoProxy = true;
        group.add(proxy);

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
        var self = this;
        try {
            window.fetch(url, {credentials: 'same-origin', redirect: 'manual'}).then(function() {
                // The view may have satisfied view-based completion (a video
                // played in-world never opens the overlay), so refresh the
                // scene's states to update the tick and sign colour.
                self.refreshActivityStates();
                return null;
            }).catch(function() {
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
        if (ud.readerAction) {
            this.readerControl(ud.readerAction);
        } else if (ud.videoToggle) {
            this.toggleVideo(ud.videoToggle);
        } else if (ud.videoSrc) {
            this.startVideo(target);
        } else if (ud.url) {
            this.openActivity(ud.url, ud.name, {cmid: ud.cmid, reader: ud.reader});
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
                        // The activity panel lives inside the stage, which the
                        // list view hides; close it so its iframe stops running
                        // (and does not reappear when 3D view is restored).
                        self.closeActivityOverlay();
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
        // A click on the reader's content plane maps to the link under the ray.
        if (hit && hit.object.userData && hit.object.userData.readerContent) {
            if (this.gestures) {
                this.gestures.pulse(controller.userData.handedness, 0.5, 30);
            }
            this.readerHitLink(hit.uv);
            return;
        }
        if (target && target.userData &&
                (target.userData.url || target.userData.videoToggle || target.userData.readerAction)) {
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
     * Build the in-view object editor: a toggle button and a controls panel for
     * scaling, moving and rotating the selected building or video screen. Only
     * called for users who can edit the course (config.canedit).
     */
    Cyberspace.prototype.buildEditor = function() {
        var self = this;
        var s = this.config.strings || {};

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'format-mnemo__edit-btn';
        btn.textContent = s.edit || 'Edit layout';
        this.root.appendChild(btn);
        this.editButton = btn;

        var field = function(key, label, min, max, step) {
            return '<label class="format-mnemo__editor-row">' +
                '<span>' + label + '</span>' +
                '<input type="range" data-mnemo-ed="' + key + '" min="' + min +
                '" max="' + max + '" step="' + step + '">' +
                '<output data-mnemo-out="' + key + '"></output>' +
                '</label>';
        };
        var panel = document.createElement('div');
        panel.className = 'format-mnemo__editor';
        panel.hidden = true;
        panel.innerHTML =
            '<div class="format-mnemo__editor-caption">' + (s.editediting || 'Editing') + '</div>' +
            '<div class="format-mnemo__editor-title" data-mnemo-ed-name></div>' +
            field('scale', s.editscale || 'Scale', 0.3, 4, 0.05) +
            field('sx', s.editwidth || 'Width', 0.3, 4, 0.05) +
            field('sy', s.editheight || 'Height', 0.3, 4, 0.05) +
            field('sz', s.editdepth || 'Depth', 0.3, 4, 0.05) +
            field('x', (s.editmove || 'Move') + ' X', -20, 20, 0.5) +
            field('y', (s.editmove || 'Move') + ' Y', -10, 30, 0.5) +
            field('z', (s.editmove || 'Move') + ' Z', -20, 20, 0.5) +
            field('rot', s.editrotate || 'Rotate', 0, 360, 1) +
            field('brightness', s.editbrightness || 'Brightness', 0, 3, 0.05) +
            field('texsize', s.edittexsize || 'Texture size', 0.25, 4, 0.05) +
            '<label class="format-mnemo__editor-snap" data-mnemo-ed-snaprow>' +
            '<input type="checkbox" data-mnemo-ed-snap>' +
            '<span>' + (s.editsnap || 'Snap to grid') + '</span>' +
            '</label>' +
            '<label class="format-mnemo__editor-snap" data-mnemo-ed-snapsurfacerow>' +
            '<input type="checkbox" data-mnemo-ed-snapsurface>' +
            '<span>' + (s.editsnapsurface || 'Snap to surface') + '</span>' +
            '</label>' +
            '<div class="format-mnemo__editor-actions">' +
            '<button type="button" data-mnemo-ed-act="save">' + (s.editsave || 'Save') + '</button>' +
            '<button type="button" data-mnemo-ed-act="reset">' + (s.editreset || 'Reset') + '</button>' +
            '<button type="button" data-mnemo-ed-act="close">' + (s.editclose || 'Close') + '</button>' +
            '</div>' +
            '<button type="button" class="format-mnemo__editor-delete" data-mnemo-ed-act="delete">' +
            (s.editdelete || 'Delete') + '</button>' +
            '<div class="format-mnemo__editor-status" data-mnemo-ed-status></div>';
        this.root.appendChild(panel);
        this.editorPanel = panel;

        // Live-apply slider changes to the selected object.
        var keys = ['scale', 'sx', 'sy', 'sz', 'x', 'y', 'z', 'rot', 'brightness', 'texsize'];
        keys.forEach(function(key) {
            var input = panel.querySelector('[data-mnemo-ed="' + key + '"]');
            input.addEventListener('input', function() {
                if (!self.selected) {
                    return;
                }
                // Texture size is a surface property; it reuses the transform's
                // scale field for storage but retiles the surface rather than
                // scaling a mesh.
                if (key === 'texsize') {
                    self.selected.transform.scale = parseFloat(input.value);
                    self.retileSurface(self.selected);
                    self.syncEditorOutputs();
                    return;
                }
                var value = self.snapValue(key, parseFloat(input.value), self.selected);
                input.value = value;
                self.selected.transform[key] = value;
                if (key === 'brightness') {
                    self.applyBrightness(self.selected);
                } else {
                    // With snap-to-surface on, moving in the plane re-rests the
                    // object on whatever surface it is now over (e.g. up onto a
                    // sidewalk), and the resulting Move-Y is reflected below.
                    if (self.snapSurface && (key === 'x' || key === 'z') &&
                            self.propType(self.selected)) {
                        self.dropToSurface(self.selected);
                        var yInput = panel.querySelector('[data-mnemo-ed="y"]');
                        yInput.value = self.selected.transform.y;
                    }
                    self.applyTransform(self.selected);
                }
                self.syncEditorOutputs();
            });
        });

        // Snap-to-grid toggle: remembered per viewer and applied on the next
        // slider move (so it aligns objects without disturbing the current one).
        var snapBox = panel.querySelector('[data-mnemo-ed-snap]');
        snapBox.checked = this.snap;
        snapBox.addEventListener('change', function() {
            self.snap = snapBox.checked;
            try {
                window.localStorage.setItem('format_mnemo_snap', self.snap ? '1' : '0');
            } catch (e) {
                // Ignore storage being unavailable; the toggle still works.
            }
        });

        // Snap-to-surface toggle: remembered per viewer. Turning it on drops the
        // selected object onto the surface beneath it now (and each later move
        // re-drops it); the Move-Y control is disabled while it is on, since the
        // vertical position is then driven by the surface.
        var surfBox = panel.querySelector('[data-mnemo-ed-snapsurface]');
        surfBox.checked = this.snapSurface;
        surfBox.addEventListener('change', function() {
            self.snapSurface = surfBox.checked;
            try {
                window.localStorage.setItem('format_mnemo_snapsurface', self.snapSurface ? '1' : '0');
            } catch (e) {
                // Ignore storage being unavailable; the toggle still works.
            }
            if (self.snapSurface && self.selected && self.propType(self.selected)) {
                self.dropToSurface(self.selected);
                self.applyTransform(self.selected);
            }
            if (self.selected) {
                self.fillEditor(self.selected);
            } else {
                self.updateSnapSurfaceUi();
            }
        });

        panel.querySelector('[data-mnemo-ed-act="save"]').addEventListener('click', function() {
            self.saveTransform();
        });
        panel.querySelector('[data-mnemo-ed-act="reset"]').addEventListener('click', function() {
            if (!self.selected) {
                return;
            }
            self.selected.transform = {scale: 1, sx: 1, sy: 1, sz: 1,
                x: 0, y: 0, z: 0, rot: 0, brightness: 1};
            if (self.selected.kind === 'surface') {
                self.retileSurface(self.selected);
            } else {
                self.applyTransform(self.selected);
                if (self.selected.emits) {
                    self.applyBrightness(self.selected);
                }
            }
            self.fillEditor(self.selected);
        });
        panel.querySelector('[data-mnemo-ed-act="close"]').addEventListener('click', function() {
            self.deselectEditable();
        });
        panel.querySelector('[data-mnemo-ed-act="delete"]').addEventListener('click', function() {
            self.deleteSelected();
        });

        btn.addEventListener('click', function() {
            self.editMode = !self.editMode;
            btn.classList.toggle('format-mnemo__edit-btn--on', self.editMode);
            btn.textContent = self.editMode ? (s.editdone || 'Done editing') : (s.edit || 'Edit layout');
            if (self.editMode) {
                self.setPlaceMode(false); // Edit and place modes are exclusive.
            } else {
                self.deselectEditable();
            }
            // The alignment grid is shown throughout the editor (edit or place
            // mode) so buildings and objects can be lined up against it.
            self.showGroundGrid(self.editMode || self.placeMode);
        });

        this.buildPlacer();
    };

    /**
     * Build the in-view object placer: a "Place objects" button, a palette of
     * prop types, and the ground grid shown while placing. Clicking a grid
     * square in place mode drops the selected prop there.
     */
    Cyberspace.prototype.buildPlacer = function() {
        var self = this;
        var s = this.config.strings || {};

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'format-mnemo__place-btn';
        btn.textContent = s.place || 'Place objects';
        this.root.appendChild(btn);
        this.placeButton = btn;

        var panel = document.createElement('div');
        panel.className = 'format-mnemo__placer';
        panel.hidden = true;
        var types = [
            {key: 'lamp', label: s.placelamp || 'Street lamp'},
            {key: 'barrier', label: s.placebarrier || 'Barrier'},
            {key: 'kiosk', label: s.placekiosk || 'Kiosk'},
            {key: 'av', label: s.placevehicle || 'Vehicle'}
        ];
        var html = '<div class="format-mnemo__placer-types">';
        types.forEach(function(t) {
            html += '<button type="button" class="format-mnemo__placer-type" data-mnemo-place="' +
                t.key + '">' + t.label + '</button>';
        });
        html += '</div><div class="format-mnemo__placer-hint">' +
            (s.placehint || 'Pick an object, then click a grid square to place it.') +
            '</div><div class="format-mnemo__editor-status" data-mnemo-place-status></div>';
        panel.innerHTML = html;
        this.root.appendChild(panel);
        this.placerPanel = panel;

        var typeButtons = panel.querySelectorAll('[data-mnemo-place]');
        var markActive = function() {
            for (var i = 0; i < typeButtons.length; i++) {
                typeButtons[i].classList.toggle(
                    'format-mnemo__placer-type--on',
                    typeButtons[i].getAttribute('data-mnemo-place') === self.placeType
                );
            }
        };
        for (var i = 0; i < typeButtons.length; i++) {
            typeButtons[i].addEventListener('click', function() {
                self.placeType = this.getAttribute('data-mnemo-place');
                markActive();
            });
        }
        markActive();

        btn.addEventListener('click', function() {
            self.setPlaceMode(!self.placeMode);
        });
    };

    /**
     * Turn placement mode on or off, toggling the palette, the ground grid and
     * the button label. Entering placement leaves edit mode (they are
     * mutually exclusive and share the click handler).
     *
     * @param {Boolean} on Whether placement mode should be on.
     */
    Cyberspace.prototype.setPlaceMode = function(on) {
        var s = this.config.strings || {};
        this.placeMode = !!on;
        if (this.placeButton) {
            this.placeButton.classList.toggle('format-mnemo__place-btn--on', this.placeMode);
            this.placeButton.textContent = this.placeMode ?
                (s.placedone || 'Done placing') : (s.place || 'Place objects');
        }
        if (this.placerPanel) {
            this.placerPanel.hidden = !this.placeMode;
        }
        this.showGroundGrid(this.placeMode || this.editMode);
        if (this.placeMode && this.editMode) {
            // Leave edit mode without recursing back into this method.
            this.editMode = false;
            if (this.editButton) {
                this.editButton.classList.remove('format-mnemo__edit-btn--on');
                this.editButton.textContent = s.edit || 'Edit layout';
            }
            this.deselectEditable();
        }
    };

    /**
     * Show or hide a grid overlay on the ground, so a teacher can see the cells
     * placement snaps to. Built once, lazily.
     *
     * @param {Boolean} on Whether the grid should be visible.
     */
    Cyberspace.prototype.showGroundGrid = function(on) {
        var THREE = this.THREE;
        if (!this.groundGrid && on) {
            var g = this.gridStep > 0 ? this.gridStep : 2;
            // Size and centre the grid to the generated avenue so it covers the
            // whole layout however many sections there are, not a fixed box.
            var road = this.roads && this.roads[0];
            var zmin = road ? road.zMin : -120;
            var zmax = road ? road.zMax : 12;
            // A square that spans the avenue's length (plus margin for the side
            // streets that branch off it in x), rounded to whole grid cells.
            var span = Math.max(160, (zmax - zmin) + 60);
            span = Math.ceil(span / g) * g;
            var divisions = Math.round(span / g);
            var grid = new THREE.GridHelper(span, divisions, this.palette.primary, this.palette.primary);
            // Sit clearly above the road strips, textured plazas and the raised
            // sidewalk tops (which are SIDEWALK_HEIGHT high) so none of those
            // opaque surfaces hide the lines, centred on a grid multiple so the
            // drawn lines land on the lattice placement snaps to.
            grid.position.set(0, SIDEWALK_HEIGHT + 0.06, this.snapCoord((zmin + zmax) / 2));
            if (grid.material) {
                grid.material.transparent = true;
                grid.material.opacity = 0.6;
                grid.material.depthWrite = false;
            }
            grid.renderOrder = 3;
            this.scene.add(grid);
            this.groundGrid = grid;
        }
        if (this.groundGrid) {
            this.groundGrid.visible = !!on;
        }
    };

    /**
     * Select an editable object: show the panel populated with its transform and
     * draw a selection box around it.
     *
     * @param {Object} editable The editable record.
     */
    Cyberspace.prototype.selectEditable = function(editable) {
        this.selected = editable;
        if (this.selBox) {
            this.scene.remove(this.selBox);
            this.selBox = null;
        }
        // Surface editables have no single group (they retile many meshes), so
        // there is no bounding box to draw around them.
        if (editable.group) {
            this.selBox = new this.THREE.BoxHelper(editable.group, this.palette.primary);
            this.scene.add(this.selBox);
        }
        // Float the object's name above it in the scene so it is unmistakable
        // which item is being edited (skipped for surfaces, which have no
        // anchor; their name still shows in the panel header).
        this.showSelectionLabel(editable);
        if (this.editorPanel) {
            this.editorPanel.hidden = false;
            this.fillEditor(editable);
        }
    };

    /**
     * Clear the current selection and hide the editor panel.
     */
    Cyberspace.prototype.deselectEditable = function() {
        this.selected = null;
        if (this.selBox) {
            this.scene.remove(this.selBox);
            this.selBox = null;
        }
        this.showSelectionLabel({}); // Clear the floating name label.
        if (this.editorPanel) {
            this.editorPanel.hidden = true;
        }
    };

    /**
     * Show a floating neon label with the selected object's name, anchored just
     * above it and always drawn on top, so the teacher can see exactly which
     * item they are editing. Passing an editable with no group (or {}) just
     * clears any existing label; surfaces are edited without one.
     *
     * @param {Object} editable The selected editable (or {} to clear).
     */
    Cyberspace.prototype.showSelectionLabel = function(editable) {
        var THREE = this.THREE;
        if (this.selLabel) {
            this.scene.remove(this.selLabel);
            if (this.selLabel.material) {
                if (this.selLabel.material.map) {
                    this.selLabel.material.map.dispose();
                }
                this.selLabel.material.dispose();
            }
            this.selLabel = null;
        }
        if (!editable || !editable.group) {
            return;
        }
        var box = new THREE.Box3().setFromObject(editable.group);
        if (box.isEmpty()) {
            return;
        }
        var size = new THREE.Vector3();
        box.getSize(size);
        // Scale the label with the object so it stays legible over big towers
        // without dwarfing small props.
        var scale = Math.min(6, Math.max(2, size.x * 0.6));
        var label = this.makeLabel(editable.name || '', this.palette.primary, scale);
        label.renderOrder = 999;
        if (label.material) {
            label.material.depthTest = false; // Never hidden behind geometry.
        }
        this.scene.add(label);
        this.selLabel = label;
        this.positionSelLabel(editable.group);
    };

    /**
     * Reposition the floating selection label just above an object's current
     * bounding box, so it tracks live move/scale edits. No-op without a label.
     *
     * @param {Object} group The selected object's group.
     */
    Cyberspace.prototype.positionSelLabel = function(group) {
        if (!this.selLabel) {
            return;
        }
        var THREE = this.THREE;
        var box = new THREE.Box3().setFromObject(group);
        if (box.isEmpty()) {
            return;
        }
        var size = new THREE.Vector3();
        box.getSize(size);
        var center = new THREE.Vector3();
        box.getCenter(center);
        this.selLabel.position.set(center.x, box.max.y + Math.max(1, size.y * 0.12), center.z);
    };

    /**
     * Populate the editor sliders and title from an editable's transform.
     *
     * @param {Object} editable The editable record.
     */
    Cyberspace.prototype.fillEditor = function(editable) {
        var panel = this.editorPanel;
        panel.querySelector('[data-mnemo-ed-name]').textContent = editable.name || '';
        var t = editable.transform;
        var one = function(v) {
            return typeof v === 'number' ? v : 1;
        };
        // Texture size reuses the transform's scale field for a surface.
        var map = {scale: t.scale, sx: one(t.sx), sy: one(t.sy), sz: one(t.sz),
            x: t.x, y: t.y, z: t.z, rot: t.rot,
            brightness: t.brightness !== undefined ? t.brightness : 1, texsize: t.scale};
        Object.keys(map).forEach(function(key) {
            panel.querySelector('[data-mnemo-ed="' + key + '"]').value = map[key];
        });
        // A surface editable offers only its texture-size control; every other
        // object offers the transform sliders (and brightness only when it emits
        // light). Toggle each row to match the selected object's kind.
        var surface = editable.kind === 'surface';
        var rows = {scale: !surface, sx: !surface, sy: !surface, sz: !surface,
            x: !surface, y: !surface, z: !surface,
            rot: !surface, brightness: !surface && editable.emits, texsize: surface};
        Object.keys(rows).forEach(function(key) {
            panel.querySelector('[data-mnemo-ed="' + key + '"]')
                .closest('.format-mnemo__editor-row').hidden = !rows[key];
        });
        // Deletable objects: teacher-placed props, and generated decorative
        // props (a street lamp, barrier or kiosk) which are hidden per course.
        panel.querySelector('[data-mnemo-ed-act="delete"]').hidden = !this.isDeletable(editable);
        panel.querySelector('[data-mnemo-ed-status]').textContent = '';
        this.updateSnapSurfaceUi();
        this.syncEditorOutputs();
    };

    /**
     * Reflect the snap-to-surface state in the editor: while it is on and a
     * snappable prop is selected, the Move-Y control is locked, since the
     * object's height is driven by the surface beneath it rather than set by
     * hand.
     */
    Cyberspace.prototype.updateSnapSurfaceUi = function() {
        if (!this.editorPanel) {
            return;
        }
        var yInput = this.editorPanel.querySelector('[data-mnemo-ed="y"]');
        if (!yInput) {
            return;
        }
        var lock = !!(this.snapSurface && this.selected && this.propType(this.selected));
        yInput.disabled = lock;
        var row = yInput.closest('.format-mnemo__editor-row');
        if (row) {
            row.classList.toggle('format-mnemo__editor-row--locked', lock);
        }
    };

    /**
     * Refresh the numeric readouts beside each slider from the sliders.
     */
    Cyberspace.prototype.syncEditorOutputs = function() {
        var panel = this.editorPanel;
        var twodp = {scale: 1, sx: 1, sy: 1, sz: 1, brightness: 1, texsize: 1};
        ['scale', 'sx', 'sy', 'sz', 'x', 'y', 'z', 'rot', 'brightness', 'texsize'].forEach(function(key) {
            var input = panel.querySelector('[data-mnemo-ed="' + key + '"]');
            var out = panel.querySelector('[data-mnemo-out="' + key + '"]');
            out.textContent = twodp[key] ?
                parseFloat(input.value).toFixed(2) : Math.round(parseFloat(input.value));
        });
    };

    /**
     * Persist the selected object's transform through the Moodle web service.
     * Uses the AMD ajax module lazily so the render bundle keeps no hard
     * dependency on it (and headless tests never touch the network).
     */
    Cyberspace.prototype.saveTransform = function() {
        var editable = this.selected;
        if (!editable || !window.require) {
            return;
        }
        var s = this.config.strings || {};
        var status = this.editorPanel.querySelector('[data-mnemo-ed-status]');
        var saveBtn = this.editorPanel.querySelector('[data-mnemo-ed-act="save"]');
        // Guard against a double-clicked Save firing two concurrent requests.
        if (saveBtn.disabled) {
            return;
        }
        saveBtn.disabled = true;
        status.textContent = s.editsaving || 'Saving…';
        var savedText = s.editsaved || 'Saved';
        var errorText = s.editsaveerror || 'Could not save';
        var promise = this.persistTransform(editable);
        if (!promise) {
            saveBtn.disabled = false;
            return;
        }
        promise.then(function() {
            status.textContent = savedText;
            saveBtn.disabled = false;
            return null;
        }).catch(function() {
            status.textContent = errorText;
            saveBtn.disabled = false;
        });
    };

    /**
     * Persist an editable's transform through the Moodle web service, without
     * touching the editor panel, and return the request promise (or null when
     * ajax is unavailable). Activities save by course-module id; non-activity
     * scene objects save by their per-course slot key (with brightness). Both
     * carry the per-axis width/height/depth multipliers. Used both by Save and
     * by the placer (to persist a surface-snapped drop for a freshly placed
     * prop that is not the current selection).
     *
     * @param {Object} editable The editable to persist.
     * @return {Promise|null} The web-service call promise, or null.
     */
    Cyberspace.prototype.persistTransform = function(editable) {
        if (!editable || !window.require) {
            return null;
        }
        var t = editable.transform;
        var one = function(v) {
            return typeof v === 'number' ? v : 1;
        };
        var request = editable.objkey ? {
            methodname: 'format_mnemo_set_scene_object',
            args: {
                courseid: this.config.courseid, objkey: editable.objkey, scale: t.scale,
                scalex: one(t.sx), scaley: one(t.sy), scalez: one(t.sz),
                offsetx: t.x, offsety: t.y, offsetz: t.z, rotation: t.rot,
                brightness: t.brightness !== undefined ? t.brightness : 1
            }
        } : {
            methodname: 'format_mnemo_set_transform',
            args: {
                cmid: editable.cmid, scale: t.scale,
                scalex: one(t.sx), scaley: one(t.sy), scalez: one(t.sz),
                offsetx: t.x, offsety: t.y, offsetz: t.z, rotation: t.rot
            }
        };
        return new Promise(function(resolve, reject) {
            window.require(['core/ajax'], function(ajax) {
                ajax.call([request])[0].then(resolve).catch(reject);
            });
        });
    };

    /**
     * Place the currently-selected prop type at the grid square under the
     * pointer: raycast the ground plane, snap to the grid, persist through the
     * web service, then build the prop so it appears immediately.
     */
    Cyberspace.prototype.placeAtPointer = function() {
        var self = this;
        var THREE = this.THREE;
        var s = this.config.strings || {};
        var type = this.placeType;
        var status = this.placerPanel ?
            this.placerPanel.querySelector('[data-mnemo-place-status]') : null;
        if (!this.propTemplates[type] || !window.require) {
            // The model has not loaded yet (or no ajax available); nothing to
            // place. Leave a hint rather than failing silently.
            if (status) {
                status.textContent = s.placehint || '';
            }
            return;
        }
        // Find where the pointer ray meets the ground (y = 0).
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        var point = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) {
            return;
        }
        var x = this.snapCoord(point.x);
        var z = this.snapCoord(point.z);
        if (status) {
            status.textContent = s.editsaving || 'Saving…';
        }
        var request = {
            methodname: 'format_mnemo_add_placed_object',
            args: {courseid: this.config.courseid, type: type, x: x, z: z}
        };
        window.require(['core/ajax'], function(ajax) {
            ajax.call([request])[0].then(function(res) {
                self.placeProp(res.type, res.id, res.x, res.z);
                if (status) {
                    status.textContent = '';
                }
                return null;
            }).catch(function() {
                if (status) {
                    status.textContent = s.editsaveerror || 'Could not save';
                }
            });
        });
    };

    /**
     * Build one placed prop from its template and register it as an editable
     * keyed placed:&lt;id&gt;, so it can immediately be selected, moved and
     * deleted, and persists for every viewer.
     *
     * @param {String} type The prop model name.
     * @param {Number} id The placed-object id from the web service.
     * @param {Number} x Grid-snapped world-x.
     * @param {Number} z Grid-snapped world-z.
     */
    Cyberspace.prototype.placeProp = function(type, id, x, z) {
        var tpl = this.propTemplates[type];
        if (!tpl) {
            return;
        }
        var y = this.placedBaseY(type);
        var m = tpl.clone();
        m.position.set(x, y, z);
        if (type === 'lamp') {
            this.addLampLight(m);
        }
        this.setShadow(m, true);
        this.scene.add(m);
        this.addPickProxy(m);
        this.placedObjects.push({id: id, type: type, x: x, z: z});
        this.registerSceneEditable('placed:' + id, this.propLabel(type),
            m, x, y, z, type === 'lamp' || type === 'av');
        // With snap-to-surface on, rest the new prop on the surface beneath it
        // (e.g. a raised sidewalk) and persist that height so every learner sees
        // it there, not sunk to road level.
        if (this.snapSurface && type !== 'av') {
            var editable = this.editables[this.editables.length - 1];
            if (editable && editable.objkey === 'placed:' + id) {
                this.dropToSurface(editable);
                this.applyTransform(editable);
                this.persistTransform(editable);
            }
        }
    };

    /**
     * Delete the selected teacher-placed prop: remove it through the web
     * service, then take it out of the scene. A no-op for anything that is not
     * a placed prop (its key does not match placed:&lt;id&gt;).
     */
    Cyberspace.prototype.deletePlaced = function() {
        var self = this;
        var editable = this.selected;
        if (!editable || !editable.objkey) {
            return;
        }
        var match = /^placed:([0-9]+)$/.exec(editable.objkey);
        if (!match) {
            return;
        }
        var id = parseInt(match[1], 10);
        if (!window.require) {
            this.removePlacedFromScene(editable, id);
            return;
        }
        var s = this.config.strings || {};
        var status = this.editorPanel.querySelector('[data-mnemo-ed-status]');
        status.textContent = s.editsaving || 'Saving…';
        var request = {
            methodname: 'format_mnemo_remove_placed_object',
            args: {courseid: this.config.courseid, id: id}
        };
        window.require(['core/ajax'], function(ajax) {
            ajax.call([request])[0].then(function() {
                self.removePlacedFromScene(editable, id);
                return null;
            }).catch(function() {
                status.textContent = s.editsaveerror || 'Could not save';
            });
        });
    };

    /**
     * Remove a placed prop from the scene, the editables list and the local
     * placed-object list, and clear the selection.
     *
     * @param {Object} editable The placed prop's editable record.
     * @param {Number} id The placed-object id.
     */
    Cyberspace.prototype.removePlacedFromScene = function(editable, id) {
        if (editable.group) {
            this.scene.remove(editable.group);
        }
        var idx = this.editables.indexOf(editable);
        if (idx >= 0) {
            this.editables.splice(idx, 1);
        }
        for (var i = 0; i < this.placedObjects.length; i++) {
            if (this.placedObjects[i].id === id) {
                this.placedObjects.splice(i, 1);
                break;
            }
        }
        this.deselectEditable();
    };

    /**
     * Whether the selected object can be deleted from the editor: a
     * teacher-placed prop, or a generated decorative prop (lamp/barrier/kiosk).
     * Gates, pylons and activities are not deletable.
     *
     * @param {Object} editable The editable record.
     * @return {Boolean} Whether a Delete control should be offered.
     */
    Cyberspace.prototype.isDeletable = function(editable) {
        if (!editable || !editable.objkey) {
            return false;
        }
        if (/^placed:/.test(editable.objkey)) {
            return true;
        }
        var t = this.propType(editable);
        return t === 'lamp' || t === 'barrier' || t === 'kiosk';
    };

    /**
     * Whether a generated prop's slot has been removed (hidden) for this course,
     * so the build should skip it.
     *
     * @param {String} objkey The slot key.
     * @return {Boolean} Whether the slot is hidden.
     */
    Cyberspace.prototype.isHidden = function(objkey) {
        var o = this.sceneObjects[objkey];
        return !!(o && o.hidden);
    };

    /**
     * Delete the selected object: a teacher-placed prop is removed outright; a
     * generated decorative prop is hidden for the course (so it stays gone on
     * reload). Anything else is a no-op.
     */
    Cyberspace.prototype.deleteSelected = function() {
        var editable = this.selected;
        if (!editable || !editable.objkey) {
            return;
        }
        if (/^placed:/.test(editable.objkey)) {
            this.deletePlaced();
        } else if (this.isDeletable(editable)) {
            this.deleteGeneratedProp(editable);
        }
    };

    /**
     * Hide a generated decorative prop for the course through the web service,
     * then take it out of the scene. The hidden state persists so the prop stays
     * gone for every viewer and on reload.
     *
     * @param {Object} editable The generated prop's editable record.
     */
    Cyberspace.prototype.deleteGeneratedProp = function(editable) {
        var self = this;
        var objkey = editable.objkey;
        var apply = function() {
            // Remember the removal so it also holds if the scene is rebuilt in
            // this session, then detach the prop and clear the selection.
            self.sceneObjects[objkey] = self.sceneObjects[objkey] || {};
            self.sceneObjects[objkey].hidden = true;
            if (editable.group) {
                self.scene.remove(editable.group);
            }
            var idx = self.editables.indexOf(editable);
            if (idx >= 0) {
                self.editables.splice(idx, 1);
            }
            self.deselectEditable();
        };
        if (!window.require) {
            apply();
            return;
        }
        var s = this.config.strings || {};
        var status = this.editorPanel.querySelector('[data-mnemo-ed-status]');
        status.textContent = s.editsaving || 'Saving…';
        var request = {
            methodname: 'format_mnemo_remove_scene_object',
            args: {courseid: this.config.courseid, objkey: objkey}
        };
        window.require(['core/ajax'], function(ajax) {
            ajax.call([request])[0].then(function() {
                apply();
                return null;
            }).catch(function() {
                status.textContent = s.editsaveerror || 'Could not save';
            });
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
        // In place mode a click drops the selected prop on the grid.
        if (this.placeMode) {
            this.placeAtPointer();
            return;
        }
        // In edit mode a click selects an object to transform, rather than
        // opening the activity.
        if (this.editMode) {
            this.pickEditable();
            return;
        }
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        var hits = this.raycaster.intersectObjects(this.interactive, false);
        if (hits.length) {
            var obj = hits[0].object;
            if (obj.userData && obj.userData.readerContent) {
                this.readerHitLink(hits[0].uv);
            } else {
                this.activate(obj);
            }
        }
    };

    /**
     * Register an activity's object (a building or a video screen) as editable
     * in the in-view editor, remembering its default placement so the stored
     * transform is applied relative to it. The transform is applied immediately
     * for every viewer; the editor UI (which mutates it) is built only for users
     * who can edit the course.
     *
     * @param {Object} act The activity node (id is the course module id).
     * @param {Object} group The Three.Group placed for the activity.
     * @param {Number} baseX Default world x.
     * @param {Number} baseY Default world y.
     * @param {Number} baseZ Default world z.
     * @param {Object} sign Optional signboard group to keep street-facing when
     *     the building is rotated (counter-rotated against the group).
     * @param {Object} scalenode Optional child group that takes the non-uniform
     *     width/height/depth so the sign (a sibling) is never sheared; defaults
     *     to the group itself.
     * @param {Object} panel Optional interactive mesh (the sign face or video
     *     screen) whose material and base colour a live refresh recolours.
     */
    Cyberspace.prototype.registerEditable = function(act, group, baseX, baseY, baseZ, sign, scalenode, panel) {
        var t = act.transform || {};
        var editable = {
            cmid: act.id,
            objkey: null,
            name: act.name,
            group: group,
            sign: sign || null,
            // The node that takes the non-uniform width/height/depth (the
            // building body, kept apart from the sign so the sign never shears);
            // falls back to the group for objects with no separate scale node.
            scaleNode: scalenode || group,
            signBaseZ: sign ? sign.position.z : 0,
            baseX: baseX, baseY: baseY, baseZ: baseZ,
            baseRotY: group.rotation.y,
            emits: false,
            transform: {
                scale: t.scale > 0 ? t.scale : 1,
                sx: t.sx > 0 ? t.sx : 1, sy: t.sy > 0 ? t.sy : 1, sz: t.sz > 0 ? t.sz : 1,
                x: t.x || 0, y: t.y || 0, z: t.z || 0, rot: t.rot || 0
            }
        };
        // Apply any stored transform so it renders from the first frame, for
        // every viewer.
        if (act.transform) {
            this.applyTransform(editable);
        }
        // Record the activity (for every viewer, editable or not) with a
        // completion tick, so its state can be refreshed live.
        if (act.id) {
            this.registerActivity(editable, act, sign || null, panel || null);
        }
        // Only objects the viewer may edit at their own module context become
        // selectable, matching the web service's permission check (a course-
        // level grant that is prohibited on one activity must not offer it).
        if (act.editable !== false) {
            group.userData.mnemoEditable = editable;
            this.editables.push(editable);
        }
    };

    /**
     * Build a green completion tick (a checkmark that always faces the camera),
     * floating in front of a building above its sign; shown when the activity
     * is complete. Recorded in the activities map so a live refresh can toggle
     * it and recolour the sign.
     *
     * @param {Object} editable The activity's editable record.
     * @param {Object} act The activity node (id, state).
     * @param {Object} sign The sign group, or null (e.g. a video screen).
     * @param {Object} panel The interactive mesh (sign face or video screen),
     *     or null; carries the frame material and hover-restore base colour.
     */
    Cyberspace.prototype.registerActivity = function(editable, act, sign, panel) {
        var tick = this.makeTick();
        if (sign) {
            // Parent the tick to the sign so it follows the sign when the
            // editor's depth control shifts the sign's z (otherwise it would be
            // left embedded in, or detached from, a deepened building).
            sign.add(tick);
            tick.position.set(0, 1.1, 0.4);
        } else {
            editable.group.add(tick);
            tick.position.set(0, 2.4, 0.4);
        }
        tick.visible = act.state === 'complete';
        // The state colour lives on the frame material (exposed on the sign
        // group for buildings; the video screen has no sign, so read it from the
        // interactive panel's material instead).
        var frameMat = (sign && sign.userData && sign.userData.frameMat) ||
            (panel && panel.userData && panel.userData.material) || null;
        this.activities[act.id] = {
            group: editable.group,
            tick: tick,
            frameMat: frameMat,
            panel: (panel && panel.userData) ? panel : null,
            state: act.state
        };
    };

    /**
     * A green completion tick sprite (drawn to a canvas, glowing, drawn on top
     * so it reads as a floating badge). Always faces the camera.
     *
     * @return {Object} A Three.Sprite.
     */
    Cyberspace.prototype.makeTick = function() {
        var THREE = this.THREE;
        var ctx = this.newCanvasCtx(128);
        ctx.clearRect(0, 0, 128, 128);
        ctx.strokeStyle = '#39ff14';
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#39ff14';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(30, 66);
        ctx.lineTo(56, 92);
        ctx.lineTo(100, 38);
        ctx.stroke();
        var tex = new THREE.CanvasTexture(ctx.canvas);
        if (tex.colorSpace !== undefined) {
            tex.colorSpace = THREE.SRGBColorSpace;
        }
        var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false
        }));
        sprite.renderOrder = 6;
        sprite.scale.set(1.3, 1.3, 1);
        return sprite;
    };

    /**
     * Re-fetch the course's current activity states from the server and apply
     * them, so completion and availability update without a full page reload
     * (called when the learner closes the in-scene activity panel). Best-effort:
     * a failed request leaves the scene as it was.
     */
    Cyberspace.prototype.refreshActivityStates = function() {
        var self = this;
        if (!window.require || !this.config.courseid) {
            return;
        }
        var seq = ++this.stateRefreshSeq;
        var request = {
            methodname: 'format_mnemo_get_states',
            args: {courseid: this.config.courseid}
        };
        window.require(['core/ajax'], function(ajax) {
            ajax.call([request])[0].then(function(res) {
                // Drop a response overtaken by a later refresh, so an older
                // snapshot cannot revert a state a newer one already applied.
                if (self.stateRefreshSeq !== seq) {
                    return null;
                }
                self.applyStates((res && res.states) || []);
                return null;
            }).catch(function() {
                // Leave the scene as it is on a failed refresh.
            });
        });
    };

    /**
     * Apply refreshed activity states: toggle each activity's completion tick
     * and recolour its sign frame to the state colour. An activity the server no
     * longer lists has become unavailable since the scene was built (hidden, or
     * a time window closed), so it is set to restricted rather than left reading
     * as open. Only activities already built into the scene are updated; one
     * newly revealed from being fully hidden still needs a page reload.
     *
     * @param {Array} states [{cmid, state}] from get_states.
     */
    Cyberspace.prototype.applyStates = function(states) {
        var seen = {};
        var i;
        for (i = 0; i < states.length; i++) {
            seen[states[i].cmid] = states[i].state;
        }
        var changed = false;
        var cmids = Object.keys(this.activities);
        for (i = 0; i < cmids.length; i++) {
            var cmid = cmids[i];
            var a = this.activities[cmid];
            // A cmid absent from the response is no longer visible: treat it as
            // restricted so it stops reading as available without a reload.
            var state = Object.prototype.hasOwnProperty.call(seen, cmid) ? seen[cmid] : 'restricted';
            if (a.state === state) {
                continue;
            }
            a.state = state;
            if (a.tick) {
                a.tick.visible = state === 'complete';
            }
            var colour = STATE_COLOURS[state];
            if (typeof colour === 'number') {
                if (a.frameMat && a.frameMat.color) {
                    a.frameMat.color.setHex(colour);
                }
                // Keep the hover-restore colour in step, so moving the pointer
                // off the sign does not snap it back to the pre-refresh colour.
                if (a.panel && a.panel.userData) {
                    a.panel.userData.baseColour = colour;
                }
            }
            changed = true;
        }
        if (changed && this.renderer && this.renderer.shadowMap) {
            this.renderer.shadowMap.needsUpdate = true;
        }
    };

    /**
     * Apply an editable's transform (scale, position offset, rotation) to its
     * group, relative to the default placement recorded at registration.
     *
     * @param {Object} editable The editable record.
     */
    Cyberspace.prototype.applyTransform = function(editable) {
        var t = editable.transform;
        var g = editable.group;
        g.position.set(editable.baseX + t.x, editable.baseY + t.y, editable.baseZ + t.z);
        g.rotation.y = editable.baseRotY + t.rot * Math.PI / 180;
        // Uniform scale times the per-axis width/height/depth multipliers, so a
        // teacher can stretch an object as well as scale it evenly.
        var sx = t.sx > 0 ? t.sx : 1;
        var sy = t.sy > 0 ? t.sy : 1;
        var sz = t.sz > 0 ? t.sz : 1;
        var node = editable.scaleNode || g;
        if (node !== g) {
            // The group carries only the uniform scale (and rotation), so the
            // sign under it is never sheared; the scale node takes the
            // anisotropic stretch of the body.
            g.scale.setScalar(t.scale);
            node.scale.set(sx, sy, sz);
        } else {
            g.scale.set(t.scale * sx, t.scale * sy, t.scale * sz);
        }
        // Keep the signboard facing the street: counter-rotate it against the
        // building's editor rotation so its world orientation stays where it was
        // placed (the street centreline), even as the building turns; and track
        // the (depth-scaled) front face so a deepened building keeps it on-face.
        if (editable.sign) {
            editable.sign.rotation.y = -t.rot * Math.PI / 180;
            editable.sign.position.z = (editable.signBaseZ || 0) * sz;
        }
        if (this.selBox) {
            this.selBox.update();
        }
        // Keep the floating name label above the object as it moves/scales.
        if (this.selLabel && this.selected && this.selected.group === g) {
            this.positionSelLabel(g);
        }
        if (this.renderer && this.renderer.shadowMap) {
            this.renderer.shadowMap.needsUpdate = true;
        }
    };

    /**
     * The height of the topmost road/sidewalk/ground surface directly beneath a
     * world (x, z), by casting a ray straight down through the recorded surface
     * meshes. Used by snap-to-surface so an object rests on a raised sidewalk
     * rather than at road level. Returns 0 (ground datum) when nothing is hit.
     *
     * @param {Number} x World x.
     * @param {Number} z World z.
     * @return {Number} The surface height (world y).
     */
    Cyberspace.prototype.surfaceHeightAt = function(x, z) {
        if (!this.surfaces || !this.surfaces.length) {
            return 0;
        }
        var THREE = this.THREE;
        if (!this.surfaceCaster) {
            this.surfaceCaster = new THREE.Raycaster();
            this.surfaceDown = new THREE.Vector3(0, -1, 0);
            this.surfaceOrigin = new THREE.Vector3();
        }
        this.surfaceOrigin.set(x, 60, z);
        this.surfaceCaster.set(this.surfaceOrigin, this.surfaceDown);
        var hits = this.surfaceCaster.intersectObjects(this.surfaces, false);
        // Hits come back sorted nearest-first, so from above the first is the
        // topmost surface at this point.
        return hits.length ? hits[0].point.y : 0;
    };

    /**
     * Set an editable's vertical offset so it rests on the surface beneath its
     * current world position (base + offset), for snap-to-surface. Flying props
     * (vehicles) keep their hover height rather than being dropped to a kerb.
     *
     * @param {Object} editable The editable to rest on the surface.
     */
    Cyberspace.prototype.dropToSurface = function(editable) {
        if (this.propType(editable) === 'av') {
            return;
        }
        var t = editable.transform;
        var y = this.surfaceHeightAt(editable.baseX + t.x, editable.baseZ + t.z);
        t.y = y - editable.baseY;
    };

    /**
     * The placed/scattered prop type of an editable (lamp, barrier, kiosk, av),
     * from its slot key, or null for anything else (activities, gates, pylons,
     * surfaces).
     *
     * @param {Object} editable The editable record.
     * @return {String|null} The prop type, or null.
     */
    Cyberspace.prototype.propType = function(editable) {
        var key = editable && editable.objkey;
        if (!key) {
            return null;
        }
        // A teacher-placed prop keys placed:<id>; its type lives in placedObjects.
        if (key.indexOf('placed:') === 0) {
            var id = parseInt(key.slice(7), 10);
            for (var i = 0; i < this.placedObjects.length; i++) {
                if (this.placedObjects[i].id === id) {
                    return this.placedObjects[i].type;
                }
            }
            return null;
        }
        // A scattered prop keys <type>:<slot> (lamp/barrier/kiosk/av).
        var prefix = key.split(':')[0];
        return (prefix === 'lamp' || prefix === 'barrier' || prefix === 'kiosk' ||
            prefix === 'av') ? prefix : null;
    };

    /**
     * Snap an edited slider value to the grid when snap-to-grid is on, so
     * objects align consistently. Positions snap on their absolute world
     * coordinate (base + offset) to a 1-unit lattice — objects with different
     * defaults still line up — rotation to 15 degrees and scale to 0.25 steps.
     * Other controls (brightness, texture size) and the off state pass through.
     *
     * @param {String} key The transform field being edited.
     * @param {Number} raw The raw slider value.
     * @param {Object} editable The selected editable (for its base placement).
     * @return {Number} The snapped value.
     */
    /**
     * Snap a single world coordinate to the layout grid. Used to place the
     * generated city (buildings, props, gates, pylons) on a consistent lattice.
     *
     * @param {Number} v A world coordinate.
     * @return {Number} The nearest grid multiple.
     */
    Cyberspace.prototype.snapCoord = function(v) {
        var g = this.gridStep > 0 ? this.gridStep : 2;
        return Math.round(v / g) * g;
    };

    /**
     * Snap a base coordinate to the grid, but only when the object has no
     * stored in-view transform. A stored transform is an offset from the
     * original (unsnapped) base, so snapping the base of an object a teacher
     * already positioned would shift it on upgrade; keeping the original base
     * for those preserves saved layouts while new/default objects align.
     *
     * @param {Number} v The default base coordinate.
     * @param {Object} stored The object's stored transform/override, if any.
     * @return {Number} The snapped base, or the original when a transform exists.
     */
    Cyberspace.prototype.snapBase = function(v, stored) {
        return stored ? v : this.snapCoord(v);
    };

    Cyberspace.prototype.snapValue = function(key, raw, editable) {
        if (!this.snap || isNaN(raw)) {
            return raw;
        }
        var g = this.gridStep;
        if (key === 'x' || key === 'y' || key === 'z') {
            var base = editable.baseX;
            if (key === 'y') {
                base = editable.baseY;
            } else if (key === 'z') {
                base = editable.baseZ;
            }
            return Math.round((base + raw) / g) * g - base;
        }
        if (key === 'rot') {
            return Math.round(raw / 15) * 15;
        }
        if (key === 'scale') {
            return Math.round(raw / 0.25) * 0.25;
        }
        return raw;
    };

    /**
     * Register a non-activity scene object (a prop, gate or pylon) as editable,
     * keyed per course by a stable slot key, applying any stored transform and
     * brightness for every viewer. Only wired into the editor when the viewer
     * can edit the course.
     *
     * @param {String} objkey The slot key from slotKey().
     * @param {String} name A human label for the editor panel.
     * @param {Object} group The Three.Group placed for the object.
     * @param {Number} baseX Default world x.
     * @param {Number} baseY Default world y.
     * @param {Number} baseZ Default world z.
     * @param {Boolean} emits Whether it emits light (offer a brightness slider).
     */
    Cyberspace.prototype.registerSceneEditable = function(objkey, name, group, baseX, baseY, baseZ, emits) {
        var o = this.sceneObjects[objkey] || {};
        var editable = {
            cmid: null,
            objkey: objkey,
            name: name,
            group: group,
            baseX: baseX, baseY: baseY, baseZ: baseZ,
            baseRotY: group.rotation.y,
            emits: !!emits,
            transform: {
                scale: o.scale > 0 ? o.scale : 1,
                sx: o.sx > 0 ? o.sx : 1, sy: o.sy > 0 ? o.sy : 1, sz: o.sz > 0 ? o.sz : 1,
                x: o.x || 0, y: o.y || 0, z: o.z || 0, rot: o.rot || 0,
                // Brightness may legitimately be 0 (off), so keep any finite
                // stored value rather than treating 0 as "unset".
                brightness: typeof o.brightness === 'number' ? o.brightness : 1
            }
        };
        // Apply any stored override so it renders that way for every viewer.
        if (this.sceneObjects[objkey]) {
            this.applyTransform(editable);
            if (editable.emits) {
                this.applyBrightness(editable);
            }
        }
        if (this.config.canedit) {
            group.userData.mnemoEditable = editable;
            this.editables.push(editable);
        }
    };

    /**
     * Apply an editable's brightness multiplier to the emissive materials and
     * lights under its group, relative to a base captured on first apply (so it
     * is idempotent and reversible). Basic (unlit neon) materials are scaled by
     * colour, which can only dim.
     *
     * @param {Object} editable The editable record.
     */
    Cyberspace.prototype.applyBrightness = function(editable) {
        var b = editable.transform.brightness;
        editable.group.traverse(function(o) {
            if (o.isLight) {
                if (o.userData.mnemoBaseIntensity === undefined) {
                    o.userData.mnemoBaseIntensity = o.intensity;
                }
                o.intensity = o.userData.mnemoBaseIntensity * b;
                return;
            }
            if (!o.material) {
                return;
            }
            // Props are placed as tpl.clone(), which shares material instances
            // across every clone. Give this mesh its own material(s) once, so
            // changing one prop's brightness does not bleed into its siblings.
            if (!o.userData.mnemoOwnMaterial) {
                o.material = Array.isArray(o.material) ?
                    o.material.map(function(m) {
                        return m.clone();
                    }) : o.material.clone();
                o.userData.mnemoOwnMaterial = true;
            }
            var mats = Array.isArray(o.material) ? o.material : [o.material];
            for (var i = 0; i < mats.length; i++) {
                var m = mats[i];
                if (typeof m.emissiveIntensity === 'number' && m.emissive &&
                        (m.emissive.r || m.emissive.g || m.emissive.b)) {
                    if (m.userData.mnemoBaseEmissive === undefined) {
                        m.userData.mnemoBaseEmissive = m.emissiveIntensity;
                    }
                    m.emissiveIntensity = m.userData.mnemoBaseEmissive * b;
                } else if (m.isMeshBasicMaterial && m.color) {
                    if (!m.userData.mnemoBaseColor) {
                        m.userData.mnemoBaseColor = m.color.clone();
                    }
                    m.color.copy(m.userData.mnemoBaseColor).multiplyScalar(b);
                }
            }
        });
    };

    /**
     * Find the editable record an intersected object belongs to, by walking up
     * its ancestors to the registered group.
     *
     * @param {Object} obj The raycast-hit object.
     * @return {Object|null} The editable record, or null.
     */
    Cyberspace.prototype.editableFor = function(obj) {
        var node = obj;
        while (node) {
            if (node.userData && node.userData.mnemoEditable) {
                return node.userData.mnemoEditable;
            }
            node = node.parent;
        }
        return null;
    };

    /**
     * Raycast from the pointer and select the editable object under it.
     */
    Cyberspace.prototype.pickEditable = function() {
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        var groups = [];
        for (var i = 0; i < this.editables.length; i++) {
            groups.push(this.editables[i].group);
        }
        // Textured road/ground surfaces select their shared surface editable.
        for (var j = 0; j < this.surfacePickMeshes.length; j++) {
            groups.push(this.surfacePickMeshes[j]);
        }
        var hits = this.raycaster.intersectObjects(groups, true);
        if (!hits.length) {
            return;
        }
        var editable = this.editableFor(hits[0].object);
        if (editable) {
            this.selectEditable(editable);
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
     * Open a course activity from within the scene. Outside an immersive
     * headset session (desktop, phone or magic-window) the activity is shown
     * in a panel layered over the 3D view - its real Moodle page in an iframe -
     * so the learner does the quiz, assignment or resource without leaving the
     * world. Inside an immersive session the page DOM is not visible, so this
     * falls back to navigating to the activity (which ends the session);
     * presenting activities natively in-scene is a later phase.
     *
     * @param {String} url The activity view URL.
     * @param {String} name The activity name (panel heading).
     * @param {Object} opts Optional {cmid, reader}: a readable activity opens
     *     the native 3D reader inside a headset instead of navigating away.
     */
    Cyberspace.prototype.openActivity = function(url, name, opts) {
        if (!url) {
            return;
        }
        opts = opts || {};
        if (this.renderer.xr.isPresenting) {
            // The page DOM is invisible in an immersive session. A readable
            // activity is shown on the native reader panel; anything else falls
            // back to navigating (which ends the session).
            if (opts.reader && opts.cmid) {
                this.openReader(opts.cmid, name, url);
                return;
            }
            this.open(url);
            return;
        }
        this.showActivityOverlay(url, name);
    };

    /**
     * Show (building it once) the in-scene activity overlay for a URL, layered
     * over the stage with a heading, a close control and an open-in-new-tab
     * link, and load the activity's Moodle page into its iframe. In-world video
     * audio is paused while the panel is open so it does not sound behind it.
     *
     * @param {String} url The activity view URL to load in the panel.
     * @param {String} name The activity name shown as the panel heading.
     */
    Cyberspace.prototype.showActivityOverlay = function(url, name) {
        var overlay = this.activityOverlay || this.buildActivityOverlay();
        this.overlayReturnFocus = document.activeElement;
        overlay.title.textContent = name || '';
        overlay.el.setAttribute('aria-label', name || '');
        overlay.frame.setAttribute('title', name || '');
        overlay.frame.src = url;
        overlay.full.href = url;
        overlay.el.hidden = false;
        this.setOverlayInert(true);
        this.pauseVideos();
        overlay.close.focus();
    };

    /**
     * Make the rest of the page inert while the activity panel is open (or
     * revert it), so keyboard focus and clicks cannot reach the covered stage
     * controls or the surrounding course page - `aria-modal` alone does not do
     * this. Every sibling of the panel (inside the stage, and the bar/fallback
     * outside it) is toggled; the panel itself stays interactive. `inert` is a
     * no-op in browsers that lack it, which degrades safely.
     *
     * @param {Boolean} on Whether the background should be inert.
     */
    Cyberspace.prototype.setOverlayInert = function(on) {
        var overlay = this.activityOverlay;
        if (!overlay) {
            return;
        }
        var root = this.root;
        var mark = function(parent, skip) {
            if (!parent) {
                return;
            }
            for (var i = 0; i < parent.children.length; i++) {
                if (parent.children[i] !== skip) {
                    parent.children[i].inert = on;
                }
            }
        };
        // Inside the stage, everything except the panel; then the stage's
        // siblings (the toggle bar and the fallback list) in the container.
        mark(root, overlay.el);
        mark(root.closest ? root.closest('.format-mnemo') : null, root);
    };

    /**
     * Build the activity overlay DOM once, layered over the stage, and wire its
     * close control and Escape-to-close. Returns the record of its parts;
     * subsequent opens reuse it.
     *
     * @return {Object} {el, title, frame, close, full}.
     */
    Cyberspace.prototype.buildActivityOverlay = function() {
        var self = this;
        var s = this.config.strings || {};

        var el = document.createElement('div');
        el.className = 'format-mnemo__overlay';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.hidden = true;

        var bar = document.createElement('div');
        bar.className = 'format-mnemo__overlay-bar';

        var title = document.createElement('h3');
        title.className = 'format-mnemo__overlay-title';

        var full = document.createElement('a');
        full.className = 'format-mnemo__overlay-full';
        full.target = '_blank';
        full.rel = 'noopener';
        full.textContent = s.activityopen || 'Open in new tab';

        var close = document.createElement('button');
        close.type = 'button';
        close.className = 'btn btn-secondary format-mnemo__overlay-close';
        close.textContent = s.activityclose || 'Close';
        close.addEventListener('click', function() {
            self.closeActivityOverlay();
        });

        var frame = document.createElement('iframe');
        frame.className = 'format-mnemo__overlay-frame';
        // Escape should close the panel even when the learner is interacting
        // with the activity, whose keystrokes go to the nested document and do
        // not bubble out. The activity is same-origin (a Moodle page on this
        // site), so hook Escape on the framed document each time it loads; a
        // cross-origin document (e.g. an external tool) simply throws and is
        // left to the outer bar's own Escape handler below.
        frame.addEventListener('load', function() {
            try {
                var doc = frame.contentDocument;
                if (doc) {
                    doc.addEventListener('keydown', function(e) {
                        if (e.key === 'Escape') {
                            self.closeActivityOverlay();
                        }
                    });
                }
            } catch (e) {
                // Cross-origin framed document; its keys are not observable.
            }
        });

        bar.appendChild(title);
        bar.appendChild(full);
        bar.appendChild(close);
        el.appendChild(bar);
        el.appendChild(frame);

        el.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                self.closeActivityOverlay();
            }
        });

        this.root.appendChild(el);
        this.activityOverlay = {el: el, title: title, frame: frame, close: close, full: full};
        return this.activityOverlay;
    };

    /**
     * Hide the activity overlay, stop the framed page (and any media it plays)
     * by clearing its src, and return focus to the element that opened it.
     */
    Cyberspace.prototype.closeActivityOverlay = function() {
        var overlay = this.activityOverlay;
        if (!overlay || overlay.el.hidden) {
            return;
        }
        overlay.el.hidden = true;
        overlay.frame.src = 'about:blank';
        this.setOverlayInert(false);
        if (this.overlayReturnFocus && this.overlayReturnFocus.focus) {
            this.overlayReturnFocus.focus();
        }
        // Finishing the activity may have changed completion or availability;
        // refresh the scene's states (sign colours and completion ticks) so the
        // learner sees it without reloading the page.
        this.refreshActivityStates();
    };

    /**
     * Fetch a readable activity's content and show it on the native 3D reader
     * panel (used inside an immersive session, where the page DOM is invisible).
     * Records the module view so completion-on-view fires as opening the page
     * would; on a fetch failure it falls back to navigating to the activity.
     *
     * @param {Number} cmid The course-module id.
     * @param {String} name The activity name (reader heading).
     * @param {String} url The activity view URL (view ping and fallback).
     * @param {Number} chapterid Optional book chapter id (0 for the first).
     */
    Cyberspace.prototype.openReader = function(cmid, name, url, chapterid) {
        var self = this;
        if (!window.require || !cmid) {
            this.open(url);
            return;
        }
        var seq = ++this.readerSeq;
        var request = {
            methodname: 'format_mnemo_get_content',
            args: {cmid: cmid, chapterid: chapterid || 0}
        };
        this.recordView(url);
        window.require(['core/ajax'], function(ajax) {
            ajax.call([request])[0].then(function(res) {
                // Drop a response for a reader that was closed or superseded.
                if (self.readerSeq !== seq) {
                    return null;
                }
                self.showReader(res, name, url, cmid);
                return null;
            }).catch(function() {
                // Could not fetch the content; navigate to the activity instead
                // - but only if this request is still the current one (the user
                // may have closed the reader or opened another chapter).
                if (self.readerSeq === seq) {
                    self.open(url);
                }
            });
        });
    };

    /**
     * Show fetched content on the reader panel: store it, lay it out, render the
     * first window, place the panel in front of the viewer and make its controls
     * clickable.
     *
     * @param {Object} res The get_content response.
     * @param {String} name The activity name.
     * @param {String} url The activity view URL.
     * @param {Number} cmid The course-module id.
     */
    Cyberspace.prototype.showReader = function(res, name, url, cmid) {
        var r = this.reader || this.buildReaderPanel();
        r.cmid = cmid;
        r.url = url;
        r.name = name;
        r.blocks = (res && res.blocks) || [];
        r.chapters = (res && res.chapters) || [];
        r.chapterid = (res && res.chapterid) || 0;
        r.scroll = 0;
        this.setReaderTitle((res && res.title) || name || '');
        this.updateChapterControls();
        this.layoutReader();
        this.renderReaderCanvas();
        this.positionReaderInFront();
        r.group.visible = true;
        this.readerOpen = true;
        this.addReaderInteractive();
    };

    /**
     * Build the reader panel once: a dark backing board, a title strip, the
     * content plane (a canvas texture the layout renders into), and the control
     * buttons (close, scroll, chapter navigation). Reused by later opens.
     *
     * @return {Object} The reader record.
     */
    Cyberspace.prototype.buildReaderPanel = function() {
        var THREE = this.THREE;
        var group = new THREE.Group();
        group.visible = false;
        group.renderOrder = 20;

        var W = 1000;
        var H = 1360;
        // World size in metres (portrait), keeping the canvas aspect.
        var worldW = 1.5;
        var worldH = worldW * (H / W);

        // Backing board, a touch larger than the content, with the title strip.
        var board = new THREE.Mesh(
            new THREE.PlaneGeometry(worldW + 0.12, worldH + 0.28),
            new THREE.MeshBasicMaterial({color: 0x05070d, transparent: true, opacity: 0.94})
        );
        board.position.z = -0.01;
        group.add(board);

        var titleCanvas = document.createElement('canvas');
        titleCanvas.width = W;
        titleCanvas.height = 90;
        var titleTex = new THREE.CanvasTexture(titleCanvas);
        if (titleTex.colorSpace !== undefined) {
            titleTex.colorSpace = THREE.SRGBColorSpace;
        }
        var titleMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(worldW, worldW * (90 / W)),
            new THREE.MeshBasicMaterial({map: titleTex, transparent: true})
        );
        titleMesh.position.set(0, worldH / 2 + 0.09, 0.001);
        group.add(titleMesh);

        var canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        var tex = new THREE.CanvasTexture(canvas);
        if (tex.colorSpace !== undefined) {
            tex.colorSpace = THREE.SRGBColorSpace;
        }
        var content = new THREE.Mesh(
            new THREE.PlaneGeometry(worldW, worldH),
            new THREE.MeshBasicMaterial({map: tex, transparent: true})
        );
        content.position.set(0, 0, 0.001);
        // The content plane is a raycast target so a click on a rendered link
        // can be mapped (via the hit uv) to the link under it.
        content.userData = {readerContent: true, interactive: true};
        group.add(content);

        this.reader = {
            group: group, board: board, content: content,
            canvas: canvas, ctx: canvas.getContext('2d'), tex: tex,
            titleCanvas: titleCanvas, titleCtx: titleCanvas.getContext('2d'), titleTex: titleTex,
            W: W, H: H, margin: 56, worldW: worldW, worldH: worldH,
            blocks: [], items: [], images: {}, links: [], contentHeight: 0, scroll: 0,
            chapters: [], chapterid: 0, cmid: null, url: null, name: null,
            buttons: {}, inInteractive: false
        };
        this.buildReaderButtons(worldW, worldH);
        if (this.scene) {
            this.scene.add(group);
        }
        return this.reader;
    };

    /**
     * Build the reader's control buttons (close, scroll up/down, previous/next
     * chapter) as glyph planes carrying a readerAction, positioned around the
     * panel. Chapter buttons start hidden until a book is shown.
     *
     * @param {Number} worldW The content width in metres.
     * @param {Number} worldH The content height in metres.
     */
    Cyberspace.prototype.buildReaderButtons = function(worldW, worldH) {
        var half = worldW / 2;
        var edge = worldH / 2;
        var defs = [
            {action: 'close', glyph: '✕', x: half + 0.02, y: edge + 0.09},
            // Open the real activity page (leaves the immersive session): the
            // only way to start a quiz attempt or make a submission, and a full
            // fallback for pages and books.
            {action: 'open', glyph: '↗', x: -half - 0.02, y: edge + 0.09},
            {action: 'scrollup', glyph: '▲', x: half + 0.02, y: 0.24},
            {action: 'scrolldown', glyph: '▼', x: half + 0.02, y: -0.24},
            {action: 'prevchapter', glyph: '❮', x: -0.28, y: -edge - 0.12},
            {action: 'nextchapter', glyph: '❯', x: 0.28, y: -edge - 0.12}
        ];
        for (var i = 0; i < defs.length; i++) {
            var btn = this.makeReaderButton(defs[i].glyph, defs[i].action);
            btn.position.set(defs[i].x, defs[i].y, 0.004);
            this.reader.group.add(btn);
            this.reader.buttons[defs[i].action] = btn;
        }
    };

    /**
     * A single reader control button: a small rounded glyph plane whose userData
     * carries the action the picker dispatches to readerControl.
     *
     * @param {String} glyph The button glyph.
     * @param {String} action The reader action id.
     * @return {Object} A Three.Mesh.
     */
    Cyberspace.prototype.makeReaderButton = function(glyph, action) {
        var THREE = this.THREE;
        var canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        var ctx = canvas.getContext('2d');
        var accent = this.readerAccent();
        ctx.fillStyle = 'rgba(10,16,26,0.92)';
        this.roundRect(ctx, 6, 6, 116, 116, 22);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = accent;
        this.roundRect(ctx, 6, 6, 116, 116, 22);
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.font = '600 66px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(glyph, 64, 70);
        var tex = new THREE.CanvasTexture(canvas);
        if (tex.colorSpace !== undefined) {
            tex.colorSpace = THREE.SRGBColorSpace;
        }
        var mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(0.16, 0.16),
            new THREE.MeshBasicMaterial({map: tex, transparent: true})
        );
        mesh.userData = {readerAction: action, material: mesh.material, baseColour: 0xffffff, interactive: true};
        return mesh;
    };

    /**
     * The reader's accent colour (the course neon primary) as a CSS hex string.
     *
     * @return {String} A #rrggbb colour.
     */
    Cyberspace.prototype.readerAccent = function() {
        var c = (this.palette && this.palette.primary) || 0x39d0ff;
        return '#' + ('000000' + c.toString(16)).slice(-6);
    };

    /**
     * Draw a rounded rectangle path on a 2D context (path only; the caller fills
     * or strokes it).
     *
     * @param {Object} ctx The 2D context.
     * @param {Number} x Left.
     * @param {Number} y Top.
     * @param {Number} w Width.
     * @param {Number} h Height.
     * @param {Number} rad Corner radius.
     */
    Cyberspace.prototype.roundRect = function(ctx, x, y, w, h, rad) {
        var rr = Math.min(rad, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    };

    /**
     * Show or hide the chapter navigation buttons: only a book with more than
     * one chapter needs them.
     */
    Cyberspace.prototype.updateChapterControls = function() {
        var r = this.reader;
        var many = r.chapters && r.chapters.length > 1;
        if (r.buttons.prevchapter) {
            r.buttons.prevchapter.visible = many;
        }
        if (r.buttons.nextchapter) {
            r.buttons.nextchapter.visible = many;
        }
    };

    /**
     * Draw the reader's title strip.
     *
     * @param {String} title The activity (or chapter) title.
     */
    Cyberspace.prototype.setReaderTitle = function(title) {
        var r = this.reader;
        var ctx = r.titleCtx;
        ctx.clearRect(0, 0, r.W, 90);
        ctx.fillStyle = this.readerAccent();
        ctx.font = '600 46px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        var text = title || '';
        // Trim an over-long title to the strip width.
        while (text && ctx.measureText(text).width > r.W - 40) {
            text = text.slice(0, -2);
        }
        if (text !== (title || '')) {
            text += '…';
        }
        ctx.fillText(text, r.margin, 50);
        r.titleTex.needsUpdate = true;
    };

    /**
     * Place the reader panel about two metres in front of the viewer, at eye
     * level, facing them - so it is comfortable to read and does not follow the
     * head (which would be nauseating).
     */
    Cyberspace.prototype.positionReaderInFront = function() {
        var THREE = this.THREE;
        var r = this.reader;
        var camPos = this.camera.getWorldPosition(new THREE.Vector3());
        var dir = this.camera.getWorldDirection(new THREE.Vector3());
        dir.y = 0;
        if (dir.lengthSq() < 1e-6) {
            dir.set(0, 0, -1);
        }
        dir.normalize();
        var pos = camPos.clone().add(dir.multiplyScalar(2.2));
        pos.y = camPos.y - 0.05;
        r.group.position.copy(pos);
        r.group.lookAt(camPos.x, pos.y, camPos.z);
    };

    /**
     * Add the reader's control buttons to the interactive set so the pointer and
     * XR controllers can click them (once; guarded against duplicates).
     */
    Cyberspace.prototype.addReaderInteractive = function() {
        var r = this.reader;
        if (r.inInteractive) {
            return;
        }
        this.interactive.push(r.content);
        for (var key in r.buttons) {
            if (Object.prototype.hasOwnProperty.call(r.buttons, key)) {
                this.interactive.push(r.buttons[key]);
            }
        }
        r.inInteractive = true;
    };

    /**
     * Remove the reader's control buttons from the interactive set.
     */
    Cyberspace.prototype.removeReaderInteractive = function() {
        var r = this.reader;
        if (!r || !r.inInteractive) {
            return;
        }
        var remove = function(list, obj) {
            var idx = list.indexOf(obj);
            if (idx !== -1) {
                list.splice(idx, 1);
            }
        };
        remove(this.interactive, r.content);
        for (var key in r.buttons) {
            if (Object.prototype.hasOwnProperty.call(r.buttons, key)) {
                remove(this.interactive, r.buttons[key]);
            }
        }
        r.inInteractive = false;
    };

    /**
     * Dispatch a reader control action (from a clicked button).
     *
     * @param {String} action One of close, scrollup, scrolldown, prevchapter,
     *     nextchapter.
     */
    Cyberspace.prototype.readerControl = function(action) {
        if (action === 'close') {
            this.closeReader();
        } else if (action === 'open') {
            // Leave the reader and navigate to the full activity page.
            var url = this.reader && this.reader.url;
            this.readerSeq++;
            this.readerOpen = false;
            if (url) {
                this.open(url);
            }
        } else if (action === 'scrollup') {
            this.scrollReader(-this.readerPageStep());
        } else if (action === 'scrolldown') {
            this.scrollReader(this.readerPageStep());
        } else if (action === 'prevchapter') {
            this.stepChapter(-1);
        } else if (action === 'nextchapter') {
            this.stepChapter(1);
        }
    };

    /**
     * Map a click on the content plane (by its hit uv) to a rendered link, and
     * open that link's target (leaving the immersive session, like the open
     * control). A click that falls on no link does nothing.
     *
     * @param {Object} uv The hit's texture coordinate ({x, y} in 0..1), or null.
     */
    Cyberspace.prototype.readerHitLink = function(uv) {
        var r = this.reader;
        if (!uv || !r) {
            return;
        }
        // The texture's v axis runs bottom-to-top, the canvas y top-to-bottom.
        var px = uv.x * r.W;
        var py = (1 - uv.y) * r.H + r.scroll;
        for (var i = 0; i < r.links.length; i++) {
            var link = r.links[i];
            if (px >= link.x && px <= link.x + link.w && py >= link.y && py <= link.y + link.h) {
                this.readerSeq++;
                this.readerOpen = false;
                this.open(link.href);
                return;
            }
        }
    };

    /**
     * The scroll distance for one page button press (most of a screenful).
     *
     * @return {Number} Pixels.
     */
    Cyberspace.prototype.readerPageStep = function() {
        return this.reader ? this.reader.H * 0.85 : 0;
    };

    /**
     * Scroll the reader content by a pixel delta, clamped to the document, and
     * re-render the visible window.
     *
     * @param {Number} deltaPx The scroll delta in canvas pixels.
     */
    Cyberspace.prototype.scrollReader = function(deltaPx) {
        var r = this.reader;
        if (!r) {
            return;
        }
        var max = Math.max(0, r.contentHeight - r.H);
        r.scroll = Math.max(0, Math.min(max, r.scroll + deltaPx));
        this.renderReaderCanvas();
    };

    /**
     * Move to an adjacent book chapter (by fetching it), if one exists.
     *
     * @param {Number} dir -1 for the previous chapter, +1 for the next.
     */
    Cyberspace.prototype.stepChapter = function(dir) {
        var r = this.reader;
        if (!r || !r.chapters || r.chapters.length < 2) {
            return;
        }
        var idx = -1;
        for (var i = 0; i < r.chapters.length; i++) {
            if (r.chapters[i].id === r.chapterid) {
                idx = i;
                break;
            }
        }
        var target = idx + dir;
        if (target < 0 || target >= r.chapters.length) {
            return;
        }
        this.openReader(r.cmid, r.name, r.url, r.chapters[target].id);
    };

    /**
     * Hide the reader, release its controls and refresh the scene's activity
     * states (reading may have satisfied completion-on-view).
     */
    Cyberspace.prototype.closeReader = function() {
        if (!this.reader) {
            return;
        }
        // Invalidate any in-flight fetch so a late response cannot reopen the
        // panel (success) or navigate away (failure) after the user closed it.
        this.readerSeq++;
        this.reader.group.visible = false;
        this.readerOpen = false;
        this.removeReaderInteractive();
        this.refreshActivityStates();
    };

    /**
     * Lay the content blocks out top to bottom into positioned items (with
     * pre-measured, wrapped lines), recording the total document height. Called
     * on load and whenever an image finishes loading and changes the flow.
     */
    Cyberspace.prototype.layoutReader = function() {
        var r = this.reader;
        var ctx = r.ctx;
        var maxW = r.W - r.margin * 2;
        var y = r.margin;
        r.items = [];
        r.links = [];
        for (var i = 0; i < r.blocks.length; i++) {
            y = this.layoutBlock(ctx, r.blocks[i], y, maxW);
        }
        r.contentHeight = y + r.margin;
    };

    /**
     * Lay out one block, appending its item(s) and returning the next y.
     *
     * @param {Object} ctx The measuring context.
     * @param {Object} block The content block.
     * @param {Number} y The current y (top of this block).
     * @param {Number} maxW The wrap width.
     * @return {Number} The y below this block.
     */
    Cyberspace.prototype.layoutBlock = function(ctx, block, y, maxW) {
        if (block.type === 'image') {
            return this.layoutImage(block, y, maxW);
        }
        var spec = this.readerBlockSpec(block);
        ctx.font = spec.font;
        var indent = block.type === 'listitem' ? 44 : 0;
        var prefix = this.listPrefix(block);
        // A preformatted block keeps its own line breaks and spacing; everything
        // else is wrapped from a whitespace-collapsed word stream.
        var lines = block.pre ? this.preLines(ctx, block)
            : this.wrapReaderWords(ctx, this.readerWords(block), maxW - indent);
        var lineH = Math.round(spec.size * 1.34);
        var itemx = this.reader.margin + indent;
        var itemy = y + spec.above;
        this.reader.items.push({
            kind: 'text', block: block, spec: spec, prefix: prefix,
            x: itemx, y: itemy, lines: lines, lineH: lineH
        });
        this.collectReaderLinks(ctx, lines, itemx, itemy, lineH, spec.size);
        return y + spec.above + lines.length * lineH + spec.below;
    };

    /**
     * Split a preformatted block into physical lines (preserving spacing), each
     * a single unwrapped run, so code and other whitespace-sensitive content is
     * not reflowed.
     *
     * @param {Object} ctx The measuring context (font already set).
     * @param {Object} block The preformatted block.
     * @return {Array} Lines, each an array with one {text, href, w}.
     */
    Cyberspace.prototype.preLines = function(ctx, block) {
        var runs = block.runs || [];
        var text = '';
        for (var i = 0; i < runs.length; i++) {
            text += runs[i].text;
        }
        var raw = text.replace(/\t/g, '    ').split('\n');
        var lines = [];
        for (var l = 0; l < raw.length; l++) {
            lines.push([{text: raw[l], href: null, w: ctx.measureText(raw[l]).width}]);
        }
        return lines.length ? lines : [[]];
    };

    /**
     * Record the document-space hit rectangle of every linked word in a laid-out
     * text item, so a click on the content plane can be mapped to a link.
     *
     * @param {Object} ctx The measuring context (font already set).
     * @param {Array} lines The item's wrapped lines.
     * @param {Number} x0 The item's left x.
     * @param {Number} y0 The item's top y (document space).
     * @param {Number} lineH The line height.
     * @param {Number} size The font size (link box height).
     */
    Cyberspace.prototype.collectReaderLinks = function(ctx, lines, x0, y0, lineH, size) {
        var space = ctx.measureText(' ').width;
        for (var l = 0; l < lines.length; l++) {
            var x = x0;
            var line = lines[l];
            for (var w = 0; w < line.length; w++) {
                if (line[w].href) {
                    this.reader.links.push({
                        x: x, y: y0 + l * lineH, w: line[w].w, h: size, href: line[w].href
                    });
                }
                x += line[w].w + space;
            }
        }
    };

    /**
     * The font, size and vertical spacing for a text block by its type/level.
     *
     * @param {Object} block The content block.
     * @return {Object} {font, size, colour, above, below}.
     */
    Cyberspace.prototype.readerBlockSpec = function(block) {
        var sizes = {'1': 54, '2': 46, '3': 40, '4': 36, '5': 32, '6': 30};
        if (block.type === 'heading') {
            var hs = sizes[block.level] || 34;
            return {font: '700 ' + hs + 'px system-ui, sans-serif', size: hs,
                colour: '#ffffff', above: Math.round(hs * 0.5), below: Math.round(hs * 0.28)};
        }
        if (block.pre) {
            return {font: '26px ui-monospace, monospace', size: 26,
                colour: '#c7d4e0', above: 12, below: 16};
        }
        if (block.quote || block.caption) {
            return {font: 'italic 28px system-ui, sans-serif', size: 28,
                colour: '#aebccb', above: 10, below: 16};
        }
        return {font: '30px system-ui, sans-serif', size: 30,
            colour: '#e6edf3', above: block.type === 'listitem' ? 6 : 12,
            below: block.type === 'listitem' ? 6 : 16};
    };

    /**
     * The bullet or number prefix for a list item.
     *
     * @param {Object} block The content block.
     * @return {String} The prefix (empty for non-list items).
     */
    Cyberspace.prototype.listPrefix = function(block) {
        if (block.type !== 'listitem') {
            return '';
        }
        return block.ordered ? (block.index || 1) + '.' : '•';
    };

    /**
     * Flatten a block's runs (or text) into a word stream, each word carrying
     * any link href so it can be styled.
     *
     * @param {Object} block The content block.
     * @return {Array} Words as {text, href}.
     */
    Cyberspace.prototype.readerWords = function(block) {
        var words = [];
        var runs = block.runs || (block.text ? [{text: block.text}] : []);
        for (var i = 0; i < runs.length; i++) {
            var parts = String(runs[i].text).split(/\s+/);
            for (var p = 0; p < parts.length; p++) {
                if (parts[p] !== '') {
                    words.push({text: parts[p], href: runs[i].href || null});
                }
            }
        }
        return words;
    };

    /**
     * Greedily wrap a word stream to a maximum width, pre-measuring each word so
     * rendering does not measure again.
     *
     * @param {Object} ctx The measuring context (font already set).
     * @param {Array} words Words as {text, href}.
     * @param {Number} maxW The wrap width.
     * @return {Array} Lines, each an array of {text, href, w}.
     */
    Cyberspace.prototype.wrapReaderWords = function(ctx, words, maxW) {
        var lines = [];
        var line = [];
        var width = 0;
        var space = ctx.measureText(' ').width;
        for (var i = 0; i < words.length; i++) {
            var w = ctx.measureText(words[i].text).width;
            var add = (line.length ? space : 0) + w;
            if (line.length && width + add > maxW) {
                lines.push(line);
                line = [];
                width = 0;
                add = w;
            }
            line.push({text: words[i].text, href: words[i].href, w: w});
            width += add;
        }
        if (line.length) {
            lines.push(line);
        }
        return lines.length ? lines : [[]];
    };

    /**
     * Lay out an image block, reserving its (aspect-correct) height and kicking
     * off the load when the pixels are not cached yet.
     *
     * @param {Object} block The image block.
     * @param {Number} y The current y.
     * @param {Number} maxW The available width.
     * @return {Number} The y below the image.
     */
    Cyberspace.prototype.layoutImage = function(block, y, maxW) {
        var cache = this.reader.images[block.src];
        var iw = maxW;
        var ih;
        if (cache && cache.ready) {
            var nat = cache.img;
            var scale = nat.naturalWidth > maxW ? maxW / nat.naturalWidth : 1;
            iw = Math.round(nat.naturalWidth * scale);
            ih = Math.round(nat.naturalHeight * scale);
        } else {
            var ratio = (block.width > 0 && block.height > 0) ? block.height / block.width : 0.6;
            ih = Math.round(maxW * ratio);
            this.loadReaderImage(block.src);
        }
        ih = Math.min(ih, 900);
        this.reader.items.push({
            kind: 'image', src: block.src, alt: block.alt || '',
            x: this.reader.margin + Math.round((maxW - iw) / 2), y: y + 10, w: iw, h: ih
        });
        return y + 10 + ih + 20;
    };

    /**
     * Load an inline image once, then re-layout and re-render so it flows in at
     * its true size. A same-origin image (a Moodle pluginfile) loads with the
     * session cookie and does not taint the canvas; a cross-origin image is
     * requested anonymously (CORS) so drawing it cannot taint the canvas - if
     * the remote host sends no CORS headers the load simply fails and a
     * placeholder is shown instead.
     *
     * @param {String} src The image URL.
     */
    Cyberspace.prototype.loadReaderImage = function(src) {
        var self = this;
        if (!src || this.reader.images[src]) {
            return;
        }
        var entry = {img: null, ready: false};
        this.reader.images[src] = entry;
        if (typeof Image === 'undefined') {
            return;
        }
        var img = new Image();
        entry.img = img;
        if (this.isCrossOrigin(src)) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = function() {
            entry.ready = true;
            if (self.readerOpen) {
                self.layoutReader();
                // A loaded image's true height can differ from the reserved
                // placeholder, so clamp the scroll to the new document bounds
                // before rendering (avoids a gap past the end).
                var max = Math.max(0, self.reader.contentHeight - self.reader.H);
                self.reader.scroll = Math.min(self.reader.scroll, max);
                self.renderReaderCanvas();
            }
        };
        img.onerror = function() {
            // Leave a placeholder in the flow if the image cannot be loaded.
        };
        img.src = src;
    };

    /**
     * Whether a URL points to a different origin than the page (so it must be
     * loaded with CORS to avoid tainting the canvas).
     *
     * @param {String} src The URL.
     * @return {Boolean} True when cross-origin.
     */
    Cyberspace.prototype.isCrossOrigin = function(src) {
        if (/^data:/i.test(src)) {
            return false;
        }
        try {
            return new URL(src, window.location.href).origin !== window.location.origin;
        } catch (e) {
            // A URL that will not parse is treated as cross-origin (safer).
            return true;
        }
    };

    /**
     * Render the visible window of the laid-out document into the content canvas
     * and flag the texture for upload, plus a slim scroll indicator.
     */
    Cyberspace.prototype.renderReaderCanvas = function() {
        var r = this.reader;
        var ctx = r.ctx;
        ctx.fillStyle = '#0b1018';
        ctx.fillRect(0, 0, r.W, r.H);
        var top = r.scroll;
        var bottom = top + r.H;
        for (var i = 0; i < r.items.length; i++) {
            var item = r.items[i];
            var h = item.kind === 'image' ? item.h : item.lines.length * item.lineH;
            if (item.y + h < top || item.y > bottom) {
                continue;
            }
            if (item.kind === 'image') {
                this.drawReaderImage(ctx, item, top);
            } else {
                this.drawReaderText(ctx, item, top);
            }
        }
        this.drawReaderScrollbar(ctx);
        r.tex.needsUpdate = true;
    };

    /**
     * Draw one text item's wrapped lines, styling linked words with the accent
     * colour and an underline.
     *
     * @param {Object} ctx The 2D context.
     * @param {Object} item The laid-out text item.
     * @param {Number} top The scroll offset (document y at the canvas top).
     */
    Cyberspace.prototype.drawReaderText = function(ctx, item, top) {
        ctx.font = item.spec.font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        var accent = this.readerAccent();
        var space = ctx.measureText(' ').width;
        for (var l = 0; l < item.lines.length; l++) {
            var ly = item.y + l * item.lineH - top;
            var x = item.x;
            if (l === 0 && item.prefix) {
                ctx.fillStyle = '#8aa0b4';
                ctx.fillText(item.prefix, item.x - 40, ly);
            }
            var line = item.lines[l];
            for (var wi = 0; wi < line.length; wi++) {
                var word = line[wi];
                ctx.fillStyle = word.href ? accent : item.spec.colour;
                ctx.fillText(word.text, x, ly);
                if (word.href) {
                    var uy = ly + item.spec.size + 2;
                    ctx.fillRect(x, uy, word.w, 2);
                }
                x += word.w + space;
            }
        }
    };

    /**
     * Draw one image item (or a labelled placeholder while it loads or if it
     * failed).
     *
     * @param {Object} ctx The 2D context.
     * @param {Object} item The laid-out image item.
     * @param {Number} top The scroll offset.
     */
    Cyberspace.prototype.drawReaderImage = function(ctx, item, top) {
        var cache = this.reader.images[item.src];
        var y = item.y - top;
        if (cache && cache.ready && cache.img) {
            try {
                ctx.drawImage(cache.img, item.x, y, item.w, item.h);
                return;
            } catch (e) {
                // Fall through to the placeholder if the draw fails.
            }
        }
        ctx.fillStyle = '#111a26';
        ctx.fillRect(item.x, y, item.w, item.h);
        ctx.fillStyle = '#6d8298';
        ctx.font = 'italic 26px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.alt || 'Image', item.x + item.w / 2, y + item.h / 2);
    };

    /**
     * Draw a slim scroll indicator down the right edge when the document is
     * taller than one screen.
     *
     * @param {Object} ctx The 2D context.
     */
    Cyberspace.prototype.drawReaderScrollbar = function(ctx) {
        var r = this.reader;
        if (r.contentHeight <= r.H) {
            return;
        }
        var trackX = r.W - 14;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(trackX, 8, 6, r.H - 16);
        var frac = r.H / r.contentHeight;
        var thumbH = Math.max(40, (r.H - 16) * frac);
        var maxScroll = r.contentHeight - r.H;
        var thumbY = 8 + (r.H - 16 - thumbH) * (maxScroll ? r.scroll / maxScroll : 0);
        ctx.fillStyle = this.readerAccent();
        ctx.fillRect(trackX, thumbY, 6, thumbH);
    };

    /**
     * Per-frame update: locomotion, spinning, flicker, highlighting, rendering.
     */
    Cyberspace.prototype.tick = function() {
        var dt = Math.min(0.05, this.clock.getDelta());
        this.time += dt;
        var presenting = this.renderer.xr.isPresenting;

        // While the on-screen activity panel covers the stage, pause the scene:
        // it is fully hidden, so there is nothing to animate or render. (An
        // immersive session never shows the panel, so it keeps running.)
        if (!presenting && this.activityOverlay && !this.activityOverlay.el.hidden) {
            return;
        }

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

        // Slowly revolve the Void's planet field (one turn per hour).
        this.spinPlanets(dt);

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
        if (this.readerOpen) {
            // While the reader is up, a held trigger interacts with the panel;
            // it must never fly the viewer (the panel body is not interactive).
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
        if (this.hovered && this.hovered.userData.material) {
            this.hovered.scale.setScalar(1);
            this.hovered.userData.material.color.setHex(this.hovered.userData.baseColour);
        }
        this.hovered = mesh;
        if (mesh) {
            // The large reader content plane is interactive (for link hits) but
            // must not be scaled or tinted like a small node/button.
            if (mesh.userData.material) {
                mesh.scale.setScalar(1.12);
                mesh.userData.material.color.setHex(0xffffff);
            }
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
        this.readerScrollSpeed = 1400; // Reader scroll, canvas px per second at full stick.
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

        if (this.cs.readerOpen) {
            // While the reader is up, a thumbstick scrolls it instead of moving
            // the viewer (pushing forward scrolls down through the page).
            if (Math.abs(ctrl.glideZ) > this.deadzone) {
                this.cs.scrollReader(-ctrl.glideZ * this.readerScrollSpeed * dt);
            }
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
            roadTexture: null, groundTexture: null, sidewalkTexture: null,
            spaceTexture: null, planetTextures: [], ringTexture: null
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
        if (config.sidewalktextureurl) {
            jobs.push(loadBoundedTexture(config.sidewalktextureurl, THREE, true, function(tex) {
                assets.sidewalkTexture = tex;
            }));
        }

        // The Void's optional sky and planet maps (equirectangular). Only loaded
        // for the void environment, since nothing else uses them. Planet maps
        // keep their upload order so a given slot stays on the same planet.
        if (config.environment === 'void') {
            if (config.spacetextureurl) {
                jobs.push(loadBoundedTexture(config.spacetextureurl, THREE, false, function(tex) {
                    assets.spaceTexture = tex;
                }));
            }
            var planeturls = config.planettextureurls || [];
            planeturls.forEach(function(url, index) {
                assets.planetTextures[index] = null;
                jobs.push(loadBoundedTexture(url, THREE, false, function(tex) {
                    assets.planetTextures[index] = tex;
                }));
            });
            // Optional ring image (a radial strip) shared by every ringed planet.
            if (config.ringtextureurl) {
                jobs.push(loadBoundedTexture(config.ringtextureurl, THREE, false, function(tex) {
                    assets.ringTexture = tex;
                }));
            }
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

    /**
     * Centre a loaded model at the origin and frame the camera to it, so a
     * model of any size fills its preview square from a pleasant three-quarter
     * angle.
     *
     * @param {Object} THREE The Three.js namespace.
     * @param {Object} model The loaded model group.
     * @param {Object} cam The preview camera.
     */
    function framePreviewModel(THREE, model, cam) {
        var box = new THREE.Box3().setFromObject(model);
        var size = box.getSize(new THREE.Vector3());
        var centre = box.getCenter(new THREE.Vector3());
        model.position.sub(centre);
        var maxdim = Math.max(size.x, size.y, size.z) || 1;
        var dist = (maxdim / 2) / Math.tan((cam.fov * Math.PI / 180) / 2) * 1.7;
        cam.position.set(dist * 0.55, dist * 0.4, dist);
        cam.lookAt(0, 0, 0);
        cam.near = Math.max(0.001, dist / 100);
        cam.far = dist * 12;
        cam.updateProjectionMatrix();
    }

    /**
     * Build and configure a glTF loader for the admin previews from the loaded
     * addon namespace, with the Draco, KTX2/Basis and meshopt decoders. Returns
     * null when the addon loader is unavailable (a strict CSP blocked the import
     * map), so the gallery simply keeps its blank canvases.
     *
     * @param {Object} loaded The loaded Three.js + addon namespace.
     * @param {Object} config The preview config (addonsbaseurl).
     * @param {Object} renderer The shared WebGL renderer (for KTX2 support).
     * @return {Object|null} The loader, or null.
     */
    function buildPreviewLoader(loaded, config, renderer) {
        if (!loaded.GLTFLoader) {
            return null;
        }
        var loader = new loaded.GLTFLoader();
        var base = config.addonsbaseurl;
        if (loaded.DRACOLoader && base) {
            loader.setDRACOLoader(new loaded.DRACOLoader().setDecoderPath(base + 'libs/draco/gltf/'));
        }
        if (loaded.KTX2Loader && base) {
            try {
                loader.setKTX2Loader(
                    new loaded.KTX2Loader().setTranscoderPath(base + 'libs/basis/').detectSupport(renderer)
                );
            } catch (e) {
                // KTX2/Basis unavailable on this GPU; other formats still load.
            }
        }
        if (loaded.MeshoptDecoder) {
            loader.setMeshoptDecoder(loaded.MeshoptDecoder);
        }
        return loader;
    }

    /**
     * Render the admin asset viewer's model previews: load each model, frame it,
     * and spin them all in one animation loop through a single shared WebGL
     * renderer whose output is copied into each card's 2D canvas (so the gallery
     * uses only one WebGL context however many models it shows).
     *
     * @param {Object} config The preview config ({models: [{canvasid, url}], addonsbaseurl}).
     * @param {Object} loaded The loaded Three.js + addon namespace.
     */
    function renderModelPreviews(config, loaded) {
        var THREE = loaded.THREE;
        var models = config.models || [];
        if (!models.length || typeof THREE.WebGLRenderer !== 'function') {
            return;
        }
        var size = 240;
        var renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setPixelRatio(1);
        renderer.setSize(size, size, false);
        var loader = buildPreviewLoader(loaded, config, renderer);
        if (!loader) {
            return;
        }
        var entries = [];
        models.forEach(function(m) {
            var canvas = document.getElementById(m.canvasid);
            if (!canvas) {
                return;
            }
            var scene = new THREE.Scene();
            scene.add(new THREE.AmbientLight(0xffffff, 0.85));
            var key = new THREE.DirectionalLight(0xffffff, 1.1);
            key.position.set(3, 5, 4);
            scene.add(key);
            var cam = new THREE.PerspectiveCamera(40, 1, 0.01, 5000);
            var entry = {ctx: canvas.getContext('2d'), scene: scene, cam: cam, model: null};
            entries.push(entry);
            loader.loadAsync(m.url).then(function(gltf) {
                framePreviewModel(THREE, gltf.scene, cam);
                scene.add(gltf.scene);
                entry.model = gltf.scene;
                return null;
            }).catch(function() {
                // Leave this card's canvas blank if the model cannot be loaded.
            });
        });
        if (!entries.length) {
            return;
        }
        var spin = function() {
            for (var i = 0; i < entries.length; i++) {
                var e = entries[i];
                if (!e.model) {
                    continue;
                }
                e.model.rotation.y += 0.012;
                renderer.render(e.scene, e.cam);
                e.ctx.clearRect(0, 0, size, size);
                e.ctx.drawImage(renderer.domElement, 0, 0, size, size);
            }
            window.requestAnimationFrame(spin);
        };
        window.requestAnimationFrame(spin);
    }

    return {
        // Exposed for the headless tests (tests/webxr): the gesture manager so
        // its input->action mapping can be driven with scripted input, and the
        // scene class so a render harness can screenshot it. Not used by the
        // plugin itself.
        _GestureManager: GestureManager,
        _Cyberspace: Cyberspace,
        _framePreviewModel: framePreviewModel,

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
        },

        /**
         * Entry point for the admin asset viewer (preview.php): render a live,
         * spinning 3D preview of each prop model into its card canvas. Textures
         * are shown by the page as plain images and need no client code, so this
         * only wires up the model previews. Best-effort: if Three.js or the glTF
         * addon loader cannot load, the gallery keeps its labels and links.
         *
         * @param {String} rootid The DOM id of the preview root element.
         */
        initPreview: function(rootid) {
            var root = document.getElementById(rootid);
            if (!root) {
                return;
            }
            var config;
            try {
                config = JSON.parse(root.getAttribute('data-mnemo-preview') || '{}');
            } catch (e) {
                return;
            }
            loadThree(config).then(function(loaded) {
                try {
                    renderModelPreviews(config, loaded);
                } catch (e) {
                    if (window.console) {
                        window.console.error(e);
                    }
                }
                return null;
            }).catch(function() {
                // Three.js could not load; the gallery stays static.
            });
        }
    };
});
