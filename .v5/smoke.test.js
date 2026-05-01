const assert = require("assert");
const {
  Game,
  KEYS,
  STATE,
  createStackTestLevel,
  createManualQueueTestLevel
} = require("./src/game.js");

function runFrames(game, frames, inputFn) {
  const dt = 1 / 60;
  for (let i = 0; i < frames; i += 1) {
    const cleared = {
      [KEYS.LEFT]: false,
      [KEYS.RIGHT]: false,
      [KEYS.JUMP]: false,
      [KEYS.PERMEATE]: false,
      [KEYS.ASSIST]: false,
      [KEYS.RESET]: false
    };
    if (inputFn) Object.assign(cleared, inputFn(i, game.snapshot()));
    game.setInput(cleared);
    game.update(dt);
  }
}

function countTouched(game) {
  return Object.keys(game.snapshot().touchedSolids).length;
}

function testAutoAssistClimbsStackedPlatforms() {
  const game = new Game({ levelFactory: createStackTestLevel });
  runFrames(game, 720, () => ({
    [KEYS.PERMEATE]: true,
    [KEYS.ASSIST]: true
  }));

  const snapshot = game.snapshot();
  assert.ok(
    countTouched(game) >= 5,
    `expected to touch every stacked platform, touched ${countTouched(game)}`
  );
  assert.ok(
    snapshot.player.y + snapshot.player.h < 240 || snapshot.state === STATE.WON,
    `expected to emerge above final platform, y=${snapshot.player.y}, state=${snapshot.state}`
  );
}

function testManualQueueConsumesOnSurfacing() {
  const game = new Game({ levelFactory: createManualQueueTestLevel });
  let sawRebound = false;
  let holdQueue = false;
  let sawQueuedSurface = false;

  runFrames(game, 360, (i, snapshot) => {
    const input = {};
    if (i < 95) {
      input[KEYS.PERMEATE] = true;
    } else if (snapshot.state === STATE.REBOUNDING) {
      sawRebound = true;
      holdQueue = true;
    }
    if (holdQueue) {
      input[KEYS.PERMEATE] = true;
    }
    return input;
  });

  const snapshot = game.snapshot();
  sawQueuedSurface = sawRebound && snapshot.state === STATE.PERMEATING;
  assert.ok(sawRebound, "expected manual release to start rebound");
  assert.ok(
    sawQueuedSurface,
    `expected queued permeation to consume on surfacing, final state=${snapshot.state}`
  );
}

function testQuickReleaseStillReboundsWhenDepthBecomesValid() {
  const game = new Game({ levelFactory: createManualQueueTestLevel });
  game.player.y = 302;
  game.player.grounded = true;
  let sawRebound = false;

  runFrames(game, 240, (i, snapshot) => {
    if (snapshot.state === STATE.REBOUNDING) sawRebound = true;
    return {
      [KEYS.PERMEATE]: i === 0
    };
  });

  const snapshot = game.snapshot();
  assert.ok(
    sawRebound,
    `expected quick Shift tap to rebound after lower body embedded, final state=${snapshot.state}, y=${snapshot.player.y}`
  );
}

testAutoAssistClimbsStackedPlatforms();
testManualQueueConsumesOnSurfacing();
testQuickReleaseStillReboundsWhenDepthBecomesValid();
console.log("Smoke tests passed");
