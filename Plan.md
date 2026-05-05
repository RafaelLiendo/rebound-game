# Plan: Permeation Buoyancy Platformer

## Intent

Create a compact 2D platformer centered on the feeling of becoming intangible,
passing through solid matter, and rebounding upward with buoyant force. The core
fantasy is not teleportation or instant ejection; it should feel like diving
into a dense medium, letting the material resist and hold the player, then using
depth to burst back into open air.

The experience should teach the mechanic through play across a short campaign.
The player first discovers that holding Permeate lets them slip through a thin
surface, then learns that meaningful lower-body embedding can turn depth into
targeted rebound height. Later levels build routes from pass-through dives,
ceiling hangs, moving matter, hazards, checkpoints, and manual or assisted
rebound chains.

This plan intentionally stays design-facing. It describes game feel, state flow,
controls, level beats, and validation expectations without duplicating the full
implementation notes in `AGENTS.md` or the executable checks in
`smoke-test.js`.

## Mechanics Feel

- Movement should feel responsive, readable, and expressive enough for platform
  play: quick horizontal control, forgiving jumps, and variable jump height.
- Permeation should make solid matter feel viscous rather than empty. The
  player should slow down inside it, be gently drawn toward the mass, and be
  resisted by thin surfaces unless the entry fall is committed enough to punch
  through.
- Rebound should build from the player's lower-body embedded depth. A valid
  release phases the player upward to a planned top exit, then launches them to
  a depth-based target height measured from that exit. During the upward rebound
  launch, horizontal steering should be stronger than normal movement so the
  player can shape the arc.
- A shallow release with the lower body embedded should produce a smaller pop.
  A deeper release should produce a stronger launch, with the shared rebound
  scale capped so very deep masses remain powerful but predictable.
- Releasing while only the upper body is still inside solid matter should not
  trigger a rebound. The player should continue clearing the material and return
  to normal once fully out.
- Top-half-only permeation should support a deliberate ceiling hang. With no
  input the player should stay pinned; Space should latch a center pull without
  automatically rebounding; Ctrl+Shift assist should pull inward and rebound
  only once the lower half is fully embedded.
- If the player attempts to rebound from a place with no plausible upward
  escape, the game should communicate that they are stuck and recover them
  cleanly.
- Chained permeation should reward timing: release to rebound, then re-enter
  permeation as soon as the body surfaces. Once a shallow chain route has begun,
  chain-lock behavior should keep it forgiving rather than requiring
  frame-perfect Shift taps.
- Auto chain should preserve the same mechanic while reducing execution burden:
  holding Ctrl+Shift should alternate between rebound and permeation whenever
  the current terrain supports it, and should stop when either input is
  released.
- Checkpoints, hazards, movers, asteroids, and wider scrolling levels should
  support the campaign without changing the core relationship between solid
  matter, permeation, and rebound.

## Controls

- Move: Left/Right arrows or A/D.
- Jump: Space. On mobile, dragging the left joystick upward maps to Jump.
- Permeate: Shift. On mobile, the right `Hold` button maps to Shift while held.
- Auto Rebound/Permeate assist: hold Ctrl+Shift. Desktop accepts either Ctrl
  key; mobile maps upward drag on the `Hold` button to Ctrl+Shift.
- Reset to latest checkpoint: R.
- Complete level prompt: Space, Enter, click, or tap advances after non-final
  levels; the final prompt restarts from checkpoint.

## State Machine

### States

- **Solid**: The default physical state. The player collides with terrain and
  solid entities, moves normally, jumps, lands, rides appropriate moving
  platforms, activates checkpoints, touches hazards, and can reach the goal.
- **Permeating**: The player is intangible to terrain and can pass through solid
  matter. While inside matter, movement is resisted, entry commitment matters,
  top-half-only overlap can become a ceiling hang, and lower-body embedding can
  become a rebound.
- **Rebounding**: The player has released or auto-triggered from a valid
  embedded position and is phasing upward to the planned exit before receiving
  the depth-targeted launch. Rebound horizontal steering is boosted during the
  active upward window.
- **Stuck**: The player attempted or failed to resolve a rebound where upward
  escape is not available. The game briefly communicates failure, then returns
  the player to a recoverable checkpoint position.
- **Won**: The player has reached the current level goal.

### Transitions

- **Start, load level, or reset -> Solid**: The player begins in a recoverable,
  playable position at the current level's largest reached checkpoint.
- **Solid -> Permeating**: The player presses Permeate.
- **Permeating -> Solid**: The player releases Permeate while clear of solid
  matter.
