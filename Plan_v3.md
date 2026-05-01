# Plan: Permeation Buoyancy 2D Platformer Demo

## Context

Build a single-file, browser-playable 2D platformer demo around a "Permeation
Buoyancy" mechanic inspired by Mirio Togata. Holding Shift makes the character
intangible and gravity pulls them through terrain; releasing Shift while
overlapping solid matter triggers a Rebound that ejects them along the shortest
exit vector with speed proportional to overlap depth. Fully-enclosed cases
trigger a "stuck" failure state.

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

1. **Rebound direction** = minimum-penetration axis among 4 cardinal directions,
   with an UP bias. Computing literal "nearest open space" would require
   per-release BFS; for a 32px tile world the cardinal-penetration heuristic is
   identical in 99% of cases and runs in O(tiles_overlapped). UP is biased by
   multiplying its effective penetration by `UP_BIAS = 0.6` during the
   minimum-comparison; magnitude is still computed from the true (un-biased)
   penetration. The bias reflects the design intuition that the player almost
   always *enters* solid matter by falling into it from above, and a tiny
   horizontal sliver of overlap shouldn't override the obvious "back the way I
   came" exit.

2. **Rebound magnitude** = `lerp(REBOUND_MIN_SPEED, REBOUND_MAX_SPEED, depth_norm)`,
   where `depth_norm = clamp(penetration_px / (REBOUND_MAX_DEPTH_TILES * TILE_SIZE), 0, 1)`.
   Shallow dips give a nudge; deep dives give a rocket. Saturates at 4 tiles deep.

3. **Stuck detection** = 4 cardinal raycasts capped at `STUCK_SEARCH_RADIUS`
   (6 tiles). If every cardinal exit ray hits more than 6 tiles of solid before
   finding empty space, declare stuck. This is cheaper than flood-fill and
   correct for any convex pocket.

4. **Coyote time and jump buffer** both = 6 frames @ 60Hz (0.1s). Standard
   Celeste defaults.

5. **Variable jump** = velocity cap on Space-release. When Space is released
   during upward motion, clamp `vy` to `JUMP_CUT_VELOCITY` (-3.5 px/frame).
   Cleaner than scaling.

6. **Rebound air control** = horizontal accel halved during the rebound state.
   Horizontal speed is not clamped to `MAX_RUN_SPEED` during rebounding so the
   launch + drift can carry past the normal cap.

7. **Permeation cooldown** = 0.2s after exiting any rebound, during which Shift
   cannot re-trigger Permeation. Prevents accidental insta-re-permeate.

8. **Fixed-timestep loop at 60Hz with accumulator.** No render interpolation —
   at 60Hz visual cost is negligible and the code stays readable. `requestAnimationFrame`
   drives an accumulator that calls `step(dt = 1/60)` zero-or-more times per frame
   (capped at 0.25s of accumulated time to prevent spiral-of-death).

### Visuals

9. **Permeation visual** = 40% alpha + cyan stroke that pulses via `sin(t)`.
   Stroke pulse doubles as a readability cue.
10. **Rebounding visual** = orange stroke; **Stuck visual** = red flash.
11. **Camera** follows player vertically (clamped to level bounds). Horizontal
    is fixed since the level is exactly 1 screen wide (30 cols × 32 px = 960 px = view width).

### Assumptions

- "Shortest exit vector" = minimum cardinal penetration depth, not literal
  Euclidean nearest-empty-pixel.
- "Search radius" for stuck = 6 tiles in each cardinal direction.
- Player hitbox = 24×40 px (slightly narrower than a tile, gives a bit of edge
  forgiveness on stairs).
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
| `REBOUND_MIN_SPEED` | 7 | Minimum rebound velocity magnitude. |
| `REBOUND_MAX_SPEED` | 18 | Maximum rebound velocity magnitude. |
| `REBOUND_MAX_DEPTH_TILES` | 4 | Overlap depth at which rebound speed saturates. |
| `REBOUND_AIR_CONTROL` | 0.5 | Horizontal accel multiplier during rebound state. |
| `REBOUND_STATE_DURATION` | 0.4 | Seconds the rebound state lasts (steering window). |
| `PERMEATE_COOLDOWN` | 0.2 | Seconds before Permeation can re-activate. |
| `STUCK_SEARCH_RADIUS` | 6 | Tiles to search per direction before declaring stuck. |
| `STUCK_DURATION` | 0.5 | Seconds frozen before respawn. |
| `PLAYER_W` | 24 | Player hitbox width. |
| `PLAYER_H` | 40 | Player hitbox height. |
| `UP_BIAS` | 0.6 | Multiplier on UP's penetration in direction selection. |
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
      //                         coyoteTimer, jumpBufferTimer, reboundTimer,
      //                         permeateCooldownTimer, stuckTimer, flashTimer}
      // === PHYSICS HELPERS ===
      //   - isSolidTile(c, r)
      //   - playerRect()
      //   - overlappingSolidTiles(rect)        → list of {c, r}
      //   - moveAndCollide(dx, dy)             → axis-separated swept-AABB
      //   - castClearTilesInDirection(rect, dir) → tile-count to first empty in lane
      //   - computeRebound()                   → see "Rebound math" below
      // === STEP (fixed dt) ===
      //   1. decay timers
      //   2. handle R-key reset
      //   3. handle stuck timer → respawn
      //   4. permeation entry/exit (with cooldown gate)
      //   5. on Shift release: computeRebound() → solid | rebounding | stuck
      //   6. horizontal input → accel (halved during rebound)
      //   7. variable jump (cut to JUMP_CUT_VELOCITY on Space release while ascending)
      //   8. gravity (also during permeating)
      //   9. move + collide (skipped while permeating)
      //   10. probe-grounded (1px below)
      //   11. exit rebounding on timer or landing
      //   12. off-level fail-safe respawn
      //   13. goal collision → won
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

