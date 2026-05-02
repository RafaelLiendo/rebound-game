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

function findMarker(level, marker) {
  for (let r = 0; r < level.map.length; r++) {
    const c = level.map[r].indexOf(marker);
    if (c >= 0) return { c, r };
  }
  throw new Error("marker " + marker + " not found in " + level.name);
}

function testLoadLevelRecalculatesMap() {
  const g = makeGame();
  const ts = g.CONFIG.TILE_SIZE;
  const expectedSpawn = findMarker(g.LEVELS[1], "0");
  const expectedGoal = findMarker(g.LEVELS[1], "@");

  assert(g.LEVELS.length >= 5, "game does not expose the authored level set");
  assert(g.currentLevelIndex === 0, "game did not start on level 0");
  assert(g.tiles.length === g.LEVEL.length, "initial tiles do not match active level height");

  g.loadLevel(1);

  assert(g.currentLevelIndex === 1, "loadLevel did not update the current level index");
  assert(g.LEVEL === g.LEVELS[1].map, "loadLevel did not update the active map");
  assert(g.LEVELS[1].spawn.c === expectedSpawn.c && g.LEVELS[1].spawn.r === expectedSpawn.r, "loaded level spawn was not normalized");
  assert(g.LEVELS[1].goal.c === expectedGoal.c && g.LEVELS[1].goal.r === expectedGoal.r, "loaded level goal was not normalized");
  assert(g.tiles.length === g.LEVEL.length, "tiles were not rebuilt for the loaded level");
  assert(g.tiles.every((row) => row.length === g.LEVEL[0].length), "loaded level tile rows have inconsistent widths");
  assert(g.spawnCell.c === expectedSpawn.c && g.spawnCell.r === expectedSpawn.r, "loaded level spawn was not parsed");
  assert(g.goalRect.x === expectedGoal.c * ts && g.goalRect.y === expectedGoal.r * ts, "loaded level goal was not parsed");
}

function testAuthoredLevelsHaveValidMarkersAndStarts() {
  const g = makeGame();

  g.LEVELS.forEach((level, index) => {
    const width = level.map[0].length;
    const joined = level.map.join("");
    const spawnCount = (joined.match(/0/g) || []).length;
    const goalCount = (joined.match(/@/g) || []).length;

    assert(width > 30, "level " + (index + 1) + " does not take advantage of horizontal camera tracking");
    assert(level.map.length === 45, "level " + (index + 1) + " is not 45 rows tall");
    assert(level.map.every((row) => row.length === width), "level " + (index + 1) + " has uneven rows");
    assert(spawnCount === 1, "level " + (index + 1) + " must have exactly one spawn checkpoint 0");
    assert(goalCount === 1, "level " + (index + 1) + " must have exactly one goal");

    g.loadLevel(index);

    assert(g.currentLevelIndex === index, "level " + (index + 1) + " did not load");
    assert(g.player.state === "solid", "level " + (index + 1) + " did not spawn solid");
    assert(g.overlappingSolidTiles(g.playerRect()).length === 0, "level " + (index + 1) + " spawns inside terrain");
    assert(g.player.grounded === true, "level " + (index + 1) + " spawn is not grounded");
    assert(g.goalRect.y < g.spawnCell.y, "level " + (index + 1) + " goal is not above the spawn");
  });
}

function testCameraTracksHorizontallyInWideLevel() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;
  const rows = Array.from({ length: 45 }, () => Array(60).fill("."));
  rows[43][1] = "0";
  rows[40][58] = "@";
  for (let c = 0; c < 60; c++) rows[44][c] = "#";

  g.LEVELS.push({
    name: "Wide Camera Fixture",
    map: rows.map((row) => row.join(""))
  });

  try {
    g.loadLevel(originalLength);
    assert(g.LEVELS[originalLength].spawn.c === 1 && g.LEVELS[originalLength].goal.c === 58, "raw fixture level was not normalized on load");
    assert(g.COLS === 60, "wide level columns were not parsed");
    assert(g.levelW === 60 * g.CONFIG.TILE_SIZE, "wide level width was not calculated");

    g.updateCamera();
    assertNear(g.cameraX, 0, "camera should start at the left edge");

    setPlayer(g, cellX(g, 50), standY(g, 44), "solid");
    g.updateCamera();

    assert(g.cameraX > 0, "camera did not pan right in a wide level");
    assert(g.cameraX <= g.levelW - g.CONFIG.VIEW_W, "camera panned past the right edge");
  } finally {
    g.LEVELS.pop();
    g.loadLevel(0);
  }
}

