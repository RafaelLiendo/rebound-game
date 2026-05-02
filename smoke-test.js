const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeGame() {
  global.window = { addEventListener() {}, gameInternals: null };
  global.document = {
    getElementById() {
      return {
        getContext() {
          return new Proxy({}, {
            get: (target, prop) => target[prop] || (target[prop] = function () {})
          });
        }
      };
    }
  };
  global.performance = { now: () => 0 };
  global.requestAnimationFrame = function () {};
  new Function(script)();
  return global.window.gameInternals;
}

function press(g, code) {
  g.keys[code] = true;
  g.keyEdge[code] = true;
}

function release(g, code) {
  g.keys[code] = false;
  g.keyReleased[code] = true;
}

function step(g, frames = 1) {
  for (let i = 0; i < frames; i++) g.step(g.CONFIG.DT);
}

function resetKeys(g) {
  for (const k of Object.keys(g.keys)) g.keys[k] = false;
  for (const k of Object.keys(g.keyEdge)) g.keyEdge[k] = false;
  for (const k of Object.keys(g.keyReleased)) g.keyReleased[k] = false;
}

function setPlayer(g, x, y, state = "solid") {
  const p = g.player;
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.state = state;
  p.grounded = false;
  p.won = false;
  p.coyoteTimer = 0;
  p.jumpBufferTimer = 0;
  p.reboundAirborneTimer = 0;
  p.reboundSurfaced = false;
  p.queuedPermeate = false;
  p.queuedPermeateSource = null;
  p.permeateUntilClear = false;
  p.stuckTimer = 0;
  p.flashTimer = 0;
  g.probeGrounded();
  resetKeys(g);
}

function cellX(g, c) {
  return c * g.CONFIG.TILE_SIZE + (g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_W) / 2;
}

function standY(g, row) {
  return row * g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_H;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertNear(actual, expected, msg) {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(msg + " expected " + expected + ", got " + actual);
  }
}

function completeCurrentLevel(g) {
  setPlayer(g, g.goalRect.x, g.goalRect.y, "solid");
  step(g);
  assert(g.player.won === true, "placing player on the goal did not complete the level");
}

function testLoadLevelRecalculatesMap() {
  const g = makeGame();
  const ts = g.CONFIG.TILE_SIZE;

  assert(g.LEVELS.length >= 2, "game does not expose multiple levels");
  assert(g.currentLevelIndex === 0, "game did not start on level 0");
  assert(g.tiles.length === g.LEVEL.length, "initial tiles do not match active level height");

  g.loadLevel(1);

  assert(g.currentLevelIndex === 1, "loadLevel did not update the current level index");
  assert(g.LEVEL === g.LEVELS[1].map, "loadLevel did not update the active map");
  assert(g.tiles.length === g.LEVEL.length, "tiles were not rebuilt for the loaded level");
  assert(g.tiles.every((row) => row.length === g.LEVEL[0].length), "loaded level tile rows have inconsistent widths");
  assert(g.spawnCell.c === 1 && g.spawnCell.r === 43, "loaded level spawn was not parsed");
  assert(g.goalRect.x === 25 * ts && g.goalRect.y === 13 * ts, "loaded level goal was not parsed");
}

function testResetRestartsCurrentLevel() {
  const g = makeGame();
  g.loadLevel(1);
  g.player.x = 500;
  g.player.y = 200;

  press(g, "KeyR");
  step(g);

  assert(g.currentLevelIndex === 1, "reset changed the current level");
  assert(g.player.won === false, "reset left the player in a won state");
  assertNear(g.player.x, g.spawnCell.x + (g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_W) / 2, "reset did not restore spawn x");
  assertNear(g.player.y, (g.spawnCell.r + 1) * g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_H, "reset did not restore spawn y");
}

function testWinningAdvancesToNextLevel() {
  const g = makeGame();
  completeCurrentLevel(g);

  press(g, "Space");
  step(g);

  assert(g.currentLevelIndex === 1, "Space on win screen did not advance to the next level");
  assert(g.player.won === false, "advanced level started in a won state");
}

function testFinalLevelDoesNotAdvancePastEnd() {
  const g = makeGame();
  const finalIndex = g.LEVELS.length - 1;
  g.loadLevel(finalIndex);
  completeCurrentLevel(g);

  press(g, "Space");
  step(g);

  assert(g.currentLevelIndex === finalIndex, "final level advanced past the end");
  assert(g.player.won === true, "final level did not remain on the completion screen");
}

