# Plan: Permeation Buoyancy 2D Platformer Demo

## Context

The user wants a single-file, browser-playable 2D platformer demo built around a "Permeation Buoyancy" mechanic inspired by Mirio Togata. The mechanic is non-trivial: holding Shift makes the character intangible and gravity pulls them through terrain; releasing Shift while overlapping solid matter triggers a Rebound that ejects them along the shortest exit vector — speed proportional to overlap depth, fully-enclosed cases trigger a "stuck" failure state.

The working directory `C:\Users\rafae\source\games` is empty, so this is greenfield. The deliverable is one `index.html` file with no external dependencies. The challenge is less about plumbing and more about (a) getting the rebound math right and (b) tuning Celeste-grade movement feel (coyote, buffer, variable jump) into a single tight script.

The user explicitly asked for an opinionated implementation rather than clarifying questions, so this plan locks in design decisions and proceeds straight to implementation on approval.

---

## Design Summary (key tuning decisions)

1. **Rebound direction = minimum-penetration axis among 4 cardinal directions, biased upward.** Computing a true "nearest open space" would require BFS over tiles per release; for a 32px tile world the minimum-of-4-penetrations heuristic gives identical results 99% of the time and runs in O(tiles_overlapped). When two axes tie, prefer **up** — it's the most fun and matches the "human log" canon of being violently spat skyward.
2. **Rebound magnitude = `lerp(MIN, MAX, overlap_depth / MAX_DEPTH)`**, where `MAX_DEPTH` is 4 tiles. Shallow dips give a nudge, deep dives give a rocket. This makes Beat 2 (deep dive into thick terrain → high ledge) feel naturally readable.
3. **Stuck detection = BFS over solid tiles from player center, capped at `STUCK_SEARCH_RADIUS` (6 tiles).** If every cardinal exit ray hits more than 6 tiles of solid before finding empty, we declare stuck. Cheaper than full flood-fill, sufficient for this demo level.
4. **Coyote time and jump buffer both = 6 frames @ 60Hz (0.1s).** Standard Celeste defaults; documented in CONFIG so the user can tune.
5. **Variable jump = velocity cap on Space-release.** When Space is released during upward motion, clamp `vy` to `JUMP_CUT_VELOCITY` (-3.5 px/frame). Cleaner than scaling and easier to reason about.
6. **Permeation visuals = 40% alpha + cyan stroke that pulses via `sin(t)`.** Stroke pulse doubles as a readability cue for the cooldown window after rebound (different color: orange).
7. **Rebound air control at 50%** is implemented by halving `MOVE_ACCEL` for the duration of the rebound state (until `vy >= 0` and grounded, or 0.4s timer expires — whichever first).
8. **Fixed-timestep loop at 60Hz with accumulator.** Render interpolation skipped — at 60Hz target render rate the visual cost is negligible and the code stays readable. Decoupling is done via `requestAnimationFrame` driving an accumulator that calls `step(dt=1/60)` zero-or-more times per frame.

