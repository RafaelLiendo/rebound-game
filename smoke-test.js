const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function makeGame() {
  const elements = {};
  function makeElement() {
    const classes = new Set();
    const styleValues = {};
    return {
      style: {
        setProperty(name, value) {
          styleValues[name] = String(value);
          this[name] = String(value);
        },
        removeProperty(name) {
          delete styleValues[name];
          delete this[name];
        },
        getPropertyValue(name) {
          return styleValues[name] || "";
        }
      },
      attributes: {},
      textContent: "",
      width: 0,
      height: 0,
      classList: {
        add(name) {
          classes.add(name);
        },
        remove(name) {
          classes.delete(name);
        },
        contains(name) {
          return classes.has(name);
        }
      },
      addEventListener() {},
      contains(target) {
        return target === this;
      },
      setPointerCapture() {},
      requestFullscreen() {
        global.document.fullscreenElement = this;
        return Promise.resolve();
      },
      webkitRequestFullscreen() {
        global.document.webkitFullscreenElement = this;
      },
      getBoundingClientRect() {
        return { width: 96, height: 96, left: 0, top: 0, right: 96, bottom: 96 };
      },
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
  const documentElement = makeElement();
  global.window = {
    addEventListener() {},
    innerWidth: 960,
    innerHeight: 540,
    visualViewport: null,
    gameInternals: null
  };
  Object.defineProperty(global, "navigator", {
    configurable: true,
    value: { maxTouchPoints: 0, standalone: false, userAgent: "Smoke", platform: "Win32" }
  });
  global.document = {
    documentElement,
    fullscreenElement: null,
    webkitFullscreenElement: null,
    fullscreenEnabled: true,
    addEventListener() {},
    querySelector(selector) {
      if (selector === ".shell") return makeElement();
      return null;
    },
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

function testVirtualKeyHelperTracksEdgesAndReleases() {
  const g = makeGame();
  g.setVirtualKey("ArrowLeft", true);
  assert(g.keys.ArrowLeft === true, "virtual key did not become held");
  assert(g.keyEdge.ArrowLeft === true, "virtual key did not emit press edge");
  assert(g.keyReleased.ArrowLeft !== true, "virtual key emitted release while pressed");

  g.clearEdges();
  g.setVirtualKey("ArrowLeft", true);
  assert(g.keyEdge.ArrowLeft !== true, "held virtual key repeated press edge");

  g.setVirtualKey("ArrowLeft", false);
  assert(g.keys.ArrowLeft === false, "virtual key did not release held state");
  assert(g.keyReleased.ArrowLeft === true, "virtual key did not emit release edge");
  assert(g.keyEdge.ArrowLeft !== true, "virtual key kept press edge after release");
}

function testMobileJoystickMapsMoveAndJumpKeys() {
  const g = makeGame();
  g.mobileInput.joystickStart(100, 100, 1);
  assert(!g.keys.ArrowLeft && !g.keys.ArrowRight && !g.keys.Space, "neutral joystick pressed a key");

  g.mobileInput.joystickMove(60, 100, 1);
  assert(g.keys.ArrowLeft === true, "joystick left did not hold ArrowLeft");
  assert(g.keyEdge.ArrowLeft === true, "joystick left did not emit ArrowLeft edge");

  g.mobileInput.joystickMove(140, 100, 1);
  assert(g.keys.ArrowLeft === false, "joystick right did not release ArrowLeft");
  assert(g.keyReleased.ArrowLeft === true, "joystick right did not emit ArrowLeft release");
  assert(g.keys.ArrowRight === true, "joystick right did not hold ArrowRight");
  assert(g.keyEdge.ArrowRight === true, "joystick right did not emit ArrowRight edge");

  g.clearEdges();
  g.mobileInput.joystickMove(140, 60, 1);
  assert(g.keys.ArrowRight === true, "diagonal joystick did not keep ArrowRight");
  assert(g.keys.Space === true, "joystick up did not hold Space");
  assert(g.keyEdge.Space === true, "joystick up did not emit Space edge");

  g.clearEdges();
  g.mobileInput.joystickMove(100, 100, 1);
  assert(g.keys.ArrowRight === false, "neutral joystick did not release ArrowRight");
  assert(g.keys.Space === false, "neutral joystick did not release Space");
  assert(g.keyReleased.ArrowRight === true, "neutral joystick did not emit ArrowRight release");
  assert(g.keyReleased.Space === true, "neutral joystick did not emit Space release");
}

function testMobileShiftButtonMapsShiftAndVerticalAssist() {
  const g = makeGame();
  g.mobileInput.shiftStart(100, 2, 90);
  assert(g.keys.ShiftLeft === true, "Shift button did not hold Shift");
  assert(g.keyEdge.ShiftLeft === true, "Shift button did not emit Shift edge");
  assert(g.keys.ControlLeft !== true, "centered Shift button held Ctrl");

  g.clearEdges();
  g.mobileInput.shiftMove(71, 2);
  assert(g.keys.ShiftLeft === true, "near-threshold Shift drag released Shift");
  assert(g.keys.ControlLeft !== true, "near-threshold Shift drag held Ctrl early");

  g.mobileInput.shiftMove(70, 2);
  assert(g.keys.ControlLeft === true, "upward Shift drag did not hold Ctrl");
  assert(g.keyEdge.ControlLeft === true, "upward Shift drag did not emit Ctrl edge");

  g.clearEdges();
  g.mobileInput.shiftMove(86, 2);
  assert(g.keys.ShiftLeft === true, "returning Shift drag released Shift");
  assert(g.keys.ControlLeft === false, "returning Shift drag did not release Ctrl");
  assert(g.keyReleased.ControlLeft === true, "returning Shift drag did not emit Ctrl release");

  g.clearEdges();
  g.mobileInput.shiftEnd(2);
  assert(g.keys.ShiftLeft === false, "center release did not release Shift");
  assert(g.keyReleased.ShiftLeft === true, "center release did not emit Shift release");
  assert(g.keyReleased.ControlLeft !== true, "center release emitted extra Ctrl release");
}

function testMobileShiftReleaseAtTopReleasesShiftAndCtrl() {
  const g = makeGame();
  g.mobileInput.shiftStart(100, 3, 90);
  g.clearEdges();
  g.mobileInput.shiftMove(60, 3);
  g.clearEdges();
  g.mobileInput.shiftEnd(3);

  assert(g.keys.ShiftLeft === false, "top release did not release Shift");
  assert(g.keys.ControlLeft === false, "top release did not release Ctrl");
  assert(g.keyReleased.ShiftLeft === true, "top release did not emit Shift release");
  assert(g.keyReleased.ControlLeft === true, "top release did not emit Ctrl release");
}

function testMobileHudCopyExplainsTouchControls() {
  assert(html.includes('<strong>Hold</strong> to sink'), "mobile HUD copy does not explain holding to sink");
  assert(html.includes('<strong>Release</strong> to rebound'), "mobile HUD copy does not explain releasing to rebound");
  assert(html.includes('<strong>Drag up</strong> to chain rebound'), "mobile HUD copy does not explain drag-up chaining");
  assert(!html.includes("Stick</span>"), "mobile HUD still explains the move stick");
  assert(!html.includes("Hold Shift"), "mobile HUD still uses keyboard Shift wording");
  assert(html.includes('class="touchKnob holdButtonGlyph"'), "mobile Shift button does not use the shared Hold glyph");
  assert(html.includes('class="holdButtonGlyph holdButtonGlyphMini"'), "mobile HUD legend does not include a copy of the Hold glyph");
  assert(html.includes('content: "^"'), "mobile Shift button does not show an upward drag cue");
  assert(html.includes("mobileMode"), "mobile HUD does not have the robust mobile-mode fallback");
  assert(!html.includes("installHint"), "mobile install hint should not be part of gameplay");
  assert(!html.includes("Add to Home Screen for full screen"), "mobile gameplay still promises PWA fullscreen");
  assert(!html.includes("fullscreenButton"), "experimental fullscreen button should be removed");
  assert(!html.includes("requestGameFullscreen"), "experimental fullscreen API path should be removed");
  assert(html.includes("viewport-fit=cover"), "mobile viewport does not opt into safe-area fullscreen layout");
  assert(html.includes("Tap to continue"), "completion prompt does not use tap-to-continue copy");
  assert(html.includes("Tap to checkpoint"), "final completion prompt does not use tap-to-checkpoint copy");
  assert(!html.includes("Press Space for next rift"), "win prompt still asks mobile players to press Space");
}

function testPwaManifestIsLinkedAndLandscapeFullscreen() {
  assert(html.includes('<link rel="manifest" href="manifest.webmanifest">'), "manifest link is missing");
  assert(html.includes('<link rel="apple-touch-icon" href="shadow-cat.png">'), "Apple touch icon link is missing");
  assert(manifest.display === "fullscreen", "manifest display is not fullscreen");
  assert(manifest.orientation === "landscape", "manifest orientation is not landscape");
  assert(manifest.icons.some((icon) => icon.src === "shadow-cat.png"), "manifest does not use shadow-cat icon");
}

function testIOSStandaloneDetectionRemainsAvailable() {
  const g = makeGame();

  global.navigator.userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
  global.navigator.platform = "iPhone";
  global.navigator.maxTouchPoints = 5;
  assert(g.detectIOS() === true, "iPhone user agent was not detected");
  assert(g.isStandaloneWebApp() === false, "normal iPhone Safari was detected as standalone");

  global.navigator.standalone = true;
  assert(g.isStandaloneWebApp() === true, "home-screen web app was not detected as standalone");
}

function testMobileGestureSuppressionHooks() {
  assert(html.includes("overscroll-behavior: none"), "game surface does not suppress scroll chaining");
  assert(html.includes("-webkit-touch-callout: none"), "game surface does not suppress iOS callouts");
  assert(html.includes("-webkit-user-select: none"), "game surface does not suppress iOS text selection");
  assert(html.includes("touch-action: none"), "game surface does not suppress browser touch gestures");
  assert(html.includes('"gesturestart"'), "gesturestart is not blocked");
  assert(html.includes('"gesturechange"'), "gesturechange is not blocked");
  assert(html.includes('"gestureend"'), "gestureend is not blocked");
  assert(html.includes('"selectstart"'), "selectstart is not blocked");
  assert(html.includes('"dragstart"'), "dragstart is not blocked");
  assert(html.includes('"contextmenu"'), "contextmenu is not blocked");
  assert(html.includes("{ passive: false }"), "document gesture guards are not registered as non-passive");
}

function testCompactViewportEnablesMobileMode() {
  const g = makeGame();
  global.window.innerWidth = 844;
  global.window.innerHeight = 390;
  assert(g.detectCompactMobileViewport() === true, "landscape phone-sized viewport was not treated as mobile mode");
}

function testMobileViewportSizingUsesVisualViewport() {
  const g = makeGame();
  global.window.visualViewport = { width: 844, height: 390, offsetLeft: 0, offsetTop: 7, addEventListener() {} };

  const viewport = g.mobileViewportRect();
  assert(viewport.width === 844, "mobile viewport helper did not read visualViewport width");
  assert(viewport.height === 390, "mobile viewport helper did not read visualViewport height");
  assert(viewport.top === 7, "mobile viewport helper did not read visualViewport offset");

  g.syncGameViewport(true);
  assert(g.CONFIG.VIEW_H === 540, "mobile viewport changed logical height");
  assert(g.CONFIG.VIEW_W === Math.round(540 * 844 / 390), "mobile viewport did not widen logical canvas");

  g.syncGameViewport(false);
  assert(g.CONFIG.VIEW_W === 960, "desktop viewport width was not restored");
  assert(g.CONFIG.VIEW_H === 540, "desktop viewport height was not restored");
}

function testMobileReleaseAllClearsHeldVirtualKeys() {
  const g = makeGame();
  g.mobileInput.joystickStart(100, 100, 1);
  g.mobileInput.joystickMove(140, 60, 1);
  g.mobileInput.shiftStart(100, 2, 90);
  g.mobileInput.shiftMove(60, 2);
  g.clearEdges();

  g.mobileInput.releaseAll();

  assert(g.keys.ArrowRight === false, "releaseAll did not clear joystick horizontal input");
  assert(g.keys.Space === false, "releaseAll did not clear joystick jump input");
  assert(g.keys.ShiftLeft === false, "releaseAll did not clear Shift input");
  assert(g.keys.ControlLeft === false, "releaseAll did not clear chain assist input");
  assert(g.keyReleased.ArrowRight === true, "releaseAll did not emit joystick release");
  assert(g.keyReleased.ShiftLeft === true, "releaseAll did not emit Shift release");
  assert(g.keyReleased.ControlLeft === true, "releaseAll did not emit Ctrl release");
}

function testTapCompletionPromptAdvancesLevel() {
  const g = makeGame();
  completeCurrentLevel(g);

  assert(g.activateCompletionPrompt() === true, "tap completion prompt was not handled");
  assert(g.currentLevelIndex === 1, "tap completion prompt did not advance to the next level");
  assert(g.player.won === false, "tap completion prompt left player in won state");
}

function testTapFinalCompletionPromptRestartsCheckpoint() {
  const g = makeGame();
  const finalIndex = g.LEVELS.length - 1;
  g.loadLevel(finalIndex);
  completeCurrentLevel(g);

  assert(g.activateCompletionPrompt() === true, "final tap completion prompt was not handled");
  assert(g.currentLevelIndex === finalIndex, "final tap completion changed the level");
  assert(g.player.won === false, "final tap completion did not restart from checkpoint");
  assert(g.activeCheckpoint.order === 0, "final tap completion reset checkpoint progress incorrectly");
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

const EARLY_CAMPAIGN_LEVEL_NAMES = [
  "Hidden Base",
  "Buried Tunnels",
  "Occupied Streets",
  "Rooftop District"
];

const LATE_CAMPAIGN_LEVEL_NAMES = [
  "Skyline Spire",
  "Outer Hulls",
  "Fleet Bridges",
  "Command Vessel"
];

const CAMPAIGN_LEVEL_NAMES = EARLY_CAMPAIGN_LEVEL_NAMES.concat(LATE_CAMPAIGN_LEVEL_NAMES);

function campaignLevelIndex(g, name) {
  const index = g.LEVELS.findIndex((level) => level.name === name);
  assert(index >= 0, "campaign level not found: " + name);
  return index;
}

function loadCampaignLevel(g, name) {
  const index = campaignLevelIndex(g, name);
  g.loadLevel(index);
  return g.LEVELS[index];
}

function loadTemporaryLevel(g, def) {
  const originalLength = g.LEVELS.length;
  const index = originalLength;
  g.LEVELS.push(g.defineLevel(def));
  g.loadLevel(index);
  return { originalLength, index };
}

function restoreTemporaryLevels(g, originalLength) {
  g.LEVELS.length = originalLength;
  g.loadLevel(0);
}

function bugOneChainFixture() {
  return {
    name: "Bug 1 Chain Fixture",
    map: [
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      ".......@..",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "##########",
      "..........",
      "...0......",
      "##########",
      "##########"
    ]
  };
}

function bugTwoTallMassFixture() {
  return {
    name: "Bug 2 Tall Mass Fixture",
    map: [
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      "..........",
      ".......@..",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "##########",
      "..........",
      "...0......",
      "##########",
      "##########"
    ]
  };
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
  p.chainLocked = false;
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

function assertPassThroughThreshold(g, massRows) {
  const target = minimumFallThroughTiles(g, massRows);
  assert(!simulatePassThrough(g, massRows, target - 0.25), massRows + "-row mass passed below the 2x+1 entry threshold");
  assert(simulatePassThrough(g, massRows, target + 0.25), massRows + "-row mass failed above the 2x+1 entry threshold");
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

function safeAuthoredGapTiles(rawTiles) {
  return Math.max(0, Math.floor(rawTiles - 0.10));
}

function measureNormalHorizontalJumpGaps(g) {
  const launchSpeed = launchSpeedForRiseTilesForTest(g, LEVEL_REACH_LIMITS.normalJumpTiles);
  return [0, 1, 2].map((riseTiles) => {
    const frames = ascentFramesAtRise(g, launchSpeed, riseTiles);
    const rawTiles = horizontalReachTilesForFrames(g, frames);
    return {
      riseTiles,
      rawTiles,
      safeTiles: safeAuthoredGapTiles(rawTiles)
    };
  });
}

function measureReboundHorizontalGaps(g) {
  return [1, 2, 3, 4, 5].map((rows) => {
    const riseTiles = bottomReboundLimitTiles(rows);
    const launchSpeed = launchSpeedForRiseTilesForTest(g, riseTiles);
    const frames = ascentFramesAtRise(g, launchSpeed, riseTiles);
    const rawTiles = horizontalReachTilesForFrames(g, frames, g.CONFIG.REBOUND_HORIZONTAL_MULTIPLIER);
    return {
      rows,
      riseTiles,
      rawTiles,
      safeTiles: safeAuthoredGapTiles(rawTiles)
    };
  });
}

function measureCeilingHangGap(g, gapRows) {
  clearMeasurementWorld(g);
  const floorRow = 34;
  const ceilingRow = floorRow - gapRows - 1;
  for (let c = 0; c < g.tiles[floorRow].length; c++) g.tiles[floorRow][c] = true;
  paintTileBlock(g, ceilingRow, 14, 1, 3);

  const startY = standY(g, floorRow);
  setPlayer(g, cellX(g, 15), startY, "solid");
  press(g, "Space");
  step(g);
  g.keys.ShiftLeft = true;
  g.keyEdge.ShiftLeft = true;

  let lowerOverlapSeen = false;
  let bestY = startY;
  for (let i = 0; i < 180; i++) {
    step(g);
    bestY = Math.min(bestY, g.player.y);
    lowerOverlapSeen = lowerOverlapSeen || g.overlappingSolidTiles(g.bottomHalfRect(g.playerRect())).some((tile) => tile.r === ceilingRow);
    if (g.ceilingHangInfo(g.playerRect()).active) {
      return {
        gapRows,
        reachable: true,
        lowerOverlapSeen,
        peakRiseTiles: tilesFromPixels(g, startY - bestY)
      };
    }
  }

  return {
    gapRows,
    reachable: false,
    lowerOverlapSeen,
    peakRiseTiles: tilesFromPixels(g, startY - bestY)
  };
}

function measureCeilingHangGaps(g) {
  return [1, 2, 3, 4, 5].map((gapRows) => measureCeilingHangGap(g, gapRows));
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
    assert(
      g.goalRect.x !== g.spawnCell.x || g.goalRect.y !== g.spawnCell.y,
      "level " + (index + 1) + " goal overlaps the spawn"
    );
  });
}

function testPlayableCampaignIsRedesignedLevelSet() {
  const g = makeGame();
  assert(g.LEVELS.length === CAMPAIGN_LEVEL_NAMES.length, "playable campaign should have exactly 8 levels");
  for (let i = 0; i < CAMPAIGN_LEVEL_NAMES.length; i++) {
    assert(g.LEVELS[i].name === CAMPAIGN_LEVEL_NAMES[i], "level " + (i + 1) + " should be " + CAMPAIGN_LEVEL_NAMES[i]);
    assert(!/^Bug /.test(g.LEVELS[i].name), "bug regression fixture leaked into playable campaign");
  }
}

function testCampaignLevelMetadataIsExposed() {
  const g = makeGame();

  g.LEVELS.forEach((level, index) => {
    assert(typeof level.loreBeat === "string" && level.loreBeat.length > 0, "level " + (index + 1) + " missing lore beat metadata");
    assert(typeof level.mechanicBeat === "string" && level.mechanicBeat.length > 0, "level " + (index + 1) + " missing mechanic beat metadata");
    assert(level.reachability && typeof level.reachability.expected === "string", "level " + (index + 1) + " missing reachability expectations");

    g.loadLevel(index);
    assert(g.activeLevelMetadata.loreBeat === level.loreBeat, "active lore beat was not exposed for level " + (index + 1));
    assert(g.activeLevelMetadata.mechanicBeat === level.mechanicBeat, "active mechanic beat was not exposed for level " + (index + 1));
    assert(g.activeLevelMetadata.reachability.expected === level.reachability.expected, "active reachability metadata was not exposed for level " + (index + 1));
  });
}

const LEVEL_REACH_LIMITS = {
  normalJumpTiles: 2,
  maxReboundRows: 5,
  minimumClearanceRows: 2,
  bottomReboundByRows: [0, 2, 4, 7, 12, 21]
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
      if (!isSolidTile(level, r, c) || isSolidTile(level, r - 1, c)) {
        c++;
        continue;
      }

      const start = c;
      let maxHeight = 0;
      let standable = false;
      while (
        c < level.map[0].length &&
        isSolidTile(level, r, c) &&
        !isSolidTile(level, r - 1, c)
      ) {
        maxHeight = Math.max(maxHeight, staticColumnHeight(level, r, c));
        standable = standable || hasPlayerClearance(level, r, c);
        c++;
      }

      nodes.push({
        id: id++,
        c: start,
        r,
        w: c - start,
        h: maxHeight,
        type: "terrain",
        name: "terrain",
        standable,
        minC: start,
        maxC: c,
        minR: r,
        maxR: r + 1
      });
    }
  }
}

function addMoverSurfaceNodes(level, nodes) {
  let id = nodes.length;
  for (const entity of level.entities) {
    if (entity.type !== "mover") continue;
    const ampXTiles = Math.abs(entity.ampX || 0) / 32;
    const ampYTiles = Math.abs(entity.ampY || 0) / 32;
    nodes.push({
      id: id++,
      c: entity.c,
      r: entity.r,
      w: entity.w,
      h: entity.h,
      type: entity.type,
      name: entity.name,
      role: entity.role,
      standable: true,
      minC: entity.c - ampXTiles,
      maxC: entity.c + entity.w + ampXTiles,
      minR: entity.r - ampYTiles,
      maxR: entity.r + 1 + ampYTiles
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
  const aMin = a.minC === undefined ? a.c : a.minC;
  const aMax = a.maxC === undefined ? a.c + a.w : a.maxC;
  const bMin = b.minC === undefined ? b.c : b.minC;
  const bMax = b.maxC === undefined ? b.c + b.w : b.maxC;
  if (aMax <= bMin) return bMin - aMax;
  if (bMax <= aMin) return aMin - bMax;
  return 0;
}

function bottomReboundLimitTiles(rows) {
  return LEVEL_REACH_LIMITS.bottomReboundByRows[Math.min(rows, LEVEL_REACH_LIMITS.maxReboundRows)];
}

function minimumFallThroughTiles(g, rows) {
  return g.passThroughTargetFallTiles ? g.passThroughTargetFallTiles(rows) :
    Math.max(1, rows) * 2 + 1;
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

function slabChainAnalysis(g, from, to, riseTiles, gapTiles) {
  const horizontallyAligned = gapTiles <= 1;
  const shallowMatter = from.h <= 2 && to.h <= 2;
  const emptyRows = riseTiles - 1;
  if (!horizontallyAligned || !shallowMatter || emptyRows < 1 || emptyRows > 2) return null;
  return {
    ok: true,
    mode: "chain",
    riseTiles,
    gapTiles,
    verticalLimitTiles: 3,
    horizontalLimitTiles: 1,
    reason: "chain"
  };
}

function movementAnalysis(g, from, to) {
  const riseTiles = from.r - to.r;
  const gapTiles = rangeGapTiles(from, to);
  let verticalLimitTiles = Infinity;
  let horizontalLimitTiles = 0;
  let mode = "fall";

  if (riseTiles <= 0) {
    horizontalLimitTiles = horizontalReachTilesForFrames(g, fallFramesToDrop(g, -riseTiles));
  } else if (riseTiles <= LEVEL_REACH_LIMITS.normalJumpTiles && to.standable) {
    mode = "jump";
    verticalLimitTiles = LEVEL_REACH_LIMITS.normalJumpTiles;
    horizontalLimitTiles = horizontalReachTilesForFrames(
      g,
      ascentFramesAtRise(g, launchSpeedForRiseTilesForTest(g, LEVEL_REACH_LIMITS.normalJumpTiles), riseTiles)
    );
  } else {
    const chain = slabChainAnalysis(g, from, to, riseTiles, gapTiles);
    if (chain) return chain;

    mode = "rebound";
    verticalLimitTiles = bottomReboundLimitTiles(from.h);
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
    node.standable &&
    nodeContainsColumn(node, level.spawn.c) &&
    node.r >= level.spawn.r &&
    node.r <= level.spawn.r + 1 &&
    hasPlayerClearance(level, node.r, level.spawn.c)
  );
}

function isGoalNode(level, node) {
  return node.standable &&
    node.r === level.goal.r + 1 &&
    nodeContainsColumn(node, level.goal.c) &&
    hasPlayerClearance(level, node.r, level.goal.c);
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

function testBuriedPressureLockFiveRowPassThroughGate() {
  const g = makeGame();
  loadCampaignLevel(g, "Buried Tunnels");

  function passesSealFromFall(fallTiles) {
    const sealTopRow = 10;
    const sealBottomY = 15 * g.CONFIG.TILE_SIZE;
    setPlayer(
      g,
      cellX(g, 24),
      sealTopRow * g.CONFIG.TILE_SIZE - fallTiles * g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_H,
      "permeating"
    );
    g.keys.ShiftLeft = true;
    for (let i = 0; i < 240; i++) {
      step(g);
      if (g.player.y > sealBottomY && g.overlappingSolidTiles(g.playerRect()).length === 0) return true;
    }
    return false;
  }

  const requiredFall = minimumFallThroughTiles(g, 5);
  assert(!passesSealFromFall(requiredFall - 0.25), "Buried Tunnels seal can be bypassed without the intended 2x+1 high dive");
  assert(passesSealFromFall(requiredFall + 0.25), "Buried Tunnels 5-row seal did not allow a tuned 2x+1 high-dive pass-through");
}

function testMoonwellChoirContainsPlayableChainStack() {
  const g = makeGame();
  const level = loadCampaignLevel(g, "Occupied Streets");
  const chainRows = [53, 51, 49, 46];
  for (const row of chainRows) {
    for (let c = 14; c <= 16; c++) {
      assert(tileAt(level, row, c) === "#", "Occupied Streets missing chain slab at row " + row);
    }
  }
  assert(chainRows[0] - chainRows[1] - 1 === 1, "Occupied Streets first chain gap should be 1 row");
  assert(chainRows[1] - chainRows[2] - 1 === 1, "Occupied Streets second chain gap should be 1 row");
  assert(chainRows[2] - chainRows[3] - 1 === 2, "Occupied Streets speed-check chain gap should be 2 rows");

  setPlayer(g, cellX(g, 15), standY(g, 56), "solid");
  press(g, "ShiftLeft");
  step(g, 60);
  press(g, "ControlLeft");

  const touchedRows = new Set();
  for (let i = 0; i < 720; i++) {
    step(g);
    for (const t of g.overlappingSolidTiles(g.playerRect())) touchedRows.add(t.r);
    if (g.player.y < 46 * g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_H) break;
  }

  for (const row of chainRows.slice(0, 3)) {
    assert(touchedRows.has(row), "Occupied Streets auto-chain skipped slab row " + row);
  }
}

function testHangingArchiveContainsCeilingHangRoute() {
  const g = makeGame();
  const level = loadCampaignLevel(g, "Rooftop District");
  for (let c = 32; c <= 38; c++) {
    assert(tileAt(level, 29, c) === "#", "Rooftop District missing 2-row ceiling at c" + c);
    assert(tileAt(level, 32, c) === "#", "Rooftop District missing floor below 2-row ceiling at c" + c);
  }
  for (let c = 56; c <= 62; c++) {
    assert(tileAt(level, 21, c) === "#", "Rooftop District missing 3-row ceiling at c" + c);
    assert(tileAt(level, 25, c) === "#", "Rooftop District missing floor below 3-row ceiling at c" + c);
  }
  assert(measureCeilingHangGap(g, 2).reachable === true, "2-row ceiling hang gap should remain reachable");
  assert(measureCeilingHangGap(g, 3).reachable === true, "3-row ceiling hang gap should remain reachable");
}

function findSurfaceNodeAt(level, row, col) {
  const nodes = surfaceNodesForLevel(level);
  const node = nodes.find((n) => n.r === row && nodeContainsColumn(n, col));
  assert(node, "surface node not found at row " + row + " col " + col + " in " + level.name);
  return node;
}

function testSkylineSpireUsesBoostOnlyGaps() {
  const g = makeGame();
  const level = loadCampaignLevel(g, "Skyline Spire");
  const moves = [
    { from: findSurfaceNodeAt(level, 42, 20), to: findSurfaceNodeAt(level, 35, 33), rows: 3 },
    { from: findSurfaceNodeAt(level, 31, 46), to: findSurfaceNodeAt(level, 19, 62), rows: 4 },
    { from: findSurfaceNodeAt(level, 30, 76), to: findSurfaceNodeAt(level, 9, 91), rows: 5 }
  ];

  for (const entry of moves) {
    const move = movementAnalysis(g, entry.from, entry.to);
    assert(move.mode === "rebound", "Skyline Spire route should require rebound movement");
    assert(move.ok, "Skyline Spire " + entry.rows + "-row rebound move exceeds measured limits");
    assert(move.gapTiles > LEVEL_REACH_LIMITS.normalJumpTiles, "Skyline Spire rebound gap is too small to teach boosted horizontal shaping");
  }
}

function testMoverLevelsExposeExpectedRuntimeSurfaces() {
  const g = makeGame();
  const tideworks = loadCampaignLevel(g, "Outer Hulls");
  assert(tideworks.entities.some((e) => e.type === "mover" && e.role === "platform" && e.w === 5 && e.h === 1), "Outer Hulls missing 5x1 platform ferry");
  assert(tideworks.entities.some((e) => e.type === "mover" && e.role === "rebound" && e.w === 4 && e.h === 3), "Outer Hulls missing 4x3 vertical rebound mass");
  assert(tideworks.entities.some((e) => e.type === "mover" && e.role === "rebound" && e.w === 5 && e.h === 3), "Outer Hulls missing 5x3 horizontal rebound ferry");

  const finale = loadCampaignLevel(g, "Command Vessel");
  assert(finale.entities.length === 3, "Command Vessel should expose three moving entities");
  assert(finale.entities.some((e) => e.path === "circle" && e.role === "rebound"), "Command Vessel missing circular rebound mass");
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

function testSlashHazardRecoversToActiveCheckpointAndStaysNonsolid() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;
  const index = g.LEVELS.length;
  g.LEVELS.push(g.defineLevel({
    name: "Slash Hazard Fixture",
    map: fixtureRows(50, [
      { char: "/", c: 16, r: 35, cols: 2, rows: 1 }
    ], [
      { order: 1, c: 8, r: 35 }
    ])
  }));

  try {
    g.loadLevel(index);
    assert(g.isHazardTile(16, 35), "slash hazard tile lookup failed");
    assert(!g.isSolidTile(16, 35), "slash hazard was treated as solid terrain");

    setPlayer(g, cellX(g, 16), standY(g, 36), "solid");
    assert(g.overlappingHazardTiles(g.playerRect()).length > 0, "player did not overlap slash hazard fixture");
    assert(g.overlappingSolidTiles(g.playerRect()).length === 0, "slash hazard overlapped as solid terrain");

    setPlayer(g, cellX(g, 8), standY(g, 36), "solid");
    step(g);
    assert(g.activeCheckpoint.order === 1, "checkpoint 1 was not activated before slash hazard recovery");

    setPlayer(g, cellX(g, 16), standY(g, 36), "solid");
    step(g);

    assert(g.currentLevelIndex === index, "slash hazard recovery changed the current level");
    assert(g.activeCheckpoint.order === 1, "slash hazard recovery cleared checkpoint progress");
    assert(g.player.won === false, "slash hazard recovery left player in a won state");
    assertNear(g.player.x, cellX(g, 8), "slash hazard did not recover player to active checkpoint x");
    assertNear(g.player.y, standY(g, 36), "slash hazard did not recover player to active checkpoint y");
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
  const temp = loadTemporaryLevel(g, bugOneChainFixture());

  try {
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
  } finally {
    restoreTemporaryLevels(g, temp.originalLength);
  }
}

function testBugTwoTallMassReboundsOnce() {
  const g = makeGame();
  const temp = loadTemporaryLevel(g, bugTwoTallMassFixture());

  try {
    g.goalRect.x = -1000;
    g.goalRect.y = -1000;

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
  } finally {
    restoreTemporaryLevels(g, temp.originalLength);
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

function testHeldShiftChainLockedReboundQueuesManualExit() {
  const g = makeGame();
  clearMeasurementWorld(g);

  paintTileBlock(g, 21, 19, 3, 3);
  setPlayer(g, cellX(g, 20), 22 * g.CONFIG.TILE_SIZE, "permeating");
  g.player.chainLocked = true;
  press(g, "ShiftLeft");

  step(g);
  assert(g.player.state === "rebounding", "held Shift chain-lock did not start rebound");
  assert(g.player.queuedPermeate === true, "held Shift chain-lock did not queue manual permeation");
  assert(g.player.queuedPermeateSource === "manual", "held Shift chain-lock did not record manual queue source");

  let surfaced = false;
  for (let i = 0; i < 120; i++) {
    step(g);
    if (g.overlappingSolidTiles(g.playerRect()).length === 0) {
      surfaced = true;
      assert(g.player.state === "permeating", "held Shift chain-lock became solid at rebound exit");
      assert(g.player.queuedPermeate === false, "held Shift chain-lock did not consume the manual queue");
      assert(g.player.reboundAirborneTimer === 0, "held Shift chain-lock preserved auto-chain boost");
      break;
    }
  }

  assert(surfaced, "held Shift chain-lock never surfaced");
}

function testHeldShiftManualChainPullsThroughCeilingHang() {
  const g = makeGame();
  clearMeasurementWorld(g);

  paintTileBlock(g, 36, 10, 5, 5);
  paintTileBlock(g, 24, 10, 5, 5);

  setPlayer(g, cellX(g, 12), 41 * g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_H, "solid");

  press(g, "ShiftLeft");
  step(g, 60);
  assert(g.overlappingSolidTiles(g.playerRect()).length > 0, "held Shift chain never entered the first mass");

  release(g, "ShiftLeft");
  step(g);
  assert(g.player.state === "rebounding", "held Shift chain did not start the first rebound");

  press(g, "ShiftLeft");
  step(g);
  assert(g.player.queuedPermeate === true, "held Shift chain did not manually queue permeation");
  assert(g.player.queuedPermeateSource === "manual", "held Shift chain did not record a manual queue");

  let consumedManualQueue = false;
  let sawCeilingHang = false;
  let sawCeilingPull = false;
  let secondRebound = false;
  let previousState = g.player.state;

  for (let i = 0; i < 300; i++) {
    step(g);

    assert(g.keys.ShiftLeft === true, "held Shift chain lost the Shift hold");
    assert(g.player.state !== "solid", "held Shift chain became solid while Shift was still held");
    assert(g.player.state !== "stuck", "held Shift chain entered stuck recovery");

    if (previousState === "rebounding" && g.player.state === "permeating") {
      consumedManualQueue = true;
      assert(g.player.queuedPermeate === false, "held Shift chain did not consume the manual queue");
      assert(g.player.reboundAirborneTimer === 0, "manual held Shift chain preserved auto-chain boost");
    }
    if (consumedManualQueue && g.ceilingHangInfo(g.playerRect()).active) sawCeilingHang = true;
    if (consumedManualQueue && g.player.ceilingPullMode !== null) sawCeilingPull = true;
    if (consumedManualQueue && previousState !== "rebounding" && g.player.state === "rebounding") {
      secondRebound = true;
      break;
    }

    previousState = g.player.state;
  }

  assert(consumedManualQueue, "held Shift chain never consumed the manual queue on surfacing");
  assert(sawCeilingHang, "held Shift chain did not diagnose the top-half ceiling-hang overlap");
  assert(sawCeilingPull, "held Shift chain did not pull through the ceiling hang");
  assert(secondRebound, "held Shift chain did not rebound after the ceiling-hang overlap");
}

function testManualTapChainKeepsQueuedPermeation() {
  const g = makeGame();
  const temp = loadTemporaryLevel(g, bugOneChainFixture());

  try {
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
  } finally {
    restoreTemporaryLevels(g, temp.originalLength);
  }
}

function testManualRhythmChainCompletesFirstLevelWithoutCtrl() {
  const g = makeGame();
  const temp = loadTemporaryLevel(g, bugOneChainFixture());

  try {
    setPlayer(g, cellX(g, 7), standY(g, 60), "solid");

    press(g, "ShiftLeft");
    step(g, 60);
    assert(g.overlappingSolidTiles(g.playerRect()).length > 0, "manual rhythm chain never entered the first mass");
    release(g, "ShiftLeft");
    step(g);
    assert(g.player.state === "rebounding", "manual rhythm chain did not start the first rebound");

    const tapPeriod = 45;
    const tapWidth = 6;
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
  } finally {
    restoreTemporaryLevels(g, temp.originalLength);
  }
}

function testManualChainCompletesFirstLevelWithoutFurtherInput() {
  const g = makeGame();
  const temp = loadTemporaryLevel(g, bugOneChainFixture());

  try {
    setPlayer(g, cellX(g, 7), standY(g, 60), "solid");

    press(g, "ShiftLeft");
    step(g, 60);
    assert(g.overlappingSolidTiles(g.playerRect()).length > 0, "manual no-input chain never entered the first mass");
    release(g, "ShiftLeft");
    step(g);
    assert(g.player.state === "rebounding", "manual no-input chain did not start the first rebound");

    let reboundStarts = 1;
    let previousState = g.player.state;
    let chainStarted = true;
    for (let i = 0; i < 2400; i++) {
      assert(g.keys.ControlLeft !== true && g.keys.ControlRight !== true, "manual no-input chain used Ctrl");
      assert(g.keys.ShiftLeft !== true && g.keys.ShiftRight !== true, "manual no-input chain kept Shift held");
      step(g);
      if (previousState !== "rebounding" && g.player.state === "rebounding") reboundStarts++;
      previousState = g.player.state;
      if (g.player.state === "permeating" || g.player.state === "rebounding") chainStarted = true;

      assert(g.player.state !== "stuck", "manual no-input chain entered stuck recovery");
      assert(!chainStarted || g.player.state !== "solid", "manual no-input chain became solid before fully exiting");

      if (g.player.won) {
        assert(reboundStarts >= 4, "manual no-input chain did not perform enough rebounds");
        return;
      }
    }

    throw new Error("manual no-input chain did not reach the first-level goal");
  } finally {
    restoreTemporaryLevels(g, temp.originalLength);
  }
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

function testSkylineSpireFiveRowReboundUsesCappedTarget() {
  const g = makeGame();
  loadCampaignLevel(g, "Skyline Spire");

  const deepMassCol = 77;
  const massBottomRow = 34;
  const bottomY = (massBottomRow + 1) * g.CONFIG.TILE_SIZE;
  for (const mode of ["release", "ctrl+shift"]) {
    setPlayer(g, cellX(g, deepMassCol), bottomY - g.CONFIG.PLAYER_H, "permeating");
    const target = g.shouldRebound(g.playerRect()).targetRiseTiles;
    assertApprox(target, 21, 0.001, "Skyline Spire five-row mass did not use capped rebound tuning");

    const measured = measureCurrentReboundPeakFromExit(g, 480, mode);
    assertApprox(measured.riseTiles, target, 0.05, "Skyline Spire five-row " + mode + " rebound did not follow its exit-relative target height");
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
  const targetMinimumFalls = tunedRows.map((rows) => minimumFallThroughTiles(g, rows));
  const overCapRows = [6, 8, 12];
  const cappedRebound = reboundTargetFromDepthLevelForTest(5);
  const heightTolerance = 0.05;

  const normalJump = measureNormalJumpPeak(g);
  const terminalFall = measureFreeFallToTerminal(g);
  const terminalRows = findMaxTerminalVelocityPassThroughRows(g);
  const normalHorizontalGaps = measureNormalHorizontalJumpGaps(g);
  const reboundHorizontalGaps = measureReboundHorizontalGaps(g);
  const ceilingHangGaps = measureCeilingHangGaps(g);

  for (let rows = 1; rows <= 5; rows++) {
    centerRebounds.push(measureReboundPeak(g, rows, "center", "release"));
    centerAssistRebounds.push(measureReboundPeak(g, rows, "center", "ctrl+shift"));
    bottomRebounds.push(measureReboundPeak(g, rows, "bottom", "release"));
    bottomAssistRebounds.push(measureReboundPeak(g, rows, "bottom", "ctrl+shift"));
    minimumFalls.push(findMinimumFallTiles(g, rows));
    assertPassThroughThreshold(g, rows);
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
  assertApprox(findMinimumFallTiles(g, 6), minimumFallThroughTiles(g, 6), heightTolerance, "6-row mass minimum fall-through target missed");
  assertPassThroughThreshold(g, 6);

  assertApprox(normalJump, 2, heightTolerance, "normal jump target missed");
  assertApprox(terminalFall, 5, heightTolerance, "free fall to max-speed target missed");
  assert(terminalRows === 0, "terminal-speed pass-through bypassed the entry budget; expected 0 rows, got " + terminalRows);
  assert(
    normalHorizontalGaps.map((entry) => entry.safeTiles).join(",") === "5,4,3",
    "normal horizontal safe gaps changed; got " + normalHorizontalGaps.map((entry) => entry.safeTiles).join(",")
  );
  assert(
    reboundHorizontalGaps.map((entry) => entry.safeTiles).join(",") === "4,6,7,9,12",
    "rebound horizontal safe gaps changed; got " + reboundHorizontalGaps.map((entry) => entry.safeTiles).join(",")
  );
  assert(ceilingHangGaps[0].reachable === false && ceilingHangGaps[0].lowerOverlapSeen === true, "1-tile ceiling gap should overlap too deeply for a clean hang");
  assert(ceilingHangGaps[1].reachable === true, "2-tile ceiling gap should be reachable by normal jump into hang");
  assert(ceilingHangGaps[2].reachable === true, "3-tile ceiling gap should be reachable by normal jump into hang");
  assert(ceilingHangGaps[3].reachable === false, "4-tile ceiling gap should be beyond normal jump hang reach");
  assert(ceilingHangGaps[4].reachable === false, "5-tile ceiling gap should be beyond normal jump hang reach");

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
  console.log("  normal horizontal jump gaps");
  console.log("  rise | raw gap | safe authored gap");
  for (const entry of normalHorizontalGaps) {
    console.log(
      "  " + entry.riseTiles +
      "    | " + formatTiles(entry.rawTiles) +
      "    | " + entry.safeTiles
    );
  }
  console.log("  rebound horizontal gaps at full target rise (1.5x)");
  console.log("  rows | target rise | raw gap | safe authored gap");
  for (const entry of reboundHorizontalGaps) {
    console.log(
      "  " + entry.rows +
      "    | " + formatTiles(entry.riseTiles) +
      "        | " + formatTiles(entry.rawTiles) +
      "    | " + entry.safeTiles
    );
  }
  console.log("  ceiling hang vertical gaps");
  console.log("  gap rows | result | peak rise");
  for (const entry of ceilingHangGaps) {
    console.log(
      "  " + entry.gapRows +
      "        | " + (entry.reachable ? "reachable" : entry.lowerOverlapSeen ? "too tight" : "too high") +
      " | " + formatTiles(entry.peakRiseTiles)
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

function testOpenClawPresentationStatesAreReadable() {
  const g = makeGame();
  const labels = [];

  function capture(expectedKey, label, maxMessageLength) {
    const state = g.presentationState();
    assert(state.key === expectedKey, "presentation state expected " + expectedKey + ", got " + state.key);
    assert(state.label === label, expectedKey + " label was not readable");
    assert(state.message.length <= maxMessageLength, expectedKey + " message is too long for the HUD");
    assert(typeof state.tone === "string" && state.tone.length > 0, expectedKey + " tone hook is missing");
    labels.push(state.label);
  }

  setPlayer(g, g.player.x, g.player.y, "solid");
  capture("solid", "Open Claw", 34);

  setPlayer(g, g.player.x, g.player.y, "permeating");
  capture("permeating", "Shadow Sink", 26);

  buildCeilingHangFixture(g);
  capture("ceiling-hang", "Ceiling Cling", 26);

  setPlayer(g, g.player.x, g.player.y, "rebounding");
  g.player.reboundMeterLevel = 3;
  capture("rebounding", "Rebound", 26);

  setPlayer(g, g.player.x, g.player.y, "stuck");
  capture("stuck", "Snared", 26);

  g.recoverToCheckpoint();
  capture("checkpoint-recovery", "Recovered", 26);

  setPlayer(g, g.goalRect.x, g.goalRect.y, "solid");
  g.player.won = true;
  capture("won", "Unseen", 26);

  assert(new Set(labels).size === labels.length, "presentation labels should be distinct across core states");
}

function buildWallClawFixture(g) {
  clearMeasurementWorld(g, 36, 36);
  const wallCol = 14;
  paintTileBlock(g, 8, wallCol, 20, 1);
  paintTileBlock(g, 31, 0, 1, 36);
  return {
    wallCol,
    wallX: wallCol * g.CONFIG.TILE_SIZE,
    clingX: wallCol * g.CONFIG.TILE_SIZE - g.CONFIG.PLAYER_W,
    startY: 15 * g.CONFIG.TILE_SIZE
  };
}

function testWallClawClingsOnlyWhileAirborne() {
  const g = makeGame();
  const fixture = buildWallClawFixture(g);

  setPlayer(g, fixture.clingX, fixture.startY, "solid");
  g.player.vy = 7;
  press(g, "ArrowRight");
  step(g);

  assert(g.player.wallClingSide === 1, "airborne wall press did not enter right-wall cling");
  assert(g.player.vy <= g.CONFIG.WALL_CLING_MAX_FALL_SPEED, "wall cling did not cap fall speed");
  assert(g.player.state === "solid", "wall cling should stay in solid movement");

  setPlayer(g, fixture.clingX, standY(g, 31), "solid");
  press(g, "ArrowRight");
  step(g);
  assert(g.player.grounded === true, "fixture player did not start grounded");
  assert(g.player.wallClingSide === 0, "grounded wall press should not become a wall cling");
}

function testWallClawJumpAndResetSafety() {
  const g = makeGame();
  const fixture = buildWallClawFixture(g);

  setPlayer(g, fixture.clingX, fixture.startY, "solid");
  g.player.vy = 7;
  press(g, "ArrowRight");
  step(g);
  assert(g.player.wallClingSide === 1, "wall jump fixture did not cling");

  press(g, "Space");
  step(g);
  assert(g.player.wallClingSide === 0, "wall jump kept cling latched");
  assert(g.player.vy === g.CONFIG.JUMP_VELOCITY, "wall jump did not use normal jump height");
  assert(g.player.vx < 0, "right-wall jump did not launch away from the wall");
  assert(Math.abs(g.player.vx) <= g.CONFIG.MAX_RUN_SPEED, "wall jump exceeded normal horizontal speed limits");

  press(g, "KeyR");
  step(g);
  assert(g.player.state === "solid", "reset during Wall Claw did not return to solid");
  assert(g.player.wallClingSide === 0, "reset did not clear Wall Claw state");
  assert(g.overlappingSolidTiles(g.playerRect()).length === 0, "reset during Wall Claw spawned inside terrain");
}

function testScannerFieldsAreAuthoredAndNonsolid() {
  const g = makeGame();
  pushDynamicFixture(
    g,
    { kind: "scanner", name: "training searchlight", char: "L" },
    { char: "L", c: 10, r: 26, cols: 5, rows: 4 }
  );

  const scanner = g.entities.find((entity) => entity.type === "scanner");
  assert(scanner, "scanner marker did not create a runtime scanner field");
  assert(scanner.solid === false, "scanner field should not be solid matter");
  assert(scanner.x === 10 * g.CONFIG.TILE_SIZE && scanner.y === 26 * g.CONFIG.TILE_SIZE, "scanner field geometry was not map-authored");

  setPlayer(g, scanner.x + 8, scanner.y + 8, "solid");
  g.player.vx = 2;
  step(g);
  assert(g.overlappingSolidEntities(g.playerRect()).length === 0, "scanner field blocked collision as a solid entity");
}

function testScannerRecoversExposedButNotHiddenPermeation() {
  const g = makeGame();
  pushDynamicFixture(
    g,
    { kind: "scanner", name: "training searchlight", char: "L" },
    { char: "L", c: 10, r: 24, cols: 6, rows: 5 }
  );
  const scanner = g.entities.find((entity) => entity.type === "scanner");

  setPlayer(g, scanner.x + 12, scanner.y + 12, "solid");
  g.player.vx = 1;
  step(g);
  assert(g.player.recoveryCue === "scanner", "exposed scanner contact did not expose scanner recovery");

  paintTileBlock(g, 25, 11, 2, 4);
  setPlayer(g, scanner.x + g.CONFIG.TILE_SIZE, (25 * g.CONFIG.TILE_SIZE) + 4, "permeating");
  g.keys.ShiftLeft = true;
  step(g);
  assert(g.player.recoveryCue !== "checkpoint", "scanner punished hidden permeation inside matter");
  assert(g.player.state === "permeating", "hidden scanner permeation did not remain permeating");
}

function testScannerRecoveryPreservesCheckpointAndControls() {
  const g = makeGame();
  pushDynamicFixture(
    g,
    { kind: "scanner", name: "training searchlight", char: "L" },
    { char: "L", c: 14, r: 32, cols: 5, rows: 3 },
    [
      { order: 1, c: 8, r: 43 },
      { order: 2, c: 24, r: 43 }
    ]
  );
  const scanner = g.entities.find((entity) => entity.type === "scanner");

  setPlayer(g, cellX(g, 24), standY(g, 44), "solid");
  step(g);
  assert(g.activeCheckpoint.order === 2, "checkpoint 2 was not reached before scanner failure");

  setPlayer(g, scanner.x + 8, scanner.y + 8, "solid");
  g.player.vx = 1;
  step(g);

  assert(g.activeCheckpoint.order === 2, "scanner recovery downgraded checkpoint progress");
  assert(g.player.recoveryCue === "scanner", "scanner recovery did not expose a scanner-specific cue");
  assert(g.presentationState().message === "scanner reset", "scanner recovery HUD message was not clear");
  assertNear(g.player.x, cellX(g, 24), "scanner recovery did not respawn at the largest checkpoint x");
  assertNear(g.player.y, standY(g, 44), "scanner recovery did not respawn at the largest checkpoint y");
  assert(g.overlappingSolidTiles(g.playerRect()).length === 0, "scanner recovery spawned inside terrain");

  g.setVirtualKey("ArrowRight", true);
  g.setVirtualKey("ArrowRight", false);
  assert(g.keys.ArrowRight === false && g.keyReleased.ArrowRight === true, "mobile virtual controls stopped responding after scanner recovery");
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

function testMovingPlatformCrushesSolidPlayerAgainstFixedFloor() {
  const g = makeGame();
  const originalLength = g.LEVELS.length;

  try {
    const rows = fixtureRows(50, [
      { char: "A", c: 12, r: 29, cols: 4, rows: 1 }
    ], [
      { order: 1, c: 4, r: 33 }
    ]).map((row) => row.split(""));
    for (let c = 0; c < rows[34].length; c++) rows[34][c] = "#";

    const index = g.LEVELS.length;
    g.LEVELS.push(g.defineLevel({
      name: "Moving Platform Crush Fixture",
      map: rows.map((row) => row.join("")),
      entities: [{
        kind: "mover",
        name: "descending crusher",
        char: "A",
        role: "platform",
        motion: { kind: "vertical", amplitude: { x: 0, y: 96 }, speed: 1.6, phase: Math.PI }
      }]
    }));
    g.loadLevel(index);

    setPlayer(g, cellX(g, 4), standY(g, 34), "solid");
    step(g);
    assert(g.activeCheckpoint.order === 1, "checkpoint 1 was not activated before crush");

    const e = g.entities[0];
    setPlayer(g, e.x + 32, standY(g, 34), "solid");
    const crushY = g.player.y;
    let recovered = false;
    let liftedToMoverTop = false;

    for (let i = 0; i < 260; i++) {
      step(g);
      if (g.player.flashTimer > 0) {
        recovered = true;
        break;
      }
      if (g.player.y < crushY - 8 && Math.abs(g.player.y + g.CONFIG.PLAYER_H - e.y) < 0.001) {
        liftedToMoverTop = true;
        break;
      }
    }

    assert(!liftedToMoverTop, "descending mover lifted solid player onto its top instead of crushing");
    assert(recovered, "descending mover did not recover crushed player");
    assertNear(g.player.x, cellX(g, 4), "crush recovery did not restore active checkpoint x");
    assertNear(g.player.y, standY(g, 34), "crush recovery did not restore active checkpoint y");
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
  ["virtual key helper tracks edges and releases", testVirtualKeyHelperTracksEdgesAndReleases],
  ["mobile joystick maps move and jump keys", testMobileJoystickMapsMoveAndJumpKeys],
  ["mobile Shift button maps Shift and vertical assist", testMobileShiftButtonMapsShiftAndVerticalAssist],
  ["mobile Shift release at top releases Shift and Ctrl", testMobileShiftReleaseAtTopReleasesShiftAndCtrl],
  ["mobile HUD copy explains touch controls", testMobileHudCopyExplainsTouchControls],
  ["PWA manifest is linked and landscape fullscreen", testPwaManifestIsLinkedAndLandscapeFullscreen],
  ["iOS standalone detection remains available", testIOSStandaloneDetectionRemainsAvailable],
  ["mobile gesture suppression hooks", testMobileGestureSuppressionHooks],
  ["compact viewport enables mobile mode", testCompactViewportEnablesMobileMode],
  ["mobile viewport sizing uses visualViewport", testMobileViewportSizingUsesVisualViewport],
  ["mobile releaseAll clears held virtual keys", testMobileReleaseAllClearsHeldVirtualKeys],
  ["tap completion prompt advances level", testTapCompletionPromptAdvancesLevel],
  ["tap final completion prompt restarts checkpoint", testTapFinalCompletionPromptRestartsCheckpoint],
  ["load level recalculates map", testLoadLevelRecalculatesMap],
  ["authored levels have valid starts", testAuthoredLevelsHaveValidMarkersAndStarts],
  ["playable campaign is redesigned level set", testPlayableCampaignIsRedesignedLevelSet],
  ["campaign level metadata is exposed", testCampaignLevelMetadataIsExposed],
  ["authored levels are reachable within player limits", testAuthoredLevelsAreReachableWithinPlayerLimits],
  ["Buried Tunnels uses five-row pass-through gate", testBuriedPressureLockFiveRowPassThroughGate],
  ["Occupied Streets contains playable chain stack", testMoonwellChoirContainsPlayableChainStack],
  ["Rooftop District contains ceiling-hang route", testHangingArchiveContainsCeilingHangRoute],
  ["Skyline Spire uses boost-only rebound gaps", testSkylineSpireUsesBoostOnlyGaps],
  ["mover levels expose expected runtime surfaces", testMoverLevelsExposeExpectedRuntimeSurfaces],
  ["camera tracks horizontally in wide levels", testCameraTracksHorizontallyInWideLevel],
  ["load level rejects uneven rows", testLoadLevelRejectsUnevenRows],
  ["reset respawns at active checkpoint", testResetRespawnsAtActiveCheckpoint],
  ["slash hazard recovers to active checkpoint and stays nonsolid", testSlashHazardRecoversToActiveCheckpointAndStaysNonsolid],
  ["winning advances to next level", testWinningAdvancesToNextLevel],
  ["final level stops at end", testFinalLevelDoesNotAdvancePastEnd],
  ["bug 1 auto-chain reaches top", testBugOneAutoChainReachesTop],
  ["bug 2 tall mass rebounds once", testBugTwoTallMassReboundsOnce],
  ["auto assist climbs tuned thick stack", testAutoAssistClimbsTunedThickStack],
  ["manual queue consumes on surface", testManualQueueConsumesOnSurface],
  ["held Shift chain-lock queues manual exit", testHeldShiftChainLockedReboundQueuesManualExit],
  ["held Shift manual chain pulls through ceiling hang", testHeldShiftManualChainPullsThroughCeilingHang],
  ["manual tap chain keeps queued permeation", testManualTapChainKeepsQueuedPermeation],
  ["manual rhythm chain completes bug fixture without Ctrl", testManualRhythmChainCompletesFirstLevelWithoutCtrl],
  ["manual chain completes bug fixture without further input", testManualChainCompletesFirstLevelWithoutFurtherInput],
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
  ["Skyline Spire five-row rebound uses capped target", testSkylineSpireFiveRowReboundUsesCappedTarget],
  ["permeation bottom brake resists deep sinking", testPermeationBottomBrakeResistsDeepSinking],
  ["short fall does not accidentally permeate through thin mass", testShortFallDoesNotAccidentallyPermeateThroughThinMass],
  ["high fall can permeate through thin mass", testHighFallCanPermeateThroughThinMass],
  ["very high fall can permeate through large mass", testVeryHighFallCanPermeateThroughLargeMass],
  ["rebound depth meter levels", testReboundDepthMeterLevels],
  ["HUD pressure bar uses rebound depth meter", testHudPressureBarUsesReboundDepthMeter],
  ["HUD pressure meter has five segments", testHudPressureMeterHasFiveSegments],
  ["Open Claw presentation states are readable", testOpenClawPresentationStatesAreReadable],
  ["Wall Claw clings only while airborne", testWallClawClingsOnlyWhileAirborne],
  ["Wall Claw jump and reset safety", testWallClawJumpAndResetSafety],
  ["scanner fields are authored and nonsolid", testScannerFieldsAreAuthoredAndNonsolid],
  ["scanner recovers exposed but not hidden permeation", testScannerRecoversExposedButNotHiddenPermeation],
  ["scanner recovery preserves checkpoint and controls", testScannerRecoveryPreservesCheckpointAndControls],
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
  ["moving platform crushes solid player against fixed floor", testMovingPlatformCrushesSolidPlayerAgainstFixedFloor],
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
