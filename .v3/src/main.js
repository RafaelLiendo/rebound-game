"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const stateLabel = document.getElementById("stateLabel");
const messageLabel = document.getElementById("messageLabel");
const pressureFill = document.getElementById("pressureFill");

const W = canvas.width;
const H = canvas.height;
const WORLD = { w: 2140, h: 760 };
const START = { x: 84, y: 438 };

const keys = new Map();
let lastTime = performance.now();
let cameraX = 0;
let cameraY = 0;
let shake = 0;
let won = false;

const solids = [
  { x: -80, y: 520, w: 570, h: 120, kind: "earth" },
  { x: 280, y: 396, w: 170, h: 124, kind: "mass" },
  { x: 640, y: 445, w: 250, h: 36, kind: "ledge" },
  { x: 740, y: 520, w: 440, h: 120, kind: "earth" },
  { x: 930, y: 342, w: 165, h: 178, kind: "mass" },
  { x: 1215, y: 440, w: 180, h: 34, kind: "ledge" },
  { x: 1450, y: 365, w: 190, h: 155, kind: "mass" },
  { x: 1688, y: 510, w: 560, h: 130, kind: "earth" },
  { x: 1800, y: 412, w: 150, h: 26, kind: "ledge" },
];

const hints = [
  { x: 118, y: 472, text: "move" },
  { x: 322, y: 374, text: "sink" },
  { x: 372, y: 438, text: "release" },
  { x: 960, y: 318, text: "wait deeper" },
  { x: 1476, y: 340, text: "chain" },
  { x: 1845, y: 385, text: "surface" },
];

const goal = { x: 1954, y: 356, w: 42, h: 154 };
const particles = [];
const ripples = [];

const player = {
  x: START.x,
  y: START.y,
  w: 24,
  h: 34,
  vx: 0,
  vy: 0,
  grounded: false,
  permeating: false,
  inside: false,
  rebound: false,
  pressure: 0,
  depth: 0,
  insideTime: 0,
  coyote: 0,
  jumpBuffer: 0,
  unsafe: 0,
  face: 1,
};

