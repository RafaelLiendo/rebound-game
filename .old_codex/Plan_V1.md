# Plan: Permeation Buoyancy 2D Platformer Demo

## Context

Build a single-file, browser-playable 2D platformer demo around a "Permeation
Buoyancy" mechanic inspired by Mirio Togata. Holding Shift makes the character
intangible and a water-like medium pulls them down through terrain (drag plus
a gentle pull toward the contiguous mass's vertical center, not free-fall);
releasing Shift while the player's **bottom half** is overlapping solid matter
triggers a Rebound that accelerates them upward like a buoyant ball rising to
the surface — speed builds while still embedded, peaking near the surface,
rather than ejecting at full speed instantly. If only the top half overlaps on
release, no rebound fires; the player keeps permeating until the body is fully
clear, then returns to solid. Fully-enclosed cases (no upward exit within the
search radius) trigger a "stuck" failure state.

The deliverable is one `index.html` file with no external dependencies that
opens directly in any modern browser (no server, no build step, no modules).
Target file is `C:\Users\rafae\source\games\index.html`.

The challenge is in two places: (a) getting the rebound penetration math right
in multi-tile-thick blocks, and (b) Celeste-grade movement feel (coyote time,
jump buffer, variable jump) in a single tight script.

---

## Scope

**Two puzzle beats**, both teaching the permeation mechanic:

- **Beat 1 — "drop through"** (tutorial, optional, near spawn). A 1-tile thin
  floor the player can stand on; holding Shift drops them through to the floor
  below. Discoverable, not gating.
- **Beat 2 — "deep-dive rocket"** (main puzzle). A thick 5-tile-deep block.
  Player dives in (Shift), releases deep inside, the rebound rockets them up
  to a high ledge that's unreachable by jumping. While airborne the player
  holds Right to drift onto the landing ledge offset to the side.

A third beat (sideways-permeation through a wall) is intentionally out of
scope — see "Why two beats, not three" below — but is the primary candidate
for a follow-up extension.

---

## Design Decisions (locked in; no clarifying questions)

### Mechanics

1. **Rebound trigger and direction** — On Shift release, the rebound fires
   only if the player's **bottom half** is overlapping solid matter; specifically,
   if any solid tile overlaps the rect `(rect.x, rect.y + rect.h/2, rect.w, rect.h/2)`.
   If only the top half overlaps (e.g. the player has just permeated almost all
   the way through and only their head is still in the block), the rebound is
   suppressed and the player continues to permeate until fully clear, then
   transitions back to `solid`. When the rebound does fire, the exit direction
   is **always up** — no cardinal selection, no horizontal or downward rebounds.
   This rules out the previous edge-case rebounds (sideways out of a thin sliver
   of overlap, or downward out of an overhang) that broke immersion. The
   `UP_BIAS` constant is therefore removed.

   The "bottom half overlaps" rule is what gates the rebound: the player's belly
   is the buoyant part, the player's head poking out of solid is just "almost
   surfaced." Stuck detection still applies: if `countSolidRowsAbove(rect) >
   STUCK_SEARCH_RADIUS` (see §3), the rebound resolves to `stuck` instead.

2. **Rebound feel — buoyancy force, not instant ejection.** On rebound trigger
   the player's `vy` is **set to 0** (not to a launch velocity). The state
   becomes `rebounding`, and **on subsequent fixed steps** while the player is
   still overlapping the contiguous solid mass, every step applies an upward
   buoyancy acceleration `BUOYANCY_ACCEL` instead of gravity. The trigger step
   itself does not apply buoyancy — `vy` stays at 0 for one step (see §10).
   Vertical speed is clamped at `BUOYANCY_MAX_SPEED` so the player doesn't
   accelerate forever in very deep blocks. The moment the player's rect no
   longer overlaps any solid (i.e. they have surfaced), the buoyancy force ends
   and gravity resumes; the velocity they had at the surface carries them up
   ballistically and they fall back under normal physics.

   This produces the "lighter ball released from underwater" feel: speed builds
   *while embedded*, peaks at the surface, then decays under gravity. Deeper
   dives mean more time spent accelerating, so depth still translates into
   apex height — but emergently, not via a `lerp(min, max, depth)` curve. The
   former `REBOUND_MIN_SPEED` / `REBOUND_MAX_SPEED` / `REBOUND_MAX_DEPTH_TILES`
   constants are removed; the new `BUOYANCY_ACCEL` and `BUOYANCY_MAX_SPEED`
   replace them. Tuning target: a 5-tile-deep dive produces an apex roughly
   matching the previous demo's high-ledge clear; verify in smoke tests.

3. **Stuck detection** — Since the rebound only ever exits upward, stuck
   reduces to a single upward count: starting from the **first solid row in
   the player's column lane that the player overlaps**, walk upward and count
   contiguous solid rows. If the count exceeds `STUCK_SEARCH_RADIUS` (6 tiles),
   declare stuck. The walk must start from the first overlapped row, *not*
   from the top of the contiguous mass — counting from the top would mean
   walking immediately into empty space and reporting 0, never declaring
   stuck. See `countSolidRowsAbove` in the rebound math section.

4. **Coyote time and jump buffer** both = 6 frames @ 60Hz (0.1s). Standard
   Celeste defaults.

5. **Variable jump** = velocity cap on Space-release. When Space is released
   during upward motion, clamp `vy` to `JUMP_CUT_VELOCITY` (-3.5 px/frame).
   Cleaner than scaling. Like all edge-triggered velocity changes (jump press,
   jump cut, rebound trigger), the new value is left untouched for the
   *remainder of that step* — gravity, buoyancy, and other vertical forces
   apply starting on the following fixed step. See §10 below.

6. **Rebound air control** — horizontal accel halved during the rebound state,
   horizontal speed uncapped (so launch + drift can carry past `MAX_RUN_SPEED`).
   The rebound state now spans **two sub-phases**: (a) `buoyant` — embedded,
   buoyancy force active, vy clamped to `BUOYANCY_MAX_SPEED`; (b) `airborne` —
   surfaced, gravity active, free flight. The state remains `rebounding` (and
   thus eligible for halved-accel air control + uncapped horizontal speed)
   through both phases until either the player lands grounded or
   `REBOUND_STATE_DURATION` of *post-surfacing* time elapses. The timer starts
   when the player surfaces, not when Shift is released — otherwise deep dives
   would burn the steering window entirely on buoyant ascent and leave none for
   the airborne drift to the landing ledge.

7. **Permeation feel — drag and center-pull, not free-fall.** While `permeating`
   *and* the player's rect overlaps any solid *and* the `permeateUntilClear`
   latch is **not** set, gravity is replaced by:
   (a) a vertical drag force `vy *= (1 - PERMEATE_DRAG)` each frame, simulating
   resistance from the medium, and (b) a gentle pull toward the contiguous solid
   mass's vertical center: `vy += sign(centerY - rect.centerY) * PERMEATE_PULL_ACCEL`,
   where `centerY` is the midpoint between `topSolidRow * TS` and
   `(botSolidRow + 1) * TS` for the contiguous mass under the player's column
   lane (computed identically to the rebound math). In two cases drag and pull
   are skipped and **normal gravity** applies instead:
   - **Outside the medium** — permeating in mid-air after dropping out the
     bottom of a thin floor.
   - **`permeateUntilClear` latch is set** — the player has released Shift with
     only the top half overlapping (see §1 and the state machine). The latch
     forces gravity-only physics so the head clears the floor naturally; if
     center-pull stayed active, a thin floor would re-capture the head every
     time it tried to clear.

   This produces a "diving in water" feel: entry decelerates, the player settles
   toward the middle of the block at a low terminal speed, and shallow floors
   (where the player passes through quickly) feel airier than deep blocks
   (where the medium grabs them and slows the descent). It also makes the
   "release while passing through a thin gap" pattern more controllable, since
   the player isn't moving at terminal velocity through a 1-tile floor.

8. **Permeation cooldown** = 0.2s after exiting any rebound, during which Shift
   cannot re-trigger Permeation. Prevents accidental insta-re-permeate.

9. **Fixed-timestep loop at 60Hz with accumulator.** No render interpolation —
   at 60Hz visual cost is negligible and the code stays readable. `requestAnimationFrame`
   drives an accumulator that calls `step(dt = 1/60)` zero-or-more times per frame
   (capped at 0.25s of accumulated time to prevent spiral-of-death).

10. **Edge-triggered velocity changes skip the same step's vertical force.**
    Three events in `step()` set `vy` to a specific value: jump press
    (`vy = JUMP_VELOCITY`), jump cut (`vy = JUMP_CUT_VELOCITY`), and rebound
    trigger (`vy = 0`). When any of these fire, the vertical-force resolution
    block (§9 in the STEP outline) is **skipped for that step only**, so the
    intended value reaches the move/collide phase exactly. Gravity or buoyancy
    resume on the very next fixed step. Implementation: the input-handling and
    rebound-trigger blocks set a local `skipVerticalForce = true`, and the
    vertical-force block early-returns if that flag is true. Without this
    skip, jumps lose `GRAVITY` worth of velocity on press, jump-cuts lose
    `GRAVITY` on release, and rebounds appear to start with a hidden
    `BUOYANCY_ACCEL` impulse — making smoke tests non-deterministic and the
    rebound feel "snappy" rather than building from rest.

### Visuals

11. **Permeation visual** = 40% alpha + cyan stroke that pulses via `sin(t)`.
    Stroke pulse doubles as a readability cue.
12. **Rebounding visual** = orange stroke; **Stuck visual** = red flash.
13. **Camera** follows player vertically (clamped to level bounds). Horizontal
    is fixed since the level is exactly 1 screen wide (30 cols × 32 px = 960 px = view width).

### Assumptions

- "Bottom-half overlap" = any solid tile overlapping the rect
  `(rect.x, rect.y + rect.h/2, rect.w, rect.h/2)`. With `PLAYER_H = 40`, this
  is the lower 20px of the hitbox.
- "Stuck search radius" = 6 tiles upward (the only direction that matters now).
- Player hitbox = 24×40 px (slightly narrower than a tile, gives a bit of edge
  forgiveness on stairs).
- "Surfaced" = `overlappingSolidTiles(playerRect()).length === 0`. Buoyancy
  shuts off the same step this becomes true; gravity resumes the next step.
- Checkpoint = level start; no mid-level checkpoints.
- Goal flag = a yellow rectangle at the level end; touching it sets a `won`
  flag and renders "Level Complete".

---

## CONFIG (tunable constants, all in one object at the top of the script)

| Constant | Value | Description |
|---|---|---|
| `TILE_SIZE` | 32 | Pixel size of one tile. |
| `VIEW_W` / `VIEW_H` | 960 / 540 | Canvas dimensions. |
| `GRAVITY` | 0.5 | Downward acceleration (px/frame²). |
| `MAX_FALL_SPEED` | 12 | Terminal velocity. |
| `MOVE_ACCEL` | 0.8 | Horizontal acceleration when input held. |
| `MOVE_DECEL` | 1.2 | Horizontal deceleration (snappier than accel). |
| `MAX_RUN_SPEED` | 5 | Horizontal cap (uncapped during rebound). |
| `JUMP_VELOCITY` | -10 | Initial jump velocity. |
| `JUMP_CUT_VELOCITY` | -3.5 | vy clamp on Space-release during ascent. |
| `COYOTE_FRAMES` | 6 | Frames after leaving ground where jump still works. |
| `JUMP_BUFFER_FRAMES` | 6 | Frames before landing where Space press is remembered. |
| `REBOUND_AIR_CONTROL` | 0.5 | Horizontal accel multiplier during rebound state. |
| `REBOUND_STATE_DURATION` | 0.4 | Seconds the airborne phase of rebound lasts (steering window; timer starts on surfacing, not on Shift release). |
| `BUOYANCY_ACCEL` | 1.0 | Upward acceleration applied while embedded during rebound (px/frame²). Replaces gravity in the buoyant phase. |
| `BUOYANCY_MAX_SPEED` | 18 | Cap on upward speed during buoyant phase (px/frame). Saturates around a 5-tile dive depth. |
| `PERMEATE_DRAG` | 0.08 | Per-frame velocity drag while permeating *and* embedded in solid (1 = instant stop, 0 = no drag). |
| `PERMEATE_PULL_ACCEL` | 0.3 | Acceleration toward contiguous mass's vertical center while permeating + embedded (px/frame²). Replaces gravity. |
| `PERMEATE_COOLDOWN` | 0.2 | Seconds before Permeation can re-activate. |
| `STUCK_SEARCH_RADIUS` | 6 | Tiles upward to search before declaring stuck. |
| `STUCK_DURATION` | 0.5 | Seconds frozen before respawn. |
| `PLAYER_W` | 24 | Player hitbox width. |
| `PLAYER_H` | 40 | Player hitbox height. |
| `DT` | 1/60 | Fixed simulation step in seconds. |

---

## Technical Architecture

Single `index.html`, expected ~900 lines. Sections in order:

```
<!DOCTYPE html>
<html>
  <head>
    <style>
      /* full-window canvas, letterbox black bg, pixel-crisp scaling */
    </style>
  </head>
  <body>
    <canvas id="game" width="960" height="540"></canvas>
    <script>
      // === CONFIG ===
      // === LEVEL DATA ===     30 cols × 45 rows
      // === LEVEL PARSER ===   builds tiles[r][c]; extracts spawn (S) and goal (G)
      // === INPUT ===          keys{}, keyEdge{}, keyReleased{} with edge detection
      // === PLAYER STATE ===   {x, y, vx, vy, state, facing, grounded,
      //                         coyoteTimer, jumpBufferTimer, reboundAirborneTimer,
      //                         permeateCooldownTimer, permeateUntilClear,
      //                         stuckTimer, flashTimer}
      // === PHYSICS HELPERS ===
      //   - isSolidTile(c, r)
      //   - playerRect()
      //   - bottomHalfRect(rect)               → lower half of player rect (rect.y + rect.h/2 to rect.y + rect.h)
      //   - bottomHalfOverlapsSolid(rect)      → overlappingSolidTiles(bottomHalfRect(rect)).length > 0
      //   - overlappingSolidTiles(rect)        → list of {c, r}
      //   - moveAndCollide(dx, dy)             → axis-separated swept-AABB (used in solid + airborne rebound only)
      //   - countSolidRowsAbove(rect)          → see "stuck detection" below
      //   - shouldRebound(rect)                → see "Rebound trigger" below
      //   - contiguousMassExtents(rect)        → {topY, botY, centerY} for column lane (or null if not embedded)
      // === STEP (fixed dt) ===
      //   1. decay timers (coyote, jumpBuffer, permeateCooldown, reboundAirborne, stuck, flash)
      //   2. handle R-key reset
      //   3. handle stuck timer → respawn
      //   4. permeation entry (with cooldown gate); a Shift re-press also clears
      //      the permeateUntilClear latch (player has voluntarily re-permeated)
      //   5. on Shift release while permeating:
      //        - if bottom-half overlap → shouldRebound() → rebounding | stuck;
      //          on rebound trigger, set vy = 0 and skipVerticalForce = true (see §10 in Decisions)
      //        - else if full-body overlap (only top half is in solid) → set permeateUntilClear latch
      //          (stays permeating; gravity applies, no center-pull, see step 9)
      //        - else (no overlap) → state = solid
      //   6. if permeateUntilClear AND rect fully clear of solid → drop latch, state = solid
      //   7. horizontal input → accel (halved during rebound, uncapped speed during rebound)
      //   8. variable jump:
      //        - on Space-press edge with coyote/buffer satisfied: vy = JUMP_VELOCITY, skipVerticalForce = true
      //        - on Space-release while vy < JUMP_CUT_VELOCITY: vy = JUMP_CUT_VELOCITY, skipVerticalForce = true
      //   9. vertical force resolution by state (skipped entirely if skipVerticalForce was set this step):
      //        - solid:                              vy += GRAVITY (clamped to MAX_FALL_SPEED)
      //        - permeating + embedded + !latch:     drag + center-pull (no gravity)
      //        - permeating + (open air OR latch):   vy += GRAVITY (clamped to MAX_FALL_SPEED)
      //        - rebounding + embedded (buoyant):    vy -= BUOYANCY_ACCEL (clamped to -BUOYANCY_MAX_SPEED)
      //        - rebounding + airborne:              vy += GRAVITY (clamped); reboundAirborneTimer ticks
      //   10. move:
      //        - permeating: x += vx; y += vy; NO collision
      //        - rebounding + embedded (buoyant): x += vx; y += vy; NO collision (intangible
      //          while in the mass, otherwise the next row of a multi-tile block stops the ascent;
      //          collision resumes the step the player surfaces — see
      //          "Buoyancy phase" section)
      //        - rebounding + airborne, or solid: moveAndCollide(vx, vy) (axis-separated swept-AABB)
      //   11. probe-grounded:
      //        - precondition: overlappingSolidTiles(playerRect()) is empty
      //          (the body must already be clear of solid; otherwise grounded = false)
      //        - then: grounded = overlappingSolidTiles(playerRect shifted +1px y) is non-empty
      //   12. exit rebounding when (airborne sub-phase AND reboundAirborneTimer ≤ 0) OR grounded;
      //        on exit, set permeateCooldownTimer = PERMEATE_COOLDOWN
      //   13. off-level fail-safe respawn (y > LEVEL_HEIGHT_PX + buffer)
      //   14. goal collision → won
      // === RENDER ===
      //   - dark gradient bg → parallax dot field → tiles (with edge highlights/shadows)
      //   - pulsing yellow goal flag
      //   - player (alpha/stroke depend on state)
      //   - HUD: state pill (color-coded), cooldown bar, control hints
      //   - "LEVEL COMPLETE" overlay if won
      // === MAIN LOOP ===
      //   - rAF → accumulator → step() N times → render()
      //   - MAX_FRAME = 0.25s to prevent spiral-of-death
    </script>
  </body>
</html>
```

### Rebound trigger and contiguous-mass extents

The rebound is no longer a one-shot "compute exit vector and snap" — it's a
state transition that flips the player into `rebounding` and lets the
buoyancy force (applied in the step loop) do the work. The complexity that
used to live in `computeRebound` is now split:

- **`shouldRebound(rect)`** — fired on Shift release. Returns one of
  `{fire: false}`, `{fire: true, stuck: true}`, or `{fire: true, stuck: false}`.
- **`countSolidRowsAbove(rect)`** — counts contiguous solid rows in the
  player's column lane *starting from the first overlapped solid row*, walking
  upward. This is the stuck check (compare against `STUCK_SEARCH_RADIUS`).
  Counting from the *top* of the contiguous mass would always under-report
  (the row above the top is empty by definition), so the start row matters.
- **Contiguous-mass extents** — still computed for the column lane the player
  occupies, used by the permeation center-pull. Recomputed each step while
  permeating, since the player's column lane can drift sideways during the dive.

```
function bottomHalfOverlapsSolid(rect):
  // Bottom half of the player rect. With PLAYER_H = 40, this is the lower 20 px.
  bh = {x: rect.x, y: rect.y + rect.h / 2, w: rect.w, h: rect.h / 2}
  return overlappingSolidTiles(bh).length > 0

function countSolidRowsAbove(rect):
  // Walk upward from the FIRST solid row the player overlaps (not from the top
  // of the contiguous mass — the top is, by definition, immediately under an
  // empty row, which would always make the count 0 and never trigger stuck).
  // Returns the count of contiguous solid rows in the player's column lane,
  // starting at and including the first overlapped solid row, walking upward.
  TS = TILE_SIZE
  c0, c1 = floor(rect.x / TS), floor((rect.x + rect.w - 1) / TS)
  r0, r1 = floor(rect.y / TS), floor((rect.y + rect.h - 1) / TS)
  laneSolidRow(r) = exists c in [c0..c1] where isSolidTile(c, r)

  // First overlapped solid row, scanning top-down across the player's vertical span.
  startRow = first r in [r0..r1] where laneSolidRow(r) is true
  if startRow is undefined: return 0  // not embedded → not stuck

  count = 0
  for r = startRow down to 0:
    if laneSolidRow(r): count += 1
    else: break
  return count

function shouldRebound(rect):
  if not bottomHalfOverlapsSolid(rect): return {fire: false}
  // Rebound is going to fire — check upward viability for stuck.
  // Stuck := the contiguous solid mass above (starting at the first row the
  // player overlaps) extends beyond STUCK_SEARCH_RADIUS rows before opening up.
  if countSolidRowsAbove(rect) > STUCK_SEARCH_RADIUS: return {fire: true, stuck: true}
  return {fire: true, stuck: false}

function contiguousMassExtents(rect):
  // Identical to the old anchor/expand walk, but only along rows for this lane.
  // Used by permeation pull (which needs the vertical center). Note this finds
  // the FULL contiguous mass; countSolidRowsAbove only walks up from a starting
  // row inside it. They are deliberately different: stuck cares about the
  // ceiling between the player and open air, center-pull cares about the
  // entire mass the player is in.
  TS = TILE_SIZE
  c0, c1 = floor(rect.x / TS), floor((rect.x + rect.w - 1) / TS)
  r0, r1 = floor(rect.y / TS), floor((rect.y + rect.h - 1) / TS)

  laneSolidRow(r) = exists c in [c0..c1] where isSolidTile(c, r)

  anchorRow = first r in [r0..r1] where laneSolidRow(r) is true
  if anchorRow is undefined: return null  // player not embedded in this lane

  topSolidRow = anchorRow
  for r = anchorRow - 1 down to 0:
    if laneSolidRow(r): topSolidRow = r
    else: break
  botSolidRow = anchorRow
  for r = anchorRow + 1 up to LEVEL_ROWS - 1:
    if laneSolidRow(r): botSolidRow = r
    else: break

  topY  = topSolidRow * TS
  botY  = (botSolidRow + 1) * TS
  return {topY, botY, centerY: (topY + botY) / 2}
```

### Buoyancy phase (rebound while embedded)

```
// Inside step(), if state == "rebounding":
if overlappingSolidTiles(playerRect()).length > 0:
  // Buoyant sub-phase: replace gravity with upward buoyancy.
  vy -= BUOYANCY_ACCEL
  if vy < -BUOYANCY_MAX_SPEED: vy = -BUOYANCY_MAX_SPEED
  // Note: do NOT start REBOUND_STATE_DURATION timer yet — wait until surfacing.
else:
  // Airborne sub-phase: surfaced. Gravity resumes; start steering window.
  if reboundAirborneTimer is uninitialized: reboundAirborneTimer = REBOUND_STATE_DURATION
  vy += GRAVITY
  if vy > MAX_FALL_SPEED: vy = MAX_FALL_SPEED
  reboundAirborneTimer -= DT
```

Movement during the buoyant sub-phase is **fully intangible**: position is
updated as `x += vx; y += vy` with **no collision check**. Re-enabling
collision while embedded (the original approach) is wrong — the swept-AABB
would refuse to let the player move from row R into row R-1 of the same
multi-tile block, since row R-1 is solid and the swept-AABB doesn't
distinguish "a tile the player is already overlapping" from "the next tile
in the contiguous mass." The result was that buoyancy could not lift the
player past the first internal row of a thick block, capping the rebound
inside the dive column.

Collision resumes the moment the player surfaces (the airborne sub-phase
uses `moveAndCollide` normally). The transition is automatic: the buoyancy
branch above runs only while `overlappingSolidTiles(playerRect()).length > 0`,
so the first step the rect is clear of solid hands movement back to the
normal collide path.

### Permeation drag and center-pull (while embedded)

```
// Inside step(), if state == "permeating":
extents = contiguousMassExtents(playerRect())
if extents != null and not permeateUntilClear:
  // Embedded, no latch: drag + pull toward vertical center, no gravity.
  vy *= (1 - PERMEATE_DRAG)
  rectCenterY = playerRect().y + playerRect().h / 2
  if rectCenterY < extents.centerY: vy += PERMEATE_PULL_ACCEL
  else if rectCenterY > extents.centerY: vy -= PERMEATE_PULL_ACCEL
else:
  // Either in open air (dropping through thin floor) OR latched
  // (top-half-only release; center-pull would re-capture, so use gravity).
  vy += GRAVITY
  if vy > MAX_FALL_SPEED: vy = MAX_FALL_SPEED
```

Terminal sink speed in the embedded, unlatched case is approximately
`PERMEATE_PULL_ACCEL / PERMEATE_DRAG ≈ 3.75 px/frame`, far below
`MAX_FALL_SPEED`, which is the desired "underwater" feel. The center-pull also
means a player who Shift-drops onto a thin floor settles *into* the floor and
needs to release Shift to get out — releasing while still in the bottom half
fires a rebound up; releasing while only the head is in the floor sets the
`permeateUntilClear` latch (gravity applies, head clears, state → solid).

### State machine

```
SOLID ──Shift down──▶ PERMEATING
PERMEATING ──Shift up & bottom-half overlaps solid──▶ REBOUNDING
                                                     (or STUCK if upward exit blocked)
PERMEATING ──Shift up & only top-half overlaps──▶ PERMEATING (Shift treated as still held;
                                                  player keeps drifting until fully clear)
PERMEATING ──Shift up & no overlap──▶ SOLID
REBOUNDING (buoyant) ──surfaces (no overlap)──▶ REBOUNDING (airborne; timer starts)
REBOUNDING (airborne) ──timer expires OR landed──▶ SOLID (PERMEATE_COOLDOWN runs)
STUCK ──timer expires──▶ respawn → SOLID
SOLID ──touch goal──▶ WON
```

The "Shift up & only top-half overlaps → keep permeating" transition needs
care: the player has physically released Shift, but the game continues to
behave as if Shift is held until the body is fully out of solid. Implement
this by latching a `permeateUntilClear` flag when Shift is released with
top-half-only overlap; the flag forces `state = permeating` and ignores the
Shift-up event until `overlappingSolidTiles(playerRect()).length === 0`, at
which point the flag clears and state becomes `solid`. If the player presses
Shift again during this latch period, the latch clears (they've voluntarily
re-permeated).

---

## Level Layout

30 cols × 45 rows. ASCII grid: `#` solid, `.` empty, `S` spawn (treated as
empty), `G` goal. Spawn at row 43 col 1; goal flag at row 13 col 27.

