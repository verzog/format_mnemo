# WebXR gesture smoke test

A headless, deterministic smoke test for the XR **gesture manager** in
`amd/src/vr.js`. It drives the *real* `GestureManager` (with the real bundled
Three.js) through scripted controller and hand-tracking input and asserts the
input → action mapping, so the gesture logic can be verified **without a
headset**.

It is a **development-only** tool: nothing here is shipped with the plugin or
loaded at runtime, and it is not part of the Moodle PHP/JS CI matrix.

## What it covers

| Scenario | Asserts |
| --- | --- |
| Deadzone | A small thumbstick nudge is ignored. |
| Glide | Left stick forward moves the rig down its gaze (−Z). |
| Strafe | Left stick right moves the rig +X. |
| Snap turn | One firm right-stick flick = one 30° step, debounced. |
| Brake | An open palm sets the brake and stops glide. |
| Grab | Grip + hand movement pulls the rig the opposite way. |
| Recenter | Both thumbstick clicks return the rig to the avenue mouth. |

It does **not** render or test the visual scene, WebGL, or a live WebXR
session — only the gesture math. On-device testing (Quest, or the
[Immersive Web Emulator](https://github.com/meta-quest/immersive-web-emulator))
is still worth doing to calibrate the feel of the tunable constants at the top
of `GestureManager` (fist/palm distances, snap magnitude, glide speed, vignette
strength).

## How it works

`harness.html` captures the AMD factory from `amd/src/vr.js` (via a tiny
`define` shim), imports the bundled Three.js as an ES module, and exposes a
`window.__mnemoTest` API that builds a fake `Cyberspace` — a real Three.js rig
plus a fake XR surface (scripted `inputSource` gamepads and hand joints). This
is why `amd/src/vr.js` exports `_GestureManager`.

`smoke.mjs` serves the repo over a short-lived local HTTP server (ES-module
imports are blocked from `file://`), opens the harness in headless Chromium
with Playwright, runs each scenario in the page, and exits non-zero on any
failure.

## Running

```sh
cd tests/webxr
npm install
npm test
```

By default it launches Chromium from Playwright's normal location. In an
environment that pre-installs Chromium elsewhere, point at it:

```sh
PW_CHROMIUM=/path/to/chromium npm test
```
