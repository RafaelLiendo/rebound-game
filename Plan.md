# Plan: Permeation Platformer

## Intent

Create a movement-focused platform game built around the feeling of becoming
untouchable, passing through danger and matter, then snapping back into the
world with confidence and momentum.

The fantasy is inspired by Mirio Togata and his Permeation quirk: the player
can phase through solid things, but doing so should feel deliberate, risky, and
skillful rather than like simple invisibility or flight. The heart of the game
is learning when to disappear from the physical world, when to return, and how
to use that return as movement.

The game should feel:

- Bold and physical, with quick commitments and rewarding recoveries.
- Readable, so the player understands why a phase, rebound, miss, or failure
  happened.
- Expressive, allowing small differences in timing to produce different arcs,
  escapes, and landings.
- Heroic without being effortless: the player is powerful, but their timing and
  positioning matter.

## Core Fantasy

Mirio's Permeation is powerful because it has consequences. When intangible, he
can pass through almost anything, but he must manage his senses, position, and
return carefully. The game should borrow that spirit instead of copying only the
surface idea of walking through walls.

The player should feel as if they are:

- Slipping out of contact with the world.
- Letting gravity, momentum, and terrain carry them somewhere they could not
  normally reach.
- Reappearing with impact, direction, and renewed agency.
- Threading through obstacles by trusting timing rather than brute force.

The mechanic should create dramatic reversals: falling into danger can become a
launch, a blocked path can become a route, and a missed return can become a tense
scramble.

## Player Verbs

The player can:

- Move along the ground.
- Jump and shape their jump through timing.
- Enter permeation.
- Continue moving while permeating.
- Release permeation to attempt a return to solidity.
- Rebound when returning from within solid matter.
- Recover after surfacing, landing, or failing to return safely.

These verbs should combine naturally. The best moments should come from chaining
ordinary platforming with permeation timing, not from pausing to solve a purely
abstract puzzle.

## Permeation Feel

Permeation should feel like a dangerous permission slip. While active, the player
is allowed to pass through spaces that are normally forbidden, but they lose the
comfort of ordinary collision. The world should continue to matter through
movement, pressure, visibility, audio, animation, or other feedback.

Entering permeation should be immediate enough to feel responsive. Staying in
permeation should feel unstable enough that the player wants to choose a return
moment. Returning should feel clean when the player has made a good choice and
alarming when they have not.

## Rebound Feel

Rebound is the signature reward for using permeation with confidence. When the
player returns while still meaningfully inside solid matter, the world should
push them back out with a buoyant, upward sense of force.

The rebound should not feel like a generic jump. It should feel like the result
of the world rejecting the player back into physical space. The player should be
able to anticipate it, aim with movement, and use it to reach places that normal
movement cannot.

A good rebound should feel:

- Earned by entering and releasing at the right moment.
- Stronger in perception when the player has committed deeper.
- Legible through animation, sound, camera response, and trajectory.
- Controllable after exit, so the player remains responsible for the landing.

## Failure Feel

Failure should be clear, quick to understand, and easy to retry from. The player
should rarely wonder whether the game misunderstood them. When a return fails,
the game should communicate whether the player released too early, too late, in
an unsafe place, or without enough commitment.

The tone should stay encouraging. Failure is part of learning a strange power.
The game should invite another attempt rather than punish experimentation.

## State Machine

The state machine describes game feel and rule intent only. Names may change
during implementation.

### Grounded

The player is solid, standing on stable terrain, and has full ordinary movement.

Transitions:

- To `Airborne` when the player leaves the ground.
- To `Permeating` when the player activates permeation.
- To `Recovery` after a heavy landing or scripted lockout, if the final game
  wants brief expressive follow-through.

### Airborne

The player is solid and moving through open space without ground support.

Transitions:

- To `Grounded` when the player lands cleanly.
- To `Permeating` when the player activates permeation.
- To `Recovery` after a hard impact, hazard interaction, or other interrupt.

### Permeating

The player is intangible. Solid terrain no longer behaves as a normal barrier,
but the player is still subject to movement intent, momentum, and the risks of
being inside the world.

Transitions:

- To `Surfacing` when the player releases permeation from a place where a clean
  return is possible without a rebound.
- To `Rebounding` when the player releases permeation while meaningfully embedded
  in solid matter.
- To `Stuck` when the player cannot safely resolve back into the world.
- To `Airborne` or `Grounded` when permeation ends in open space, depending on
  whether the player has support.

### Surfacing

The player is returning from intangibility without a launch. This is the quiet
version of reappearing: useful for slipping through a floor, wall, obstacle, or
hazard and becoming solid again once clear.

Transitions:

- To `Grounded` when the player becomes solid with ground support.
- To `Airborne` when the player becomes solid in open space.
- To `Permeating` if the player chooses to remain intangible before the return
  fully resolves, if that style of cancel is desired.