The level must satisfy these constraints by construction. Before any tuning,
verify the geometry produces these properties — they are non-negotiable for
the demo to be playable:

1. **Beat 2 dive column has clear ascent.** Every column the player can dive
   in (cols 8–22 within the Beat 2 block) must have `.` from the block top
   (row 18) up through row 14 — no platform directly above any dive column.
   A platform directly above means the player head-bumps it from below and
   the rebound caps at the platform's bottom edge.
2. **Beat 2 landing platform is reachable by drift.** The high ledge must be
   horizontally within ~5 tiles of a valid dive column (the realistic drift
   distance during rebound air control + post-rebound flight). Outside that
   range, no input pattern lands the player on the ledge.
3. **Each staircase step is ≤3 tiles above the previous foothold.** Jump apex
   from `JUMP_VELOCITY = -10`, `GRAVITY = 0.5` is `100 / 32 ≈ 3.1 tiles`. Any
   step further requires a different climb path.
4. **Spawn point is clear.** `S` must be in an empty cell with empty cells
   above, and a solid tile directly below to stand on.

```
                           col: 0         1         2
                                0123456789012345678901234567890
                  row  0   "..............................",
                  row  1   "..............................",
                  row  2   "..............................",
                  row  3   "..............................",
                  row  4   "..............................",
                  row  5   "..............................",
                  row  6   "..............................",
                  row  7   "..............................",
                  row  8   "..............................",
                  row  9   "..............................",
                  row 10   "..............................",
                  row 11   "..............................",
                  row 12   "..............................",
                  row 13   "...........................G..",  ← goal flag (col 27)
                  row 14   "........................######",  ← high ledge (cols 24-29) — Beat 2 destination
                  row 15   "..............................",
                  row 16   "..............................",
                  row 17   "..............................",
                  row 18   "..............................",
                  row 19   "........######################",  ← Beat 2 block top (cols 8-29)
                  row 20   "....##########################",  ← stair 8 (cols 4-7) + block (cols 8-29)
                  row 21   "........######################",  ← block interior
                  row 22   "........######################",  ← block interior
                  row 23   "....##########################",  ← stair 7 (cols 4-7) + block bottom
                  row 24   "..............................",
                  row 25   "..............................",
                  row 26   "####..........................",  ← stair 6 (cols 0-3)
                  row 27   "..............................",
                  row 28   "..............................",
                  row 29   "....###.......................",  ← stair 5 (cols 4-6)
                  row 30   "..............................",
                  row 31   "..............................",
                  row 32   "####..........................",  ← stair 4 (cols 0-3)
                  row 33   "..............................",
                  row 34   "..............................",
                  row 35   "....###.......................",  ← stair 3 (cols 4-6)
                  row 36   "..............................",
                  row 37   "..............................",
                  row 38   "####..........................",  ← stair 2 (cols 0-3)
                  row 39   "..............................",
                  row 40   "..............................",
                  row 41   "....###..######...............",  ← stair 1 (cols 4-6) + Beat 1 thin floor (cols 9-14)
                  row 42   "..............................",
                  row 43   ".S............................",  ← spawn (col 1)
                  row 44   "##############################",  ← bottom floor
```

