# Presenter-mode gesture spec (draft for sign-off)

Status: **SIGNED OFF** — all decisions (A–E) locked; implementation to follow.
Scope: the teacher "presenter mode" camera navigation in `format_mnemo`,
driven by the MediaPipe **PoseLandmarker** (`BodyPose` in `amd/src/vr.js`).
Goal: replace the current gesture set with controls that are *physically
obvious* to a teacher at a lectern, while staying within what the body-pose
camera can actually detect.

Open decisions needing your call are marked **⭐ DECISION**.

---

## 1. Principles

1. **Rest = stop.** Arms down / normal standing = no movement. The presenter
   must be able to talk and gesture naturally without flying the scene.
2. **Body-scale only.** Every control uses whole-arm position, shoulders, or
   stepping — never fingers, palm facing, or a fist (the camera cannot see
   those at lectern distance; see §2).
3. **One axis per control.** Controls are separated so the camera never has to
   choose between two similar poses. No two "move" gestures look alike.
4. **Analog where natural.** Forward speed and climb are proportional (lean
   a little = drift; reach right out = fast), not on/off.
5. **Momentary, spring-back.** Dropping the arms returns every axis to zero, so
   fatigue never means "stuck flying."
6. **Accessible add-on, never the only path.** Keyboard/motion navigation and
   the plain list view stay as equal ways to use the course (§9).

---

## 2. What the camera can and cannot see

Presenter mode uses the **body** model (33 landmarks: head, shoulders 11/12,
elbows 13/14, wrists 15/16, hips 23/24, …) on a lectern webcam a few metres
away.

- **Detectable:** which way the shoulders face (steer), where each whole arm is
  (down / forward / up / out to the side), how far an arm is extended, stepping
  toward or away from the camera, one arm raised vs both.
- **NOT detectable at this distance:** flat palm vs fist, which way a palm
  faces, a "finger gun", individual finger or thumb movement. These are from
  the *hand* model used by the other (close-up) control mode and do not resolve
  on a presenter metres away.

Everything below is therefore expressed as **whole-arm** conditions.

---

## 3. Coordinate & calibration model

- Landmarks are normalised 0..1 in the camera's own (unmirrored) image; `x`
  right, `y` down, `z` depth (negative = nearer the camera). `z` is estimated
  from a single camera and is **noisy**, so it is only used with wide deadzones.
- **Shoulder width** `W` = distance between shoulders (11,12). Used as the unit
  of measure for every threshold, so the controls are distance-independent
  (a presenter who steps closer is not read as "arms out").
- **Calibration:** the first ~1.5 s of tracking records the presenter's neutral
  stance (shoulder width, shoulder twist, wrist rest height). All thresholds are
  measured **from neutral**, and re-calibrate on presenter change. An on-screen
  "stand normally for a second" cue covers this (§8).
- **Confidence gate:** a landmark is used only when its visibility ≥ 0.5; a
  control whose landmarks are not confidently seen reads as neutral (stop),
  never as a random command.

---

## 4. The control set

Each control lists: the **intent**, the **body condition**, the **mapping**
(analog or toggle), and the **deadzone/threshold**. Thresholds are starting
values to tune on a trial run.

### 4.1 Steer (look / turn) — shoulders
- **Intent:** turn the view left/right; works on its own *and* while flying.
- **Condition:** shoulder twist = normalised depth difference between the two
  shoulders (turning to your right sends the right shoulder back).
- **Mapping:** analog yaw rate. Twist beyond the deadzone turns faster the more
  you twist, up to a cap.
- **Deadzone/threshold:** ignore |twist| < **0.12 W**; full turn rate at
  **0.50 W** (current `turnDead`/`turnFull`). Yaw rate cap ≈ 60°/s.
- **Notes:** this is the single steering control for both standing and flying —
  "where my shoulders face is where I go." Replaces the separate "steer while
  moving" idea.

### 4.2 Forward throttle — both arms reached forward
- **Intent:** fly toward the screen; further reach = faster.
- **Condition:** **both** wrists forward of the shoulders (wrist `z` nearer the
  camera than shoulder `z`) **and** at roughly chest/shoulder height (not up,
  not down). Extension measured as wrist-forward distance ÷ W.
- **Mapping:** analog forward speed, 0 → max as reach goes from the deadzone to
  "arms straight out".
