# Mnemo — VR cyberspace course format for Moodle

`format_mnemo` renders a Moodle course as an interactive 3D **cyberpunk city**
inspired by the gestural VR navigation of *Johnny Mnemonic* and the neon skyline
of Night City. The course is a main avenue the learner flies down; each topic is
a neon **side street** branching off it, marked by a glowing gate and a tall
Japanese-style pylon carrying the topic name (and, optionally, an uploaded topic
image). The topic's activities are **buildings and shops** lining both sides of
that street, each rendered in one of Cyberpunk's architectural styles according
to what kind of activity it is. Behind the streets rise corporate **mega-towers**,
**elevated highways** over shadowed vertical slums, and giant **holographic ads**.
Learners explore it on any screen and can **jack in with a WebXR headset** to fly
the streets and reach out to open activities.

Teachers keep the familiar Moodle experience: whenever **editing is turned on**,
the standard 2D section/activity editor is shown, so the course is built exactly
as with any other format. The immersive scene is rendered for learners (editing
off).

---

## Features

- **WebXR / VR headset support** — an *Enter VR* button appears when an
  `immersive-vr` device is available (Quest, other OpenXR headsets via a WebXR
  browser).
- **Gestural navigation** — a single gesture manager maps controller and
  hand-tracking input to movement:
  - **Thumbstick** to glide (head-relative), **right thumbstick left/right**
    to **snap-turn** without physically turning.
  - **Grip / make a fist** to **grab the world** and pull yourself along the
    streets; **open your palm** to brake to a stop.
  - **Pinch** (hand tracking) or **hold the trigger** to glide toward where you
    point; aim at a node and **pinch / trigger** to open it.
  - **Click both thumbsticks** together to recenter at the avenue mouth.
  - A **comfort vignette** narrows your view while you move to reduce motion
    sickness, and controllers **buzz** when a node lights up and when you open
    one.
- **On-screen fallback** — no headset needed. Drag to look, `W`/`S` to fly,
  `A`/`D` to strafe, `R`/`F` (or `Space`) for altitude, and click a node to open
  it. `Shift` to boost.
- **Live course data** — every section becomes a side street; every activity
  becomes a building or shop with a lit signboard colour-coded by state:
  **green = complete**, **palette colour = available**, **red = restricted**.
  Completion and access restrictions are respected per user. A **green floating
  tick** hovers in front of every completed activity, and when you finish one
  from inside the scene its sign recolours and the tick appears **without a page
  reload** (the states are re-fetched when you close an activity). Activities
  that become newly visible — e.g. a restriction that only lifts on reload —
  still need a page refresh to appear.
- **Architectural styles by activity type** — activities are built in the four
  Night-City movements: assessment/serious tools (quiz, assignment, lesson…) as
  cold **Neo-Militarist** corporate towers; social/communication tools (forum,
  chat, wiki…) as bright plastic **Kitsch** shops; content and reference (page,
  book, resource…) as elite **Neo-Kitsch** pavilions; everything else as
  survival-era **Entropist** blocks. Buildings are lit concrete/steel volumes
  with window grids that glow after dark.
- **Day/night cycle** — the scene follows the **Moodle site's clock**: a real
  sun and sky by day (hazy blue, atmospheric depth), warm light at dawn/dusk,
  and a dark, neon- and window-lit skyline at night. The neon signs, holo-ads
  and lit windows intensify as it gets dark.
- **Textured, lived-in surfaces** — buildings use seamless, tileable facades
  with colour, **normal**, **roughness** and **emissive** maps (floor ledges,
  mullions, glass, scratches, rust and water streaks) plus a **trim sheet** of
  greebles (vents, pipes, bolted panels, rooftop units) bolted on for detail.
- **Per-environment backgrounds** — **Cyberspace** is the full city under the
  day/night sky, **Grid** a clean data-plane, and **Void** is deep space: the
  streets float among a starfield, drifting nebulae and lit planets (one
  ringed) under a distant star.