const tune = {
  normalGravity: 1700,
  permeateGravity: 470,
  reboundGravity: 980,
  walkAccel: 3600,
  airAccel: 2300,
  permeateAccel: 860,
  groundFriction: 0.82,
  airFriction: 0.985,
  maxRun: 285,
  maxPermeate: 92,
  jump: 590,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function getPlayerRect(px = player.x, py = player.y) {
  return { x: px, y: py, w: player.w, h: player.h };
}

function getOverlaps(rect = getPlayerRect()) {
  return solids.filter((solid) => rectsOverlap(rect, solid));
}

function overlapDepth(a, b) {
  const left = a.x + a.w - b.x;
  const right = b.x + b.w - a.x;
  const top = a.y + a.h - b.y;
  const bottom = b.y + b.h - a.y;
  return Math.max(0, Math.min(left, right, top, bottom));
}

function keyDown(...codes) {
  return codes.some((code) => keys.get(code));
}

function wantsPermeate() {
  return keyDown("ShiftLeft", "ShiftRight", "KeyK", "ArrowDown", "KeyS");
}

function wantsJump() {
  return keyDown("Space", "KeyW", "ArrowUp");
}

function resetPlayer(message = "try the same idea again") {
  player.x = START.x;
  player.y = START.y;
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.permeating = false;
  player.inside = false;
  player.rebound = false;
  player.pressure = 0;
  player.depth = 0;
  player.insideTime = 0;
  player.unsafe = 0;
  won = false;
  messageLabel.textContent = message;
  shake = 12;
}

function spawnMatterParticle(x, y, pressure, hot = false) {
  particles.push({
    x,
    y,
    vx: (Math.random() - 0.5) * 90,
    vy: -25 - Math.random() * (70 + pressure * 70),
    life: 0.35 + Math.random() * 0.45,
    maxLife: 0.75,
    r: 2 + Math.random() * 4 + pressure * 2,
    hot,
  });
}

function spawnRipple(x, y, pressure) {
  ripples.push({
    x,
    y,
    radius: 10,
    life: 0.55,
    maxLife: 0.55,
    pressure,
  });
}

function resolveAxis(axis, amount) {
  if (amount === 0) return;

  if (axis === "x") player.x += amount;
  else player.y += amount;

  const rect = getPlayerRect();
  for (const solid of solids) {
    if (!rectsOverlap(rect, solid)) continue;

    if (axis === "x") {
      if (amount > 0) player.x = solid.x - player.w;
      else if (amount < 0) player.x = solid.x + solid.w;
      player.vx = 0;
    } else {
      if (amount > 0) {
        player.y = solid.y - player.h;
        player.grounded = true;
        player.coyote = 0.12;
      } else if (amount < 0) {
        player.y = solid.y + solid.h;
      }
      player.vy = 0;
    }

    rect.x = player.x;
    rect.y = player.y;
  }
}

function updateNormal(dt, inputX, permeateHeld) {
  const accel = player.grounded ? tune.walkAccel : tune.airAccel;
  player.vx += inputX * accel * dt;
  player.vx *= player.grounded ? tune.groundFriction : tune.airFriction;
  player.vx = clamp(player.vx, -tune.maxRun, tune.maxRun);

  if (inputX !== 0) player.face = inputX;

  if (permeateHeld) {
    player.permeating = true;
    player.rebound = false;
    return;
  }

  if (player.jumpBuffer > 0 && player.coyote > 0) {
    player.vy = -tune.jump;
    player.jumpBuffer = 0;
    player.coyote = 0;
    player.grounded = false;
    spawnRipple(player.x + player.w / 2, player.y + player.h, 0.25);
  }

  player.vy += tune.normalGravity * dt;
  player.grounded = false;
  resolveAxis("x", player.vx * dt);
  resolveAxis("y", player.vy * dt);

  player.pressure = Math.max(0, player.pressure - dt * 0.8);
  player.depth = Math.max(0, player.depth - dt * 30);
}

function updatePermeating(dt, inputX, permeateHeld) {
  player.vx += inputX * tune.permeateAccel * dt;
  player.vx *= 0.92;
  player.vx = clamp(player.vx, -tune.maxPermeate, tune.maxPermeate);
  player.vy += tune.permeateGravity * dt;
  player.vy *= player.inside ? 0.84 : 0.94;
  player.vy = clamp(player.vy, -210, player.inside ? 150 : 250);

  if (inputX !== 0) player.face = inputX;

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const rect = getPlayerRect();
  const overlaps = getOverlaps(rect);
  player.inside = overlaps.length > 0;

  if (player.inside) {
    const depth = overlaps.reduce((max, solid) => Math.max(max, overlapDepth(rect, solid)), 0);
    player.depth = lerp(player.depth, depth, 0.2);
    player.insideTime += dt;
    player.pressure = clamp(player.pressure + dt * (0.48 + depth / 52), 0, 1);
    player.unsafe = clamp(player.unsafe + dt * (player.pressure > 0.82 ? 0.9 : 0.18), 0, 1.8);

    if (Math.random() < 0.45) {
      spawnMatterParticle(
        player.x + player.w / 2 + (Math.random() - 0.5) * player.w,
        player.y + player.h / 2,
        player.pressure,
        player.unsafe > 1,
      );
    }

    if (!permeateHeld) {
      const lift = lerp(560, 1120, player.pressure);
      player.rebound = true;
      player.permeating = false;
      player.vy = -lift;
      player.vx += player.face * lerp(75, 185, player.pressure);
      shake = 4 + player.pressure * 14;
      spawnRipple(player.x + player.w / 2, player.y + player.h / 2, player.pressure);
      for (let i = 0; i < 24; i += 1) {
        spawnMatterParticle(player.x + player.w / 2, player.y + player.h / 2, player.pressure, true);
      }
      return;
    }

    if (player.unsafe >= 1.8) {
      resetPlayer("too long inside the mass");
      return;
    }
  } else {
    player.pressure = Math.max(0, player.pressure - dt * 0.9);
    player.depth = Math.max(0, player.depth - dt * 55);
    player.insideTime = 0;
    player.unsafe = Math.max(0, player.unsafe - dt * 1.4);
    if (!permeateHeld) player.permeating = false;
  }
}

function updateRebound(dt, inputX) {
  player.vx += inputX * tune.airAccel * 0.45 * dt;
  player.vx *= 0.992;
  player.vy += tune.reboundGravity * dt;

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  const overlaps = getOverlaps();
  player.inside = overlaps.length > 0;

  if (player.inside) {
    player.vy -= (1280 + player.pressure * 780) * dt;
    player.pressure = Math.max(0, player.pressure - dt * 0.55);
    if (Math.random() < 0.6) {
      spawnMatterParticle(player.x + player.w / 2, player.y + player.h, player.pressure, true);
    }
  } else {
    player.rebound = false;
    player.permeating = false;
    player.insideTime = 0;
    player.unsafe = 0;
    player.pressure = Math.max(player.pressure, 0.22);
  }
}

function updatePlayer(dt) {
  if (wantsJump()) player.jumpBuffer = 0.12;
  else player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

  player.coyote = Math.max(0, player.coyote - dt);
  const inputX = (keyDown("ArrowRight", "KeyD") ? 1 : 0) - (keyDown("ArrowLeft", "KeyA") ? 1 : 0);
  const permeateHeld = wantsPermeate();

  if (player.rebound) updateRebound(dt, inputX);
  else if (player.permeating) updatePermeating(dt, inputX, permeateHeld);
  else updateNormal(dt, inputX, permeateHeld);

  player.x = clamp(player.x, -30, WORLD.w - player.w + 20);

  if (player.y > WORLD.h + 80) resetPlayer("fell out of the pressure field");

  if (!won && rectsOverlap(getPlayerRect(), goal)) {
    won = true;
    messageLabel.textContent = "reached the surface gate";
    spawnRipple(goal.x + goal.w / 2, goal.y + goal.h / 2, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 210 * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  for (let i = ripples.length - 1; i >= 0; i -= 1) {
    const r = ripples[i];
    r.life -= dt;
    r.radius += (160 + r.pressure * 130) * dt;
    if (r.life <= 0) ripples.splice(i, 1);
  }
}

function updateCamera(dt) {
  const targetX = clamp(player.x + player.w / 2 - W * 0.42, 0, WORLD.w - W);
  const targetY = clamp(player.y + player.h / 2 - H * 0.58, 0, WORLD.h - H);
  cameraX = lerp(cameraX, targetX, 1 - Math.pow(0.002, dt));
  cameraY = lerp(cameraY, targetY, 1 - Math.pow(0.002, dt));
  shake = Math.max(0, shake - dt * 36);
}

function setHud() {
  let state = "solid";
  let message = "ordinary movement is light";
  let color = "#f0c85f";

  if (won) {
    state = "clear";
    message = "the level can be chained faster now";
    color = "#68d391";
  } else if (player.rebound) {
    state = "rebound";
    message = "pressure is becoming motion";
    color = "#e85f5c";
  } else if (player.permeating && player.inside) {
    state = "inside";
    message = player.unsafe > 1 ? "the mass is becoming unsafe" : "release when the buoyancy feels charged";
    color = player.unsafe > 1 ? "#e85f5c" : "#77d1c8";
  } else if (player.permeating) {
    state = "phase";
    message = "matter will slow you once you enter";
    color = "#77d1c8";
  } else if (player.pressure > 0.25) {
    message = "control has returned";
  }

  stateLabel.textContent = state;
  stateLabel.style.background = color;
  pressureFill.style.width = `${Math.round(player.pressure * 100)}%`;
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#101720");
  sky.addColorStop(0.58, "#182319");
  sky.addColorStop(1, "#263126");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-cameraX * 0.18, -cameraY * 0.08);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 18; i += 1) {
    const x = i * 170 + 20;
    const y = 90 + Math.sin(i * 1.8) * 36;
    ctx.fillStyle = i % 2 ? "#253c32" : "#314139";
    ctx.beginPath();
    ctx.moveTo(x - 90, 500);
    ctx.lineTo(x + 40, y);
    ctx.lineTo(x + 180, 500);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(-cameraX * 0.45, -cameraY * 0.18);
  ctx.strokeStyle = "rgba(244, 240, 223, 0.08)";
  ctx.lineWidth = 1;
  for (let y = 70; y < WORLD.h; y += 56) {
    ctx.beginPath();
    for (let x = -80; x < WORLD.w + 120; x += 28) {
      const wobble = Math.sin(x * 0.018 + y * 0.05) * 5;
      if (x === -80) ctx.moveTo(x, y + wobble);
      else ctx.lineTo(x, y + wobble);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain() {
  for (const solid of solids) {
    const x = Math.round(solid.x - cameraX);
    const y = Math.round(solid.y - cameraY);
    const grad = ctx.createLinearGradient(x, y, x, y + solid.h);

    if (solid.kind === "mass") {
      grad.addColorStop(0, "#6a523c");
      grad.addColorStop(0.38, "#8e6348");
      grad.addColorStop(1, "#2f3c35");
    } else if (solid.kind === "ledge") {
      grad.addColorStop(0, "#7c9a80");
      grad.addColorStop(1, "#344537");
    } else {
      grad.addColorStop(0, "#5e6f50");
      grad.addColorStop(1, "#26372c");
    }

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, solid.w, solid.h);
    ctx.fillStyle = "rgba(244, 240, 223, 0.18)";
    ctx.fillRect(x, y, solid.w, 3);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, solid.w, solid.h);
    ctx.clip();
    ctx.globalAlpha = solid.kind === "mass" ? 0.36 : 0.19;
    ctx.strokeStyle = solid.kind === "mass" ? "#f0c85f" : "#b8c7b8";
    ctx.lineWidth = 1;
    for (let stripe = -solid.h; stripe < solid.w + solid.h; stripe += 34) {
      ctx.beginPath();
      ctx.moveTo(x + stripe, y + solid.h);
      ctx.lineTo(x + stripe + solid.h, y);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawHints() {
  ctx.save();
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const hint of hints) {
    const dx = hint.x - cameraX;
    const dy = hint.y - cameraY;
    const dist = Math.abs(player.x - hint.x);
    const alpha = clamp(1 - dist / 360, 0, 0.76);
    if (alpha <= 0.02) continue;

    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(12, 18, 23, 0.62)";
    roundRect(dx - 42, dy - 13, 84, 26, 7);
    ctx.fill();
    ctx.strokeStyle = "rgba(244, 240, 223, 0.22)";
    ctx.stroke();
    ctx.fillStyle = "#f4f0df";
    ctx.fillText(hint.text, dx, dy + 1);
  }

  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}

function drawGoal() {
  const x = goal.x - cameraX;
  const y = goal.y - cameraY;
  const active = won ? 1 : 0.45 + Math.sin(performance.now() * 0.006) * 0.08;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = `rgba(104, 211, 145, ${active})`;
  ctx.lineWidth = 5;
  roundRect(x, y, goal.w, goal.h, 8);
  ctx.stroke();
  ctx.fillStyle = `rgba(104, 211, 145, ${won ? 0.22 : 0.08})`;
  ctx.fill();

  ctx.fillStyle = "#f4f0df";
  ctx.fillRect(x + 16, y + 16, 10, goal.h - 32);
  ctx.restore();
}

function drawParticles() {
  for (const ripple of ripples) {
    const alpha = clamp(ripple.life / ripple.maxLife, 0, 1);
    ctx.strokeStyle = `rgba(240, 200, 95, ${alpha * 0.68})`;
    ctx.lineWidth = 2 + ripple.pressure * 3;
    ctx.beginPath();
    ctx.arc(ripple.x - cameraX, ripple.y - cameraY, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const p of particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.hot ? `rgba(232, 95, 92, ${alpha})` : `rgba(119, 209, 200, ${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x - cameraX, p.y - cameraY, p.r * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const x = player.x - cameraX;
  const y = player.y - cameraY;
  const cx = x + player.w / 2;
  const cy = y + player.h / 2;

  ctx.save();
  if (player.permeating || player.rebound) {
    ctx.globalAlpha = player.inside ? 0.62 : 0.8;
    ctx.strokeStyle = player.rebound ? "#e85f5c" : "#77d1c8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, player.w * 0.82, player.h * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34 + player.pressure * 34);
  glow.addColorStop(0, player.rebound ? "rgba(232, 95, 92, 0.52)" : "rgba(240, 200, 95, 0.46)");
  glow.addColorStop(1, "rgba(240, 200, 95, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 34 + player.pressure * 34, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = player.inside ? "#77d1c8" : player.rebound ? "#f0c85f" : "#f4f0df";
  roundRect(x, y, player.w, player.h, 7);
  ctx.fill();
  ctx.fillStyle = "#111820";
  ctx.fillRect(cx + player.face * 4, y + 10, 4, 4);
  ctx.fillStyle = player.permeating ? "#77d1c8" : "#d96042";
  ctx.fillRect(x + 5, y + player.h - 8, player.w - 10, 4);
  ctx.restore();
}

function drawOverlay() {
  const depth = clamp(player.depth / 58, 0, 1);
  if (depth <= 0 && player.unsafe <= 0) return;

  ctx.save();
  ctx.globalAlpha = depth * 0.25 + player.unsafe * 0.18;
  ctx.fillStyle = player.unsafe > 1 ? "#e85f5c" : "#77d1c8";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function render() {
  ctx.save();
  const sx = shake ? (Math.random() - 0.5) * shake : 0;
  const sy = shake ? (Math.random() - 0.5) * shake : 0;
  ctx.translate(sx, sy);

  drawBackground();
  drawGoal();
  drawTerrain();
  drawHints();
  drawParticles();
  drawPlayer();
  drawOverlay();

  ctx.restore();
}

function tick(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  updatePlayer(dt);
  updateParticles(dt);
  updateCamera(dt);
  setHud();
  render();

  requestAnimationFrame(tick);
}

window.addEventListener("keydown", (event) => {
  keys.set(event.code, true);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "KeyR") resetPlayer("reset to the first platform");
});

window.addEventListener("keyup", (event) => {
  keys.set(event.code, false);
});

window.addEventListener("blur", () => {
  keys.clear();
});

requestAnimationFrame(tick);