function testLoadLevelRejectsUnevenRows() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;
  g.LEVELS.push({
    name: "Broken Rows",
    map: [
      "0..",
      "##",
      "..@"
    ]
  });

  let failed = false;
  try {
    g.loadLevel(originalLength);
  } catch (err) {
    failed = /row 2/.test(err.message) && /expected 3/.test(err.message);
  } finally {
    g.LEVELS.pop();
    g.loadLevel(0);
  }

  assert(failed, "loadLevel did not reject uneven row widths");
}

function testResetRespawnsAtActiveCheckpoint() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;
  const index = g.LEVELS.length;
  g.LEVELS.push(g.defineLevel({
    name: "Reset Checkpoint Fixture",
    map: fixtureRows(50, [], [
      { order: 1, c: 8, r: 35 },
      { order: 2, c: 12, r: 35 }
    ])
  }));

  try {
    g.loadLevel(index);
    setPlayer(g, cellX(g, 12), standY(g, 36), "solid");
    step(g);
    assert(g.activeCheckpoint.order === 2, "checkpoint 2 was not activated before reset");

    g.player.x = 500;
    g.player.y = 200;
    press(g, "KeyR");
    step(g);

    assert(g.currentLevelIndex === index, "reset changed the current level");
    assert(g.activeCheckpoint.order === 2, "reset cleared checkpoint progress");
    assert(g.player.won === false, "reset left the player in a won state");
    assertNear(g.player.x, cellX(g, 12), "reset did not restore active checkpoint x");
    assertNear(g.player.y, standY(g, 36), "reset did not restore active checkpoint y");
  } finally {
    g.LEVELS.length = originalLength;
    g.loadLevel(0);
  }
}

function testWinningAdvancesToNextLevel() {
  const g = makeGame();
  completeCurrentLevel(g);

  press(g, "Space");
  step(g);

  assert(g.currentLevelIndex === 1, "Space on win screen did not advance to the next level");
  assert(g.player.won === false, "advanced level started in a won state");
  assert(g.activeCheckpoint.order === 0, "advanced level did not reset active checkpoint to 0");
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

  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }
  for (let r = 21; r <= 23; r++) {
    for (let c = 19; c <= 21; c++) g.tiles[r][c] = true;
  }

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

function paintRect(rows, c, r, cols, rowCount, ch) {
  for (let rr = r; rr < r + rowCount; rr++) {
    for (let cc = c; cc < c + cols; cc++) rows[rr][cc] = ch;
  }
}

function fixtureRows(width = 50, markers = [], checkpointCells = []) {
  const rows = Array.from({ length: 45 }, () => Array(width).fill("."));
  rows[43][1] = "0";
  rows[10][width - 3] = "@";
  for (const marker of markers) {
    paintRect(rows, marker.c, marker.r, marker.cols, marker.rows, marker.char);
  }
  for (const checkpoint of checkpointCells) {
    rows[checkpoint.r][checkpoint.c] = String(checkpoint.order);
  }
  for (let c = 0; c < width; c++) rows[44][c] = "#";
  return rows.map((row) => row.join(""));
}

function pushDynamicFixture(g, entity, marker, checkpointCells = []) {
  const markers = Array.isArray(marker) ? marker : [marker];
  const index = g.LEVELS.length;
  g.LEVELS.push(g.defineLevel({
    name: "Dynamic Fixture",
    map: fixtureRows(50, markers, checkpointCells),
    entities: [entity]
  }));
  g.loadLevel(index);
  return index;
}

function assertDefineLevelFails(g, def, pattern, msg) {
  let failed = false;
  try {
    g.defineLevel(def);
  } catch (err) {
    failed = pattern.test(err.message);
  }
  assert(failed, msg);
}

function testEntityCharMarkersNormalizeGeometry() {
  const g = makeGame();
  const level = g.defineLevel({
    name: "Entity Marker Geometry",
    map: fixtureRows(50, [
      { char: "M", c: 7, r: 22, cols: 3, rows: 2 }
    ]),
    entities: [
      { kind: "mover", name: "marked mass", char: "M", role: "rebound" }
    ]
  });

  assert(level.entities.length === 1, "entity marker did not create one normalized entity");
  assert(level.entities[0].c === 7 && level.entities[0].r === 22, "entity marker did not preserve position");
  assert(level.entities[0].w === 3 && level.entities[0].h === 2, "entity marker did not preserve size");
}