### Rebound math

Two requirements that together define the algorithm:

- **The penetration must be measured against the *contiguous solid mass*, not
  just the currently-overlapping tiles.** When the player is fully embedded in
  a thick block, "push to clear the topmost overlapped tile" leaves them still
  inside the rest of the block. The walk must extend through any contiguous
  solids in the player's perpendicular extent.
- **The walk must start from a known-solid anchor.** Walking from the player's
  top row works for `pUp` but breaks for `pDown` when the player's head sticks
  out into an empty row above the block (the walk short-circuits at the empty
  row before reaching the solid mass). Find any row in `[r0..r1]` that has a
  solid tile in the player's column lane, then expand outward symmetrically.

```
function computeRebound():
  rect = playerRect()
  overlapped = overlappingSolidTiles(rect)
  if overlapped.length == 0: return {fire: false}

  TS = TILE_SIZE
  c0, c1 = floor(rect.x / TS), floor((rect.x + rect.w - 1) / TS)
  r0, r1 = floor(rect.y / TS), floor((rect.y + rect.h - 1) / TS)

  laneSolidRow(r) = exists c in [c0..c1] where isSolidTile(c, r)
  laneSolidCol(c) = exists r in [r0..r1] where isSolidTile(c, r)

  // Anchor: a row in [r0..r1] guaranteed to be solid in the lane.
  anchorRow = first r in [r0..r1] where laneSolidRow(r) is true
            // (exists because overlapped is non-empty; fall back to r0 if not)

  // Expand from anchor to find contiguous-solid mass extents.
  topSolidRow = anchorRow
  for r = anchorRow - 1 down to 0:
    if laneSolidRow(r): topSolidRow = r
    else: break
  botSolidRow = anchorRow
  for r = anchorRow + 1 up to LEVEL_ROWS - 1:
    if laneSolidRow(r): botSolidRow = r
    else: break

  // Same for cols using anchorCol, leftSolidCol, rightSolidCol.
  ...

  // True penetrations (px) — distance to clear the contiguous mass with 1px buffer.
  pUp    = (rect.y + rect.h) - topSolidRow * TS
  pDown  = (botSolidRow + 1) * TS - rect.y
  pLeft  = (rect.x + rect.w) - leftSolidCol * TS
  pRight = (rightSolidCol + 1) * TS - rect.x

  // Viability via tile-clearance.
  upClear, downClear, leftClear, rightClear = castClearTilesInDirection(rect, ...)

  candidates = [
    {dir: "up",    pen: pUp,    clear: upClear,    isUp: true},
    {dir: "down",  pen: pDown,  clear: downClear,  isUp: false},
    {dir: "left",  pen: pLeft,  clear: leftClear,  isUp: false},
    {dir: "right", pen: pRight, clear: rightClear, isUp: false},
  ]
  viable = candidates filtered by (c.clear <= STUCK_SEARCH_RADIUS)

  if viable is empty: return {fire: true, stuck: true}

  // Direction selection: smallest *effective* penetration. UP gets the bias.
  effective(c) = c.isUp ? c.pen * UP_BIAS : c.pen
  best = viable min by effective(c)

  // Magnitude scales with TRUE penetration (not the biased version).
  depthNorm = clamp(best.pen / (REBOUND_MAX_DEPTH_TILES * TS), 0, 1)
  speed = lerp(REBOUND_MIN_SPEED, REBOUND_MAX_SPEED, depthNorm)

  // Velocity + snap-out (snap by pen + 1 px so re-collision doesn't re-trap).
  vx, vy, snapDx, snapDy = 0, 0, 0, 0
  if best.dir == "up":    vy = -speed; snapDy = -(pUp + 1)
  if best.dir == "down":  vy =  speed; snapDy =  (pDown + 1)
  if best.dir == "left":  vx = -speed; snapDx = -(pLeft + 1)
  if best.dir == "right": vx =  speed; snapDx =  (pRight + 1)

  return {fire: true, stuck: false, vx, vy, snapDx, snapDy, dir: best.dir, depthNorm}
```

### State machine