- **Deadzone/threshold:** start moving at reach > **0.15 W**; full speed at
  **0.6 W** (≈ arms straight). Spring back to 0 when arms drop.
- **Conflict guard:** requires **two** arms forward. **One** arm raised is
  pointing (§4.6), not forward.

### 4.3 Vertical arm axis — forward ↔ climb  ✅ LOCKED (Decision A, Option 1)
- **Intent:** one smooth "arm-height dial" controls forward flight and climbing.
- **The dial (how high both arms are held):**
  - arms **down** = stop (rest);
  - arms **out in front** (about horizontal) = fly forward;
  - arms **up overhead** = climb straight up;
  - arms **in between** (raised but still reaching forward) = forward **and**
    climb, blended smoothly.
- **Condition (landmarks):** both wrists tracked; the forward↔climb blend comes
  from wrist height relative to the shoulders (at shoulder height = forward; at/
  above the head line = climb), with the forward amount also scaled by reach
  (§4.2). Climb caps at the presenter ceiling (currently 60 units).
- **Why:** "up and forward" needs no gesture of its own — it is simply the
  midpoint of the dial, and no two move-poses look alike to the camera.
- **Trade-off (accepted):** you cannot hold both arms high and still fly
  dead-level; arm height always mixes in some climb. Fine for flying through a
  course.

### 4.4 Reverse / descend
- **Intent:** back away a little.
- **Problem with "step back" (your note):** physically stepping backward is
  limited by the stage and the camera's view — a long reverse walks the
  presenter off their mark and out of frame, and tracking is lost. So reverse
  must work **standing in place**.
- ⭐ **DECISION B — which in-place reverse gesture?**
  - *Option 1 (now recommended): pull both hands in.* The opposite of reaching
    forward — draw both hands back toward the waist (elbows drawn back), done
    standing still, so stage position and framing never change. Pull further =
    reverse faster; release to stop. Kept **low at the waist** (not the chest)
    so it never looks like "arms crossed = pause" (§4.5).
  - *Option 2: step back* (shoulders narrower). Simple, but limited by physical
    space and loses tracking on a long reverse — your point. Keep only as a
    gentle, very-short nudge, if at all.
  - *Dropped: "arms raised and pulled back by the head"* — too close to climb.
- **You rarely need to fly far backward:** the natural way to travel back is to
  **turn around (steer) and fly forward**, exactly as in a game. So reverse only
  needs to be a short "back off a step", not a fast long-haul control — which
  also makes the in-place pull-back gesture perfectly sufficient.
- **Descend:** lowering both arms below the forward position sinks gently toward
  neutral. Settled: no separate "come down" gesture — lowering the arms is enough.

### 4.5 Stop / pause / resume
- **Stop (continuous):** the **rest state** — arms down, standing normally.
  There is no "stop gesture"; stopping is simply not commanding a move. This
  replaces "right-hand fist".
- **Pause/resume (latch):** **arms crossed over the chest**, held ~0.5 s,
  toggles a hold so the presenter can walk around, point at the room, and
  gesture while talking without moving the scene. (Keeps current behaviour.)

### 4.6 Point & interact — one arm raised + dwell
- **Intent:** aim at a building/sign and open that activity.
- **Condition:** **one** hand raised above that shoulder (the other arm down).
  A pointer dot follows the raised hand across the screen; the scene holds still
  while pointing.
- **Interact:** **dwell** — hold the pointer on a sign ~1.5 s to open it
  (current `presenterDwell`). This replaces "finger gun + thumb", which the
  camera can't see.
- ✅ **Interact = dwell only (Decision C, LOCKED).** Calmest and most reliable;
  no "push to click" (a forward jab is too easy to trigger by accident).
- ✅ **Either hand (Decision D, LOCKED).** Pointing works with the left or right
  hand, for left-handers.

### 4.7 Summary table

| Control | Body condition | Type |
|---|---|---|
| Steer | Shoulder twist L/R | Analog yaw |
| Forward | Both arms reached forward (chest height) | Analog speed |
| Climb | Arms raised — forward↔climb dial (Decision A, locked) | Analog rise |
| Reverse | Pull both hands in to the waist (Decision B) | Analog |
| Pause/resume | Arms crossed, held 0.5 s | Toggle |
| Point | One arm raised, pointer follows | Positional |
| Interact | Dwell 1.5 s on a sign (Decision C) | Trigger |
| Stop | Arms down (rest state) | Default |