function testRepeatedEntityCharCreatesMultipleClusters() {
  const g = makeGame();
  const level = g.defineLevel({
    name: "Repeated Entity Marker",
    map: fixtureRows(50, [
      { char: "A", c: 8, r: 28, cols: 2, rows: 1 },
      { char: "A", c: 18, r: 20, cols: 3, rows: 2 }
    ]),
    entities: [
      { kind: "mover", name: "shared shuttle", char: "A", role: "platform" }
    ]
  });

  assert(level.entities.length === 2, "same char did not create multiple entity instances");
  assert(level.entities[0].name === "shared shuttle 1", "first repeated entity name was not stable");
  assert(level.entities[1].name === "shared shuttle 2", "second repeated entity name was not stable");
  assert(level.entities[0].c === 18 && level.entities[0].r === 20, "repeated entities were not sorted top-to-bottom");
  assert(level.entities[1].c === 8 && level.entities[1].r === 28, "repeated entity geometry was not preserved");
}

function testIrregularEntityMarkerIsRejected() {
  const g = makeGame();
  const rows = fixtureRows().map((row) => row.split(""));
  rows[22][10] = "A";
  rows[23][10] = "A";
  rows[23][11] = "A";

  assertDefineLevelFails(g, {
    name: "Irregular Marker",
    map: rows.map((row) => row.join("")),
    entities: [
      { kind: "mover", name: "bad marker", char: "A" }
    ]
  }, /rectangles/, "irregular marker cluster was not rejected");
}

function testMissingEntityDefinitionIsRejected() {
  const g = makeGame();
  assertDefineLevelFails(g, {
    name: "Missing Marker Definition",
    map: fixtureRows(50, [
      { char: "A", c: 8, r: 28, cols: 2, rows: 1 }
    ])
  }, /no matching entity/, "map letter without entity definition was not rejected");
}

function testLegacySpawnGoalLettersCanBeEntities() {
  const g = makeGame();
  const level = g.defineLevel({
    name: "Legacy Letter Entities",
    map: fixtureRows(50, [
      { char: "S", c: 8, r: 28, cols: 2, rows: 1 },
      { char: "G", c: 14, r: 24, cols: 2, rows: 1 }
    ]),
    entities: [
      { kind: "mover", name: "s-letter mover", char: "S" },
      { kind: "mover", name: "g-letter mover", char: "G" }
    ]
  });

  assert(level.entities.length === 2, "S and G were not accepted as entity letters");
}

function testCheckpointDigitsParseWithoutCheckpointProperty() {
  const g = makeGame();
  const level = g.defineLevel({
    name: "Digit Checkpoints",
    map: fixtureRows(50, [], [
      { order: 2, c: 16, r: 31 },
      { order: 1, c: 10, r: 35 }
    ])
  });

  assert(level.checkpoints.length === 3, "checkpoint digits were not parsed");
  assert(level.checkpoints[0].order === 0 && level.checkpoints[1].order === 1 && level.checkpoints[2].order === 2, "checkpoint digits were not sorted by order");
  assert(level.checkpoints[0].c === 1 && level.checkpoints[1].c === 10 && level.checkpoints[2].c === 16, "checkpoint digit positions were not preserved");
}

function testLargestCheckpointReachedStaysActive() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;
  const index = g.LEVELS.length;
  g.LEVELS.push(g.defineLevel({
    name: "Checkpoint Ordering",
    map: fixtureRows(50, [], [
      { order: 1, c: 8, r: 35 },
      { order: 2, c: 12, r: 35 }
    ])
  }));

  try {
    g.loadLevel(index);
    setPlayer(g, cellX(g, 12), standY(g, 36), "solid");
    step(g);
    assert(g.activeCheckpoint.order === 2, "checkpoint 2 was not activated");

    setPlayer(g, cellX(g, 8), standY(g, 36), "solid");
    step(g);
    assert(g.activeCheckpoint.order === 2, "touching checkpoint 1 downgraded the active checkpoint");
  } finally {
    g.LEVELS.length = originalLength;
    g.loadLevel(0);
  }
}

function testMovingEntityStepsDeterministically() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;

  try {
    pushDynamicFixture(g, {
      kind: "mover",
      name: "deterministic shuttle",
      char: "A",
      role: "platform",
      motion: { kind: "horizontal", amplitude: { x: 64, y: 0 }, speed: 1.5, phase: 0 }
    }, { char: "A", c: 8, r: 30, cols: 4, rows: 1 });

    step(g, 30);
    const e = g.entities[0];
    const expected = e.baseX + Math.sin(g.levelTime * e.speed + e.phase) * e.ampX;
    assertNear(e.x, expected, "moving platform x did not follow deterministic path");
    assert(e.dx !== 0, "moving platform did not report frame delta");
  } finally {
    g.LEVELS.length = originalLength;
    g.loadLevel(0);
  }
}

