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
- `manifest.webmanifest` provides optional mobile install metadata. Mobile play
  should work well in the browser without requiring PWA installation.

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
  - `/` = non-solid hazard scar; touching it recovers the player to the
    largest checkpoint reached
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
- Keep `/` hazard tiles authored directly in map rows and detected from the
  active `LEVEL`; do not duplicate them into a separate parsed grid. They must
  remain outside solid collision, permeation, rebound, and reachability matter.
- Different levels may have different row and column counts. Within a single
  level, every map row must have the same number of columns; `parseLevel()`
  throws an error for uneven row widths.
- Levels may be wider than the 960 px viewport. The camera tracks both
  horizontal and vertical player movement through `updateCamera()`, clamping to
  the active level bounds.
- Authored levels must be reachable under the measured player limits in
  `smoke-test.js`. The reachability smoke test derives terrain matter, standable
  surfaces, mover path extents, and shallow slab-chain matter from the map, then
  checks spawn-to-goal traversal using normal jump height, rebound height by
  mass depth, pass-through caps, horizontal reach, and two-row player clearance
  for actual landing shelves. Do not add fake scaffold terrain only to appease
  the audit; if a route is mechanically valid through chain rebounds, moving
  matter, or ceiling-hang setup, teach or tune the audit to model that mechanic
  directly.
- If level switching changes, keep `window.gameInternals` useful for tests by
  exposing live getters for active level data, dimensions, and camera position.
- Mobile landscape play uses touch controls layered over the canvas:
  - the left joystick maps to left/right movement, with upward drag mapped to
    Space jump;
  - the right button is labeled `Hold`, maps to Shift while pressed, and shows
    a `^` cue because upward drag maps to Ctrl+Shift assisted chaining;
  - mobile control help in the HUD should show a small copy of the `Hold`
    button and explain only the right-button actions: hold to sink, release to
    rebound, and drag up to chain rebound. Do not explain the move stick there.
- Do not add a fake fullscreen button for iPhone Safari, and do not make PWA
  installation the primary mobile path. Keep `manifest.webmanifest` and mobile
  web app meta tags as optional install metadata, but browser play must not
  depend on users finding `Share > Add to Home Screen`.
- Mobile layout should treat the `.shell` as the single game surface. In mobile
  landscape, it should fill the visible viewport using `visualViewport` when
  available, keep logical canvas height at 540, and widen the logical canvas
  width to match the phone aspect ratio rather than stretching the scene.
  Desktop should keep the fixed 960 x 540 logical viewport.
- Mobile browser gestures should be suppressed across the game surface, canvas,
  HUD, and touch controls. Preserve `touch-action: none`, disabled text
  selection/callouts, non-passive gesture guards, and document/window cleanup
  for touch-owned virtual keys so iOS does not select text, page-zoom, scroll,
  open callouts, or leave controls stuck. Portrait should keep the rotate
  prompt.
- Rebound tuning is intentionally target-based. `reboundDepthLevel()` is the
  lower-body embedded depth in tile rows, clamped by the active mass height and
  the five-row tuning cap, so the center of a five-row mass is `2.5` and the
  bottom is `5.0`. `reboundTargetRiseTiles()` converts that depth level into
  target height with `2^(n - 1) + n`. The launch-speed helper then converts that
  target into fixed-step motion. Prefer extending this model over adding
  separate deep-bonus formulas.
- Rebound targets are measured from the planned top exit, `reboundExitY`, not
  from the release depth. While rebounding, the player phases upward until the
  planned exit, then receives the launch velocity for the full target rise.
  Deep releases in tall masses should still reach the capped target height from
  that exit; do not subtract embedded depth from post-exit launch height.
- Manual and assisted rebounds should use the same target-based launch velocity
  at the planned exit. Do not let Ctrl+Shift preserve the artificial surfacing
  speed as extra rebound height; keep smoke coverage comparing release and
  Ctrl+Shift rebound peaks, plus chain responsiveness.
- Shallow stacked rebound chains should be governed by the `player.chainLocked`
  flow: once a chain has started and there is more chain matter ahead in the
  player's vertical lane, the player should stay in permeating/rebounding
  rather than becoming `solid` or `stuck`. Keep this limited to shallow
  slab-ladder style chains so deep blocked upward escapes still enter `stuck`.
  Manual queued permeation should record this chain intent when Shift is
  pressed during `rebounding`, so a held-Shift queue can pull through a
  top-half-only ceiling overlap into the next rebound without a surfacing-time
  special case.
