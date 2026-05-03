const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeGame() {
  const elements = {};
  function makeElement() {
    return {
      style: {},
      attributes: {},
      textContent: "",
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      getAttribute(name) {
        return this.attributes[name];
      },
      getContext() {
        return new Proxy({}, {
          get: (target, prop) => {
            if (prop === "createLinearGradient" || prop === "createRadialGradient") {
              return function () {
                return { addColorStop() {} };
              };
            }
            return target[prop] || (target[prop] = function () {});
          }
        });
      }
    };
  }
  global.window = { addEventListener() {}, gameInternals: null };
  global.document = {
    getElementById(id) {
      if (!elements[id]) elements[id] = makeElement();
      return elements[id];
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

function scratchRows(rowCount = 50, colCount = 70) {
  const rows = Array.from({ length: rowCount }, () => Array(colCount).fill("."));
  rows[1][colCount - 2] = "@";
  rows[rowCount - 3][1] = "0";
  rows[rowCount - 1].fill("#");
  return rows.map((row) => row.join(""));
}

function ensureScratchWorld(g, rowCount = 50, colCount = 70) {
  if (g.ROWS >= rowCount && g.COLS >= colCount) return;
  const index = g.LEVELS.length;
  g.LEVELS.push(g.defineLevel({
    name: "Smoke Measurement Fixture",
    map: scratchRows(rowCount, colCount)
  }));
  g.loadLevel(index);
}

function loadFirstDesignedLevel(g) {
  const index = g.LEVELS.findIndex((level) => !/^Bug /.test(level.name));
  assert(index >= 0, "no non-bug authored level found");
  g.loadLevel(index);
  return index;
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
  p.manualReboundQueued = false;
  p.manualChainTimer = 0;
  p.permeateUntilClear = false;
  p.permeateStartFeetY = state === "permeating" ? y + g.CONFIG.PLAYER_H : null;
  p.ceilingPullMode = null;
  p.embeddedDepth = 0;
  p.reboundMeterLevel = 0;
  p.reboundStrength = 0;
  p.reboundTargetRiseTiles = 0;
  p.reboundLaunchVelocity = 0;
  p.reboundExitY = null;
  p.reboundEntity = null;
  p.reboundIgnoreEntity = null;
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

function assertApprox(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(msg + " expected " + expected + " +/- " + tolerance + ", got " + actual);
  }
}

function feetY(g) {
  return g.player.y + g.CONFIG.PLAYER_H;
}

function tilesFromPixels(g, pixels) {
  return pixels / g.CONFIG.TILE_SIZE;
}

function clearMeasurementWorld(g, rowCount = 50, colCount = 70) {
  ensureScratchWorld(g, rowCount, colCount);
  g.entities.length = 0;
  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }
}

function paintTileBlock(g, topRow, leftCol, rowCount, colCount = 3) {
  for (let r = topRow; r < topRow + rowCount; r++) {
    for (let c = leftCol; c < leftCol + colCount; c++) g.tiles[r][c] = true;
  }
}

function buildMeasurementFixture(g, options = {}) {
  clearMeasurementWorld(g);
  const topRow = options.topRow === undefined ? 24 : options.topRow;
  const leftCol = options.leftCol === undefined ? 10 : options.leftCol;
  const cols = options.cols === undefined ? 3 : options.cols;
  const massRows = options.massRows || 0;
  if (massRows > 0) paintTileBlock(g, topRow, leftCol, massRows, cols);
  if (options.floorRow !== undefined) {
    for (let c = 0; c < g.tiles[options.floorRow].length; c++) g.tiles[options.floorRow][c] = true;
  }
  return {
    topRow,
    leftCol,
    cols,
    massRows,
    topY: topRow * g.CONFIG.TILE_SIZE,
    bottomY: (topRow + massRows) * g.CONFIG.TILE_SIZE,
    x: cellX(g, leftCol + Math.floor(cols / 2))
  };
}

function formatTiles(value) {
  return value.toFixed(2);
}

function measurePeakFeetRise(g, setup, maxFrames = 360) {
  const startFeet = setup();
  let peakFeet = startFeet;
  for (let i = 0; i < maxFrames; i++) {
    step(g);
    peakFeet = Math.min(peakFeet, feetY(g));
  }
  return tilesFromPixels(g, startFeet - peakFeet);
}

function activateRebound(g, mode) {
  if (mode === "ctrl+shift") {
    g.keys.ShiftLeft = true;
    g.keys.ControlLeft = true;
  } else {
    release(g, "ShiftLeft");
  }
  step(g);
}

function measureCurrentReboundPeakFromExit(g, maxFrames = 480, mode = "release") {
  const rebound = g.shouldRebound(g.playerRect());
  assert(rebound.fire === true, mode + " rebound measurement did not start from a valid release");
  assert(rebound.exitY !== null && rebound.exitY !== undefined, mode + " rebound measurement did not provide a planned exit");

  activateRebound(g, mode);
  assert(g.player.state !== "stuck", mode + " rebound measurement became stuck on activation");

  let exited = false;
  let peakY = Infinity;
  for (let i = 0; i < maxFrames; i++) {
    step(g);
    assert(g.player.state !== "stuck", mode + " rebound measurement became stuck after activation");
    if (!exited && g.player.y <= rebound.exitY + 0.001) exited = true;
    if (exited) peakY = Math.min(peakY, g.player.y);
    if (exited && g.player.vy > 0 && g.player.y > peakY + 5) break;
  }

  assert(exited, mode + " rebound measurement never reached the planned exit");
  return {
    rebound,
    riseTiles: tilesFromPixels(g, rebound.exitY - peakY)
  };
}

function measureNormalJumpPeak(g) {
  const fixture = buildMeasurementFixture(g, { floorRow: 32, leftCol: 10 });
  return measurePeakFeetRise(g, () => {
    setPlayer(g, fixture.x, standY(g, 32), "solid");
    assert(g.player.grounded === true, "normal jump measurement did not start grounded");
    press(g, "Space");
    return feetY(g);
  }, 180);
}

function measureReboundPeak(g, massRows, releasePoint, mode = "release") {
  const fixture = buildMeasurementFixture(g, { topRow: 24, leftCol: 10, massRows });
  const releaseFeet = releasePoint === "center" ?
    fixture.topY + (fixture.bottomY - fixture.topY) / 2 :
    fixture.bottomY;

  setPlayer(g, fixture.x, releaseFeet - g.CONFIG.PLAYER_H, "permeating");
  return measureCurrentReboundPeakFromExit(g, 480, mode).riseTiles;
}

function simulatePassThrough(g, massRows, fallTiles, maxFrames = 360) {
  const fixture = buildMeasurementFixture(g, { topRow: 24, leftCol: 10, massRows });
  setPlayer(
    g,
    fixture.x,
    fixture.topY - fallTiles * g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_H,
    "permeating"
  );
  g.keys.ShiftLeft = true;

  for (let i = 0; i < maxFrames; i++) {
    step(g);
    if (g.player.y > fixture.bottomY && g.overlappingSolidTiles(g.playerRect()).length === 0) {
      return true;
    }
  }
  return false;
}

function findMinimumFallTiles(g, massRows) {
  const precision = 1 / 32;
  let low = 0;
  let high = 32;
  assert(simulatePassThrough(g, massRows, high), "fall-through threshold for " + massRows + " rows exceeded " + high + " tiles");

  while (high - low > precision) {
    const mid = (low + high) / 2;
    if (simulatePassThrough(g, massRows, mid)) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return high;
}

function measureFreeFallToTerminal(g) {
  buildMeasurementFixture(g);
  setPlayer(g, cellX(g, 10), -g.CONFIG.PLAYER_H, "solid");
  const startFeet = feetY(g);

  for (let i = 0; i < 240; i++) {
    step(g);
    if (g.player.vy >= g.CONFIG.MAX_FALL_SPEED - 0.001) {
      assertApprox(g.player.vy, g.CONFIG.MAX_FALL_SPEED, 0.001, "free fall did not reach max fall speed");
      return tilesFromPixels(g, feetY(g) - startFeet);
    }
  }

  throw new Error("free fall never reached max fall speed");
}

function simulateTerminalVelocityPassThrough(g, massRows, maxFrames = 420) {
  const fixture = buildMeasurementFixture(g, { topRow: 2, leftCol: 10, massRows });
  setPlayer(g, fixture.x, fixture.topY - g.CONFIG.PLAYER_H, "permeating");
  g.player.vy = g.CONFIG.MAX_FALL_SPEED;
  g.keys.ShiftLeft = true;

  for (let i = 0; i < maxFrames; i++) {
    step(g);
    if (g.player.y > fixture.bottomY && g.overlappingSolidTiles(g.playerRect()).length === 0) {
      return true;
    }
  }
  return false;
}

function findMaxTerminalVelocityPassThroughRows(g) {
  const capRows = 40;
  assert(!simulateTerminalVelocityPassThrough(g, capRows), "terminal velocity pass-through exceeded " + capRows + " tile rows");

  let low = 0;
  let high = capRows;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (simulateTerminalVelocityPassThrough(g, mid)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
}

function measureChainPeak(g, stackCount) {
  clearMeasurementWorld(g);
  const rows = [];
  for (let i = 0; i < stackCount; i++) rows.push(35 - i * 2);
  for (const row of rows) paintTileBlock(g, row, 14, 1, 3);

  const startFeet = rows[0] * g.CONFIG.TILE_SIZE;
  setPlayer(g, cellX(g, 15), standY(g, rows[0]), "solid");
  press(g, "ShiftLeft");

  const touchedRows = new Set();
  let firstSlabReady = false;
  for (let i = 0; i < 120; i++) {
    step(g);
    for (const t of g.overlappingSolidTiles(g.playerRect())) touchedRows.add(t.r);
    if (touchedRows.has(rows[0]) && g.shouldRebound(g.playerRect()).fire) {
      firstSlabReady = true;
      break;
    }
  }
  assert(firstSlabReady, "chain measurement for " + stackCount + " slabs never reached a valid first-slab rebound; touched " + Array.from(touchedRows).join(","));
  press(g, "ControlLeft");

  let peakFeet = startFeet;
  for (let i = 0; i < 900; i++) {
    step(g);
    peakFeet = Math.min(peakFeet, feetY(g));
    for (const t of g.overlappingSolidTiles(g.playerRect())) touchedRows.add(t.r);
    if (g.player.y < rows[rows.length - 1] * g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_H) break;
  }

  const missedRows = rows.filter((row) => !touchedRows.has(row));
  assert(missedRows.length === 0, "chain measurement skipped stack rows: " + missedRows.join(", "));
  return tilesFromPixels(g, startFeet - peakFeet);
}

function oneTileGapChainImpossible(g, stackCount) {
  return stackCount > 1 && g.CONFIG.PLAYER_H > g.CONFIG.TILE_SIZE;
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

const LEVEL_REACH_LIMITS = {
  normalJumpTiles: 2,
  maxPassThroughRows: 5,
  minimumClearanceRows: 2,
  bottomReboundByRows: [0, 2, 4, 7, 12, 21],
  minimumFallThroughByRows: [0, 2, 4, 5, 5, 5]
};

function tileAt(level, r, c) {
  if (r < 0 || r >= level.map.length || c < 0 || c >= level.map[0].length) return ".";
  return level.map[r][c];
}

function isSolidTile(level, r, c) {
  return tileAt(level, r, c) === "#";
}

function hasPlayerClearance(level, r, c) {
  for (let clearR = r - LEVEL_REACH_LIMITS.minimumClearanceRows; clearR < r; clearR++) {
    if (isSolidTile(level, clearR, c)) return false;
  }
  return true;
}

function staticColumnHeight(level, r, c) {
  let height = 0;
  while (isSolidTile(level, r + height, c)) height++;
  return height;
}

function addStaticSurfaceNodes(level, nodes) {
  let id = nodes.length;
  for (let r = 0; r < level.map.length; r++) {
    let c = 0;
    while (c < level.map[0].length) {
      if (!isSolidTile(level, r, c) || isSolidTile(level, r - 1, c) || !hasPlayerClearance(level, r, c)) {
        c++;
        continue;
      }

      const start = c;
      let maxHeight = 0;
      while (
        c < level.map[0].length &&
        isSolidTile(level, r, c) &&
        !isSolidTile(level, r - 1, c) &&
        hasPlayerClearance(level, r, c)
      ) {
        maxHeight = Math.max(maxHeight, staticColumnHeight(level, r, c));
        c++;
      }

      nodes.push({
        id: id++,
        c: start,
        r,
        w: c - start,
        h: maxHeight,
        type: "terrain",
        name: "terrain"
      });
    }
  }
}

function addMoverSurfaceNodes(level, nodes) {
  let id = nodes.length;
  for (const entity of level.entities) {
    if (entity.type !== "mover") continue;
    nodes.push({
      id: id++,
      c: entity.c,
      r: entity.r,
      w: entity.w,
      h: entity.h,
      type: entity.type,
      name: entity.name,
      role: entity.role
    });
  }
}

function surfaceNodesForLevel(level) {
  const nodes = [];
  addStaticSurfaceNodes(level, nodes);
  addMoverSurfaceNodes(level, nodes);
  return nodes;
}

function rangeGapTiles(a, b) {
  if (a.c + a.w <= b.c) return b.c - (a.c + a.w);
  if (b.c + b.w <= a.c) return a.c - (b.c + b.w);
  return 0;
}

function bottomReboundLimitTiles(rows) {
  return LEVEL_REACH_LIMITS.bottomReboundByRows[Math.min(rows, LEVEL_REACH_LIMITS.maxPassThroughRows)];
}

function ballisticRisePixelsForTest(g, launchSpeed) {
  let vy = -launchSpeed;
  let y = 0;
  let peak = 0;
  for (let i = 0; i < 240; i++) {
    vy = Math.min(g.CONFIG.MAX_FALL_SPEED, vy + g.CONFIG.GRAVITY);
    y += vy;
    peak = Math.min(peak, y);
    if (vy >= 0 && y > peak) break;
  }
  return -peak;
}

function launchSpeedForRiseTilesForTest(g, riseTiles) {
  const targetPixels = riseTiles * g.CONFIG.TILE_SIZE;
  let low = 0;
  let high = 64;
  while (ballisticRisePixelsForTest(g, high) < targetPixels) high *= 2;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (ballisticRisePixelsForTest(g, mid) < targetPixels) low = mid;
    else high = mid;
  }
  return high;
}

function ascentFramesAtRise(g, launchSpeed, riseTiles) {
  const targetY = -riseTiles * g.CONFIG.TILE_SIZE;
  const tolerance = 2;
  let vy = -launchSpeed;
  let y = 0;
  let reachedHeight = riseTiles <= 0;
  for (let frames = 1; frames <= 600; frames++) {
    vy = Math.min(g.CONFIG.MAX_FALL_SPEED, vy + g.CONFIG.GRAVITY);
    y += vy;
    if (y <= targetY + tolerance) reachedHeight = true;
    if (reachedHeight && y >= targetY - tolerance && vy >= 0) return frames;
  }
  return 0;
}

function fallFramesToDrop(g, fallTiles) {
  const targetY = Math.max(0, fallTiles) * g.CONFIG.TILE_SIZE;
  let vy = 0;
  let y = 0;
  for (let frames = 1; frames <= 600; frames++) {
    vy = Math.min(g.CONFIG.MAX_FALL_SPEED, vy + g.CONFIG.GRAVITY);
    y += vy;
    if (y >= targetY) return frames;
  }
  return 600;
}

function horizontalReachTilesForFrames(g, frames, speedMultiplier = 1) {
  return frames * g.CONFIG.MAX_RUN_SPEED * speedMultiplier / g.CONFIG.TILE_SIZE + g.CONFIG.PLAYER_W / g.CONFIG.TILE_SIZE;
}

function movementAnalysis(g, from, to) {
  const riseTiles = from.r - to.r;
  const gapTiles = rangeGapTiles(from, to);
  let verticalLimitTiles = Infinity;
  let horizontalLimitTiles = 0;
  let mode = "fall";

  if (riseTiles <= 0) {
    horizontalLimitTiles = horizontalReachTilesForFrames(g, fallFramesToDrop(g, -riseTiles));
  } else if (riseTiles <= LEVEL_REACH_LIMITS.normalJumpTiles) {
    mode = "jump";
    verticalLimitTiles = LEVEL_REACH_LIMITS.normalJumpTiles;
    horizontalLimitTiles = horizontalReachTilesForFrames(
      g,
      ascentFramesAtRise(g, launchSpeedForRiseTilesForTest(g, LEVEL_REACH_LIMITS.normalJumpTiles), riseTiles)
    );
  } else {
    mode = "rebound";
    verticalLimitTiles = bottomReboundLimitTiles(from.h);
    const fallThroughTiles = LEVEL_REACH_LIMITS.minimumFallThroughByRows[Math.min(from.h, LEVEL_REACH_LIMITS.maxPassThroughRows)];
    if (from.h > LEVEL_REACH_LIMITS.maxPassThroughRows || fallThroughTiles > LEVEL_REACH_LIMITS.maxPassThroughRows) {
      return {
        ok: false,
        mode,
        riseTiles,
        gapTiles,
        verticalLimitTiles,
        horizontalLimitTiles,
        reason: "pass-through cap"
      };
    }
    horizontalLimitTiles = horizontalReachTilesForFrames(
      g,
      ascentFramesAtRise(g, launchSpeedForRiseTilesForTest(g, verticalLimitTiles), riseTiles),
      g.CONFIG.REBOUND_HORIZONTAL_MULTIPLIER
    );
  }

  return {
    ok: riseTiles <= verticalLimitTiles && gapTiles <= horizontalLimitTiles,
    mode,
    riseTiles,
    gapTiles,
    verticalLimitTiles,
    horizontalLimitTiles,
    reason: riseTiles > verticalLimitTiles ? "vertical" : "horizontal"
  };
}

function describeSurface(node) {
  return node.name + " c" + node.c + "-" + (node.c + node.w - 1) + " r" + node.r + " h" + node.h;
}

function nodeContainsColumn(node, c) {
  return c >= node.c && c < node.c + node.w;
}

function findStartNodes(level, nodes) {
  return nodes.filter((node) =>
    nodeContainsColumn(node, level.spawn.c) &&
    node.r >= level.spawn.r &&
    node.r <= level.spawn.r + 1
  );
}

function isGoalNode(level, node) {
  return node.r === level.goal.r + 1 && nodeContainsColumn(node, level.goal.c);
}

function explainBestBlockedMove(g, nodes, reachable) {
  let best = null;
  for (const from of nodes) {
    if (!reachable.has(from.id)) continue;
    for (const to of nodes) {
      if (reachable.has(to.id)) continue;
      const move = movementAnalysis(g, from, to);
      const verticalOver = Math.max(0, move.riseTiles - move.verticalLimitTiles);
      const horizontalOver = Math.max(0, move.gapTiles - move.horizontalLimitTiles);
      const score = verticalOver * 10 + horizontalOver + Math.max(0, to.r);
      if (!best || score < best.score) best = { from, to, move, score };
    }
  }
  if (!best) return "no candidate move found";
  return describeSurface(best.from) + " -> " + describeSurface(best.to) +
    " needs " + best.move.mode + " rise " + best.move.riseTiles +
    " tiles and gap " + best.move.gapTiles.toFixed(2) +
    " tiles; limits are rise " + best.move.verticalLimitTiles +
    " and gap " + best.move.horizontalLimitTiles.toFixed(2);
}

function testAuthoredLevelsAreReachableWithinPlayerLimits() {
  const g = makeGame();

  g.LEVELS.forEach((level, index) => {
    if (/^Bug /.test(level.name)) return;

    const nodes = surfaceNodesForLevel(level);
    const starts = findStartNodes(level, nodes);
    assert(starts.length > 0, "level " + (index + 1) + " " + level.name + " has no standable spawn surface");
    assert(
      nodes.some((node) => isGoalNode(level, node)),
      "level " + (index + 1) + " " + level.name + " has no standable goal shelf"
    );

    const queue = starts.slice();
    const reachable = new Set(starts.map((node) => node.id));
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const from = queue[cursor];
      for (const to of nodes) {
        if (reachable.has(to.id)) continue;
        if (!movementAnalysis(g, from, to).ok) continue;
        reachable.add(to.id);
        queue.push(to);
      }
    }

    assert(
      nodes.some((node) => reachable.has(node.id) && isGoalNode(level, node)),
      "level " + (index + 1) + " " + level.name +
        " goal shelf is unreachable within player limits; closest blocked move: " +
        explainBestBlockedMove(g, nodes, reachable)
    );
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

function testBugOneAutoChainReachesTop() {
  const g = makeGame();
  g.loadLevel(0);
  setPlayer(g, cellX(g, 7), standY(g, 60), "solid");

  press(g, "ShiftLeft");
  step(g, 60);
  press(g, "ControlLeft");

  let chainStarted = false;
  const chainExits = [];
  let previousState = g.player.state;
  for (let i = 0; i < 2400; i++) {
    step(g);
    if (previousState === "rebounding" && g.player.state === "permeating") {
      chainExits.push({
        speed: g.player.vy,
        launch: g.player.reboundLaunchVelocity,
        target: g.player.reboundTargetRiseTiles
      });
    }
    previousState = g.player.state;
    if (g.player.state === "permeating" || g.player.state === "rebounding") chainStarted = true;
    assert(g.player.state !== "stuck", "bug 1 chain entered stuck recovery");
    assert(!chainStarted || g.player.state !== "solid", "bug 1 chain became solid before reaching the top");
    if (g.player.won) {
      assert(chainExits.length >= 4, "bug 1 chain did not record enough rebound exits");
      for (let j = 0; j < Math.min(4, chainExits.length); j++) {
        assert(chainExits[j].target >= 1, "bug 1 chain exit " + j + " lost its rebound target");
        assert(
          chainExits[j].speed <= -chainExits[j].launch + 0.001,
          "bug 1 chain exit " + j + " velocity collapsed to " + chainExits[j].speed.toFixed(3) +
            " below launch " + chainExits[j].launch.toFixed(3)
        );
      }
      return;
    }
  }

  throw new Error("bug 1 auto-chain did not reach the top goal");
}

function testBugTwoTallMassReboundsOnce() {
  const g = makeGame();
  g.loadLevel(1);
  g.goalRect.x = -1000;
  g.goalRect.y = -1000;

  const massTopRow = 17;
  const massBottomRow = 37;
  const bottomY = (massBottomRow + 1) * g.CONFIG.TILE_SIZE;
  for (const mode of ["release", "ctrl+shift"]) {
    setPlayer(g, cellX(g, 7), bottomY - g.CONFIG.PLAYER_H, "permeating");

    const rebound = g.shouldRebound(g.playerRect());
    assert(rebound.fire === true, "bug 2 tall mass did not allow " + mode + " rebound");
    assertApprox(rebound.targetRiseTiles, 21, 0.001, "bug 2 tall mass did not use capped 5-row " + mode + " rebound tuning");

    activateRebound(g, mode);
    let reboundStarts = g.player.state === "rebounding" ? 1 : 0;
    let exited = false;
    let peakY = Infinity;
    let previousState = g.player.state;
    for (let i = 0; i < 900; i++) {
      step(g);
      if (previousState !== "rebounding" && g.player.state === "rebounding") reboundStarts++;
      previousState = g.player.state;
      assert(g.player.state !== "stuck", "bug 2 " + mode + " tall mass entered stuck recovery");
      if (!exited && g.player.y <= rebound.exitY + 0.001) exited = true;
      if (exited) peakY = Math.min(peakY, g.player.y);
      if (exited && g.player.vy > 0 && g.player.y > peakY + 5) break;
    }

    assert(exited, "bug 2 " + mode + " tall mass rebound did not reach its planned exit");
    assert(reboundStarts === 1, "bug 2 " + mode + " tall mass rebounded " + reboundStarts + " times instead of once");
    assertApprox(tilesFromPixels(g, rebound.exitY - peakY), 21, 0.05, "bug 2 " + mode + " bottom rebound did not rise 21 tiles from the top exit");
  }
}

function testAutoAssistClimbsTunedThickStack() {
  const g = makeGame();
  clearMeasurementWorld(g);

  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const rows = [36, 31, 26, 21];
  const massHeight = 3;
  for (const row of rows) {
    for (let r = row; r < row + massHeight; r++) {
      for (let c = 14; c <= 16; c++) g.tiles[r][c] = true;
    }
  }

  setPlayer(g, cellX(g, 15), standY(g, rows[0]), "solid");
  press(g, "ShiftLeft");

  // Let Shift permeation settle the player fully into the bottom mass, then
  // hold Ctrl. No Space press, no Shift release, and no Ctrl release are used.
  step(g, 60);
  assert(g.overlappingSolidTiles(g.playerRect()).length > 0, "player never permeated into the first mass");
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

  const missedRows = rows.filter((row) => {
    for (let r = row; r < row + massHeight; r++) {
      if (touchedRows.has(r)) return false;
    }
    return true;
  });
  assert(missedRows.length === 0, "auto-chain skipped stack masses: " + missedRows.join(", "));
  assert(reachedTop, "auto-chain did not carry the player above the top tile");
}

function testManualQueueConsumesOnSurface() {
  const g = makeGame();
  clearMeasurementWorld(g);

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

function testManualTapChainKeepsQueuedPermeation() {
  const g = makeGame();
  g.loadLevel(0);
  setPlayer(g, cellX(g, 7), standY(g, 60), "solid");

  press(g, "ShiftLeft");
  step(g, 60);
  assert(g.overlappingSolidTiles(g.playerRect()).length > 0, "manual tap chain never entered the first mass");
  release(g, "ShiftLeft");
  step(g);
  assert(g.player.state === "rebounding", "manual tap chain did not start the first rebound");

  let releaseTapNext = false;
  let chainStarted = true;
  let reboundStarts = 1;
  let previousState = g.player.state;

  for (let i = 0; i < 2400; i++) {
    if (releaseTapNext) {
      release(g, "ShiftLeft");
      releaseTapNext = false;
    } else if (g.player.state === "rebounding" && !g.player.queuedPermeate) {
      press(g, "ShiftLeft");
      releaseTapNext = true;
    } else if (
      g.player.state === "permeating" &&
      !g.player.permeateUntilClear &&
      g.overlappingMatter(g.playerRect()).length > 0
    ) {
      press(g, "ShiftLeft");
      releaseTapNext = true;
    }

    step(g);

    if (previousState !== "rebounding" && g.player.state === "rebounding") reboundStarts++;
    previousState = g.player.state;
    if (g.player.state === "permeating" || g.player.state === "rebounding") chainStarted = true;

    assert(g.player.state !== "stuck", "manual tap chain entered stuck recovery");
    assert(!chainStarted || g.player.state !== "solid", "manual tap chain became solid before reaching the top");
    assert(g.player.stuckTimer === 0, "manual tap chain armed stuck respawn");

    if (g.player.won) {
      assert(reboundStarts >= 4, "manual tap chain did not perform enough rebounds");
      return;
    }
  }

  throw new Error("manual tap chain did not reach the top goal");
}

function testManualRhythmChainCompletesFirstLevelWithoutCtrl() {
  const g = makeGame();
  g.loadLevel(0);
  setPlayer(g, cellX(g, 7), standY(g, 60), "solid");

  press(g, "ShiftLeft");
  step(g, 60);
  assert(g.overlappingSolidTiles(g.playerRect()).length > 0, "manual rhythm chain never entered the first mass");
  release(g, "ShiftLeft");
  step(g);
  assert(g.player.state === "rebounding", "manual rhythm chain did not start the first rebound");

  const tapPeriod = 8;
  const tapWidth = 2;
  let reboundStarts = 1;
  let previousState = g.player.state;
  let chainStarted = true;

  for (let i = 0; i < 2400; i++) {
    const phase = i % tapPeriod;
    if (phase === 0) press(g, "ShiftLeft");
    if (phase === tapWidth) release(g, "ShiftLeft");

    assert(g.keys.ControlLeft !== true && g.keys.ControlRight !== true, "manual rhythm chain used Ctrl");
    step(g);

    if (previousState !== "rebounding" && g.player.state === "rebounding") reboundStarts++;
    previousState = g.player.state;
    if (g.player.state === "permeating" || g.player.state === "rebounding") chainStarted = true;

    assert(g.keys.ControlLeft !== true && g.keys.ControlRight !== true, "manual rhythm chain held Ctrl after stepping");
    assert(g.player.state !== "stuck", "manual rhythm chain entered stuck recovery");
    assert(!chainStarted || g.player.state !== "solid", "manual rhythm chain became solid before reaching the top");
    assert(g.player.stuckTimer === 0, "manual rhythm chain armed stuck respawn");

    if (g.player.won) {
      assert(reboundStarts >= 4, "manual rhythm chain did not perform enough rebounds");
      return;
    }
  }

  throw new Error("manual rhythm chain did not reach the first-level goal without Ctrl");
}

function testReboundHorizontalBoostScalesMovement() {
  const g = makeGame();
  const fixture = buildMeasurementFixture(g, { topRow: 24, leftCol: 10, massRows: 5, cols: 3 });
  const normalSpeed = g.CONFIG.MAX_RUN_SPEED;
  const boostedSpeed = normalSpeed * g.CONFIG.REBOUND_HORIZONTAL_MULTIPLIER;
  const eps = 0.001;

  setPlayer(g, fixture.x, fixture.bottomY - g.CONFIG.PLAYER_H, "permeating");
  release(g, "ShiftLeft");
  press(g, "ArrowRight");

  let exceededNormal = false;
  let sawSolidLaunchBoost = false;
  let boostEnded = false;

  for (let i = 0; i < 240; i++) {
    step(g);
    assert(g.player.state !== "stuck", "rebound horizontal boost entered stuck recovery");
    assert(Math.abs(g.player.vx) <= boostedSpeed + eps, "rebound horizontal boost exceeded its boosted speed cap");
    if (g.reboundMoveBoostActive() && Math.abs(g.player.vx) > normalSpeed + eps) exceededNormal = true;
    if (g.player.state === "solid" && g.reboundMoveBoostActive() && g.player.vy < 0) {
      sawSolidLaunchBoost = true;
    }
    if (sawSolidLaunchBoost && !g.reboundMoveBoostActive()) {
      boostEnded = true;
      break;
    }
  }

  assert(exceededNormal, "rebound horizontal boost never exceeded normal run speed");
  assert(sawSolidLaunchBoost, "rebound horizontal boost did not persist into the visible upward launch");
  assert(boostEnded, "rebound horizontal boost did not end after the upward launch apex");
  assert(Math.abs(g.player.vx) <= normalSpeed + eps, "normal movement stayed above max run speed after rebound boost ended");
}

function testCtrlChainReboundsKeepHorizontalBoost() {
  const g = makeGame();
  clearMeasurementWorld(g);

  const rows = [36, 28];
  const massHeight = 5;
  for (const row of rows) paintTileBlock(g, row, 5, massHeight, 22);

  const normalSpeed = g.CONFIG.MAX_RUN_SPEED;
  const boostedSpeed = normalSpeed * g.CONFIG.REBOUND_HORIZONTAL_MULTIPLIER;
  const eps = 0.001;

  setPlayer(g, cellX(g, 15), standY(g, rows[0]), "solid");
  press(g, "ShiftLeft");
  step(g, 60);
  assert(g.overlappingSolidTiles(g.playerRect()).length > 0, "Ctrl chain boost test never entered the first mass");

  press(g, "ControlLeft");
  press(g, "ArrowRight");

  let reboundStarts = 0;
  let previousState = g.player.state;
  let secondReboundExceededNormal = false;
  let secondReboundReachedChainLaunch = false;

  for (let i = 0; i < 720; i++) {
    step(g);
    assert(g.player.state !== "stuck", "Ctrl chain horizontal boost entered stuck recovery");
    assert(Math.abs(g.player.vx) <= boostedSpeed + eps, "Ctrl chain horizontal boost exceeded its doubled speed cap");

    if (previousState !== "rebounding" && g.player.state === "rebounding") reboundStarts++;
    if (reboundStarts >= 2 && g.reboundMoveBoostActive() && Math.abs(g.player.vx) > normalSpeed + eps) {
      secondReboundExceededNormal = true;
    }
    if (reboundStarts >= 2 && g.player.state !== "rebounding" && g.reboundMoveBoostActive() && g.player.vy < 0) {
      secondReboundReachedChainLaunch = true;
      break;
    }
    previousState = g.player.state;
  }

  assert(reboundStarts >= 2, "Ctrl chain did not start a second rebound");
  assert(secondReboundExceededNormal, "second Ctrl-chain rebound did not exceed normal run speed");
  assert(secondReboundReachedChainLaunch, "second Ctrl-chain rebound boost did not persist into the upward chain launch");
}

function testUpperBodyOnlyReleaseDoesNotRebound() {
  const g = makeGame();
  clearMeasurementWorld(g);

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

function buildCeilingHangFixture(g) {
  clearMeasurementWorld(g);
  const row = 20;
  const leftCol = 10;
  paintTileBlock(g, row, leftCol, 1, 3);

  const topY = row * g.CONFIG.TILE_SIZE;
  const bottomY = (row + 1) * g.CONFIG.TILE_SIZE;
  const startY = bottomY - 15;
  setPlayer(g, cellX(g, leftCol + 1), startY, "permeating");
  return {
    row,
    leftCol,
    topY,
    bottomY,
    startY,
    exitY: topY - g.CONFIG.PLAYER_H
  };
}

function testCeilingHangWithoutInputStaysPinned() {
  const g = makeGame();
  const fixture = buildCeilingHangFixture(g);

  g.player.vy = 4;
  assert(g.ceilingHangInfo(g.playerRect()).active === true, "ceiling hang fixture did not start in top-half-only matter");
  assert(g.bottomHalfOverlapsSolid(g.playerRect()) === false, "ceiling hang fixture started with lower-body overlap");

  for (let i = 0; i < 30; i++) {
    step(g);
    assert(g.player.state === "permeating", "ceiling hang left permeating without input");
    assert(g.player.reboundSurfaced === false, "ceiling hang behaved like a rebound without input");
    assert(g.bottomHalfOverlapsSolid(g.playerRect()) === false, "ceiling hang drifted into lower-body matter without input");
    assertNear(g.player.y, fixture.startY, "ceiling hang moved vertically without input");
    assertNear(g.player.vy, 0, "ceiling hang kept vertical speed without input");
  }
}

function testCeilingHangSpaceLatchesCenterPull() {
  const g = makeGame();
  const fixture = buildCeilingHangFixture(g);

  press(g, "Space");
  step(g);
  release(g, "Space");

  assert(g.player.ceilingPullMode === "space", "Space did not latch ceiling-hang pull");
  assert(g.player.jumpBufferTimer === 0, "Space ceiling pull left a jump buffered");
  assert(g.player.y < fixture.startY, "Space ceiling pull did not move toward the mass center");
  assert(g.player.state === "permeating", "Space ceiling pull changed state immediately");

  let lowerEntered = false;
  for (let i = 0; i < 80; i++) {
    step(g);
    assert(g.player.state === "permeating", "Space ceiling pull triggered an unwanted rebound");
    if (g.bottomHalfOverlapsSolid(g.playerRect())) {
      lowerEntered = true;
      break;
    }
  }

  assert(lowerEntered, "Space ceiling pull never reached normal lower-body permeation");
  step(g);
  assert(g.player.ceilingPullMode === null, "Space ceiling pull did not clear after lower-body matter overlap");
  assert(g.player.state === "permeating", "Space ceiling pull did not remain in normal permeation");
}

function testCeilingHangCtrlPullsThenReboundsWhenFullyInside() {
  const g = makeGame();
  const fixture = buildCeilingHangFixture(g);

  press(g, "ControlLeft");
  step(g);

  assert(g.player.ceilingPullMode === "assist", "Ctrl did not arm ceiling-hang assist");
  assert(g.player.y < fixture.startY, "Ctrl ceiling assist did not pull toward the mass center");
  assert(g.player.state === "permeating", "Ctrl ceiling assist rebounded before lower-body entry");

  let sawPartialLowerEntry = false;
  let rebounded = false;
  for (let i = 0; i < 120; i++) {
    step(g);
    const lowerOverlap = g.bottomHalfOverlapsSolid(g.playerRect());
    const fullyInside = g.bottomHalfFullyInsideMatter(g.playerRect());

    if (lowerOverlap && !fullyInside && g.player.state === "permeating") {
      sawPartialLowerEntry = true;
    }
    if (sawPartialLowerEntry && lowerOverlap && !fullyInside) {
      assert(g.player.state !== "rebounding", "Ctrl ceiling assist rebounded on first lower-body contact");
    }
    if (g.player.state === "rebounding") {
      rebounded = true;
      assert(sawPartialLowerEntry, "Ctrl ceiling assist did not wait past first lower-body contact");
      assert(g.player.reboundExitY === fixture.exitY, "Ctrl ceiling assist did not use the normal rebound exit");
      assert(g.player.reboundTargetRiseTiles > 0, "Ctrl ceiling assist did not use target-based rebound tuning");
      assert(g.player.reboundLaunchVelocity > 0, "Ctrl ceiling assist did not compute a rebound launch velocity");
      break;
    }
  }

  assert(rebounded, "Ctrl ceiling assist did not rebound after the lower half became fully embedded");
}

function testBlockedUpwardEscapeBecomesStuck() {
  const g = makeGame();
  clearMeasurementWorld(g);

  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  for (let r = 20; r <= 30; r++) {
    for (let c = 18; c <= 20; c++) g.tiles[r][c] = true;
  }
  for (let c = 18; c <= 20; c++) g.tiles[18][c] = true;

  setPlayer(g, cellX(g, 19), 29 * g.CONFIG.TILE_SIZE, "permeating");
  activateRebound(g, "release");

  for (let i = 0; i < 120 && g.player.state !== "stuck"; i++) step(g);
  assert(g.player.state === "stuck", "blocked upward escape did not enter stuck state");
  step(g, Math.ceil(g.CONFIG.STUCK_DURATION / g.CONFIG.DT) + 2);
  assert(g.player.state === "solid", "stuck recovery did not return to solid");
  assert(g.overlappingSolidTiles(g.playerRect()).length === 0, "stuck recovery left player inside terrain");
}

function testPermeationCenterPullUsesTunedAccel() {
  const g = makeGame();
  clearMeasurementWorld(g);

  g.entities.length = 0;
  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const row = 20;
  for (let c = 10; c <= 12; c++) g.tiles[row][c] = true;

  setPlayer(g, cellX(g, 11), row * g.CONFIG.TILE_SIZE - 20, "permeating");
  step(g);

  assert(g.player.vy > 0, "permeate center pull did not draw the player toward the mass center");
  assert(g.player.vy <= g.CONFIG.PERMEATE_MATTER_MAX_SPEED, "permeate center pull exceeded the matter speed cap");
}

function testThinMassKeepsExistingReboundCurve() {
  const g = makeGame();
  clearMeasurementWorld(g);

  g.entities.length = 0;
  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const row = 20;
  for (let c = 10; c <= 12; c++) g.tiles[row][c] = true;

  for (const mode of ["release", "ctrl+shift"]) {
    setPlayer(g, cellX(g, 11), row * g.CONFIG.TILE_SIZE, "permeating");
    const rebound = g.shouldRebound(g.playerRect());

    assert(rebound.fire === true, "thin lower-body overlap did not allow " + mode + " rebound");
    assertApprox(rebound.targetRiseTiles, 2, 0.001, "thin mass bottom " + mode + " did not target a 2-tile rebound");

    const measured = measureCurrentReboundPeakFromExit(g, 480, mode);
    assertApprox(measured.riseTiles, 2, 0.05, "thin mass bottom " + mode + " did not rise 2 tiles from the planned exit");
  }
}

function testDeepStaticMassRewardsBottomDive() {
  const g = makeGame();
  clearMeasurementWorld(g);

  g.entities.length = 0;
  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const topRow = 20;
  const bottomRow = 24;
  for (let r = topRow; r <= bottomRow; r++) {
    for (let c = 10; c <= 12; c++) g.tiles[r][c] = true;
  }

  const topY = topRow * g.CONFIG.TILE_SIZE;
  const bottomY = (bottomRow + 1) * g.CONFIG.TILE_SIZE;
  const fullChargeDepth = g.CONFIG.PLAYER_H + g.CONFIG.TILE_SIZE;

  setPlayer(g, cellX(g, 11), topY + fullChargeDepth - g.CONFIG.PLAYER_H, "permeating");
  const mid = g.shouldRebound(g.playerRect());

  setPlayer(g, cellX(g, 11), bottomY - g.CONFIG.PLAYER_H, "permeating");
  const deep = g.shouldRebound(g.playerRect());

  assert(deep.targetRiseTiles > mid.targetRiseTiles, "bottom dive in tall static mass did not strengthen rebound");
  assertApprox(deep.targetRiseTiles, 21, 0.001, "bottom dive did not reach the tuned 5-row target height");
}

function testTallStaticMassReboundsFromExit() {
  const g = makeGame();
  clearMeasurementWorld(g, 80, 70);

  const topRow = 35;
  const bottomRow = 55;
  for (let r = topRow; r <= bottomRow; r++) {
    for (let c = 10; c <= 12; c++) g.tiles[r][c] = true;
  }

  const topY = topRow * g.CONFIG.TILE_SIZE;
  const bottomY = (bottomRow + 1) * g.CONFIG.TILE_SIZE;
  const centerFeet = topY + (bottomY - topY) / 2;

  for (const mode of ["release", "ctrl+shift"]) {
    setPlayer(g, cellX(g, 11), centerFeet - g.CONFIG.PLAYER_H, "permeating");
    const center = measureCurrentReboundPeakFromExit(g, 900, mode);

    setPlayer(g, cellX(g, 11), bottomY - g.CONFIG.PLAYER_H, "permeating");
    const bottom = measureCurrentReboundPeakFromExit(g, 900, mode);

    assertApprox(center.rebound.targetRiseTiles, 21, 0.001, "tall mass center " + mode + " did not use capped rebound tuning");
    assertApprox(bottom.rebound.targetRiseTiles, 21, 0.001, "tall mass bottom " + mode + " did not use capped rebound tuning");
    assertApprox(center.riseTiles, 21, 0.05, "tall mass center " + mode + " did not rise 21 tiles from the planned exit");
    assertApprox(bottom.riseTiles, 21, 0.05, "tall mass bottom " + mode + " did not rise 21 tiles from the planned exit");
  }
}

function testFirstLevelDeepReboundCanReachGoalHeight() {
  const g = makeGame();
  loadFirstDesignedLevel(g);

  const deepMassCol = 55;
  const massBottomRow = 30;
  const bottomY = (massBottomRow + 1) * g.CONFIG.TILE_SIZE;
  for (const mode of ["release", "ctrl+shift"]) {
    setPlayer(g, cellX(g, deepMassCol), bottomY - g.CONFIG.PLAYER_H, "permeating");
    const target = g.shouldRebound(g.playerRect()).targetRiseTiles;

    const measured = measureCurrentReboundPeakFromExit(g, 480, mode);
    assertApprox(measured.riseTiles, target, 0.05, "first level deep " + mode + " rebound did not follow its exit-relative target height");
  }
}

function testPermeationBottomBrakeResistsDeepSinking() {
  const g = makeGame();
  clearMeasurementWorld(g);

  g.entities.length = 0;
  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const topRow = 20;
  const bottomRow = 24;
  for (let r = topRow; r <= bottomRow; r++) {
    for (let c = 10; c <= 12; c++) g.tiles[r][c] = true;
  }

  const bottomY = (bottomRow + 1) * g.CONFIG.TILE_SIZE;
  setPlayer(g, cellX(g, 11), bottomY - g.CONFIG.PLAYER_H - 4, "permeating");
  g.player.vy = 8;
  step(g);

  assert(g.player.vy < 8, "deep permeation did not brake downward speed");
  assert(g.player.vy <= g.CONFIG.PERMEATE_MATTER_MAX_SPEED, "deep permeation exceeded matter speed cap");
}

function testShortFallDoesNotAccidentallyPermeateThroughThinMass() {
  const g = makeGame();
  clearMeasurementWorld(g);

  g.entities.length = 0;
  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const row = 24;
  for (let c = 10; c <= 12; c++) g.tiles[row][c] = true;

  const topY = row * g.CONFIG.TILE_SIZE;
  const bottomY = (row + 1) * g.CONFIG.TILE_SIZE;
  setPlayer(g, cellX(g, 11), topY - 16 - g.CONFIG.PLAYER_H, "permeating");
  g.keys.ShiftLeft = true;

  let passedThrough = false;
  for (let i = 0; i < 120; i++) {
    step(g);
    if (g.player.y > bottomY && g.overlappingSolidTiles(g.playerRect()).length === 0) {
      passedThrough = true;
      break;
    }
  }

  assert(!passedThrough, "short fall accidentally permeated through a thin mass");
}

function testHighFallCanPermeateThroughThinMass() {
  const g = makeGame();
  clearMeasurementWorld(g);

  g.entities.length = 0;
  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const row = 24;
  for (let c = 10; c <= 12; c++) g.tiles[row][c] = true;

  const topY = row * g.CONFIG.TILE_SIZE;
  const bottomY = (row + 1) * g.CONFIG.TILE_SIZE;
  setPlayer(g, cellX(g, 11), topY - 160 - g.CONFIG.PLAYER_H, "permeating");
  g.keys.ShiftLeft = true;

  let passedThrough = false;
  for (let i = 0; i < 140; i++) {
    step(g);
    if (g.player.y > bottomY && g.overlappingSolidTiles(g.playerRect()).length === 0) {
      passedThrough = true;
      break;
    }
  }

  assert(passedThrough, "high fall did not permeate through a thin mass");
}

function testVeryHighFallCanPermeateThroughLargeMass() {
  const g = makeGame();
  clearMeasurementWorld(g);

  g.entities.length = 0;
  for (let r = 0; r < g.tiles.length; r++) {
    for (let c = 0; c < g.tiles[r].length; c++) g.tiles[r][c] = false;
  }

  const topRow = 24;
  const rows = 5;
  for (let r = topRow; r < topRow + rows; r++) {
    for (let c = 10; c <= 12; c++) g.tiles[r][c] = true;
  }

  const topY = topRow * g.CONFIG.TILE_SIZE;
  const bottomY = (topRow + rows) * g.CONFIG.TILE_SIZE;
  setPlayer(g, cellX(g, 11), topY - 512 - g.CONFIG.PLAYER_H, "permeating");
  g.keys.ShiftLeft = true;

  let passedThrough = false;
  for (let i = 0; i < 220; i++) {
    step(g);
    if (g.player.y > bottomY && g.overlappingSolidTiles(g.playerRect()).length === 0) {
      passedThrough = true;
      break;
    }
  }

  assert(passedThrough, "very high fall did not permeate through a large mass");
}

function reboundTargetFromDepthLevelForTest(level) {
  return level <= 0 ? 0 : Math.pow(2, level - 1) + level;
}

function testPlayerLimitMeasurements() {
  const g = makeGame();
  const centerRebounds = [];
  const centerAssistRebounds = [];
  const bottomRebounds = [];
  const bottomAssistRebounds = [];
  const minimumFalls = [];
  const chainPeaks = [];
  const tunedRows = [1, 2, 3, 4, 5];
  const targetCenterRebounds = tunedRows.map((rows) => reboundTargetFromDepthLevelForTest(rows / 2));
  const targetBottomRebounds = tunedRows.map(reboundTargetFromDepthLevelForTest);
  const targetMinimumFalls = [2, 4, 5, 5, 5];
  const overCapRows = [6, 8, 12];
  const cappedRebound = reboundTargetFromDepthLevelForTest(5);
  const heightTolerance = 0.05;

  const normalJump = measureNormalJumpPeak(g);
  const terminalFall = measureFreeFallToTerminal(g);
  const terminalRows = findMaxTerminalVelocityPassThroughRows(g);

  for (let rows = 1; rows <= 5; rows++) {
    centerRebounds.push(measureReboundPeak(g, rows, "center", "release"));
    centerAssistRebounds.push(measureReboundPeak(g, rows, "center", "ctrl+shift"));
    bottomRebounds.push(measureReboundPeak(g, rows, "bottom", "release"));
    bottomAssistRebounds.push(measureReboundPeak(g, rows, "bottom", "ctrl+shift"));
    minimumFalls.push(findMinimumFallTiles(g, rows));
    chainPeaks.push(oneTileGapChainImpossible(g, rows) ? null : measureChainPeak(g, rows));
  }

  for (let i = 0; i < 5; i++) {
    assertApprox(centerRebounds[i], targetCenterRebounds[i], heightTolerance, "release center rebound target missed for " + (i + 1) + " tile mass");
    assertApprox(centerAssistRebounds[i], targetCenterRebounds[i], heightTolerance, "ctrl+shift center rebound target missed for " + (i + 1) + " tile mass");
    assertApprox(bottomRebounds[i], targetBottomRebounds[i], heightTolerance, "release bottom rebound target missed for " + (i + 1) + " tile mass");
    assertApprox(bottomAssistRebounds[i], targetBottomRebounds[i], heightTolerance, "ctrl+shift bottom rebound target missed for " + (i + 1) + " tile mass");
    assertApprox(minimumFalls[i], targetMinimumFalls[i], heightTolerance, "minimum fall-through target missed for " + (i + 1) + " tile mass");
  }

  for (const rows of overCapRows) {
    const fixture = buildMeasurementFixture(g, { topRow: 24, leftCol: 10, massRows: rows });
    setPlayer(g, fixture.x, fixture.bottomY - g.CONFIG.PLAYER_H, "permeating");
    const rebound = g.shouldRebound(g.playerRect());
    assert(rebound.fire === true, rows + "-tile mass did not allow capped rebound");
    assertApprox(rebound.meterLevel, 5, 0.001, rows + "-tile mass exceeded the 5-row rebound depth cap");
    assertApprox(rebound.targetRiseTiles, cappedRebound, 0.001, rows + "-tile mass exceeded the rebound target cap");
    assertApprox(measureReboundPeak(g, rows, "bottom", "release"), cappedRebound, heightTolerance, "release bottom rebound cap missed for " + rows + " tile mass");
    assertApprox(measureReboundPeak(g, rows, "bottom", "ctrl+shift"), cappedRebound, heightTolerance, "ctrl+shift bottom rebound cap missed for " + rows + " tile mass");
  }

  assertApprox(normalJump, 2, heightTolerance, "normal jump target missed");
  assertApprox(terminalFall, 5, heightTolerance, "free fall to max-speed target missed");
  assert(terminalRows === 5, "terminal-speed pass-through target missed; expected 5 rows, got " + terminalRows);

  console.log("PLAYER LIMITS");
  console.log("  normal jump peak: " + formatTiles(normalJump) + " tiles");
  console.log("  free fall to max speed: " + formatTiles(terminalFall) + " tiles");
  console.log("  max-speed pass-through: " + terminalRows + " tile rows");
  console.log("  rows | center rebound | center ctrl | bottom rebound | bottom ctrl | min fall through | chain peak");
  for (let i = 0; i < 5; i++) {
    console.log(
      "  " + (i + 1) +
      "    | " + formatTiles(centerRebounds[i]) +
      "           | " + formatTiles(centerAssistRebounds[i]) +
      "        | " + formatTiles(bottomRebounds[i]) +
      "          | " + formatTiles(bottomAssistRebounds[i]) +
      "       | " + formatTiles(minimumFalls[i]) +
      "             | " + (chainPeaks[i] === null ? "impossible (32px gap < 40px player)" : formatTiles(chainPeaks[i]))
    );
  }
}

function testReboundDepthMeterLevels() {
  const g = makeGame();
  const tunedRows = [1, 2, 3, 4, 5];

  assertApprox(g.reboundMeterLevel(0, g.CONFIG.TILE_SIZE), 0, 0.001, "zero depth meter was not empty");
  assertApprox(g.reboundMeterLevel(2.5 * g.CONFIG.TILE_SIZE, 5 * g.CONFIG.TILE_SIZE), 2.5, 0.001, "5-row center meter was not half full");

  for (const rows of tunedRows) {
    const fixture = buildMeasurementFixture(g, { topRow: 24, leftCol: 10, massRows: rows });
    const centerFeet = fixture.topY + (fixture.bottomY - fixture.topY) / 2;
    const bottomFeet = fixture.bottomY;

    setPlayer(g, fixture.x, centerFeet - g.CONFIG.PLAYER_H, "permeating");
    const center = g.shouldRebound(g.playerRect());
    assert(center.fire === true, rows + "-row center meter did not start from a valid rebound");
    assertApprox(center.meterLevel, rows / 2, 0.001, rows + "-row center meter level missed");

    setPlayer(g, fixture.x, bottomFeet - g.CONFIG.PLAYER_H, "permeating");
    const bottom = g.shouldRebound(g.playerRect());
    assert(bottom.fire === true, rows + "-row bottom meter did not start from a valid rebound");
    assertApprox(bottom.meterLevel, rows, 0.001, rows + "-row bottom meter level missed");
  }
}

function testHudPressureBarUsesReboundDepthMeter() {
  const g = makeGame();
  const pressureFill = global.document.getElementById("pressureFill");
  const pressureMeter = global.document.getElementById("pressureMeter");

  setPlayer(g, cellX(g, 1), standY(g, g.ROWS - 1), "solid");
  g.renderOnly();
  assert(pressureFill.style.width === "0%", "solid HUD meter was not empty");
  assert(pressureMeter.getAttribute("aria-valuetext") === "0.0/5", "solid HUD meter aria text was not empty");

  const fixture = buildMeasurementFixture(g, { topRow: 24, leftCol: 10, massRows: 5 });
  const centerFeet = fixture.topY + (fixture.bottomY - fixture.topY) / 2;
  setPlayer(g, fixture.x, centerFeet - g.CONFIG.PLAYER_H, "permeating");
  g.keys.ShiftLeft = true;
  step(g);
  g.renderOnly();
  assert(pressureFill.style.width === "50%", "5-row center HUD meter was not half full");
  assert(pressureMeter.getAttribute("aria-valuetext") === "2.5/5", "5-row center HUD meter aria text was not half full");

  setPlayer(g, fixture.x, fixture.bottomY - g.CONFIG.PLAYER_H, "permeating");
  g.keys.ShiftLeft = true;
  step(g);
  g.renderOnly();
  assert(pressureFill.style.width === "100%", "5-row bottom HUD meter was not full");
  assert(pressureMeter.getAttribute("aria-valuetext") === "5.0/5", "5-row bottom HUD meter aria text was not full");
}

function testHudPressureMeterHasFiveSegments() {
  const meterMarkup = html.match(/<div id="pressureMeter"[\s\S]*?<\/div>/);
  assert(!!meterMarkup, "HUD pressure meter markup was not found");
  const segmentCount = (meterMarkup[0].match(/class="meterSegment"/g) || []).length;
  assert(segmentCount === 5, "HUD pressure meter expected 5 segments, got " + segmentCount);
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
    for (const mode of ["release", "ctrl+shift"]) {
      setPlayer(g, e.x + 32, e.y + 34, "permeating");
      activateRebound(g, mode);

      assert(g.overlappingSolidEntities(g.playerRect()).length > 0, "player was not embedded in dynamic solid for " + mode);
      assert(g.player.state === "rebounding", "dynamic solid " + mode + " did not start rebound");
    }
  } finally {
    g.LEVELS.length = originalLength;
    g.loadLevel(0);
  }
}

function testDeepDynamicMassRewardsBottomDive() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;

  try {
    pushDynamicFixture(g, {
      kind: "mover",
      name: "tall rebound mass",
      char: "A",
      role: "rebound",
      motion: { kind: "horizontal", amplitude: { x: 0, y: 0 }, speed: 0, phase: 0 }
    }, { char: "A", c: 12, r: 28, cols: 4, rows: 5 });

    const e = g.entities[0];
    const fullChargeDepth = g.CONFIG.PLAYER_H + g.CONFIG.TILE_SIZE;

    setPlayer(g, e.x + 32, e.y + fullChargeDepth - g.CONFIG.PLAYER_H, "permeating");
    const mid = g.shouldRebound(g.playerRect());

    setPlayer(g, e.x + 32, e.y + e.h - g.CONFIG.PLAYER_H, "permeating");
    const deep = g.shouldRebound(g.playerRect());

    assert(deep.targetRiseTiles > mid.targetRiseTiles, "bottom dive in tall dynamic mass did not strengthen rebound");
    assertApprox(deep.targetRiseTiles, 21, 0.001, "dynamic bottom dive did not reach the tuned 5-row target height");
  } finally {
    g.LEVELS.length = originalLength;
    g.loadLevel(0);
  }
}

function testMovingReboundMassUsesLiveExit() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;

  function runCase(name, phase, expectedDirection) {
    pushDynamicFixture(g, {
      kind: "mover",
      name: name,
      char: "A",
      role: "rebound",
      motion: { kind: "vertical", amplitude: { x: 0, y: 96 }, speed: 1.6, phase }
    }, { char: "A", c: 12, r: 27, cols: 4, rows: 5 });

    const e = g.entities[0];
    setPlayer(g, e.x + 32, e.y + e.h - g.CONFIG.PLAYER_H, "permeating");
    const rebound = g.shouldRebound(g.playerRect());
    assert(rebound.fire === true, name + " did not start from a valid dynamic rebound");
    assert(rebound.entity === e, name + " rebound did not track the source mover");

    release(g, "ShiftLeft");
    step(g);
    assert(g.player.state === "rebounding", name + " release did not start rebound");
    assert(g.player.reboundEntity === e, name + " did not store the live rebound entity");
    assert(
      expectedDirection === "up" ? e.dy < 0 : e.dy > 0,
      name + " mover did not move " + expectedDirection + " on rebound start"
    );

    let surfaced = false;
    let surfaceExitY = null;
    let peakY = Infinity;
    for (let i = 0; i < 360; i++) {
      const wasRebounding = g.player.state === "rebounding";
      step(g);
      assert(g.player.state !== "stuck", name + " moving rebound entered stuck recovery");

      if (!surfaced && wasRebounding && g.player.state !== "rebounding") {
        surfaced = true;
        surfaceExitY = e.y - g.CONFIG.PLAYER_H;
        assertApprox(g.player.y, surfaceExitY, 0.001, name + " did not surface at the mover's live top edge");
        assert(g.overlappingSolidEntities(g.playerRect()).length === 0, name + " surfaced while still inside the mover");
        assert(g.player.vy < 0, name + " did not launch upward after surfacing");
      }

      if (surfaced) {
        peakY = Math.min(peakY, g.player.y);
        if (g.player.vy > 0 && g.player.y > peakY + 5) break;
      }
    }

    assert(surfaced, name + " never surfaced from the moving rebound mass");
    assertApprox(
      tilesFromPixels(g, surfaceExitY - peakY),
      rebound.targetRiseTiles,
      0.08,
      name + " did not preserve rebound target height from the live exit"
    );
  }

  try {
    runCase("upward live-exit mass", Math.PI, "up");
    runCase("downward live-exit mass", 0, "down");
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
  ["authored levels are reachable within player limits", testAuthoredLevelsAreReachableWithinPlayerLimits],
  ["camera tracks horizontally in wide levels", testCameraTracksHorizontallyInWideLevel],
  ["load level rejects uneven rows", testLoadLevelRejectsUnevenRows],
  ["reset respawns at active checkpoint", testResetRespawnsAtActiveCheckpoint],
  ["winning advances to next level", testWinningAdvancesToNextLevel],
  ["final level stops at end", testFinalLevelDoesNotAdvancePastEnd],
  ["bug 1 auto-chain reaches top", testBugOneAutoChainReachesTop],
  ["bug 2 tall mass rebounds once", testBugTwoTallMassReboundsOnce],
  ["auto assist climbs tuned thick stack", testAutoAssistClimbsTunedThickStack],
  ["manual queue consumes on surface", testManualQueueConsumesOnSurface],
  ["manual tap chain keeps queued permeation", testManualTapChainKeepsQueuedPermeation],
  ["manual rhythm chain completes first level without Ctrl", testManualRhythmChainCompletesFirstLevelWithoutCtrl],
  ["rebound horizontal boost scales movement", testReboundHorizontalBoostScalesMovement],
  ["Ctrl chain rebounds keep horizontal boost", testCtrlChainReboundsKeepHorizontalBoost],
  ["upper-body-only release waits until clear", testUpperBodyOnlyReleaseDoesNotRebound],
  ["ceiling hang without input stays pinned", testCeilingHangWithoutInputStaysPinned],
  ["ceiling hang Space latches center pull", testCeilingHangSpaceLatchesCenterPull],
  ["ceiling hang Ctrl rebounds once fully inside", testCeilingHangCtrlPullsThenReboundsWhenFullyInside],
  ["blocked upward escape recovers from stuck", testBlockedUpwardEscapeBecomesStuck],
  ["permeation center pull uses tuned accel", testPermeationCenterPullUsesTunedAccel],
  ["thin mass keeps existing rebound curve", testThinMassKeepsExistingReboundCurve],
  ["deep static mass rewards bottom dive", testDeepStaticMassRewardsBottomDive],
  ["tall static mass rebounds from planned exit", testTallStaticMassReboundsFromExit],
  ["first level deep rebound can reach goal height", testFirstLevelDeepReboundCanReachGoalHeight],
  ["permeation bottom brake resists deep sinking", testPermeationBottomBrakeResistsDeepSinking],
  ["short fall does not accidentally permeate through thin mass", testShortFallDoesNotAccidentallyPermeateThroughThinMass],
  ["high fall can permeate through thin mass", testHighFallCanPermeateThroughThinMass],
  ["very high fall can permeate through large mass", testVeryHighFallCanPermeateThroughLargeMass],
  ["rebound depth meter levels", testReboundDepthMeterLevels],
  ["HUD pressure bar uses rebound depth meter", testHudPressureBarUsesReboundDepthMeter],
  ["HUD pressure meter has five segments", testHudPressureMeterHasFiveSegments],
  ["player limit measurements", testPlayerLimitMeasurements],
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
  ["deep dynamic mass rewards bottom dive", testDeepDynamicMassRewardsBottomDive],
  ["moving rebound mass uses live exit", testMovingReboundMassUsesLiveExit],
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
