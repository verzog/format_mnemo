# Mnemo — VR cyberspace course format for Moodle

`format_mnemo` renders a Moodle course as an interactive 3D cyberspace inspired
by the gestural VR navigation of *Johnny Mnemonic*. Sections and activities
float as neon **data-structures** in a dark grid void. Learners fly through
them on any screen and can **jack in with a WebXR headset** to explore the
course spatially and navigate with their hands.

Teachers keep the familiar Moodle experience: whenever **editing is turned on**,
the standard 2D section/activity editor is shown, so the course is built exactly
as with any other format. The immersive scene is rendered for learners (editing
off).

---

## Features

- **WebXR / VR headset support** — an *Enter VR* button appears when an
  `immersive-vr` device is available (Quest, other OpenXR headsets via a WebXR
  browser).
- **Gestural navigation** — point where you want to go and **pinch** (hand
  tracking) or **squeeze / hold the trigger** to glide through the data-space.
  Point at a node and pinch to open it.
- **On-screen fallback** — no headset needed. Drag to look, `W`/`S` to fly,
  `A`/`D` to strafe, `R`/`F` (or `Space`) for altitude, and click a node to open
  it. `Shift` to boost.
- **Live course data** — every section becomes a node; every activity becomes a
  glowing octahedron colour-coded by state: **green = complete**,
  **palette colour = available**, **red = restricted**. Completion and access
  restrictions are respected per user.
- **Accessible list view** — a full, semantic list of every section and activity
  is always rendered. It is the no-JavaScript fallback, the graceful-degradation
  path if the 3D scene can't load, and a one-click toggle for anyone who prefers
  it.
- **Per-course look** — teachers choose the environment (Cyberspace / Grid /
  Void), the neon palette (Cyan / Amber / Magenta / Green), and the node layout
  (Ring around the learner / City grid / Ascending spiral) in course settings.
- **No framework** — the scene is hand-rolled on [Three.js](https://threejs.org)
  with the browser's native WebXR API. Three.js is the only third-party
  dependency and it is loaded as an ES module from an admin-configurable URL.

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
2. Pick the **Environment**, **Neon palette** and **Node layout**.
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

- **Three.js module URL** — where the browser loads Three.js from. Defaults to a
  public CDN (jsDelivr). For **offline / air-gapped** sites, or to satisfy a
  strict **Content Security Policy**, host `three.module.min.js` yourself and put
  its URL here.
- **Default environment** / **Default neon palette** — the defaults applied to
  newly created courses (teachers can override per course).

### Content Security Policy note

The scene loads Three.js with a dynamic ES-module `import()` from the configured
URL. If your site sets a CSP, allow that origin in `script-src`
(the default is `https://cdn.jsdelivr.net`), or host Three.js on your own domain
and point the setting at it. If the module cannot load, the plugin automatically
falls back to the accessible list view and shows a short message.

## How it works

| File | Role |
| --- | --- |
| `lib.php` | The `format_mnemo` class: sections, format options, view URLs. |
| `format.php` | Entry point — 2D editor while editing, cyberspace scene otherwise. |
| `classes/output/renderer.php` | Extends the core section renderer; queues the WebXR module. |
| `classes/output/scene.php` | Builds the section/activity graph (JSON for the client + accessible list). |
| `templates/scene.mustache` | Scene container, loading state, and the fallback list. |
| `amd/src/vr.js` | Hand-rolled Three.js + WebXR renderer with gestural navigation. |
| `settings.php` | Site-wide settings (Three.js URL, defaults). |

The server never renders 3D; it only ships the course graph and the fallback.
All rendering, raycasting and locomotion happen client-side against WebXR.

## Accessibility & privacy

- The immersive scene is a progressive enhancement over a fully accessible,
  keyboard-navigable HTML list that is always present in the page.
- Respects `prefers-reduced-motion` for the loading indicator.
- The plugin stores **no personal data** (see `privacy` provider string).

## Development

The AMD module is authored in `amd/src/vr.js` and shipped minified in
`amd/build/vr.min.js`. Inside a full Moodle tree you can rebuild it with the
standard `grunt amd` task; the committed build was produced with Terser and is
functionally identical to the source.

## Licence

GNU GPL v3 or later, matching Moodle.