- **Road-constrained movement** — on foot (and gliding) the learner is kept on
  the avenue and side streets; **flying** (rising off the ground) releases the
  constraint so the whole city is free to explore.
- **Cinematic rendering** — filmic **ACES tone mapping**, **sun shadow maps**,
  and a hand-rolled **bloom** pass (threshold + separable blur) make the neon
  glow. Bloom is subtle by day and strong at night. The full post pipeline
  runs on the **on-screen** view; the headset renders directly (tone mapping
  and shadows still apply) so framerate stays comfortable.
- **Authored 3D props** — the streets are dressed with real glTF models: flying
  cars gliding above the avenue, street lamps and road barriers along the kerbs,
  and kiosks at the side-street mouths. They cast the sun shadows and their
  emissive parts glow after dark. Street lamps also carry a real point light, so
  they cast a neon pool with a specular glint on the reflective road, ground and
  sidewalks beneath them (dimmable per lamp with the editor's brightness slider). A compact, self-contained **glTF (`.glb`)
  loader** (built on the bundled Three.js — no add-ons) reads the full common
  scope: node hierarchy, every accessor type, vertex colours and multiple UV
  sets, samplers, alpha modes, and PBR **base-colour / metallic-roughness /
  normal / occlusion / emissive textures** (embedded, data-URI or external),
  plus the emissive-strength and texture-transform extensions.
- **Activity buildings from models** — beyond the procedural styling, an asset
  pack can supply a real building model per activity **type** by including
  `building-<modname>.glb` (e.g. `building-quiz.glb`, `building-forum.glb`,
  `building-page.glb`). Matching activities render that model — fitted to the
  building footprint, keeping their clickable sign — instead of the procedural
  block, so the cityscape reflects what each activity actually is. Any type
  without a model keeps its procedural building.
- **Video activities as screens** — an activity that points at a video is shown
  as a large street-side screen instead of a building, its neon frame carrying
  the activity's state colour. Each screen starts as a neon **poster** (with a ▶)
  so no media loads until the learner acts — protecting privacy and bandwidth.
  Clicking a **direct video file** (a File resource whose main file is a video,
  or a URL ending in `.mp4`/`.webm`/`.ogv`/`.m4v`/`.mov`) loads and **plays it
  in-world** with sound (further clicks toggle play/pause), and records the
  module view so completion-on-view still fires; a file that can't be decoded
  (e.g. cross-origin without CORS) falls back to opening the activity. Clicking a
  **YouTube/Vimeo** screen opens the video. Screen audio pauses when you switch
  to the list view or hide the tab.
- **Open activities without leaving the world** — clicking a building opens the
  activity in a panel layered over the 3D view (its real Moodle page in a frame)
  on desktop, phone and magic-window, so a quiz, assignment or resource is done
  without leaving the scene. **Inside a VR headset** — where the page DOM is
  invisible — a **readable** activity (a **Page**, a **Book**'s chapters, or the
  **intro** of a **Label**, **Quiz** or **Assignment**) instead opens on a
  **native 3D reader panel**: the text is laid out in-world with headings,
  paragraphs, lists, inline links and images, floating about two metres ahead at
  eye level. Scroll it with a **thumbstick** or the on-panel **▲/▼** buttons,
  page through a book with **❮/❯**, and close with **✕** — all by pointing and
  clicking, no headset removal. Opening a readable activity records its view, so
  completion-on-view fires and the completion tick appears live. Anything not
  readable (a quiz *attempt*, an assignment *submission*, an external tool) still
  falls back to navigating to it, since its form controls cannot render in VR.
- **Per-activity building override** — a teacher can attach a specific building
  model to one activity from its **Edit settings** page (a *Cyberspace building
  model* field: a `.glb` file name in the asset pack, or a full URL). It takes
  precedence over the type-based building, so a single quiz can look different
  from the rest.
- **In-view object editor** — teachers (anyone who can edit the course) get an
  **Edit layout** button on the 3D view. Turn it on, click an object to select
  it, then scale it evenly, stretch it by **width, height and depth**, move and
  rotate it with the panel; light-emitting objects also get a **brightness**
  slider. **Save** persists the change so it renders that way for every learner.
  A generated decorative prop (a **street lamp, barrier or kiosk**) can also be
  **deleted** from the panel; it stays gone for the course (topic gates and
  pylons are kept). Activity buildings and video screens save per-activity;
  decorative props (kiosks, lamps, barriers) and the topic gates and pylons save
  per-course by a layout slot (so adding or removing activities later — or, for
  street lamps, changing the street-lighting density — can shift which item a
  saved edit or deletion lands on). Clicking a **road, ground or sidewalk surface** selects
  it and offers a **texture size** control that retiles every strip or plaza of
  that type together, saved per course. A **Snap to grid** toggle aligns edits
  to the grid the city is laid out on, and the alignment grid is shown over the
  scene while editing so buildings and objects can be lined up against it.
  Guarded by the activity-editing capability, so learners never see it.
- **Grid-aligned layout** — the generated city (buildings, streets, props,
  gates and pylons) snaps to a 2-unit grid, so everything lines up consistently
  and edits made with snap-to-grid stay aligned with it.
- **In-view object placer** — teachers get a **Place objects** button: pick a
  prop (street lamp, barrier, kiosk or vehicle) and click a grid square to drop
  it. Placed props are saved per course, appear for every learner, and can be
  moved, scaled, rotated, dimmed or **deleted** with the object editor. They use
  the same bundled or uploaded asset-pack models as the rest of the scene.
- **Raised sidewalks** — slightly raised concrete sidewalks flank the avenue.
  An optional site-wide **sidewalk texture** (URL or upload) dresses their
  walking surface, and its tiling is texture-size editable like the road and
  ground.
- **Bring-your-own asset packs** — swap the bundled props for your own
  CC0/licensed models, either by **uploading `.glb` files straight into Moodle**
  (admin settings) or by pointing the plugin at a **URL** of a hosted pack. Name
  the files `av.glb`, `lamp.glb`, `kiosk.glb` and `barrier.glb`; a missing or
  failed model simply falls back to the procedural scene.
- **Compressed asset support** — models are loaded through Three's `GLTFLoader`
  with the **Draco** and **meshopt** geometry decoders and **KTX2/Basis**
  textures (all bundled with the plugin, served same-origin). So an authored pack
  can be a fraction of its raw size — e.g. a 21 MB model → well under 1 MB with
  Draco. If the decoders can't load (for example a strict Content-Security-Policy
  that blocks the import map), the plugin falls back to its built-in
  uncompressed-glTF parser.