- Rebound horizontal boost is separate from vertical launch tuning: while
  `reboundMoveBoostActive()` is true, left/right movement uses
  `REBOUND_HORIZONTAL_MULTIPLIER` (currently 1.5x). Keep this derived from the
  existing rebound state and `player.reboundAirborneTimer` rather than adding a
  separate boost flag. Ctrl+Shift auto-chain should preserve the airborne
  rebound window through the upward permeation handoff, while manual queued
  permeation should clear it.
- The shared rebound depth scale is capped at five rows. Depths beyond that cap
  must still target a 21-tile rebound from the planned top exit. Keep smoke
  coverage for over-cap masses in the player limit measurements.
- The HUD rebound-depth meter should display the same capped depth scale via
  `reboundMeterLevel()`. Keep the meter visually represented by five structural
  segments rather than pixel-sized repeating backgrounds, so the displayed
  divisions stay aligned with the five-tile maximum at any HUD scale.
- Permeation pass-through is also target-based: short falls should be resisted
  by drag, center pull, and bottom brake, while falls that meet the tuned tile
  threshold should carry through. Keep max-speed entry through static matter
  aligned with the player limit measurement tests.
- Top-half-only permeation is intentional ceiling-hang behavior: when the
  player is permeating with only the upper body inside matter, they should hang
  without gravity or center pull unless the player opts in. Keep this modeled
  through `ceilingHangInfo()` and the single `player.ceilingPullMode` value
  (`null`, `"space"`, or `"assist"`) rather than separate booleans. Space
  latches center pull until normal lower-body permeation begins; Ctrl pulls
  toward center and rebounds only once the lower half is fully inside matter.
  Do not let the hang catch intentional pass-through dives that meet
  `isPassThroughDive()`.

## Gameplay Expectations

Maintain the feel described in `Plan.md`:

- Permeation should feel viscous, not like normal free fall.
- Intentional high falls should be able to punch through solid matter while
  short accidental falls onto thinner tiles should still feel catchable.
- Rebound should be based on meaningful lower-body embedding in solid matter.
- Deep releases near the bottom of taller solid matter should produce a
  noticeably stronger, visually distinct rebound.
- Upper-body-only release should phase clear without firing a rebound.
- Top-half-only permeation should be a stable ceiling hang with no input.
  Space should latch center pull without automatically rebounding, while Ctrl
  should pull inward and trigger the normal target-based rebound only after the
  lower half is fully embedded.
- Blocked upward escape should enter `stuck` briefly and recover cleanly.
- Manual and assisted chain rebound should remain responsive.
- Manual shallow chain routes should not require human frame-perfect Shift
  tapping; after the first valid manual release in a stacked chain, the player
  should not become `solid` or `stuck` until the route fully exits near the
  top.
- Rebound arcs should allow stronger horizontal shaping during the upward
  launch, including Ctrl+Shift chained rebounds.
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
- hazard recovery tiles, including checkpoint-preserving respawn and non-solid
  behavior
- dynamic matter, moving platforms, asteroids, or checkpoints
- rebound/stuck behavior
- shallow manual chain-lock behavior, including no-input completion of the
  first stacked chain and preservation of blocked-escape `stuck` recovery
- held-Shift manual chain behavior, including queued permeation through a
  top-half-only ceiling overlap without preserving auto-chain boost
- rebound horizontal boost behavior, including the active window, speed cap,
  apex cleanup, and Ctrl+Shift chain handoff
- permeation momentum, including short-fall catch behavior and high-fall
  pass-through behavior
- ceiling-hang behavior, including no-input stability, Space-latched center
  pull, Ctrl delayed rebound, and pass-through dives not being caught by the
  hang
- player limit tuning, including normal jump height, terminal fall distance,
  rebound target heights, minimum pass-through fall heights, and max-speed
  pass-through thickness
- HUD meter behavior or visual charge scaling, including rebound-depth meter
  levels, five visible segments, ARIA value text, and full/empty fill states
- mobile controls, HUD copy, touch mappings, gesture suppression, optional PWA
  manifest metadata, or mobile viewport behavior
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
