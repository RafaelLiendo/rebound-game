(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.PermeationGame = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var STATE = {
    SOLID: "Solid",
    PERMEATING: "Permeating",
    REBOUNDING: "Rebounding",
    STUCK: "Stuck",
    WON: "Won"
  };

  var KEYS = {
    LEFT: "left",
    RIGHT: "right",
    JUMP: "jump",
    PERMEATE: "permeate",
    ASSIST: "assist",
    RESET: "reset"
  };

  var DEFAULTS = {
    width: 960,
    height: 540,
    gravity: 1750,
    solidAccel: 2600,
    solidMaxSpeed: 260,
    airAccel: 1750,
    friction: 0.84,
    jumpSpeed: 600,
    shortHopCut: 0.48,
    coyoteTime: 0.1,
    jumpBuffer: 0.11,
    permeateAccel: 840,
    permeateMaxSpeed: 128,
    materialSinkSpeed: 92,
    materialDamping: 0.88,
    reboundMinDepth: 13,
    reboundAutoDepth: 17,
    reboundBaseAccel: 2150,
    reboundDepthAccel: 38,
    reboundMaxSpeed: 470,
    reboundSurfaceCarry: 0.98,
    maxEscapeScan: 420,
    stuckRecoverTime: 0.75
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function approach(value, target, amount) {
    if (value < target) return Math.min(value + amount, target);
    if (value > target) return Math.max(value - amount, target);
    return value;
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function cloneRect(rect) {
    return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  }

  function makeSolid(id, x, y, w, h, kind) {
    return { id: id, x: x, y: y, w: w, h: h, kind: kind || "stone" };
  }

  function createMainLevel() {
    return {
      spawn: { x: 110, y: 298 },
      goal: { x: 850, y: 178, w: 48, h: 68 },
      solids: [
        makeSolid("left-floor", 30, 440, 245, 34, "grass"),
        makeSolid("thin-discovery", 86, 350, 218, 22, "thin"),
        makeSolid("lower-step", 278, 422, 92, 32, "grass"),
        makeSolid("deep-mass", 340, 388, 228, 150, "dense"),
        makeSolid("catch-ledge", 580, 330, 170, 28, "grass"),
        makeSolid("chain-one", 688, 406, 158, 30, "dense"),
        makeSolid("chain-two", 700, 354, 158, 30, "dense"),
        makeSolid("chain-three", 712, 302, 158, 30, "dense"),
        makeSolid("final-ledge", 756, 246, 160, 28, "grass"),
        makeSolid("stuck-well-left", 170, 214, 28, 136, "dense"),
        makeSolid("stuck-well-right", 282, 214, 28, 136, "dense"),
        makeSolid("stuck-well-cap", 170, 196, 140, 28, "dense"),
        makeSolid("stuck-well-floor", 198, 322, 84, 28, "dense")
      ]
    };
  }

  function createStackTestLevel() {
    return {
      spawn: { x: 150, y: 426 },
      goal: { x: 152, y: 166, w: 44, h: 54 },
      solids: [
        makeSolid("stack-0", 96, 448, 150, 28, "dense"),
        makeSolid("stack-1", 96, 396, 150, 28, "dense"),
        makeSolid("stack-2", 96, 344, 150, 28, "dense"),
        makeSolid("stack-3", 96, 292, 150, 28, "dense"),
        makeSolid("stack-4", 96, 240, 150, 28, "dense")
      ]
    };
  }

  function createManualQueueTestLevel() {
    return {
      spawn: { x: 128, y: 270 },
      goal: { x: 470, y: 40, w: 44, h: 54 },
      solids: [
        makeSolid("launch", 80, 342, 170, 150, "dense"),
        makeSolid("upper", 118, 150, 170, 30, "dense")
      ]
    };
  }

  function inputTemplate() {
    var input = {};
    input[KEYS.LEFT] = false;
    input[KEYS.RIGHT] = false;
    input[KEYS.JUMP] = false;
    input[KEYS.PERMEATE] = false;
    input[KEYS.ASSIST] = false;
    input[KEYS.RESET] = false;
    return input;
  }

  function Game(options) {
    options = options || {};
    this.config = Object.assign({}, DEFAULTS, options.config || {});
    this.levelFactory = options.levelFactory || createMainLevel;
    this.level = this.levelFactory();
    this.input = inputTemplate();
    this.prevInput = inputTemplate();
    this.reset();
  }

  Game.prototype.reset = function () {
    this.level = this.levelFactory();
    this.player = {
      x: this.level.spawn.x,
      y: this.level.spawn.y,
      w: 28,
      h: 40,
      vx: 0,
      vy: 0,
      grounded: false
    };
    this.state = STATE.SOLID;
    this.previousState = STATE.SOLID;
    this.lastSafe = { x: this.player.x, y: this.player.y };
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.reboundAge = 0;
    this.reboundDepth = 0;
    this.reboundAccel = 0;
    this.queuePermeate = false;
    this.releasePendingSolid = false;
    this.quickReleaseRebound = false;
    this.autoCooldown = 0;
    this.stuckTimer = 0;
    this.banner = "";
    this.bannerTimer = 0;
    this.touchedSolids = {};
    this.depthRatio = 0;
    this.winTimer = 0;
  };

  Game.prototype.setInput = function (nextInput) {
    for (var key in nextInput) {
      if (Object.prototype.hasOwnProperty.call(this.input, key)) {
        this.input[key] = !!nextInput[key];
      }
    }
  };

  Game.prototype.press = function (key, down) {
    if (Object.prototype.hasOwnProperty.call(this.input, key)) {
      this.input[key] = down !== false;
    }
  };

  Game.prototype.wasPressed = function (key) {
    return this.input[key] && !this.prevInput[key];
  };

  Game.prototype.wasReleased = function (key) {
    return !this.input[key] && this.prevInput[key];
  };

  Game.prototype.playerRectAt = function (x, y) {
    return { x: x, y: y, w: this.player.w, h: this.player.h };
  };

  Game.prototype.currentRect = function () {
    return this.playerRectAt(this.player.x, this.player.y);
  };

  Game.prototype.overlappingSolids = function (rect) {
    var hits = [];
    for (var i = 0; i < this.level.solids.length; i += 1) {
      if (rectsOverlap(rect, this.level.solids[i])) hits.push(this.level.solids[i]);
    }
    return hits;
  };

  Game.prototype.isClearAt = function (x, y) {
    return this.overlappingSolids(this.playerRectAt(x, y)).length === 0;
  };

  Game.prototype.embeddedInfo = function (rect) {
    rect = rect || this.currentRect();
    var hits = this.overlappingSolids(rect);
    var lowerY = rect.y + rect.h * 0.55;
    var upperY = rect.y + rect.h * 0.45;
    var lowerEmbedded = false;
    var upperEmbedded = false;
    var depth = 0;
    var maxSolidHeight = 1;

    for (var i = 0; i < hits.length; i += 1) {
      var solid = hits[i];
      this.touchedSolids[solid.id] = true;
      var overlapTop = Math.max(rect.y, solid.y);
      var overlapBottom = Math.min(rect.y + rect.h, solid.y + solid.h);
      var overlapH = Math.max(0, overlapBottom - overlapTop);
      if (overlapBottom > lowerY) lowerEmbedded = true;
      if (overlapTop < upperY) upperEmbedded = true;
      if (rect.y + rect.h > solid.y && rect.y < solid.y + solid.h) {
        depth = Math.max(depth, clamp(rect.y + rect.h - solid.y, 0, solid.h + rect.h));
        maxSolidHeight = Math.max(maxSolidHeight, solid.h);
      } else {
        depth = Math.max(depth, overlapH);
      }
    }

    return {
      hits: hits,
      inside: hits.length > 0,
      lowerEmbedded: lowerEmbedded,
      upperEmbedded: upperEmbedded,
      upperOnly: hits.length > 0 && upperEmbedded && !lowerEmbedded,
      depth: depth,
      depthRatio: clamp(depth / Math.max(1, maxSolidHeight), 0, 1)
    };
  };

  Game.prototype.hasUpwardEscape = function () {
    var startX = this.player.x;
    var startY = this.player.y;
    var maxScan = this.config.maxEscapeScan;
    for (var dy = 0; dy <= maxScan; dy += 8) {
      if (this.isClearAt(startX, startY - dy)) return true;
    }
    return false;
  };

  Game.prototype.changeState = function (nextState) {
    if (this.state === nextState) return;
    this.previousState = this.state;
    this.state = nextState;
  };

  Game.prototype.startPermeating = function () {
    this.releasePendingSolid = false;
    this.quickReleaseRebound = this.player.grounded || !this.isClearAt(this.player.x, this.player.y + 4);
    this.queuePermeate = false;
    this.changeState(STATE.PERMEATING);
  };

  Game.prototype.startRebound = function (info, queuedByAssist) {
    this.reboundAge = 0;
    this.reboundDepth = Math.max(this.config.reboundMinDepth, info.depth);
    this.reboundAccel =
      this.config.reboundBaseAccel + this.config.reboundDepthAccel * this.reboundDepth;
    var initialKick = clamp(85 + this.reboundDepth * 3.5, 130, 260);
    this.player.vy = Math.min(this.player.vy, -initialKick);
    this.queuePermeate = !!queuedByAssist;
    this.releasePendingSolid = false;
    this.quickReleaseRebound = false;
    this.autoCooldown = 0.16;
    this.changeState(STATE.REBOUNDING);
  };

  Game.prototype.enterStuck = function () {
    this.changeState(STATE.STUCK);
    this.stuckTimer = 0;
    this.player.vx = 0;
    this.player.vy = 0;
    this.banner = "No upward escape";
    this.bannerTimer = this.config.stuckRecoverTime;
  };

  Game.prototype.recoverFromStuck = function () {
    this.player.x = this.lastSafe.x;
    this.player.y = this.lastSafe.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.releasePendingSolid = false;
    this.quickReleaseRebound = false;
    this.queuePermeate = false;
    this.autoCooldown = 0;
    this.changeState(STATE.SOLID);
  };

  Game.prototype.win = function () {
    if (this.state !== STATE.WON) {
      this.changeState(STATE.WON);
      this.banner = "Clear";
      this.bannerTimer = 99;
      this.player.vx *= 0.4;
      this.player.vy *= 0.4;
    }
  };

  Game.prototype.update = function (dt) {
    dt = Math.min(dt, 1 / 30);

    if (this.wasPressed(KEYS.RESET)) {
      this.reset();
      this.prevInput = Object.assign({}, this.input);
      return;
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer === 0 && this.state !== STATE.WON) this.banner = "";
    }

    if (this.state !== STATE.WON) {
      if (this.wasPressed(KEYS.JUMP)) this.jumpBuffer = this.config.jumpBuffer;
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.autoCooldown = Math.max(0, this.autoCooldown - dt);

      if (this.state === STATE.SOLID) this.updateSolid(dt);
      else if (this.state === STATE.PERMEATING) this.updatePermeating(dt);
      else if (this.state === STATE.REBOUNDING) this.updateRebounding(dt);
      else if (this.state === STATE.STUCK) this.updateStuck(dt);

      this.checkGoal();
    } else {
      this.winTimer += dt;
      this.player.vx = approach(this.player.vx, 0, 700 * dt);
      this.player.vy = approach(this.player.vy, 0, 700 * dt);
    }

    this.depthRatio = this.embeddedInfo().depthRatio;
    this.prevInput = Object.assign({}, this.input);
  };

  Game.prototype.applyHorizontal = function (dt, accel, maxSpeed) {
    var dir = (this.input[KEYS.RIGHT] ? 1 : 0) - (this.input[KEYS.LEFT] ? 1 : 0);
    if (dir !== 0) {
      this.player.vx = approach(this.player.vx, dir * maxSpeed, accel * dt);
    } else if (this.player.grounded && this.state === STATE.SOLID) {
      this.player.vx *= Math.pow(this.config.friction, dt * 60);
      if (Math.abs(this.player.vx) < 4) this.player.vx = 0;
    } else {
      this.player.vx = approach(this.player.vx, 0, accel * 0.22 * dt);
    }
  };

  Game.prototype.updateSolid = function (dt) {
    if (this.input[KEYS.PERMEATE]) {
      this.startPermeating();
      this.prevInput = Object.assign({}, this.input);
      return;
    }

    this.applyHorizontal(
      dt,
      this.player.grounded ? this.config.solidAccel : this.config.airAccel,
      this.config.solidMaxSpeed
    );

    if (this.player.grounded) this.coyote = this.config.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.player.vy = -this.config.jumpSpeed;
      this.player.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
    }

    if (this.wasReleased(KEYS.JUMP) && this.player.vy < 0) {
      this.player.vy *= this.config.shortHopCut;
    }

    this.player.vy += this.config.gravity * dt;
    this.moveAndCollide(dt);

    if (this.player.grounded && this.overlappingSolids(this.currentRect()).length === 0) {
      this.lastSafe = { x: this.player.x, y: this.player.y };
    }
  };

  Game.prototype.updatePermeating = function (dt) {
    var info = this.embeddedInfo();
    var assistActive = this.input[KEYS.PERMEATE] && this.input[KEYS.ASSIST];
    var wantsAutoRebound =
      assistActive &&
      !this.releasePendingSolid &&
      this.autoCooldown <= 0 &&
      info.lowerEmbedded &&
      info.depth >= this.config.reboundAutoDepth;

    if (wantsAutoRebound) {
      if (this.hasUpwardEscape()) this.startRebound(info, true);
      else this.enterStuck();
      return;
    }

    if (!this.input[KEYS.PERMEATE] && !this.releasePendingSolid) {
      if (!info.inside) {
        if (this.quickReleaseRebound) {
          this.releasePendingSolid = true;
        } else {
          this.changeState(STATE.SOLID);
          return;
        }
      }
      if (
        !this.releasePendingSolid &&
        info.lowerEmbedded &&
        info.depth >= this.config.reboundMinDepth
      ) {
        if (this.hasUpwardEscape()) this.startRebound(info, false);
        else this.enterStuck();
        return;
      }
      if (!this.releasePendingSolid) this.releasePendingSolid = true;
    }

    if (
      this.releasePendingSolid &&
      info.lowerEmbedded &&
      info.depth >= this.config.reboundMinDepth
    ) {
      if (this.hasUpwardEscape()) this.startRebound(info, false);
      else this.enterStuck();
      return;
    }

    if (this.releasePendingSolid && !this.quickReleaseRebound && !info.inside) {
      this.quickReleaseRebound = false;
      this.changeState(STATE.SOLID);
      return;
    }

    var accel = info.inside ? this.config.permeateAccel : this.config.airAccel * 0.8;
    var maxSpeed = info.inside ? this.config.permeateMaxSpeed : this.config.solidMaxSpeed;
    this.applyHorizontal(dt, accel, maxSpeed);

    if (info.inside) {
      this.player.vx *= Math.pow(this.config.materialDamping, dt * 60);
      this.player.vy = approach(
        this.player.vy,
        this.config.materialSinkSpeed,
        (this.config.gravity * 0.7 + info.depth * 9) * dt
      );
    } else {
      this.player.vy += this.config.gravity * 0.7 * dt;
    }

    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;
    this.player.grounded = false;
  };

  Game.prototype.updateRebounding = function (dt) {
    this.reboundAge += dt;
    var info = this.embeddedInfo();
    var autoStillHeld = this.input[KEYS.PERMEATE] && this.input[KEYS.ASSIST];

    if (this.input[KEYS.PERMEATE]) {
      this.queuePermeate = true;
    }
    if (!autoStillHeld && this.prevInput[KEYS.ASSIST] && !this.input[KEYS.ASSIST]) {
      this.queuePermeate = false;
    }

    this.applyHorizontal(dt, this.config.airAccel, this.config.solidMaxSpeed);

    if (info.inside) {
      var build = clamp(this.reboundAge / 0.26, 0.18, 1);
      this.player.vy -= this.reboundAccel * build * dt;
      this.player.vy = Math.max(this.player.vy, -this.config.reboundMaxSpeed);
      this.player.vx *= Math.pow(0.94, dt * 60);
    } else {
      this.player.vy += this.config.gravity * 0.42 * dt;
    }

    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;

    var nowInfo = this.embeddedInfo();
    if (!nowInfo.inside) {
      this.player.vy *= this.config.reboundSurfaceCarry;
      if (this.queuePermeate && this.input[KEYS.PERMEATE]) {
        this.startPermeating();
        this.autoCooldown = 0.08;
      } else {
        this.queuePermeate = false;
        this.changeState(STATE.SOLID);
      }
      return;
    }

    if (this.reboundAge > 1.2 && !this.hasUpwardEscape()) {
      this.enterStuck();
    }
  };

  Game.prototype.updateStuck = function (dt) {
    this.stuckTimer += dt;
    if (this.stuckTimer >= this.config.stuckRecoverTime) this.recoverFromStuck();
  };

  Game.prototype.moveAndCollide = function (dt) {
    var player = this.player;
    player.grounded = false;

    player.x += player.vx * dt;
    this.resolveAxis("x");

    player.y += player.vy * dt;
    this.resolveAxis("y");

    if (player.y > this.config.height + 80) {
      this.player.x = this.lastSafe.x;
      this.player.y = this.lastSafe.y;
      this.player.vx = 0;
      this.player.vy = 0;
    }
  };

  Game.prototype.resolveAxis = function (axis) {
    var player = this.player;
    var rect = this.currentRect();
    var hits = this.overlappingSolids(rect);
    for (var i = 0; i < hits.length; i += 1) {
      var solid = hits[i];
      if (axis === "x") {
        if (player.vx > 0) player.x = solid.x - player.w;
        else if (player.vx < 0) player.x = solid.x + solid.w;
        player.vx = 0;
      } else {
        if (player.vy > 0) {
          player.y = solid.y - player.h;
          player.grounded = true;
        } else if (player.vy < 0) {
          player.y = solid.y + solid.h;
        }
        player.vy = 0;
      }
      rect = this.currentRect();
    }
  };

  Game.prototype.checkGoal = function () {
    if (rectsOverlap(this.currentRect(), this.level.goal)) this.win();
  };

  Game.prototype.snapshot = function () {
    return {
      state: this.state,
      player: Object.assign({}, this.player),
      depthRatio: this.depthRatio,
      touchedSolids: Object.assign({}, this.touchedSolids),
      banner: this.banner,
      queuePermeate: this.queuePermeate,
      releasePendingSolid: this.releasePendingSolid
    };
  };

  function drawRoundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function Renderer(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.pulse = 0;
  }

  Renderer.prototype.draw = function (dt) {
    this.pulse += dt;
    var ctx = this.ctx;
    var game = this.game;
    var w = game.config.width;
    var h = game.config.height;

    ctx.clearRect(0, 0, w, h);
    this.drawBackdrop(ctx, w, h);
    this.drawSolids(ctx, game.level.solids);
    this.drawGoal(ctx, game.level.goal);
    this.drawPlayer(ctx, game.player, game.state, game.depthRatio);
    this.drawWorldLabels(ctx);
  };

  Renderer.prototype.drawBackdrop = function (ctx, w, h) {
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#202c35");
    sky.addColorStop(0.5, "#182127");
    sky.addColorStop(1, "#11161b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.035)";
    for (var x = 0; x < w; x += 48) ctx.fillRect(x, 0, 1, h);
    for (var y = 36; y < h; y += 48) ctx.fillRect(0, y, w, 1);

    ctx.fillStyle = "rgba(105, 190, 177, 0.08)";
    ctx.fillRect(0, 360, w, 180);
    ctx.fillStyle = "rgba(241, 204, 105, 0.06)";
    ctx.fillRect(0, 118, w, 90);
  };

  Renderer.prototype.drawSolids = function (ctx, solids) {
    for (var i = 0; i < solids.length; i += 1) {
      var solid = solids[i];
      var dense = solid.kind === "dense";
      var thin = solid.kind === "thin";
      ctx.save();
      var grad = ctx.createLinearGradient(solid.x, solid.y, solid.x, solid.y + solid.h);
      if (dense) {
        grad.addColorStop(0, "#6b5d84");
        grad.addColorStop(1, "#3d4f62");
      } else if (thin) {
        grad.addColorStop(0, "#64b8ab");
        grad.addColorStop(1, "#3f7777");
      } else {
        grad.addColorStop(0, "#7aa56d");
        grad.addColorStop(1, "#425b4e");
      }
      drawRoundedRect(ctx, solid.x, solid.y, solid.w, solid.h, 4);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.rect(solid.x, solid.y, solid.w, solid.h);
      ctx.clip();
      ctx.strokeStyle = dense ? "rgba(239, 207, 103, 0.17)" : "rgba(255,255,255,0.11)";
      ctx.lineWidth = 2;
      for (var d = -solid.h; d < solid.w; d += 18) {
        ctx.beginPath();
        ctx.moveTo(solid.x + d, solid.y + solid.h);
        ctx.lineTo(solid.x + d + solid.h, solid.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  Renderer.prototype.drawGoal = function (ctx, goal) {
    var t = this.pulse;
    var cx = goal.x + goal.w / 2;
    var cy = goal.y + goal.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 0.9);
    ctx.strokeStyle = "#f1d36c";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.rect(-goal.w * 0.34, -goal.w * 0.34, goal.w * 0.68, goal.w * 0.68);
    ctx.stroke();
    ctx.rotate(-t * 1.7);
    ctx.strokeStyle = "rgba(104, 218, 209, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, goal.w * 0.42 + Math.sin(t * 4) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  Renderer.prototype.drawPlayer = function (ctx, p, state, depthRatio) {
    ctx.save();
    var color = "#f4f1e6";
    var stroke = "#1f262b";
    var alpha = 1;
    if (state === STATE.PERMEATING) {
      color = "#68dad1";
      stroke = "#d9fffa";
      alpha = 0.58;
    } else if (state === STATE.REBOUNDING) {
      color = "#ffd36e";
      stroke = "#fff6cb";
    } else if (state === STATE.STUCK) {
      color = "#ff806d";
      stroke = "#ffe0d9";
    } else if (state === STATE.WON) {
      color = "#f9ffe8";
      stroke = "#f1d36c";
    }

    if (state === STATE.REBOUNDING) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#ffd36e";
      drawRoundedRect(ctx, p.x - 8, p.y + 24, p.w + 16, 34, 15);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.globalAlpha = alpha;
    drawRoundedRect(ctx, p.x, p.y, p.w, p.h, 8);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "rgba(24, 28, 34, 0.72)";
    ctx.fillRect(p.x + 7, p.y + 11, 5, 5);
    ctx.fillRect(p.x + p.w - 12, p.y + 11, 5, 5);

    if (state === STATE.PERMEATING || state === STATE.REBOUNDING) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = state === STATE.PERMEATING ? "#68dad1" : "#ffd36e";
      ctx.fillRect(p.x - 6, p.y + p.h - depthRatio * p.h, 3, depthRatio * p.h);
      ctx.fillRect(p.x + p.w + 3, p.y + p.h - depthRatio * p.h, 3, depthRatio * p.h);
    }
    ctx.restore();
  };

  Renderer.prototype.drawWorldLabels = function (ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(239,245,240,0.62)";
    ctx.font = "700 11px Inter, system-ui, sans-serif";
    ctx.fillText("sink", 124, 344);
    ctx.fillText("dive", 402, 382);
    ctx.fillText("chain", 716, 384);
    ctx.restore();
  };

  return {
    Game: Game,
    Renderer: Renderer,
    STATE: STATE,
    KEYS: KEYS,
    rectsOverlap: rectsOverlap,
    cloneRect: cloneRect,
    createMainLevel: createMainLevel,
    createStackTestLevel: createStackTestLevel,
    createManualQueueTestLevel: createManualQueueTestLevel
  };
});