### Player path

1. Spawn at (col 1, row 43) on the bottom floor.
2. **Beat 1 (optional tutorial)** — jump from the bottom floor onto the first
   stair step (row 41 cols 4-6), then onto the thin floor (row 41 cols 9-14).
   Hold Shift while standing on it to fall through onto the bottom floor below.
   Discoverable but not required for progress.
3. Climb the zigzag staircase: row 41 → 38 → 35 → 32 → 29 → 26 → 23 → 20.
   Each jump is 2-3 tiles vertically.
4. From stair 8 (row 20 cols 4-7), walk right onto Beat 2 block top (row 19 cols 8-29).
5. **Beat 2** — at column 18-22 (verified working dive columns), hold Shift to
   dive into the block. Because permeation is now drag + center-pull (not
   free-fall), the player settles toward the block's vertical center and
   then sits there at low terminal speed; release Shift once the player is
   roughly mid-block (a count of "one-and-two-and" works well, ≈30+ frames).
   The buoyancy rebound builds upward speed through the block and surfaces
   with substantial vy; hold Right to drift onto the high ledge at row 14
   cols 24-29.
6. Walk to the goal flag at row 13 col 27.

### Why two beats, not three

A third beat — a "release timing" puzzle where the player permeates down
through a tall wall and releases while passing through a one-row horizontal
gap — cannot coexist with Beat 2 in this geometry without violating constraint
#1 above:

