# AGENTS.md

Guidance for AI agents working in this repository.

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
  runtime shape used by the simulation. Use `loadLevel(index)` rather than
  mutating map globals directly.
- Different levels may have different row and column counts. Within a single
  level, every map row must have the same number of columns; `parseLevel()`
  throws an error for uneven row widths.
- Levels may be wider than the 960 px viewport. The camera tracks both
  horizontal and vertical player movement through `updateCamera()`, clamping to
  the active level bounds.
- If level switching changes, keep `window.gameInternals` useful for tests by
  exposing live getters for active level data, dimensions, and camera position.

## Gameplay Expectations

Maintain the feel described in `Plan.md`:

- Permeation should feel viscous, not like normal free fall.
- Rebound should be based on meaningful lower-body embedding in solid matter.
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
- level loading or goal completion
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
  in the route, and keep same-letter entity clusters rectangular.