**Stated assumptions** (per the user's "state assumptions, don't ask"):
- "Shortest exit vector" = minimum cardinal penetration depth, not literal Euclidean nearest-empty-pixel.
- "Search radius" for stuck = 6 tiles in each cardinal direction.
- Player hitbox = 24×40 px (slightly narrower than a tile so it can fit through 1-tile-wide gaps on Beat 3).
- Checkpoint = level start; no mid-level checkpoints needed for a 3-beat tutorial.
- Goal flag = a yellow rectangle at the level end; touching it sets a `won` flag and renders "Level Complete".

---

## CONFIG Table (tunable constants)

| Constant | Default | Description |
|---|---|---|
| `TILE_SIZE` | 32 | Pixel size of one tile. |
| `GRAVITY` | 0.5 | Downward acceleration per frame (px/frame²). |
| `MAX_FALL_SPEED` | 12 | Terminal velocity. |
| `MOVE_ACCEL` | 0.8 | Horizontal acceleration when input held. |
| `MOVE_DECEL` | 1.2 | Horizontal deceleration when no input (snappier than accel = crisp stops). |
| `MAX_RUN_SPEED` | 5 | Horizontal speed cap. |
| `JUMP_VELOCITY` | -10 | Initial jump velocity. |
| `JUMP_CUT_VELOCITY` | -3.5 | vy is clamped to this on Space-release during upward motion. |
| `COYOTE_FRAMES` | 6 | Frames after leaving ground where jump is still allowed. |
| `JUMP_BUFFER_FRAMES` | 6 | Frames before landing where a Space press is remembered. |
| `REBOUND_MIN_SPEED` | 6 | Minimum rebound velocity magnitude. |
| `REBOUND_MAX_SPEED` | 16 | Maximum rebound velocity magnitude. |
| `REBOUND_MAX_DEPTH_TILES` | 4 | Overlap depth at which rebound speed saturates. |
| `REBOUND_AIR_CONTROL` | 0.5 | Horizontal accel multiplier during rebound state. |
| `REBOUND_STATE_DURATION` | 0.4 | Seconds the rebound state lasts (steering window). |
| `PERMEATE_COOLDOWN` | 0.2 | Seconds after rebound before Permeation can re-activate. |
| `STUCK_SEARCH_RADIUS` | 6 | Tiles to search in each cardinal direction before declaring stuck. |
| `STUCK_DURATION` | 0.5 | Seconds frozen before respawn. |
| `PLAYER_W` | 24 | Player hitbox width. |
| `PLAYER_H` | 40 | Player hitbox height. |

---

## Technical Architecture

**File structure** (all in one `index.html`):
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
      // === LEVEL DATA ===     (2D array, 30 cols × 51 rows for 1×3 screens)
      // === INPUT ===          (keydown/keyup → keys{} map; edge-detect press/release)
      // === PLAYER STATE ===   ({x,y,vx,vy,state,coyote,buffer,...})
      // === PHYSICS HELPERS ===
      //   - tileAt(px,py)
      //   - aabbVsTiles(rect)                  → list of overlapping solid tiles
      //   - moveAndCollide(dx,dy)              → swept-AABB resolution, axis-separated
      //   - computeRebound(rect)               → {vx, vy, stuck} via min-cardinal-penetration
      // === STEP (fixed dt) ===
      //   1. read input edges
      //   2. update timers (coyote, buffer, cooldown, stuck, rebound)
      //   3. handle state transitions:
      //        Solid: normal physics + collision
      //        Permeating: gravity only, no collision
      //        on Shift release while overlapping: computeRebound() → Rebounding | Stuck
      //        Rebounding: physics with reduced air-control, expires by timer or landing
      //        Stuck: frozen, on timer expire → respawn
      //   4. integrate, collide (if Solid/Rebounding), resolve
      //   5. check goal collision → won
      // === RENDER ===
      //   - clear → draw tiles → draw goal → draw player (with state-dependent alpha/stroke)
      //   - HUD: state name + control hint
      //   - "Level Complete" overlay if won
      // === MAIN LOOP ===
      //   - rAF → accumulator → step() N times → render()
    </script>
  </body>
</html>
```

### Rebound math (the heart of the demo)

```
function computeRebound(playerRect):
  # Find all solid tiles overlapping playerRect
  overlapped = aabbVsTiles(playerRect)
  if overlapped is empty: return {fire: false}

  # Compute the union AABB of overlapping tiles intersected with player
  # Equivalently, compute penetration in each cardinal direction:
  pUp    = playerRect.bottom - topmost_solid.top       # distance to push up so playerRect.bottom ≤ tile.top
  pDown  = bottommost_solid.bottom - playerRect.top
  pLeft  = playerRect.right - leftmost_solid.left
  pRight = rightmost_solid.right - playerRect.left

  # But we also need: in each direction, is there enough open space to land in?
  # Cast a ray in each direction in 1-tile steps until empty tile is found.
  # If any direction's clear distance > STUCK_SEARCH_RADIUS tiles → that direction is "blocked"
  # If ALL four are blocked → STUCK
  exits = [
    (UP,    pUp,    castClearRay(rect, UP)),
    (DOWN,  pDown,  castClearRay(rect, DOWN)),
    (LEFT,  pLeft,  castClearRay(rect, LEFT)),
    (RIGHT, pRight, castClearRay(rect, RIGHT)),
  ]
  viable = [e for e in exits if e.clear ≤ STUCK_SEARCH_RADIUS]
  if viable is empty: return {stuck: true}

  # Choose the direction with smallest penetration; tie-break preferring UP.
  best = min(viable, key=(penetration, !isUp))

  # Magnitude scales with depth, clamped.
  depth_norm = clamp(best.penetration / (REBOUND_MAX_DEPTH_TILES * TILE_SIZE), 0, 1)
  speed = lerp(REBOUND_MIN_SPEED, REBOUND_MAX_SPEED, depth_norm)

  # Apply along chosen axis. Also nudge player just outside the overlap so re-collision
  # doesn't immediately re-trap them.
  return {fire: true, vx, vy, snapDx, snapDy}
```

### State machine

```
SOLID ──Shift down──▶ PERMEATING
PERMEATING ──Shift up & overlap──▶ REBOUNDING (or STUCK if no exit)
PERMEATING ──Shift up & no overlap──▶ SOLID
REBOUNDING ──timer expires OR (vy>=0 & grounded)──▶ SOLID (with PERMEATE_COOLDOWN running)
STUCK ──timer expires──▶ respawn → SOLID
SOLID ──touch goal──▶ WON
```

---

## Critical Files To Be Created

- `C:\Users\rafae\source\games\index.html` — the entire deliverable, a single self-contained file.

No existing files to modify. No existing utilities to reuse (greenfield).

---

## Level Layout (1 screen wide × 3 screens tall = 30 cols × ~51 rows)

```
Top of level (rows 0–17)              ← Beat 3: tall column with one 1-tile horizontal gap
                                        Player must release Shift while aligned with gap.

Middle (rows 18–34)                   ← Beat 2: thick block, dive down through it,
                                        release to rocket up to a high ledge with the goal nearby.

Bottom (rows 35–50)                   ← Beat 1: spawn here. Thin floor + pit below leads to
                                        a platform that connects rightward into Beat 2's column.

Goal flag: top-right of the screen, accessible only after Beat 3.
```

Player spawns at bottom-left. Camera follows player vertically (clamped to level bounds), horizontally fixed since level is 1-screen wide.

---

## Verification Plan

1. **Open** `index.html` directly in Chrome/Firefox/Edge — no server needed (no fetch, no modules).
2. **Movement feel**: walk left/right, confirm crisp acceleration and snappier deceleration. Jump and confirm variable height (tap = short hop, hold = full jump). Run off ledge and confirm coyote-time jump still works.
3. **Beat 1**: stand on thin floor over pit. Hold Shift → fall through. Release Shift in mid-air below → re-solidify, no rebound. Land on platform.
4. **Beat 2**: jump into top of thick block, hold Shift, fall ~3 tiles deep, release Shift → confirm upward rebound launches you to the high ledge unreachable by jump.
5. **Beat 3**: at the tall column, hold Shift, drift sideways while falling, release Shift when player center is aligned with the 1-tile horizontal gap → confirm sideways ejection through the gap.
6. **Stuck case**: hold Shift, wait until fully embedded inside a thick wall (>6 tiles of solid in every direction) — confirm red flash + respawn at start. (May need to construct a test pocket; for the shipped level, try to provoke it by burying yourself in the densest part of Beat 2.)
7. **Cooldown**: after a rebound, immediately mash Shift — confirm 0.2s window where Permeation cannot re-activate (HUD should not flip to Permeating).
8. **R key**: at any point press R → respawn at start.
9. **Goal**: touch the yellow flag → "Level Complete" overlay appears.
10. **HUD**: confirm state label updates (Solid / Permeating / Rebounding / Stuck) and control hint is readable.

---

## Output Format Reminder

The user's `## 7. Output format` section asks the response to include, in order:
1. Design summary (5–8 bullets)
2. CONFIG markdown table
3. Full single-file HTML in one code block, with heavy comments in physics/rebound section
4. Three suggested next steps

The plan above already covers items 1 and 2; items 3 and 4 will be produced after plan approval.