- The player's rebound apex column equals the dive column at trigger time
  (vx = 0 at trigger; drift only comes from air-control input).
- The new buoyancy model gives a longer drift window than the old instant-launch
  rebound: horizontal accel is halved but applied for the full buoyant phase
  *plus* `REBOUND_STATE_DURATION` of post-surfacing flight. For a 5-tile dive
  that's roughly ~18 frames of buoyant ascent + 24 frames airborne ≈ 42 frames
  total, producing ~200-260 px (~6-8 tiles) of lateral drift maximum.
- Anything solid directly above the dive column blocks the ascent and caps the
  apex at the obstruction's bottom edge — the buoyant phase pushes the player
  into it, sustained contact triggers stuck.
- A Beat 3 wall positioned to span the dive columns blocks ascent. A wall
  positioned to *not* span the dive columns is unreachable from the Beat 2
  landing ledge by the player's normal jump.

A third beat is a candidate extension; see "Suggested next steps" for the
geometry that makes it viable (a horizontal-permeation wall placed *between*
the high ledge and an extended goal area, so the player runs at it with
horizontal velocity rather than falling through it).

---

## Files To Be Created

- `index.html` at `C:\Users\rafae\source\games\index.html` — the entire deliverable.

No existing files to modify. No external dependencies.

---

