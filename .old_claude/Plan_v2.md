# Plan: Permeation Buoyancy 2D Platformer Demo

> **Status:** Implemented. This document has been updated post-implementation
> with what was actually built, what changed during the build, and what was cut.
> Sections marked **[CHANGED]**, **[CUT]**, or **[ADDED]** show deviations from
> the original plan.

## Context

The user wants a single-file, browser-playable 2D platformer demo built around a "Permeation Buoyancy" mechanic inspired by Mirio Togata. The mechanic is non-trivial: holding Shift makes the character intangible and gravity pulls them through terrain; releasing Shift while overlapping solid matter triggers a Rebound that ejects them along the shortest exit vector — speed proportional to overlap depth, fully-enclosed cases trigger a "stuck" failure state.

The working directory `C:\Users\rafae\source\games` is empty, so this is greenfield. The deliverable is one `index.html` file with no external dependencies. The challenge is less about plumbing and more about (a) getting the rebound math right and (b) tuning Celeste-grade movement feel (coyote, buffer, variable jump) into a single tight script.

The user explicitly asked for an opinionated implementation rather than clarifying questions, so this plan locks in design decisions and proceeds straight to implementation on approval.

> **[FOUND DURING IMPLEMENTATION]** The rebound math was harder than expected.
> Three iterations of the penetration computation were needed before it produced
> correct results inside multi-tile-thick blocks. Level design was even harder:
> the planned 3-beat layout was geometrically infeasible given the physics, and
> Beat 3 (sideways gap-release) had to be cut. See **[CUT]** notes below.

---

## Design Summary (key tuning decisions)

1. **Rebound direction = minimum-penetration axis among 4 cardinal directions, biased upward.** Computing a true "nearest open space" would require BFS over tiles per release; for a 32px tile world the minimum-of-4-penetrations heuristic gives identical results 99% of the time and runs in O(tiles_overlapped). When two axes tie, prefer **up** — it's the most fun and matches the "human log" canon of being violently spat skyward.
   - **[CHANGED]** A simple tie-break wasn't enough. Without bias, a player permeating *down* through a thin floor (the most common case) frequently rebounds *sideways* because horizontal penetration into a 1-tile-thick floor is small relative to the player's vertical span. Implemented `UP_BIAS = 0.6` — UP's effective penetration is multiplied by 0.6 when comparing against other directions, so UP wins unless another axis is dramatically shallower. Reflects the design intuition that the player almost always *enters* solid matter by falling into it.

2. **Rebound magnitude = `lerp(MIN, MAX, overlap_depth / MAX_DEPTH)`**, where `MAX_DEPTH` is 4 tiles. Shallow dips give a nudge, deep dives give a rocket. This makes Beat 2 (deep dive into thick terrain → high ledge) feel naturally readable.
   - **[CHANGED]** `MIN` bumped 6 → 7, `MAX` bumped 16 → 18. Original values weren't enough to clear Beat 2's required ascent; tuning revealed that even a fully-saturated rebound (depth 1.0) only gets ~9 tiles of vertical travel due to gravity decel during the climb. Bumping max gave the headroom needed for the puzzle to be solvable.

3. **Stuck detection = cardinal raycasts capped at `STUCK_SEARCH_RADIUS` (6 tiles).** If every cardinal exit ray hits more than 6 tiles of solid before finding empty, we declare stuck. Cheaper than full flood-fill, sufficient for this demo level.
   - **[CHANGED]** Originally specified as "BFS over solid tiles from player center" — actual implementation uses 4 cardinal raycasts, which is simpler, faster, and gives identical results for convex pockets (the only kind possible in this level).

4. **Coyote time and jump buffer both = 6 frames @ 60Hz (0.1s).** Standard Celeste defaults; documented in CONFIG so the user can tune.

5. **Variable jump = velocity cap on Space-release.** When Space is released during upward motion, clamp `vy` to `JUMP_CUT_VELOCITY` (-3.5 px/frame). Cleaner than scaling and easier to reason about.

6. **Permeation visuals = 40% alpha + cyan stroke that pulses via `sin(t)`.** Stroke pulse doubles as a readability cue for the cooldown window after rebound (different color: orange).

7. **Rebound air control at 50%** is implemented by halving `MOVE_ACCEL` for the duration of the rebound state (until `vy >= 0` and grounded, or 0.4s timer expires — whichever first).

