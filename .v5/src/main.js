(function () {
  "use strict";

  var api = window.PermeationGame;
  var canvas = document.getElementById("game");
  var game = new api.Game();
  var renderer = new api.Renderer(canvas, game);
  var stateEl = document.getElementById("state");
  var depthEl = document.getElementById("depth");
  var assistEl = document.getElementById("assist");
  var bannerEl = document.getElementById("banner");
  var last = performance.now();

  canvas.tabIndex = 0;
  canvas.focus();

  var keyMap = {
    ArrowLeft: api.KEYS.LEFT,
    KeyA: api.KEYS.LEFT,
    ArrowRight: api.KEYS.RIGHT,
    KeyD: api.KEYS.RIGHT,
    Space: api.KEYS.JUMP,
    ShiftLeft: api.KEYS.PERMEATE,
    ShiftRight: api.KEYS.PERMEATE,
    ControlLeft: api.KEYS.ASSIST,
    ControlRight: api.KEYS.ASSIST,
    KeyR: api.KEYS.RESET
  };

  function setKey(event, down) {
    var mapped = keyMap[event.code];
    if (!mapped) return;
    event.preventDefault();
    game.press(mapped, down);
  }

  window.addEventListener("keydown", function (event) {
    if (event.repeat && event.code !== "Space") return;
    setKey(event, true);
  });
  window.addEventListener("keyup", function (event) {
    setKey(event, false);
  });

  window.addEventListener("blur", function () {
    game.setInput({
      left: false,
      right: false,
      jump: false,
      permeate: false,
      assist: false
    });
  });

  function updateHud() {
    var snapshot = game.snapshot();
    stateEl.textContent = snapshot.state;
    depthEl.style.width = Math.round(snapshot.depthRatio * 100) + "%";
    assistEl.textContent = game.input[api.KEYS.ASSIST] && game.input[api.KEYS.PERMEATE] ? "On" : "Off";

    if (snapshot.banner) {
      bannerEl.hidden = false;
      bannerEl.textContent = snapshot.banner;
    } else {
      bannerEl.hidden = true;
      bannerEl.textContent = "";
    }
  }

  function frame(now) {
    var dt = (now - last) / 1000;
    last = now;
    game.update(dt);
    renderer.draw(dt);
    updateHud();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