## Verification Plan

Validate with a Node.js smoke harness that mocks the canvas/DOM and drives
`step()` directly with synthetic inputs, then open in a browser for visual/feel
verification.

### Smoke harness (Node, no browser)

Extract the `<script>` body from `index.html`, mock the canvas API and `window`
/ `document` / `performance` / `requestAnimationFrame`, then expose internals
via a final `return { ... }` from a `new Function(code + '; return {...}')`
wrapper. Drive scenarios by setting `keys[]`, `keyEdge[]`, `keyReleased[]` and
calling `step(CONFIG.DT)` in a loop.

Required smoke tests:

1. **Boot and parse.** Level dimensions are 30×45. Spawn extracted at
   `(1*32, 43*32)`. Goal extracted as a 32×32 rect at the `G` cell. No JS
   syntax errors.
2. **Spawn no overlap.** `overlappingSolidTiles(playerRect())` returns `[]`
   immediately after spawn.
3. **Gravity settles.** After 30 steps with no input, player has `grounded = true`
   and is sitting on the bottom floor.
4. **Variable jump with one-frame force skip.** Press Space → after the step in
   which Space-press is registered, `vy == JUMP_VELOCITY` exactly (not
   `JUMP_VELOCITY + GRAVITY`). Release Space while ascending → after the step
   in which Space-release is registered, `vy == JUMP_CUT_VELOCITY` exactly.
   On the *following* step (no input), `vy` increases by `GRAVITY`. This
   directly tests Decision §10.
