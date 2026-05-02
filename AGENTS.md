# AGENTS.md

Guidance for AI agents working in this repository.

## Git Rules

Never commit or stage changes, let the user do it manually. You may check the staged changes to understand what changes, but you may only change the working directory.

## Project Shape

This is a small single-page canvas platformer. The playable game lives in
`index.html`, with embedded CSS and JavaScript. The current mechanic is
permeation buoyancy: the player can become intangible, sink through solid
matter, and release from depth to rebound upward.

Supporting notes:

- `Plan.md` describes the intended game feel, state machine, controls, and
  behavior validations.
- `Lore.md` describes the larger Shadow Cats / Open Claw fantasy. Treat it as
  useful direction for theme, naming, and future expansion.
- `smoke-test.js` is the lightweight Node-based regression suite.

## Commands

Run the smoke tests with:

```powershell
node .\smoke-test.js
```

There is no build step. `index.html` can be opened directly in a browser.

## Implementation Notes

- Keep the game dependency-free unless there is a strong reason to add a
  library.
- Prefer small, direct edits in `index.html`; this project intentionally keeps
  the demo compact.
- Preserve the existing fixed-step simulation style in `step(dt)`.
- The tile map uses 32 px cells and string rows:
  - `#` = solid terrain
  - `.` = empty space
  - `0` = player spawn and checkpoint zero
  - `@` = goal
  - single ASCII letters = dynamic entity markers
  - digits `0` to `9` = checkpoints
- Multiple levels are defined in `LEVELS` with `defineLevel({ ... })`. Keep
  authored levels readable: use literal ASCII `map` rows as the terrain source
  of truth. Put dynamic entity geometry directly in the map and keep entity
  behavior settings in the nearby `entities` array.
- Level entities should use named object fields rather than positional helper
  arguments:
  - movers: `kind`, `char`, `name`, `role`, and `motion`
  - asteroids: `kind`, `char`, `name`, and `timing`
- The entity `char` is case-sensitive and must be a single ASCII letter. Each
  connected group of matching letters becomes one rectangular runtime entity;
  separate groups using the same letter create multiple entities with shared
  behavior.
- Do not use entity `at` / `size` fields or a separate `checkpoints` property.
  Checkpoint digits in the map are parsed in numeric order, including `0` as
  the spawn checkpoint, and recovery always uses the largest checkpoint
  reached.
- `defineLevel()` normalizes authored map markers and entity objects into the
  runtime shape used by the simulation, including `spawn`, `goal`,
  `checkpoints`, and `entities`. Keep marker parsing there; `parseLevel()`
  should only rebuild terrain and dimensions. Use `loadLevel(index)` rather
  than mutating map globals directly.
- Different levels may have different row and column counts. Within a single
  level, every map row must have the same number of columns; `parseLevel()`
  throws an error for uneven row widths.
- Levels may be wider than the 960 px viewport. The camera tracks both
  horizontal and vertical player movement through `updateCamera()`, clamping to
  the active level bounds.
- Authored levels must be reachable under the measured player limits in
  `smoke-test.js`. The reachability smoke test derives standable terrain and
  mover surfaces from the map, then checks spawn-to-goal traversal using normal
  jump height, rebound height by mass depth, pass-through caps, horizontal
  reach, and two-row player clearance. When changing terrain or mover geometry,
  prefer fixing unreachable gaps in the map over loosening the audit.
- If level switching changes, keep `window.gameInternals` useful for tests by
  exposing live getters for active level data, dimensions, and camera position.
- Rebound tuning is intentionally target-based. `reboundTargetRiseTiles()`
  maps lower-body depth and mass height to the measured jump/rebound table, and
  the launch-speed helper converts that target into fixed-step motion. Prefer
  extending this model over adding separate deep-bonus formulas.
- Rebound targets are measured from the planned top exit, `reboundExitY`, not
  from the release depth. While rebounding, the player phases upward until the
  planned exit, then receives the launch velocity for the full target rise.
  Deep releases in tall masses should still reach the capped target height from
  that exit; do not subtract embedded depth from post-exit launch height.
- Manual and assisted chain rebounds should preserve strong upward energy at
  rebound boundaries. Avoid changes that collapse queued chain exits into small
  per-tile bumps; keep the smoke coverage that records chain exit velocity and
  exit-relative rebound peak height.
- Permeation pass-through is also target-based: short falls should be resisted
  by drag, center pull, and bottom brake, while falls that meet the tuned tile
  threshold should carry through. Keep max-speed entry through static matter
  aligned with the player limit measurement tests.

## Gameplay Expectations

Maintain the feel described in `Plan.md`:

- Permeation should feel viscous, not like normal free fall.
- Intentional high falls should be able to punch through solid matter while
  short accidental falls onto thinner tiles should still feel catchable.
- Rebound should be based on meaningful lower-body embedding in solid matter.
- Deep releases near the bottom of taller solid matter should produce a
  noticeably stronger, visually distinct rebound.
- Upper-body-only release should phase clear without firing a rebound.
- Blocked upward escape should enter `stuck` briefly and recover cleanly.
- Manual and assisted chain rebound should remain responsive.
- Reset with `R` should respawn at the largest checkpoint reached in the
  current level.
- Completing a non-final level should allow advancing to the next level.

## Testing Expectations

Before finishing behavior changes, run:

```powershell
node .\smoke-test.js
```

Add smoke coverage when changing:

- player state transitions
- collision or tile parsing
- dynamic matter, moving platforms, asteroids, or checkpoints
- rebound/stuck behavior
- permeation momentum, including short-fall catch behavior and high-fall
  pass-through behavior
- player limit tuning, including normal jump height, terminal fall distance,
  rebound target heights, minimum pass-through fall heights, and max-speed
  pass-through thickness
- level loading or goal completion
- authored level reachability, especially terrain gaps, rebound mass heights,
  moving platform surfaces, player clearance, and goal shelf access
- camera tracking or active level dimensions
- exposed `window.gameInternals` test hooks

## Style

- Keep code readable and plain JavaScript.
- Use ASCII unless an existing file clearly calls for otherwise.
- Avoid broad refactors while tuning mechanics.
- Keep HUD text short enough to fit the existing overlay.
- When adding levels, preserve consistent row widths within each map. Wider
  maps are encouraged when the route benefits from horizontal traversal. Keep
  entity lists ordered roughly in route order so the level design is easy to
  scan from code. Place entity letters and checkpoint digits where they belong
  in the route, keep same-letter entity clusters rectangular, and run the
  reachability smoke test before relying on a visually plausible route.
