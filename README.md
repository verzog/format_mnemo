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
- **Gestural navigation** — point where you want to go and **pinch** (hand
  tracking) or **squeeze / hold the trigger** to glide through the data-space.
  Point at a node and pinch to open it.
- **On-screen fallback** — no headset needed. Drag to look, `W`/`S` to fly,
  `A`/`D` to strafe, `R`/`F` (or `Space`) for altitude, and click a node to open
  it. `Shift` to boost.
- **Live course data** — every section becomes a side street; every activity
  becomes a building or shop with a lit signboard colour-coded by state:
  **green = complete**, **palette colour = available**, **red = restricted**.
  Completion and access restrictions are respected per user.
- **Architectural styles by activity type** — activities are built in the four
  Night-City movements: assessment/serious tools (quiz, assignment, lesson…) as
  cold **Neo-Militarist** corporate towers; social/communication tools (forum,
  chat, wiki…) as bright plastic **Kitsch** shops; content and reference (page,
  book, resource…) as elite **Neo-Kitsch** pavilions; everything else as
  survival-era **Entropist** blocks.
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
2. Pick the **Environment** and **Neon palette**. Optionally add a **topic
   image** in each section's settings.
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

### Content Security Policy note

By default the scene loads its bundled Three.js with a dynamic ES-module
`import()` from the **plugin's own (same) origin**, so a typical `script-src
'self'` CSP already allows it — no external origin to allow-list. If you override
the module URL to an external host, allow that origin in `script-src`. If the
module cannot load for any reason, the plugin automatically falls back to the
accessible list view and shows a short message.

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
| `classes/privacy/provider.php` | Null privacy provider — the plugin stores no personal data. |
| `settings.php` | Site-wide settings (Three.js URL, defaults). |

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
