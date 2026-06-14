/*
 * Headless smoke test for Sneaky Bigfoot.
 *
 * game.js is a browser game, so this stubs the minimal DOM/Canvas surface it
 * touches, then drives the real game loop for a couple hundred frames while
 * firing inputs (move, grab, disguise, eat, sprint, sneak). Any runtime error
 * in startup, update, or the render path throws and fails the test.
 *
 * Run with: node test/smoke-test.js
 */

"use strict";

const path = require("path");

function makeEl() {
  const handlers = {};
  return {
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, fn) {
      (handlers[type] || (handlers[type] = [])).push(fn);
    },
    _fire(type) {
      (handlers[type] || []).forEach((f) => f({ preventDefault() {} }));
    },
    appendChild() {},
    remove() {},
    set textContent(_v) {},
    set innerHTML(_v) {},
    getContext() {
      return ctxStub;
    },
    width: 960,
    height: 600,
  };
}

// Canvas 2D context stub: every method is a no-op except measureText.
const ctxStub = new Proxy(
  {},
  {
    get(_t, prop) {
      if (prop === "measureText") return () => ({ width: 10 });
      if (prop === "canvas") return { width: 960, height: 600 };
      return () => {};
    },
  }
);

const elements = {};
global.document = {
  getElementById(id) {
    return elements[id] || (elements[id] = makeEl());
  },
  createElement() {
    return makeEl();
  },
};

const winHandlers = {};
global.window = {
  addEventListener(type, fn) {
    (winHandlers[type] || (winHandlers[type] = [])).push(fn);
  },
};

global.performance = { now: () => Date.now() };

let frameCb = null;
global.requestAnimationFrame = (fn) => {
  frameCb = fn;
};

function key(k, down) {
  const list = winHandlers[down ? "keydown" : "keyup"] || [];
  list.forEach((f) => f({ key: k, preventDefault() {} }));
}

try {
  require(path.join(__dirname, "..", "game.js"));

  // Start the game via the start button handler.
  elements["start-btn"]._fire("click");

  // Drive frames with a scripted input sequence.
  key("w", true);
  key("e", true);
  let t = performance.now();
  for (let i = 0; i < 200; i++) {
    t += 16;
    if (frameCb) {
      const cb = frameCb;
      frameCb = null;
      cb(t);
    }
    if (i === 20) { key("e", false); key("q", true); }
    if (i === 40) { key("q", false); key("f", true); }
    if (i === 60) { key("f", false); key("x", true); }
    if (i === 120) { key("shift", true); }
  }

  console.log("PASS: 200 gameplay frames (startup + update + render) ran with no runtime errors.");
  process.exit(0);
} catch (err) {
  console.error("FAIL: runtime error while running the game.");
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
