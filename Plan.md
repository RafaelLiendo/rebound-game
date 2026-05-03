# Plan: Permeation Buoyancy Platformer

## Intent

Create a compact 2D platformer centered on the feeling of becoming intangible,
passing through solid matter, and rebounding upward with buoyant force. The core
fantasy is not teleportation or instant ejection; it should feel like diving
into a dense medium and being pushed back toward open air.

The experience should teach the mechanic through play. The player first
discovers that holding Permeate lets them slip through a thin surface, then
learns that releasing Permeate while meaningfully embedded in solid matter can
turn depth into upward launch height. A later rhythm emerges from chaining
permeation and rebound together.

This plan intentionally avoids technical architecture, tuning constants, exact
geometry, and implementation details. It focuses on mechanics, player intent,
state flow, controls, and behavior validation.

## Mechanics Feel

- Movement should feel responsive, readable, and expressive enough for platform
  play: quick horizontal control, forgiving jumps, and variable jump height.
- Permeation should make solid matter feel viscous rather than empty. The
  player should slow down inside it and feel gently drawn into the mass instead
  of simply falling at normal speed.
- Rebound should build from the player's embedded depth. The player should begin
  the rebound calmly, accelerate while still inside the solid mass, then surface
  with enough upward momentum to reach otherwise inaccessible spaces. During the
  upward rebound launch, horizontal steering should be stronger than normal
  movement so the player can shape the arc.
- A shallow release with the lower body embedded should produce a smaller pop.
  A deeper release should produce a stronger launch.
- Releasing while only the upper body is still inside solid matter should not
  trigger a rebound. The player should continue clearing the material and return
  to normal once fully out.
- If the player attempts to rebound from a place with no plausible upward escape,
  the game should communicate that they are stuck and recover them cleanly.
- Chained permeation should reward timing: release to rebound, then re-enter
  permeation as soon as the body surfaces.
- Auto chain should preserve the same mechanic while reducing execution burden:
  holding the assist with Permeate should alternate between rebound and
  permeation whenever the current situation supports it.

## Controls

- Move: Left/Right arrows or A/D.
- Jump: Space.
- Permeate: Shift.
- Auto Rebound/Permeate assist: hold Left Ctrl while holding Shift.
- Reset to latest checkpoint: R.

## State Machine

### States

- **Solid**: The default physical state. The player collides with terrain,
  moves normally, jumps, lands, and can reach the goal.
- **Permeating**: The player is intangible to terrain and can pass through solid
  matter. While inside solid matter, movement should feel resisted and pulled by
  the material.
- **Rebounding**: The player has released or auto-triggered from a valid embedded
  position and is being pushed upward through the material.
- **Stuck**: The player attempted to rebound where an upward escape is not
  available. The game briefly communicates failure, then returns the player to a
  recoverable position.
- **Won**: The player has reached the goal.

### Transitions

- **Start or reset -> Solid**: The player begins in a recoverable, playable
  position at the current level's largest reached checkpoint.
- **Solid -> Permeating**: The player presses Permeate.
- **Permeating -> Solid**: The player releases Permeate while clear of solid
  matter.
- **Permeating -> Permeating until clear -> Solid**: The player releases while
  only the upper body remains inside solid matter. No rebound fires; the player
  continues clearing the material, then returns to Solid.
- **Permeating -> Rebounding**: The player releases Permeate, or the assist
  triggers, while the lower body is embedded in solid matter and an upward exit
  is available.
- **Permeating -> Stuck**: The player tries to rebound from an embedded position
  where upward escape is blocked.
- **Rebounding -> Solid**: The player surfaces from the solid mass with no
  queued permeation.
- **Rebounding -> Permeating**: The player surfaces while a manual chain or auto
  chain is queued.
- **Rebounding -> Stuck**: The rebound cannot resolve because the player remains
  trapped in solid matter.
- **Stuck -> Solid**: Recovery returns the player to a playable position.
- **Any active state -> Won**: The player reaches the goal.
- **Won -> Solid**: Reset respawns at the largest reached checkpoint.

## Puzzle Beats

### Thin-Surface Discovery

The player encounters a thin solid surface that can be stood on normally. Holding
Permeate lets the player sink through it. This beat communicates that
permeation changes the relationship with terrain and that solid matter has a
distinct, slower feel while the player is inside it.

### Deep-Dive Rebound

The player reaches a thicker mass of terrain. A normal jump should not be enough
to reach the next meaningful ledge. The player dives into the mass, releases
from a valid embedded position, rebounds upward, and steers after surfacing to
land in a new area.

### Chain Rhythm

Once rebound is understood, the player can press Permeate again during the
rebound so the next permeation begins immediately on surfacing. With assist
held, the game should automate this rhythm while the player maintains the input
and the terrain keeps presenting valid rebound opportunities.

## Behavior Validation

These validations describe mechanics behavior only. They are derived from the
current smoke test harness and playable page, but intentionally avoid technical
implementation details and fixed tuning values.

### Automated Smoke Coverage

- **Auto assist climbs stacked platforms**: In a controlled vertical stack of
  separated platforms, holding Permeate and the assist should repeatedly chain
  rebound into permeation. The player should interact with every platform in the
  stack and emerge above the final one without needing jump, key releases, or
  extra inputs.
- **Manual queue consumes on surfacing**: After a rebound begins, pressing and
  holding Permeate again should queue the next permeation. On the exact moment
  the player fully surfaces from solid matter, the queued permeation should take
  over immediately instead of briefly returning to Solid.

### Playable Mechanics Checks

- **Boot and reset**: The game should start at checkpoint zero and reset into a
  playable Solid state at the largest reached checkpoint with no immediate
  terrain overlap.
- **Basic movement**: Left/right movement, jump, short-hop behavior, landing,
  and ledge forgiveness should feel consistent and controllable.
- **Thin-surface permeation**: Holding Permeate on a thin surface should carry
  the player through it with a viscous, slowed feel rather than normal free-fall.
- **Release in open air**: Releasing Permeate while clear of solid matter should
  return the player to Solid without rebound.
- **Upper-body-only release**: Releasing while only the upper body remains in
  solid matter should keep the player permeating until fully clear, then return
  to Solid.
- **Lower-body embedded release**: Releasing while the lower body is embedded
  should trigger Rebounding, beginning from a calm moment before the buoyant
  rise builds.
- **Deep rebound**: A deeper valid release should produce enough upward momentum
  to reach a ledge that normal jumping cannot reach, while still allowing
  steering after surfacing.
- **Stuck recovery**: Rebounding into a blocked upward path should enter Stuck,
  communicate the failure, and recover cleanly.
- **Manual chain**: Re-pressing Permeate during Rebounding should queue the next
  permeation and consume it immediately on surfacing.
- **Auto chain**: Holding Permeate and assist should repeatedly alternate
  between Permeating and Rebounding while valid terrain supports the rhythm.
- **Assist cancellation**: Releasing either Permeate or assist should stop the
  auto chain and return to the normal state flow.
- **Goal completion**: Touching the goal should enter Won, show completion, and
  allow reset to the largest reached checkpoint.

## Presentation Cues

- The current state should be readable at a glance.
- Permeating should look distinct from Solid and imply intangibility.
- Rebounding should look energetic and clearly different from ordinary jumping.
- Stuck and Won should be unmistakable without interrupting the player's
  understanding of the mechanic.

## Success Criteria

The demo succeeds when the player can understand the mechanic through direct
experimentation, use depth to create rebound height, steer out of the rebound
into a landing, and optionally discover the chained rhythm. The validation
scenarios above should pass without relying on a particular implementation
strategy or fixed numeric tuning.