function testSolidPlayerRidesMovingPlatform() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;

  try {
    pushDynamicFixture(g, {
      kind: "mover",
      name: "rideable shuttle",
      char: "A",
      role: "platform",
      motion: { kind: "horizontal", amplitude: { x: 80, y: 0 }, speed: 1.2, phase: 0 }
    }, { char: "A", c: 8, r: 30, cols: 5, rows: 1 });

    const e = g.entities[0];
    setPlayer(g, e.x + 24, e.y - g.CONFIG.PLAYER_H, "solid");
    const startX = g.player.x;
    step(g, 45);

    assert(g.player.x > startX + 12, "solid player was not carried by moving platform");
    assert(g.player.grounded === true, "player did not remain grounded on moving platform");
  } finally {
    g.LEVELS.length = originalLength;
    g.loadLevel(0);
  }
}

function testDynamicSolidCanTriggerRebound() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;

  try {
    pushDynamicFixture(g, {
      kind: "mover",
      name: "static rebound mass",
      char: "A",
      role: "rebound",
      motion: { kind: "horizontal", amplitude: { x: 0, y: 0 }, speed: 0, phase: 0 }
    }, { char: "A", c: 12, r: 30, cols: 4, rows: 3 });

    const e = g.entities[0];
    setPlayer(g, e.x + 32, e.y + 34, "permeating");
    release(g, "ShiftLeft");
    step(g);

    assert(g.overlappingSolidEntities(g.playerRect()).length > 0, "player was not embedded in dynamic solid");
    assert(g.player.state === "rebounding", "dynamic solid release did not start rebound");
  } finally {
    g.LEVELS.length = originalLength;
    g.loadLevel(0);
  }
}

function testAsteroidImpactRecoversToCheckpoint() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;

  try {
    pushDynamicFixture(g, {
      kind: "asteroid",
      name: "checkpoint test asteroid",
      char: "A",
      timing: { speed: 0, period: 10, phase: 1, warning: 0 }
    }, { char: "A", c: 12, r: 30, cols: 3, rows: 3 }, [
      { order: 1, c: 8, r: 35 }
    ]);

    setPlayer(g, cellX(g, 8), standY(g, 36), "solid");
    step(g);
    assert(g.activeCheckpoint.order === 1, "checkpoint 1 was not activated before asteroid impact");

    const e = g.entities[0];
    setPlayer(g, e.x + 16, e.y + 16, "solid");
    step(g);

    assertNear(g.player.x, cellX(g, 8), "asteroid did not recover player to active checkpoint x");
    assertNear(g.player.y, standY(g, 36), "asteroid did not recover player to active checkpoint y");
  } finally {
    g.LEVELS.length = originalLength;
    g.loadLevel(0);
  }
}

const tests = [
  ["load level recalculates map", testLoadLevelRecalculatesMap],
  ["authored levels have valid starts", testAuthoredLevelsHaveValidMarkersAndStarts],
  ["camera tracks horizontally in wide levels", testCameraTracksHorizontallyInWideLevel],
  ["load level rejects uneven rows", testLoadLevelRejectsUnevenRows],
  ["reset respawns at active checkpoint", testResetRespawnsAtActiveCheckpoint],
  ["winning advances to next level", testWinningAdvancesToNextLevel],
  ["final level stops at end", testFinalLevelDoesNotAdvancePastEnd],
  ["auto assist climbs ten 2-gap tiles", testAutoAssistClimbsTenTileStack],
  ["manual queue consumes on surface", testManualQueueConsumesOnSurface],
  ["upper-body-only release waits until clear", testUpperBodyOnlyReleaseDoesNotRebound],
  ["blocked upward escape recovers from stuck", testBlockedUpwardEscapeBecomesStuck],
  ["entity chars normalize geometry", testEntityCharMarkersNormalizeGeometry],
  ["repeated entity chars create clusters", testRepeatedEntityCharCreatesMultipleClusters],
  ["irregular entity markers are rejected", testIrregularEntityMarkerIsRejected],
  ["missing entity definitions are rejected", testMissingEntityDefinitionIsRejected],
  ["legacy spawn goal letters can be entities", testLegacySpawnGoalLettersCanBeEntities],
  ["checkpoint digits parse without definitions", testCheckpointDigitsParseWithoutCheckpointProperty],
  ["largest checkpoint reached stays active", testLargestCheckpointReachedStaysActive],
  ["moving entity steps deterministically", testMovingEntityStepsDeterministically],
  ["solid player rides moving platform", testSolidPlayerRidesMovingPlatform],
  ["dynamic solid can trigger rebound", testDynamicSolidCanTriggerRebound],
  ["asteroid impact recovers to checkpoint", testAsteroidImpactRecoversToCheckpoint]
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