---

## 5. Gesture-space diagram (how the poses stay separate)

```
            arms UP ............... CLIMB
               |
   one arm up  |  = POINT (scene holds)
               |
   arms FWD ...|............... FORWARD (faster the further out)
               |
   arms DOWN ..|............... STOP (rest)
               |
   pull both hands in to waist  = REVERSE (in place)
   shoulders twisted L/R        = STEER (any time)
   arms crossed (0.5s)          = PAUSE/RESUME
```
No two move-poses occupy the same arm position, so the camera never guesses.

---

## 6. Multi-person & follow rules (keep current behaviour)
- Follow the person whose shoulders look widest (closest to camera).
- Someone else must look clearly closer (×1.25) for ~1 s to take over.
- A brief drop-out (≤1 s) keeps the current presenter; longer forgets them and
  re-calibrates on the next person.

---

## 7. Feel / tuning defaults (one place to adjust)
| Name | Default | Meaning |
|---|---|---|
| calibTime | 1.5 s | Neutral-stance capture |
| leanDead / leanFull | 0.06 / 0.30 W | Step reverse deadzone / full |
| reachDead / reachFull | 0.15 / 0.60 W | Forward throttle deadzone / full (new) |
| turnDead / turnFull | 0.12 / 0.50 W | Steer deadzone / full |
| climbEnter | head line | Both wrists above → rise |
| crossHold | 0.5 s | Pause latch |
| dwell | 1.5 s | Interact |
| yaw cap | ~60°/s | Max turn rate |
| presenterCeiling | 60 | Max altitude |

---

## 8. On-screen feedback & calibration UX
- **Calibration cue:** on entering presenter mode, a short "stand normally"
  prompt while neutral is captured.
- **Live indicator:** a small, non-intrusive HUD showing the detected state
  (stop / forward+bar / climb / steer arrow / pointing / paused) and a speed
  bar, so the presenter learns the mapping and sees when a gesture registers.
- **Lost-tracking cue:** a gentle "step into view" when no body is seen
  (motion halts meanwhile — never drifts).

---

## 9. Accessibility & fallback (non-negotiable)
- Presenter mode is an **enhancement**. The keyboard/motion camera and the
  accessible **list view** remain fully functional and equal.
- All point/stop controls work with **either** hand (Decision D).
- Nothing here changes the learner (non-presenter) experience.
- ✅ **Reduced-gesture profile (Decision E, LOCKED).** A mode that needs only
  *one* arm + steering (no two-arm raises), for presenters who can't raise both
  arms. May land as a fast-follow if it risks delaying the main work.

---

## 10. Out of scope (confirm)
- Finger/palm/thumb gestures (not detectable here).
- Changing the close-up hand/face control mode (separate feature).
- Leg/lower-body gestures (a lectern webcam rarely sees them).

---

## 11. Implementation & test notes (after sign-off)
- Changes are in `amd/src/vr.js` (`BodyPose.features/update` + the nav mapping):
  a **grunt rebuild** of `amd/build/` is required, committed with the src.
- New/updated **PHPUnit-style JS unit tests** for `BodyPose` (pure landmarks-in,
  intent-out) covering each control's deadzone, the forward/one-arm-point
  conflict guard, and the vertical-axis blend.
- Bump `version.php`.
- Ship as its own branch/PR, one concern.
- Update the presenter-mode help string / any lang strings describing controls.

---

## 12. Decisions checklist (for our review)
- [x] **A** — Vertical arm-height dial (forward↔climb). ✅ LOCKED. (§4.3)
- [x] **B** — In-place reverse: pull both hands in to the waist. ✅ LOCKED. (§4.4)
- [x] **C** — Interact = dwell only. ✅ LOCKED. (§4.6)
- [x] **D** — Point works with either hand. ✅ LOCKED. (§4.6)
- [x] **E** — One-arm reduced-gesture accessibility profile included. ✅ LOCKED. (§9)
- [x] **Descend** — no separate control; lowering the arms is enough. ✅ LOCKED. (§4.4)
- [x] Thresholds in §7 accepted as starting points, to tune on a trial run.

**All decisions signed off. Spec is locked for implementation.**