5. **Permeation entry.** Hold Shift while grounded → state flips to `permeating`.
6. **Permeation falls through thin floor with drag.** Stand on row 41 thin floor at
   col 11, hold Shift. Verify the descent through the floor is *slower* than
   free-fall: after 12 frames the player has fallen, but `vy` while embedded
   stays well below `MAX_FALL_SPEED` (asserts `vy <= ~5` during the embedded
   frames, vs `~6` after exiting the floor into open air below).
7. **Permeation center-pull.** Inject a 5-tile-thick block in an empty area of
   the level. Spawn the player permeating with `vy = 0` near the top of the
   block, then step until embedded. Verify `vy` is positive (pulled toward
   center) and that the player's `rect.centerY` converges toward the contiguous
   mass's `centerY` over ~30 frames within ±4 px, and stays there.
8. **Release in open air → solid.** Hold Shift in mid-air below the thin floor,
   release → state flips to `solid` (no rebound).
9. **Top-half-only release latches permeateUntilClear, gravity applies.** Permeate
   down through a 1-tile-thick floor until only the player's top half overlaps
   the floor (head in, body out below). Release Shift. Assert: state remains
   `permeating`, `permeateUntilClear` is true, no rebound has fired. Step once
   and assert `vy` increased by exactly `GRAVITY` (not modified by drag/pull —
   verifying the latch's gravity-override per Decision §7). Step until the head
   clears the floor; assert state transitions to `solid` and the latch is
   cleared.
10. **Bottom-half-only release fires rebound; vy = 0 for one step.** Permeate
    into the Beat 2 block at col 20 just enough that the bottom half of the
    player overlaps but the head is still above the block top. Release Shift.
    Assert: state transitions to `rebounding`, `vy == 0` exactly *immediately
    after the trigger step* (Decision §10 — no buoyancy applied that step). On
    the next step, `vy == -BUOYANCY_ACCEL` (buoyancy applied, no other forces).
11. **Buoyancy accelerates while embedded; intangible while in mass.** Trigger
    a rebound from inside the Beat 2 block (5 tiles thick). Step frame-by-frame
    and assert: (a) while `overlappingSolidTiles(playerRect())` is non-empty,
    `vy` decreases by `BUOYANCY_ACCEL` each step, clamped at `-BUOYANCY_MAX_SPEED`;
    (b) the player's `y` decreases by `vy` each step *with no collision check*
    — the player passes through internal rows of the multi-tile block without
    stopping (collision must be disabled while embedded — see Buoyancy phase
    section);
    (c) the frame the player surfaces, `vy` increases by `GRAVITY` (gravity
    resumes), and from that frame onward `moveAndCollide` is used.
12. **Ground probe ignores currently-overlapped solids.** Place the player
    embedded in solid (e.g. mid-block) with state `rebounding`. Call the
    grounded-probe routine. Assert `grounded == false` even though there is
    solid 1px below the player rect — because the player's body itself
    overlaps solid, the probe must short-circuit. Then move the player to a
    position where the body is fully clear and a solid tile sits directly
    below; assert `grounded == true`. (Probe must short-circuit when the body
    overlaps solid — see STEP outline §11.)
13. **Beat 2 deep dive at col 18-22, dive ~30-40 frames → buoyant rebound that
    lands on high ledge.** Verify with horizontal input held Right during the
    rebound state: final state is `solid` or `won`, final position is on the
    high ledge (`y == 14*32 - 40` and `x >= 24*32`). This is the integration
    test for the new buoyancy + extended steering window working together.
    (Frame count is higher than the old plan because permeation descent is
    now drag-limited rather than free-fall.)
14. **Stuck case.** Inject a vertical column of solid tiles 8 tiles tall directly
    above the player. Place the player embedded such that
    `countSolidRowsAbove(playerRect()) > STUCK_SEARCH_RADIUS`. Release Shift
    while embedded → `shouldRebound()` returns `{fire: true, stuck: true}`,
    state transitions to `stuck`. Also assert: counting started from the first
    overlapped solid row (per Decision §3) — verify by placing the player such
    that the contiguous mass *top* is in empty space above the player but the
    count from the first overlapped row still exceeds the radius.
15. **Cooldown gate.** Immediately after a rebound resolves to `solid`, set
    `keys["ShiftLeft"] = true` → state stays `solid`, does not flip to
    `permeating` until `permeateCooldownTimer` reaches 0.
16. **Goal collision.** Place player overlapping `goalRect` → after one step,
    state is `won`.

### Browser verification (the user's responsibility)

Open `index.html` in Chrome/Firefox/Edge:

1. Movement feel: walk left/right has crisp accel and snappier decel. Jump
   has variable height (tap = short hop, hold = full jump). Run off ledge,
   coyote-time jump still works.
2. Beat 1 plays as expected: holding Shift on the thin floor makes the player
   *settle* into the floor (not fall through at terminal velocity); the descent
   feels viscous, like dropping into water.
3. Beat 2 plays as expected: dive at col ~20, the descent through the block
   feels deliberate (not free-fall), the player can feel the medium pulling
   them toward the block's vertical center; release deep, hold Right, the
   rebound *builds* speed during the upward ascent through the block (not
   instantly at max), peaks near the surface, and the steering window after
   surfacing is enough to drift onto the high ledge.
4. Bottom-half-only release: dive shallowly so only the player's feet are in
   the block, release → rebound fires, gentle pop upward.
5. Top-half-only release: dive deep, then drift down until only the head is in
   the block top, release Shift → no rebound; the player keeps drifting until
   the head clears, then becomes solid.
6. R key resets to spawn.
7. HUD state pill updates color and label correctly through all states
   (Solid white, Permeating cyan, Rebounding orange, Stuck red, Won yellow).
8. Cooldown bar appears beneath the state pill after a rebound and depletes
   over 0.2s.
9. "Level Complete" overlay appears on goal touch with "Press R to play again".

---

## Output Format

The deliverable response must include, in order:

1. Design summary (5-8 bullets).
2. CONFIG markdown table.
3. Full single-file HTML in one code block, with heavy comments in the physics
   and rebound sections.
4. Smoke-harness results — one line per test (PASS/FAIL with the assertion
   that fired on failure). All 16 tests in the Verification Plan must pass
   before the deliverable is considered complete.