```
SOLID ──Shift down──▶ PERMEATING
PERMEATING ──Shift up & overlap──▶ REBOUNDING (or STUCK if every cardinal blocked)
PERMEATING ──Shift up & no overlap──▶ SOLID
REBOUNDING ──timer expires OR (vy >= 0 & grounded)──▶ SOLID (PERMEATE_COOLDOWN runs)
STUCK ──timer expires──▶ respawn → SOLID
SOLID ──touch goal──▶ WON
```

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
   dive deep into the block, release after roughly 15+ frames of falling.
   Rebound launches the player up; hold Right to drift onto the high ledge at
   row 14 cols 24-29.
6. Walk to the goal flag at row 13 col 27.

### Why two beats, not three

A third beat — a "release timing" puzzle where the player permeates down
through a tall wall and releases while passing through a one-row horizontal
gap — cannot coexist with Beat 2 in this geometry without violating constraint
#1 above:

- The player's rebound apex column equals the dive column (vx = 0 at launch;
  drift only comes from air-control input).
- Drift over 24 frames of rebound air-control plus ~10 frames of post-rebound
  flight gives ~150-200 px of lateral travel — about 5 tiles maximum.
- Anything solid directly above the dive column blocks the ascent and caps the
  apex at the obstruction's bottom edge.
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
4. **Variable jump.** Press Space → vy = `JUMP_VELOCITY`. Release Space while
   ascending → vy clamps to `JUMP_CUT_VELOCITY`.
5. **Permeation entry.** Hold Shift while grounded → state flips to `permeating`.
6. **Permeation falls through thin floor.** Stand on row 41 thin floor at col 11,
   hold Shift, after 12 frames the player has fallen below the floor (still
   permeating).
7. **Release in open air → solid.** Hold Shift in mid-air below the thin floor,
   release → state flips to `solid` (no rebound).
8. **Beat 2 deep dive at col 18-22, dive 15-18 frames → upward rebound that
   lands on high ledge.** Verify with horizontal input held Right during ascent:
   final state is `solid` or `won`, final position is on the high ledge
   (`y == 14*32 - 40` and `x >= 24*32`).
9. **Stuck case.** Inject a 16×16 solid pocket into `tiles[][]` at runtime,
   place the player at the center, call `computeRebound()` → returns
   `{fire: true, stuck: true}`.
10. **Cooldown gate.** Immediately after a rebound, set `keys["ShiftLeft"] = true`
    → state stays `rebounding` or `solid`, does not flip to `permeating` until
    `permeateCooldownTimer` reaches 0.
11. **Goal collision.** Place player overlapping `goalRect` → after one step,
    state is `won`.

### Browser verification (the user's responsibility)

Open `index.html` in Chrome/Firefox/Edge:

1. Movement feel: walk left/right has crisp accel and snappier decel. Jump
   has variable height (tap = short hop, hold = full jump). Run off ledge,
   coyote-time jump still works.
2. Beat 1 plays as expected.
3. Beat 2 plays as expected (dive at col 20-ish, hold Right, land on ledge).
4. R key resets to spawn.
5. HUD state pill updates color and label correctly through all states
   (Solid white, Permeating cyan, Rebounding orange, Stuck red, Won yellow).
6. Cooldown bar appears beneath the state pill after a rebound and depletes
   over 0.2s.
7. "Level Complete" overlay appears on goal touch with "Press R to play again".

---

## Output Format

The deliverable response must include, in order:

1. Design summary (5-8 bullets).
2. CONFIG markdown table.
3. Full single-file HTML in one code block, with heavy comments in the physics
   and rebound sections.
4. Three suggested next steps.

---

## Suggested Next Steps

1. **Juice pass.** Particle bursts on rebound (orange sparks scaled by
   `depthNorm`), red shockwave on stuck, screen-shake on big rebounds, trail
   effect during permeation. Audio via Tone.js: oscillator chirp on jump,
   filtered sweep on permeate, harmonic pluck on rebound, dissonant cluster on
   stuck, victory arpeggio on win.

2. **Add a third beat: horizontal wall-permeation.** Extend the goal area to
   the right; place a tall wall *between* the Beat 2 high ledge and the new
   goal. Player runs at the wall with Shift held, horizontal velocity carries
   them through, releases on the far side onto the goal floor. Geometry to
   verify:
   - The wall must not span any Beat 2 dive column (cols 8-22) or it
     re-introduces the constraint that limits two-beat scope.
   - The wall must extend up high enough that jumping over isn't an
     alternative (≥4 tiles tall above the floor).
   - Goal floor must be on the far side of the wall at the same row as the
     mid-ledge so the player exits onto solid ground.

3. **Level editor and level select.** Move level data to JSON, add an editor
   mode (click-toggle tile under cursor, drag-place spawn/goal, save/load to
   localStorage), and a level-select menu progressing through 4-5 hand-designed
   scenarios that show different mechanic interactions: chained rebounds,
   stuck-recovery via deliberate re-permeation, permeating moving platforms,
   wall-jump-into-permeate combos.