- To `Stuck` if the return cannot be completed safely.

### Rebounding

The player is being forced out of solid matter after returning from permeation.
This is the dramatic, buoyant ejection state. It should preserve the sense that
the player caused the launch through timing rather than receiving an automatic
scripted boost.

Transitions:

- To `Airborne` when the player exits solid matter and remains unsupported.
- To `Grounded` if the rebound resolves directly onto stable terrain.
- To `Permeating` if the player reactivates or chains permeation, if chaining is
  part of the final feel.
- To `Stuck` if the rebound cannot find a safe way out.

### Stuck

The player attempted to resolve solidity in a place where the game cannot fairly
place them. This is a failure or rescue state, depending on the intended tone.

Transitions:

- To `Recovery` after the game communicates the failure and moves the player to a
  safe retry position.
- To `Permeating` if the design allows emergency continuation instead of an
  immediate reset.
- To `Grounded` or `Airborne` after a retry, rescue, checkpoint, or assist.

### Recovery

The player is briefly regaining control after a failure, landing, rescue, or
dramatic return. This state is optional in spirit: it exists to support clarity,
animation, and pacing, not to take control away unnecessarily.

Transitions:

- To `Grounded` when the player is ready and supported.
- To `Airborne` when the player is ready and unsupported.
- To `Permeating` if the game allows immediate defensive phasing.

## Controls

Controls should be described as actions first, with bindings chosen later for
the target platform and accessibility needs.

- Move: steer the character horizontally and influence airborne drift.
- Jump: leave the ground, shape jump height, and support expressive platforming.
- Permeate: hold, press, or toggle into intangibility depending on the final
  control feel.
- Release Permeation: attempt to return to solidity, potentially triggering a
  rebound.
- Aim or Directional Intent: influence drift, exit planning, or advanced
  permeation routes if the game grows beyond vertical rebounds.
- Restart or Retry: quickly return to the last fair attempt point.
- Pause: stop play and expose options, assist settings, and control remapping.

The control scheme should prioritize trust. The player should always feel that
permeation started when requested, ended when requested, and produced a result
that follows from the visible situation.

## Teaching Ideas

The game should teach through spaces that make the desired action feel natural.

Possible teaching beats:

- A safe place to phase through a simple barrier.
- A low-risk fall that demonstrates permeability without punishment.
- A rebound setup that makes the player feel the launch as a discovery.
- A landing challenge that asks the player to steer after rebounding.
- A timing challenge where releasing too early or too late produces readable
  outcomes.
- A route where ordinary movement and permeation alternate rhythmically.

Each lesson should introduce one new pressure at a time: timing, depth,
direction, hazard avoidance, route reading, or recovery.

## Level Feel

Levels should be built around anticipation and release. The player sees a place
they cannot reach, identifies a mass or obstacle they can exploit, commits to
permeation, then returns with momentum.

Good spaces might include:

- Thick masses that invite deep commitment and strong rebound.
- Thin barriers that teach clean pass-through movement.
- Offset ledges that reward steering after launch.
- Hazards that can be bypassed only by trusting intangibility.
- Safe reset pockets that keep experimentation flowing.
- Optional mastery routes where skilled players chain permeation and rebound.

The best layouts should make the player feel clever and brave at the same time.

## Feedback

The player needs strong feedback because the central mechanic temporarily breaks
the usual promise of collision.

Feedback should clarify:

- Whether the player is solid or permeating.
- Whether the player is safely inside, partly inside, or clear of matter.
- Whether releasing now will likely surface, rebound, or fail.
- When a rebound begins, peaks, and resolves.
- Where control returns after a dramatic state change.

Feedback can come from animation, silhouette treatment, particles, sound,
controller feel, camera motion, environment response, or interface hints. The
specific presentation should serve readability and feel, not decoration.

## Design Principles

- Permeation is a commitment, not a passive shield.
- Rebound is a movement reward, not a cutscene.
- Failure should explain the rule without scolding the player.
- The player should retain agency as often as readability allows.
- The power should feel strange at first, then intuitive through practice.
- Mirio's inspiration should live in confidence, timing, and risk management,
  not just in passing through walls.

## Open Questions

These are intentionally left undecided until prototyping reveals the right feel.

- Should permeation be held, toggled, buffered, or support multiple input modes?
- How much control should the player retain while fully inside matter?
- Should rebound always favor upward exit, or can later abilities support other
  directions?
- Should being stuck cause a reset, an assist rescue, a short damage state, or a
  chance to continue permeating?
- How readable should predicted outcomes be before release?
- How much should advanced players be able to chain rebounds and permeation?

## Success Criteria

The prototype or finished game is successful if players can describe the mechanic
in their own words after a short time, intentionally use permeation to solve
movement problems, and feel that spectacular rebounds came from their decisions.

The ideal reaction is not only "I went through the wall." It is "I knew when to
let go."