- **Permeating -> Permeating until clear -> Solid**: The player releases while
  only the upper body remains inside solid matter. No rebound fires; the player
  continues clearing the material, then returns to Solid.
- **Permeating -> Rebounding**: The player releases Permeate, or Ctrl+Shift
  assist triggers, while the lower body is embedded in solid matter and an
  upward exit is available.
- **Permeating -> Stuck**: The player tries to rebound from an embedded position
  where upward escape is blocked.
- **Rebounding -> Solid**: The player surfaces from the solid mass with no
  queued permeation or chain matter ahead.
- **Rebounding -> Permeating**: The player surfaces while a manual queue, a
  shallow chain lock, or auto chain is active.
- **Rebounding -> Stuck**: The rebound cannot resolve because the player remains
  trapped in solid matter.
- **Stuck -> Solid**: Recovery returns the player to the active checkpoint.
- **Any active state -> Solid**: Touching slash hazard scars, being crushed, or
  being hit by an active asteroid recovers to the active checkpoint.
- **Any active state -> Won**: The player reaches the goal.
- **Won -> Solid**: Reset or final completion prompt respawns at the largest
  reached checkpoint.
- **Won -> next level Solid**: Completing a non-final level allows advancing to
  the next level.

## Puzzle Beats

### Thin-Surface Discovery

The player encounters a thin solid surface that can be stood on normally.
Holding Permeate lets the player sink through it. This beat communicates that
permeation changes the relationship with terrain and that solid matter has a
distinct, slower feel while the player is inside it.

### Deep-Dive Rebound

The player reaches thicker terrain. A normal jump should not be enough to reach
the next meaningful ledge. The player dives into the mass, releases from a
valid lower-body embedded position, phases to the planned exit, launches upward,
and steers after surfacing to land in a new area.

### Pass-Through Commitment

Some routes require falling into matter with enough committed entry speed or
height to carry through. Short accidental drops onto thin surfaces should remain
catchable, while intentional high falls should punch through as a readable
choice.

### Ceiling-Hang Route

The player learns that upper-body-only permeation can become a stable hang
rather than an immediate fall or rebound. Space teaches manual pull-in control;
Ctrl+Shift teaches assisted pull-in and delayed rebound once the lower body is
fully embedded.

### Chain Rhythm

Once rebound is understood, the player can press Permeate again during the
rebound so the next permeation begins immediately on surfacing. Shallow stacked
routes should stay forgiving after the first successful manual chain, and
Ctrl+Shift should automate the rhythm while valid terrain keeps presenting
chain opportunities.

### Moving Matter And Hazards

Later beats combine rebound masses, moving platforms, moving rebound matter,
falling asteroid threats, slash hazard scars, checkpoints, and wider camera
movement. These additions should complicate route planning without obscuring
the central mechanic.

### Campaign Completion

Each level should teach or remix a distinct mechanic and end with a clear goal.
Completing a non-final level should offer a simple tap, click, Space, or Enter
advance; the final level should clearly communicate campaign completion and
allow restart from checkpoint.

## Behavior Validation

`smoke-test.js` is the executable source of regression truth. Before finishing
behavior changes, run:

```powershell
node .\smoke-test.js
```

These validations describe expected behavior while avoiding unnecessary
implementation detail.

### Automated Smoke Coverage

- **Input and mobile controls**: Virtual key edges, joystick movement/jump,
  right-button Hold behavior, drag-up Ctrl+Shift assist, release cleanup,
  gesture suppression, mobile viewport sizing, and optional install metadata
  should remain stable.
- **Level loading and authoring**: Levels should normalize map markers into
  spawn, goal, checkpoints, hazards, and dynamic entities; uneven rows or
  malformed entity markers should fail clearly; camera bounds should follow
  wider levels.
- **Checkpoint and hazard recovery**: Reset, slash hazards, asteroid impacts,
  and crush recovery should return the player to the largest checkpoint reached
  without downgrading progress or spawning inside terrain.
- **Auto assist climbs stacked platforms**: In a controlled vertical stack of
  separated platforms, holding Permeate and assist should repeatedly chain
  rebound into permeation. The player should interact with every platform in
  the stack and emerge above the final one without needing jump, key releases,
  or extra inputs.
- **Manual queue consumes on surfacing**: After a rebound begins, pressing and
  holding Permeate again should queue the next permeation. On the exact moment
  the player fully surfaces from solid matter, the queued permeation should take
  over immediately instead of briefly returning to Solid.