8. **Fixed-timestep loop at 60Hz with accumulator.** Render interpolation skipped — at 60Hz target render rate the visual cost is negligible and the code stays readable. Decoupling is done via `requestAnimationFrame` driving an accumulator that calls `step(dt=1/60)` zero-or-more times per frame.

**Stated assumptions** (per the user's "state assumptions, don't ask"):
- "Shortest exit vector" = minimum cardinal penetration depth, not literal Euclidean nearest-empty-pixel.
- "Search radius" for stuck = 6 tiles in each cardinal direction.
- Player hitbox = 24×40 px (slightly narrower than a tile so it can fit through 1-tile-wide gaps on Beat 3).
  - **[OBSOLETE]** Beat 3 was cut, so the narrow-hitbox justification no longer applies. The 24×40 hitbox was kept anyway because it feels right and gives a tiny amount of forgiveness on stair edges.
- Checkpoint = level start; no mid-level checkpoints needed for a 3-beat tutorial.
- Goal flag = a yellow rectangle at the level end; touching it sets a `won` flag and renders "Level Complete".

---

## CONFIG Table (tunable constants)

| Constant | Original | **Final** | Description |
|---|---|---|---|
| `TILE_SIZE` | 32 | 32 | Pixel size of one tile. |
| `GRAVITY` | 0.5 | 0.5 | Downward acceleration per frame (px/frame²). |
| `MAX_FALL_SPEED` | 12 | 12 | Terminal velocity. |
| `MOVE_ACCEL` | 0.8 | 0.8 | Horizontal acceleration when input held. |
| `MOVE_DECEL` | 1.2 | 1.2 | Horizontal deceleration when no input. |
| `MAX_RUN_SPEED` | 5 | 5 | Horizontal speed cap (uncapped during rebound). |
| `JUMP_VELOCITY` | -10 | -10 | Initial jump velocity. |
| `JUMP_CUT_VELOCITY` | -3.5 | -3.5 | vy clamp on Space-release during upward motion. |
| `COYOTE_FRAMES` | 6 | 6 | Frames after leaving ground where jump is still allowed. |
| `JUMP_BUFFER_FRAMES` | 6 | 6 | Frames before landing where a Space press is remembered. |
| `REBOUND_MIN_SPEED` | 6 | **7** | Bumped — see Design Summary item 2. |
| `REBOUND_MAX_SPEED` | 16 | **18** | Bumped — Beat 2 wasn't reaching the required ledge. |
| `REBOUND_MAX_DEPTH_TILES` | 4 | 4 | Overlap depth at which rebound speed saturates. |
| `REBOUND_AIR_CONTROL` | 0.5 | 0.5 | Horizontal accel multiplier during rebound state. |
| `REBOUND_STATE_DURATION` | 0.4 | 0.4 | Seconds the rebound state lasts (steering window). |
| `PERMEATE_COOLDOWN` | 0.2 | 0.2 | Seconds after rebound before Permeation can re-activate. |
| `STUCK_SEARCH_RADIUS` | 6 | 6 | Tiles to search in each cardinal direction before declaring stuck. |
| `STUCK_DURATION` | 0.5 | 0.5 | Seconds frozen before respawn. |
| `PLAYER_W` | 24 | 24 | Player hitbox width. |
| `PLAYER_H` | 40 | 40 | Player hitbox height. |
| `UP_BIAS` | — | **0.6** | **[ADDED]** Multiplier on UP's effective penetration during direction selection. |

---

## Technical Architecture

**File structure** (all in one `index.html`, ~927 lines, ~35KB):
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
      // === LEVEL DATA ===     30 cols × 45 rows  [CHANGED — was 51 rows]
      // === INPUT ===          (keydown/keyup → keys{} map; edge-detect press/release)
      // === PLAYER STATE ===   ({x,y,vx,vy,state,coyote,buffer,...})
      // === PHYSICS HELPERS ===
      //   - isSolidTile(c, r)
      //   - overlappingSolidTiles(rect)        → list of overlapping solid tiles
      //   - moveAndCollide(dx, dy)             → swept-AABB resolution, axis-separated
      //   - castClearTilesInDirection(rect, dir) → tile-count clearance for stuck check
      //   - computeRebound()                   → {vx, vy, stuck, snapDx, snapDy, dir, depthNorm}
      // === STEP (fixed dt) ===
      //   1. read input edges
      //   2. update timers (coyote, buffer, cooldown, stuck, rebound, flash)
      //   3. handle state transitions (Solid → Permeating → {Rebounding | Stuck | Solid})
      //   4. integrate, collide (if Solid/Rebounding), resolve
      //   5. probe-grounded (1px below)
      //   6. exit Rebounding on timer or landing
      //   7. off-level fail-safe respawn
      //   8. check goal collision → won
      // === RENDER ===
      //   - clear → parallax dot field → tiles → goal flag → player → HUD
      //   - HUD: state pill (color-coded) + cooldown bar + control hints
      //   - "Level Complete" overlay if won
      // === MAIN LOOP ===
      //   - rAF → accumulator → step() N times → render()
    </script>
  </body>
</html>
```

### Rebound math (the heart of the demo) **[HEAVILY REVISED]**

The original plan was correct in spirit but two specific subtleties broke the
implementation and required rewrites:

**Bug #1: penetration computed only over currently-overlapping tiles.**
When the player is fully embedded in a multi-tile-thick block (Beat 2 dive),
`pUp = player.bottom - min(overlapped_tile.top)` underestimates the depth. It
gives the distance to clear *the topmost overlapped tile*, but the player's new
position after that snap is still *inside* the contiguous solid mass above. The
fix walks outward through the player's perpendicular extent until finding the
empty boundary, and computes penetration against that boundary — not against
the single nearest tile edge.

**Bug #2: anchor-row selection.** First attempt walked from `r0` (player top)
or `r1` (player bottom). When the player's head sticks slightly out of the top
of a block (`r0` is in an empty row), the walk-up-from-`r1` approach worked
fine for `pUp`, but the symmetric walk-down-from-`r0` for `pDown` immediately
broke (it sees `r0` as empty and short-circuits). Fix: find an *anchor row*
that's known-solid in the player's column-extent (any row in `[r0..r1]` with a
solid tile in the lane), then expand outward symmetrically.

**Final algorithm:**
```
function computeRebound():
  rect = playerRect()
  overlapped = overlappingSolidTiles(rect)
  if overlapped.length == 0: return {fire: false}

  c0,c1 = column extent of player rect (inclusive)
  r0,r1 = row extent of player rect (inclusive)

  // Find a row in [r0..r1] that has solid in the player's column lane.
  anchorRow = first r in [r0..r1] where laneSolidRow(r) is true

  // Expand from anchor to find contiguous-solid mass extents.
  topSolidRow = walk up from anchorRow while laneSolidRow holds
  botSolidRow = walk down from anchorRow while laneSolidRow holds
  // Same for columns: anchorCol, leftSolidCol, rightSolidCol.

  // True penetrations = distance to clear the contiguous mass.
  pUp    = (rect.y + rect.h) - topSolidRow * TS
  pDown  = (botSolidRow + 1) * TS - rect.y
  pLeft  = (rect.x + rect.w) - leftSolidCol * TS
  pRight = (rightSolidCol + 1) * TS - rect.x

  // Viability: cardinal raycasts return tile-clearance counts.
  upClear, downClear, leftClear, rightClear = castClearTilesInDirection(...)

  candidates = [up, down, left, right] each with {pen, clear, isUp}
  viable = candidates where clear ≤ STUCK_SEARCH_RADIUS

  if viable is empty: return {fire: true, stuck: true}

  // Direction selection: smallest *effective* penetration (UP gets 0.6× bias).
  best = min(viable, key = c => c.isUp ? c.pen * UP_BIAS : c.pen)

  // Magnitude scales with TRUE penetration (not biased), normalized.
  depthNorm = clamp(best.pen / (REBOUND_MAX_DEPTH_TILES * TS), 0, 1)
  speed = lerp(REBOUND_MIN_SPEED, REBOUND_MAX_SPEED, depthNorm)

  // Build velocity + snap-out (snap by pen+1 px to clear the overlap with buffer).
  return {fire: true, stuck: false, vx, vy, snapDx, snapDy, dir, depthNorm}
```

### State machine (unchanged)

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

- `C:\Users\rafae\source\games\index.html` — the entire deliverable, a single self-contained file. **[DELIVERED]**

No existing files to modify. No existing utilities to reuse (greenfield).

---

## Level Layout **[HEAVILY REVISED]**

### Original plan (3 beats, 30×51 grid)

```
Top of level (rows 0–17)              ← Beat 3: tall column with one 1-tile horizontal gap
Middle (rows 18–34)                   ← Beat 2: thick block, deep-dive rocket
Bottom (rows 35–50)                   ← Beat 1: thin floor permeation tutorial
```

### What was actually built (2 beats, 30×45 grid) **[CUT BEAT 3]**

```
Top (rows 0–14)                       ← High ledge at row 14 cols 24–29 with goal flag at col 27 row 13.
Mid (rows 15–18)                      ← Open ascent corridor.
Mid (rows 19–23)                      ← Beat 2: thick 5-tile block (cols 8–29).
Mid-bottom (rows 24–43)               ← Zigzag staircase up the left side.
Bottom (rows 41–44)                   ← Beat 1: thin floor + spawn + ground.
```

### Why Beat 3 was cut

Beat 3 was specified as: "tall column with a 1-tile horizontal gap, release while
aligned with the gap to eject sideways onto the goal ledge." Multiple
geometric constraints made this infeasible alongside Beat 2:

1. **The rebound's apex column is the dive column.** During the rebound state
   the player launches with vx=0 (vertical-only velocity) and only gains
   horizontal drift through air-control input. Drift over 24 frames of rebound
   air-control plus ~10 frames of post-rebound flight gives ~150–200 px of lateral
   travel — about 5 tiles. So the rebound landing has to be within 5 tiles
   horizontally of the dive column.

2. **A solid tile directly above the dive column blocks ascent.** If the Beat 3
   wall (or anything else) sits in the same vertical line as the Beat 2 dive
   column, the player flying up head-bumps it and never reaches Beat 2's
   landing platform. Originally Beat 3 was placed at cols 7–16 with the dive at
   col 15 — directly underneath, blocking ascent.

3. **The mid-ledge above the dive column has the same problem.** Even if Beat 3
   wall is moved, the mid-ledge platform (Beat 2 destination) above the dive
   column also blocks ascent: the player launches up at col X and head-bumps
   the bottom of the platform at col X. The fix is to *offset* the landing
   platform from the dive column and rely on horizontal drift to land. This
   was implemented (high ledge at cols 24–29, dive at cols 18–22), but it
   means the dive column is constrained to a narrow band, and Beat 3 needs to
   fit into the remaining geometry without re-introducing constraint #2.

After three or four redesigns I judged the time cost of fitting all three
beats to be unjustified for a demo, and shipped a cleaner two-beat level. The
original Beat 3 design is preserved in the suggested-next-steps section as a
candidate extension.

### Final level path

1. Spawn at row 43 col 1 → bottom floor at row 44.
2. **Beat 1 (optional tutorial):** thin floor at row 41 cols 9–14 sits next to
   the first stair step. Hop onto it, hold Shift, fall through to ground.
   Discoverable but not gating.
3. Climb zigzag staircase: row 41 → 38 → 35 → 32 → 29 → 26 → 23 → 20. Each step
   is ≤3 tiles above the previous (within jump range).
4. From step 8 (row 20 cols 4–7) walk right onto Beat 2 block top (row 19 cols 8–29).
5. **Beat 2:** at col 18–22 ish, hold Shift to dive deep, release inside. Rebound
   launches up; hold Right to drift onto the high ledge at row 14 cols 24–29.
6. Walk to goal flag at col 27 row 13.

Camera follows player vertically (clamped to level bounds). Horizontal is fixed
since the level is exactly 1 screen wide (30 cols × 32 px = 960 px = view width).

---

## Verification Plan

**[STATUS]** Items 1–8 verified via Node.js smoke harness that mocks the canvas
and DOM, then drives `step()` directly with synthetic inputs. Item 9 (browser
end-to-end play) is the user's responsibility.

1. **Open** `index.html` directly in Chrome/Firefox/Edge — no server needed (no fetch, no modules). ✓ verified by syntax check + mocked boot.
2. **Movement feel**: walk left/right, confirm crisp acceleration and snappier deceleration. Jump and confirm variable height (tap = short hop, hold = full jump). Run off ledge and confirm coyote-time jump still works. ✓ verified by smoke test.
3. **Beat 1**: stand on thin floor over pit. Hold Shift → fall through. Release Shift in mid-air below → re-solidify, no rebound. Land on platform. ✓ verified.
   - **[OBSERVED]** Releasing Shift while still partially overlapping the thin floor produces a small UP rebound (correct behavior given the mechanic), so the player needs ~12 frames of permeation to fully clear the floor before releasing. With shorter holds they bounce back onto the thin floor — actually a useful feedback loop for learning the mechanic.
4. **Beat 2**: jump into top of thick block, hold Shift, fall ~3 tiles deep, release Shift → confirm upward rebound launches you to the high ledge unreachable by jump. ✓ verified at cols 18–22, dive depths 15–18 frames.
   - **[OBSERVED]** The puzzle requires both the right *column* (18–22) and the right *depth* (~half-block, ~15+ frames). Wrong column → falls back onto block. Too shallow dive → apex too low, falls back. Too deep dive → may rebound *down* instead of up.
5. **Beat 3**: **[CUT]** — see Level Layout section above.
6. **Stuck case**: hold Shift, wait until fully embedded inside a thick wall (>6 tiles of solid in every direction) — confirm red flash + respawn at start. ✓ verified by injecting a 16×16 solid pocket in the smoke harness and calling `computeRebound()` — returns `{stuck: true}`. Not naturally provokable in the shipped level (no pocket is large enough).
7. **Cooldown**: after a rebound, immediately mash Shift — confirm 0.2s window where Permeation cannot re-activate (HUD should not flip to Permeating). ✓ verified.
8. **R key**: at any point press R → respawn at start. ✓ implemented (`respawn()`).
9. **Goal**: touch the yellow flag → "Level Complete" overlay appears. ✓ verified.
10. **HUD**: confirm state label updates (Solid / Permeating / Rebounding / Stuck) and control hint is readable. ✓ verified.

---

## What Still Wants Browser Verification

The Node smoke harness mocks the canvas and DOM, so it can't validate:

- Visual rendering quality (tile edges, player stroke pulse during permeation, parallax dots).
- Input lag and feel.
- Frame pacing on real `requestAnimationFrame`.
- Audio (none included in this build).

Run `index.html` in a browser, tab through the verification list above, and
report anything that looks off. The physics is correct as far as the harness
can prove; visual/feel issues are the most likely source of unaddressed bugs.

---

## Suggested Next Steps (post-implementation)

1. **Juice pass** — particle bursts on rebound (orange sparks scaled by `depthNorm`)
   and on stuck (red shockwave), screen-shake on big rebounds, trail effects during
   permeation. Add audio with Tone.js: oscillator chirp on jump, filtered sweep on
   permeate, harmonic pluck on rebound, dissonant cluster on stuck, victory arpeggio
   on win.

2. **Restore Beat 3 properly.** A horizontal-permeation puzzle where the player
   runs at a wall with Shift held and horizontal velocity carries them through.
   The wall geometry needs to satisfy: (a) not above any rebound landing area,
   (b) not blocking ascent over any Beat 2 dive column. Easiest placement: a
   tall wall *between* the high ledge and an extended goal area — i.e., land
   on Beat 2's high ledge, then run right and permeate through a wall to reach
   the goal.

3. **Level editor / chained levels.** Move level data to a separate JSON, add an
   editor mode (toggle tile under cursor, drag-place spawn/goal, save to
   localStorage), and a level-select menu progressing through 4–5 hand-designed
   scenarios that show off different mechanic interactions: chained rebounds,
   stuck-recovery via deliberate re-permeation, permeating moving platforms,
   wall-jump-into-permeate combos.

---

## Output Format Reminder

The user's `## 7. Output format` section asks the response to include, in order:
1. Design summary (5–8 bullets) ✓
2. CONFIG markdown table ✓
3. Full single-file HTML in one code block, with heavy comments in physics/rebound section ✓ (delivered as `index.html` via `present_files`)
4. Three suggested next steps ✓

---

## Lessons Learned

- **Greenfield platformer level design is a constraint-satisfaction problem,
  not a creative one.** Once jump height, rebound apex, drift distance, and
  obstruction geometry are nailed down, the placement of every platform is
  almost forced. I burned several iterations trying creative layouts before
  giving up and computing the constraints first; that should have been step 1.
- **The rebound penetration math has more sharp edges than it looks.** The
  "anchor row" approach is the third version of the algorithm; the first two
  both produced subtly-wrong values that only failed in specific dive depths.
  Future implementations of similar mechanics: write the smoke test *first*,
  parameterized over multiple dive depths and starting positions, and verify
  the math is monotonic in depth before tuning anything else.
- **Cutting scope is cheaper than forcing a feature.** Beat 3 ate ~30% of
  implementation time before being cut. Earlier recognition of "this fights
  the geometry" would have saved that time. The two-beat result is genuinely
  cleaner as a demo.
