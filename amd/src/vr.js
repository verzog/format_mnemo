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
 * Hand-rolled Three.js (no framework) scene that lays out the course sections
 * and activities as neon data-structures in a Johnny Mnemonic style void.
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

    // Neon palettes: [primary, secondary] hex ints.
    var PALETTES = {
        cyan: {primary: 0x00e5ff, secondary: 0x0066ff, sky: 0x02060f},
        amber: {primary: 0xffb300, secondary: 0xff5722, sky: 0x0a0600},
        magenta: {primary: 0xff2bd6, secondary: 0x7c1fff, sky: 0x0a0210},
        green: {primary: 0x39ff14, secondary: 0x00b3a4, sky: 0x00080a}
    };

    // Activity state colours.
    var STATE_COLOURS = {
        complete: 0x39ff14,
        available: null, // Filled from the palette primary at build time.
        restricted: 0xff3b6b
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
        this.dragging = false;
        this.pointerMoved = 0;
        this.lastPointer = {x: 0, y: 0};
        this.tmp = new THREE.Vector3();
        this.pointerNdc = new THREE.Vector2(-2, -2); // Off-screen by default.
        this.clock = new THREE.Clock();

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
            scene.fog = new THREE.FogExp2(this.palette.sky, 0.012);
        }
        this.scene = scene;

        var camera = new THREE.PerspectiveCamera(
            70, this.aspect(), 0.1, 400
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
        this.buildVrButton();
        this.bindDesktopControls();

        window.addEventListener('resize', this.onResize.bind(this));

        // Drive everything from the XR-aware animation loop.
        renderer.setAnimationLoop(this.tick.bind(this));
    };

    Cyberspace.prototype.aspect = function() {
        return (this.root.clientWidth || 1) / (this.root.clientHeight || 480);
    };

    /**
     * Build the neon grid floor, an optional ceiling grid and a starfield.
     */
    Cyberspace.prototype.buildEnvironment = function() {
        var THREE = this.THREE;
        var primary = this.palette.primary;
        var secondary = this.palette.secondary;

        if (this.config.environment !== 'void') {
            var floor = new THREE.GridHelper(400, 160, primary, secondary);
            floor.material.opacity = 0.35;
            floor.material.transparent = true;
            floor.position.y = 0;
            this.scene.add(floor);

            if (this.config.environment === 'cyberspace') {
                var ceiling = new THREE.GridHelper(400, 160, secondary, secondary);
                ceiling.material.opacity = 0.12;
                ceiling.material.transparent = true;
                ceiling.position.y = 40;
                this.scene.add(ceiling);
            }
        }

        // Starfield: cheap Points cloud far out.
        var count = this.config.environment === 'void' ? 900 : 1400;
        var positions = new Float32Array(count * 3);
        for (var i = 0; i < count; i++) {
            var r = 120 + Math.random() * 160;
            var theta = Math.random() * Math.PI * 2;
            var phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        var stars = new THREE.Points(geo, new THREE.PointsMaterial({
            color: primary, size: 0.7, sizeAttenuation: true,
            transparent: true, opacity: 0.7
        }));
        this.scene.add(stars);
    };

    Cyberspace.prototype.buildRaycaster = function() {
        this.raycaster = new this.THREE.Raycaster();
    };

    /**
     * Line both sides of the main street with wireframe neon buildings.
     *
     * @param {Number} roadHalf Half-width of the main street.
     * @param {Number} nearZ The near (entrance) z of the street.
     * @param {Number} farZ The far end z of the street.
     */
    Cyberspace.prototype.buildBuildings = function(roadHalf, nearZ, farZ) {
        var THREE = this.THREE;
        for (var i = 0; i < 60; i++) {
            var side = Math.random() < 0.5 ? -1 : 1;
            var x = side * (roadHalf + 3 + Math.random() * 22);
            var z = nearZ - Math.random() * (nearZ - farZ);
            var hgt = 6 + Math.random() * 26;
            var w = 3 + Math.random() * 5;
            var d = 3 + Math.random() * 5;
            var colour = Math.random() < 0.5 ? this.palette.primary : this.palette.secondary;
            var box = new THREE.Mesh(
                new THREE.BoxGeometry(w, hgt, d),
                new THREE.MeshBasicMaterial({
                    color: colour, wireframe: true, transparent: true, opacity: 0.28
                })
            );
            box.position.set(x, hgt / 2, z);
            this.scene.add(box);
        }
    };

    /**
     * Build the cyberpunk city: a main street the learner flies down, lined
     * with buildings, with each topic branching off as a side street whose big
     * neon sign stands at the corner and whose activities are signs down the
     * branch.
     */
    Cyberspace.prototype.buildCity = function() {
        var THREE = this.THREE;
        var sections = this.config.sections || [];
        var self = this;

        // Start at the mouth of the street, looking down it (-Z).
        this.player.position.set(0, 0, 12);

        var roadHalf = 4.5;
        var spacing = 16;
        var startZ = -16;
        var endZ = startZ - Math.max(1, sections.length) * spacing - 8;

        // Road surface with glowing edge lines.
        var road = new THREE.Mesh(
            new THREE.PlaneGeometry(roadHalf * 2, 12 - endZ),
            new THREE.MeshBasicMaterial({color: 0x04060c, transparent: true, opacity: 0.85})
        );
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, 0.02, (12 + endZ) / 2);
        this.scene.add(road);
        [-roadHalf, roadHalf].forEach(function(x) {
            var geo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(x, 0.05, 12),
                new THREE.Vector3(x, 0.05, endZ)
            ]);
            self.scene.add(new THREE.Line(
                geo, new THREE.LineBasicMaterial({color: self.palette.primary})
            ));
        });

        this.buildBuildings(roadHalf, 12, endZ);

        sections.forEach(function(section, i) {
            var z = startZ - i * spacing;
            var side = (i % 2 === 0) ? -1 : 1;
            var cornerX = side * roadHalf;

            // Big topic sign at the corner, facing back up the street.
            var topic = self.makeSign({
                text: section.name,
                colour: section.current ? 0xffffff : self.palette.primary,
                width: 6,
                height: 3.4,
                imageurl: section.image || null
            });
            topic.group.position.set(side * (roadHalf + 1.2), 3.4, z);
            topic.group.lookAt(side * (roadHalf + 1.2), 3.4, z + 10);
            self.scene.add(topic.group);

            // Activities recede outward as signs down the branch.
            (section.activities || []).forEach(function(act, k) {
                var ax = side * (roadHalf + 3.5 + k * 3.4);
                var az = z + (k % 2 === 0 ? -1.6 : 1.6);
                var sign = self.makeSign({
                    text: act.name,
                    colour: STATE_COLOURS[act.state] || STATE_COLOURS.available,
                    width: 2.8,
                    height: 1.5,
                    url: act.url
                });
                sign.group.position.set(ax, 2.3, az);
                sign.group.lookAt(cornerX, 2.3, z);
                self.scene.add(sign.group);
            });
        });
    };

    /**
     * Build a neon street sign: a dark panel with a glowing frame, the text,
     * an optional image, and a support post. Interactive signs (with a url)
     * are registered for raycasting.
     *
     * @param {Object} opts {text, colour, width, height, imageurl?, url?}
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

        // Optional topic image occupies the upper part of the panel.
        var hasimage = !!opts.imageurl;
        if (hasimage) {
            var imgH = h * 0.55;
            var imgMat = new THREE.MeshBasicMaterial({
                color: 0xffffff, transparent: true, opacity: 0
            });
            var img = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, imgH), imgMat);
            img.position.set(0, h * 0.5 - imgH * 0.5 - 0.15, 0.03);
            panel.add(img);
            new THREE.TextureLoader().load(opts.imageurl, function(tex) {
                if (tex.colorSpace !== undefined) {
                    tex.colorSpace = THREE.SRGBColorSpace;
                }
                imgMat.map = tex;
                imgMat.opacity = 1;
                imgMat.needsUpdate = true;
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

        // Support post down to the ground.
        var post = new THREE.Mesh(
            new THREE.BoxGeometry(0.12, 24, 0.12),
            new THREE.MeshBasicMaterial({color: opts.colour, transparent: true, opacity: 0.5})
        );
        post.position.set(0, -h / 2 - 12, -0.05);
        frame.add(post);

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
            // Squeeze acts as an explicit "thrust" for controllers that map it.
            controller.addEventListener('squeezestart', function(e) {
                e.target.userData.selecting = true;
            });
            controller.addEventListener('squeezeend', function(e) {
                e.target.userData.selecting = false;
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
                self.yaw -= dx * 0.0032;
                self.pitch -= dy * 0.0032;
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
     * Per-frame update: locomotion, spinning, highlighting, rendering.
     */
    Cyberspace.prototype.tick = function() {
        var dt = Math.min(0.05, this.clock.getDelta());
        var presenting = this.renderer.xr.isPresenting;

        // Spin the data structures.
        if (this.spinners) {
            for (var i = 0; i < this.spinners.length; i++) {
                this.spinners[i].rotation.y += this.spinners[i].userData.spin * dt;
                this.spinners[i].rotation.x += this.spinners[i].userData.spin * 0.4 * dt;
            }
        }

        if (presenting) {
            this.updateXrLocomotion(dt);
            this.updateXrHighlight();
        } else {
            this.updateDesktop(dt);
            this.updateDesktopHighlight();
        }

        this.renderer.render(this.scene, this.camera);
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