- **Manual chain-lock remains forgiving**: Manual shallow chain routes should be
  completable without frame-perfect tapping, including held-Shift queues through
  top-half-only ceiling overlap.
- **Rebound tuning and movement**: Manual release and Ctrl+Shift assist should
  share the same target-based launch heights, rebound depth should cap at the
  intended maximum, horizontal boost should apply during the upward rebound
  window, and boost cleanup should happen at the correct time.
- **Permeation momentum**: Short falls should be resisted and catchable; high
  committed falls should pass through; terminal-speed entry alone should not
  bypass the intended pass-through target.
- **Ceiling hang**: No-input ceiling hang should stay pinned, Space should latch
  center pull, Ctrl+Shift should trigger rebound only after lower-body
  embedding, and committed pass-through dives should not be caught by the hang.
- **Stuck recovery**: Blocked upward escape should enter Stuck, communicate
  failure, and recover to a playable Solid state.
- **HUD meter and presentation state**: The rebound-depth meter should match the
  capped depth scale, expose accurate ARIA text, and show five visible segments
  from empty through full.
- **Dynamic matter**: Moving platforms should carry the player when solid,
  dynamic rebound masses should trigger depth-based rebound, live moving exits
  should be respected, and asteroid impacts should recover cleanly.
- **Reachability and player limits**: Authored campaign levels should remain
  reachable under measured jump, rebound, pass-through, chain, mover, and
  clearance limits.

### Playable Mechanics Checks

- **Boot and reset**: The game should start at checkpoint zero and reset into a
  playable Solid state at the largest reached checkpoint with no immediate
  terrain overlap.
- **Basic movement**: Left/right movement, jump, short-hop behavior, landing,
  ledge forgiveness, and moving-platform carry should feel consistent and
  controllable.
- **Thin-surface permeation**: Holding Permeate on a thin surface should carry
  the player through it with a viscous, slowed feel rather than normal free-fall.
- **Release in open air**: Releasing Permeate while clear of solid matter should
  return the player to Solid without rebound.
- **Upper-body-only release**: Releasing while only the upper body remains in
  solid matter should keep the player permeating until fully clear, then return
  to Solid.
- **Lower-body embedded release**: Releasing while the lower body is embedded
  should trigger Rebounding, phase the player to the planned exit, then apply
  the depth-targeted launch.
- **Deep rebound**: A deeper valid release should produce enough upward momentum
  to reach a ledge that normal jumping cannot reach, while still allowing
  boosted steering after surfacing.
- **Pass-through dive**: An intentional high fall should be able to carry
  through matter that would catch a short fall.
- **Ceiling hang**: Upper-body-only permeation should hold stable without input,
  then respond predictably to Space or Ctrl+Shift pull-in.
- **Stuck recovery**: Rebounding into a blocked upward path should enter Stuck,
  communicate the failure, and recover cleanly.
- **Manual chain**: Re-pressing or holding Permeate during Rebounding should
  queue the next permeation and consume it immediately on surfacing.
- **Auto chain**: Holding Permeate and assist should repeatedly alternate
  between Permeating and Rebounding while valid terrain supports the rhythm.
- **Assist cancellation**: Releasing either Permeate or assist should stop the
  auto chain and return to the normal state flow.
- **Checkpoint and hazard clarity**: Checkpoint progress should be obvious
  enough through play, and hazard recovery should feel like a setback rather
  than a broken state.
- **Goal completion**: Touching the goal should enter Won, show completion, and
  allow advancement or checkpoint restart depending on campaign position.

## Presentation Cues

- The current state should be readable at a glance through the HUD, player
  color, meter, particles, overlay, and completion prompts.
- Permeating should look distinct from Solid and imply intangibility.
- Rebounding should look energetic and clearly different from ordinary jumping,
  with deeper rebounds reading as stronger.
- Ceiling hang, pass-through dives, and chain handoffs should be visually
  understandable even though they are mechanically precise.
- Stuck, hazard recovery, checkpoint recovery, and Won should be unmistakable
  without interrupting the player's understanding of the mechanic.
- Mobile landscape play should present the canvas, HUD, joystick, and Hold
  button as one game surface; portrait should ask the player to rotate.

## Success Criteria

The demo succeeds when the player can understand the mechanic through direct
experimentation, use depth to create rebound height, steer out of the rebound
into a landing, survive hazards through checkpoint recovery, and discover either
manual or assisted chain rhythm. The campaign should teach these ideas through
playable levels that remain reachable under the measured player limits, and the
smoke-test suite should pass without relying on a particular implementation
strategy beyond the documented gameplay behavior.