function testAutoAssistClimbsTenTileStack() {
  const g = makeGame();

  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const rows = [];
  for (let i = 0; i < 10; i++) rows.push(35 - i * 3);
  for (const row of rows) {
    for (let c = 14; c <= 16; c++) g.tiles[row][c] = true;
  }

  setPlayer(g, cellX(g, 15), standY(g, rows[0]), "solid");
  press(g, "ShiftLeft");

  // Let Shift permeation settle the player fully into the bottom floor, then
  // hold Ctrl. No Space press, no Shift release, and no Ctrl release are used.
  step(g, 45);
  assert(g.overlappingSolidTiles(g.playerRect()).length > 0, "player never permeated into the first floor");
  press(g, "ControlLeft");

  const touchedRows = new Set();
  const topClearY = rows[rows.length - 1] * g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_H;
  let reachedTop = false;

  for (let i = 0; i < 900; i++) {
    step(g);
    for (const t of g.overlappingSolidTiles(g.playerRect())) touchedRows.add(t.r);
    if (g.player.y < topClearY) {
      reachedTop = true;
      break;
    }
  }

  const missedRows = rows.filter((row) => !touchedRows.has(row));
  assert(missedRows.length === 0, "auto-chain skipped stack rows: " + missedRows.join(", "));
  assert(reachedTop, "auto-chain did not carry the player above the top tile");
}

function testManualQueueConsumesOnSurface() {
  const g = makeGame();
  setPlayer(g, cellX(g, 20), 22 * g.CONFIG.TILE_SIZE, "permeating");

  release(g, "ShiftLeft");
  step(g);
  assert(g.player.state === "rebounding", "release did not start rebound");

  press(g, "ShiftLeft");
  step(g);
  assert(g.player.queuedPermeate === true, "manual queue was not armed");
  assert(g.player.queuedPermeateSource === "manual", "manual queue source was not recorded");

  let surfaced = false;
  for (let i = 0; i < 120; i++) {
    step(g);
    if (g.overlappingSolidTiles(g.playerRect()).length === 0) {
      surfaced = true;
      assert(g.player.state === "permeating", "state was not permeating on the surfacing frame");
      assert(g.player.queuedPermeate === false, "manual queue was not consumed");
      break;
    }
  }

  assert(surfaced, "player never surfaced during rebound");
}

function testUpperBodyOnlyReleaseDoesNotRebound() {
  const g = makeGame();

  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const row = 20;
  for (let c = 10; c <= 12; c++) g.tiles[row][c] = true;

  const tileBottom = (row + 1) * g.CONFIG.TILE_SIZE;
  setPlayer(g, cellX(g, 11), tileBottom - 15, "permeating");
  release(g, "ShiftLeft");
  step(g);

  assert(g.player.state === "permeating", "upper-body-only release incorrectly left permeating");
  assert(g.player.permeateUntilClear === true, "upper-body-only release did not latch until clear");
  assert(g.player.reboundSurfaced === false, "upper-body-only release behaved like a rebound");
}

function testBlockedUpwardEscapeBecomesStuck() {
  const g = makeGame();

  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  for (let r = 14; r <= 24; r++) {
    for (let c = 18; c <= 20; c++) g.tiles[r][c] = true;
  }

  setPlayer(g, cellX(g, 19), 23 * g.CONFIG.TILE_SIZE, "permeating");
  release(g, "ShiftLeft");
  step(g);

  assert(g.player.state === "stuck", "blocked upward escape did not enter stuck state");
  step(g, Math.ceil(g.CONFIG.STUCK_DURATION / g.CONFIG.DT) + 2);
  assert(g.player.state === "solid", "stuck recovery did not return to solid");
  assert(g.overlappingSolidTiles(g.playerRect()).length === 0, "stuck recovery left player inside terrain");
}

const tests = [
  ["load level recalculates map", testLoadLevelRecalculatesMap],
  ["reset restarts current level", testResetRestartsCurrentLevel],
  ["winning advances to next level", testWinningAdvancesToNextLevel],
  ["final level stops at end", testFinalLevelDoesNotAdvancePastEnd],
  ["auto assist climbs ten 2-gap tiles", testAutoAssistClimbsTenTileStack],
  ["manual queue consumes on surface", testManualQueueConsumesOnSurface],
  ["upper-body-only release waits until clear", testUpperBodyOnlyReleaseDoesNotRebound],
  ["blocked upward escape recovers from stuck", testBlockedUpwardEscapeBecomesStuck]
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log("PASS " + name);
  } catch (err) {
    console.log("FAIL " + name + " :: " + err.message);
    process.exitCode = 1;
  }
}

console.log("TOTAL " + passed + "/" + tests.length + " passing");