- **Custom sign packs** — give every neon sign a bespoke look: upload (or link)
  a **webfont** for the sign and label text, and an **image** to tint the sign
  frames. Both are optional site-wide settings; without them signs use the
  bundled monospace font and a flat neon frame.
- **Road & ground textures** — tile a surface across the roads and lay a
  textured plaza patch around each building, via optional site-wide upload/URL
  settings with adjustable tiling scale and patch size. Buildings also keep
  clear of scattered street props (no more kiosks dropped on a shopfront).
- **Accessible list view** — a full, semantic list of every section and activity
  is always rendered. It is the no-JavaScript fallback, the graceful-degradation
  path if the 3D scene can't load, and a one-click toggle for anyone who prefers
  it.
- **Topic images** — each section can carry an optional image (uploaded in the
  section's settings) that appears on its street sign.
- **Per-course look** — teachers choose the environment (Cyberspace / Grid /
  Void) and the neon palette (Cyan / Amber / Magenta / Green) in course settings.
- **No framework, self-contained** — the scene is hand-rolled on
  [Three.js](https://threejs.org) with the browser's native WebXR API. Three.js
  is the only third-party dependency; it is **bundled with the plugin**
  (`thirdparty/three.module.min.js`) and loaded as a same-origin ES module, so
  the plugin needs no external CDN. An admin can override the source URL if they
  prefer a shared or newer hosted copy.

## Requirements

- Moodle **5.0** or later (tested on 5.0–5.2).
- A **WebGL**-capable browser for the 3D view (all evergreen browsers).
- For VR: a **WebXR**-capable browser and an `immersive-vr` headset. Hand
  tracking uses the WebXR Hand Input API where the device/browser supports it;
  otherwise motion controllers work with the same point-and-squeeze gesture.

## Installation

1. Copy this directory to `course/format/mnemo` inside your Moodle site so the
   path is `.../course/format/mnemo/version.php`.
2. Visit **Site administration → Notifications** and complete the plugin
   upgrade.
3. (Optional) Configure the plugin under
   **Site administration → Plugins → Course formats → Mnemo (VR cyberspace)**
   (see below).

Alternatively install the ZIP via
**Site administration → Plugins → Install plugins**.

## Using it

1. In a course, open **Settings → Course format** and choose
   **Mnemo (VR cyberspace)**.
2. Pick the **Environment**, **Neon palette** and **Street lighting**.
   Optionally add a **topic image** in each section's settings.
3. With editing **on**, add sections and activities as usual (standard 2D UI).
4. Turn editing **off** to fly through the course. Click **Enter VR** to jack in
   with a headset.

### Controls

| Context | Look / aim | Move | Open a node |
| --- | --- | --- | --- |
| Desktop / mobile | drag | `W`/`S` fly, `A`/`D` strafe, `R`/`F`/`Space` up/down, `Shift` boost | click the node |
| VR headset | head + point the controller/hand | point + **squeeze trigger** or **pinch** and hold to glide | point at the node and **pinch / trigger** |

## Admin settings

Under **Plugins → Course formats → Mnemo (VR cyberspace)**:

- **Three.js module URL** — where the browser loads Three.js from. **Leave blank**
  (the default) to use the copy bundled with the plugin. Set it only to load
  Three.js from a shared or newer hosted copy.
- **Default environment** / **Default neon palette** — the defaults applied to
  newly created courses (teachers can override per course).
- **Default street lighting** — the density of the automatic street lamps that
  line the avenue and side streets at even spacing (with a lamp at each
  side-street corner): Off, Sparse, Normal or Dense. Each course can override it
  (or keep **Site default**), so changing this reaches every course that has not
  set its own. Turning it off leaves teachers free to place their own lamps.
- **Prop asset pack URL** — a URL of a directory of glTF (`.glb`) prop models to
  use instead of the bundled props. **Leave blank** to use the uploaded pack (if
  any) or the plugin's own models. If set, it takes precedence over an upload.
- **Upload prop asset pack** — upload your own `.glb` prop models directly into
  Moodle (served from the plugin's system-context file area) as an alternative to
  hosting them at a URL. Name each file exactly for the prop it replaces:
  - `av.glb` — flying car (glides above the streets as traffic)
  - `lamp.glb` — street lamp (lines the avenue kerbs)
  - `kiosk.glb` — street kiosk (sits at the mouth of each side street)
  - `barrier.glb` — road barrier (lines the avenue kerbs)

  Any prop you don't upload keeps its bundled model; textures may be embedded in
  the `.glb`. Used only when the URL above is blank.
- **Neon sign font URL** / **Upload neon sign font** — give every neon sign and
  label in the scene a custom typeface. Point the URL at a hosted webfont
  (`.woff2`, `.woff`, `.ttf` or `.otf`), or upload one directly into Moodle. The
  URL takes precedence over an upload; **leave both blank** for the bundled
  monospace font. A hosted font must allow cross-origin use (a permissive CORS
  policy) and pass your site's CSP (see the note below).
- **Sign frame texture URL** / **Upload sign frame texture** — tint every neon
  sign frame with an image (e.g. brushed metal or worn plastic) instead of a
  flat glow. Point the URL at a hosted image, or upload one. The URL takes
  precedence over an upload; **leave both blank** for a flat neon frame. The
  activity state colour multiplies over the texture, so signs still read as
  complete/available/restricted.
- **Road texture URL** / **Upload road texture** — tile a surface (e.g. wet
  asphalt) across every road instead of the bundled flat colour. Point the URL
  at a hosted tileable image, or upload one; the URL wins. **Leave both blank**
  to keep the flat wet-asphalt look.
- **Ground texture URL** / **Upload ground texture** — lay a tiled plaza patch
  of a set size around each building (see **Ground patch size**). Point the URL
  at a hosted tileable image, or upload one; the URL wins. **Leave both blank**
  to keep the dark neon floor.
- **Sidewalk texture URL** / **Upload sidewalk texture** — dress the raised
  sidewalks flanking the avenue with a tileable image. Point the URL at a hosted
  image, or upload one; the URL wins. **Leave both blank** to keep the plain
  concrete sidewalks.
- **Road texture scale** / **Ground texture scale** / **Sidewalk texture scale**
  — how many world units each texture tile covers. Larger values stretch the
  texture over more ground (fewer, larger tiles); smaller values repeat it more
  densely. Use these to tune the apparent texture size.
- **Ground patch size** — the size (world units) of the textured patch laid
  around each building. Set to `0` to disable the patches even when a ground
  texture is configured.
- **Space background URL** / **Upload space background** — wrap the **Void**
  environment in your own sky. Supply an **equirectangular (2:1 lat-long)** sky
  or starfield image (URL or upload; the URL wins). **Leave both blank** to keep
  the procedural starfield and nebulae. Only used in the Void.
- **Upload planet textures** — upload up to **nine** equirectangular (2:1
  lat-long) images to use as the surfaces of the Void's planets; each is applied
  to one planet in filename order (so the Void shows as many planets as you
  upload, up to nine). **Leave empty** to keep the procedural banded planets.
  Only used in the Void.

All uploaded textures — road, ground, sidewalk, planet and sky — are downscaled
to a bounded size before reaching the GPU (like the sign texture). The road,
ground and sidewalk textures tile best with a **seamless / tileable** image; the
planet and sky images should be **equirectangular (2:1 lat-long)** maps.

### Preparing a compressed asset pack

Models load through Three's `GLTFLoader` with the bundled Draco, meshopt and
KTX2/Basis decoders, so packs can be **compressed** to a fraction of their raw
size. A quick recipe with [glTF-Transform](https://gltf-transform.dev):

```
# Draco geometry + resized/compressed textures (biggest win):
npx @gltf-transform/cli optimize in.glb av.glb --compress draco

# or meshopt geometry:
npx @gltf-transform/cli meshopt in.glb av.glb
```

Aim for well under ~50k triangles per prop for headset performance. Uncompressed
`.glb` still works too.

### Content Security Policy note

By default the scene loads its bundled Three.js with a dynamic ES-module
`import()` from the **plugin's own (same) origin**, so a typical `script-src
'self'` CSP already allows it — no external origin to allow-list. The compressed
asset loaders are wired up with an **import map** (an inline
`<script type="importmap">`); if your site enforces a strict CSP that blocks
inline scripts, allow it (a nonce or `'unsafe-inline'` for `script-src`) so the
Draco/KTX2/meshopt decoders can load. The Draco and KTX2 decoders also run in
**Web Workers created from `blob:` URLs**, so a strict CSP must additionally
allow `worker-src blob:` (or `child-src blob:` where `worker-src` is
unsupported) — with only `worker-src 'self'`, the import map loads but every
Draco/KTX2 model still fails. Without these allowances the plugin falls back to
its built-in **uncompressed**-glTF parser, so uncompressed packs still work. If
Three.js itself cannot load at all, the plugin falls back to the accessible list
view with a short message.

A sign font, sign/road/ground texture **uploaded into Moodle** is served from
the plugin's own origin, so `font-src 'self'` / `img-src 'self'` already cover
it. If you instead point the **URL** settings at an externally hosted font or
image, a strict CSP must allow that origin (`font-src` for the webfont,
`img-src` for a texture), and the host must send permissive CORS headers. If any
of these assets is blocked or fails to load, the scene simply keeps its bundled
look (monospace font, flat neon frame, flat road and dark floor).

## How it works

| File | Role |
| --- | --- |
| `lib.php` | The `format_mnemo` class: sections, format options, view URLs. |
| `format.php` | Entry point — 2D editor while editing, cyberspace scene otherwise. |
| `classes/output/renderer.php` | Extends the core section renderer; queues the WebXR module. |
| `classes/output/scene.php` | Builds the section/activity graph (JSON for the client + accessible list). |
| `templates/scene.mustache` | Scene container, loading state, and the fallback list. |
| `amd/src/vr.js` | Hand-rolled Three.js + WebXR renderer: the avenue, per-topic side streets, styled activity buildings, and the mega-city skyline. |
| `thirdparty/three.module.min.js` | Bundled Three.js (see Third-party libraries). |
| `thirdparty/jsm/` | Bundled Three.js addons: `GLTFLoader` + Draco/KTX2/meshopt decoders for compressed asset packs. |
| `js/three-esm-loader.js` | Native ES-module shim: imports Three.js and the addon loaders, hands them to `vr.js`. |
| `classes/privacy/provider.php` | Null privacy provider — the plugin stores no personal data. |
| `classes/external/set_transform.php` | Web service backing the in-view editor: saves an activity's scale/position/rotation (capability-checked). |
| `classes/external/set_scene_object.php` | Web service saving a non-activity scene object's transform + brightness per course, by slot key (capability-checked). |
| `classes/external/add_placed_object.php` | Web service placing a decorative prop at a grid-snapped position per course (capability-checked). |
| `classes/external/remove_placed_object.php` | Web service removing a teacher-placed prop and its stored transform (capability-checked). |
| `classes/external/remove_scene_object.php` | Web service hiding a generated prop (lamp/barrier/kiosk) from a course (capability-checked). |
| `db/services.php` | Declares the `format_mnemo_set_transform` and `format_mnemo_set_scene_object` external functions. |
| `settings.php` | Site-wide settings (Three.js URL, prop asset pack URL/upload, sign font & frame texture, road & ground textures, defaults). |
| `models/*.glb` | Bundled original props (flying car, lamp, kiosk, barrier); generated by `tools/gen-models.mjs`. |

The server never renders 3D; it only ships the course graph and the fallback.
All rendering, raycasting and locomotion happen client-side against WebXR.

## Accessibility & privacy

- The immersive scene is a progressive enhancement over a fully accessible,
  keyboard-navigable HTML list that is always present in the page.
- Respects `prefers-reduced-motion` for the loading indicator.
- The plugin stores **no personal data** — it implements the Moodle Privacy API
  null provider (`classes/privacy/provider.php`).

## Development

The AMD module is authored in `amd/src/vr.js` and shipped as the Moodle-built
`amd/build/vr.min.js` (+ source map). After editing the source, rebuild it
inside a full Moodle tree with `grunt amd` and commit both build files.

## Third-party libraries

- **Three.js** `0.160.1` — MIT licence, © Three.js authors,
  <https://threejs.org>. Bundled unmodified at
  `thirdparty/three.module.min.js`; upstream licence at
  `thirdparty/three.js-LICENSE.txt`. Declared in `thirdpartylibs.xml`.

## Licence

GNU GPL v3 or later, matching Moodle — see the file headers.

Copyright © 2026 Vernon Spain.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See <https://www.gnu.org/licenses/> for details.
