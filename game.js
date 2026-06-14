/* =====================================================================
   SNEAKY BIGFOOT
   A top-down stealth life-sim in the spirit of Sneaky Sasquatch.
   Play as Papa Bigfoot: sneak the campground, swipe food, dodge the
   ranger, earn coins, and bring dinner home to your kids.
   ===================================================================== */

(() => {
  "use strict";

  // ---------- Canvas / constants ----------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const VIEW_W = canvas.width;
  const VIEW_H = canvas.height;

  const WORLD_W = 1920;
  const WORLD_H = 1440;

  const TILE = 48;

  const SPEED_WALK = 2.6;
  const SPEED_SNEAK = 1.35;
  const SPEED_RUN = 3.7;

  const MAX_CARRY = 6;
  const DAY_LENGTH = 120; // seconds of real time per in-game day

  // ---------- Game state ----------
  const State = {
    MENU: "menu",
    PLAY: "play",
    END: "end",
  };
  let state = State.MENU;

  // ---------- Input ----------
  const keys = {};
  const pressed = {}; // single-fire edge detection
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
      e.preventDefault();
    }
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  function consumePress(k) {
    if (pressed[k]) {
      pressed[k] = false;
      return true;
    }
    return false;
  }

  // ---------- World geometry ----------
  // Solid obstacles (AABB). Trees are added programmatically.
  const obstacles = [];
  function addObstacle(x, y, w, h, type) {
    obstacles.push({ x, y, w, h, type });
  }

  // Decorative + interactive zones populated below.
  const trees = [];
  const tents = [];
  const buildings = [];
  let foodSpawns = []; // {x,y,kind,taken,respawnAt}
  let droppedDecor = [];

  // Interaction points
  let den, store, laundry;

  // ---------- Food kinds ----------
  const FOOD = {
    berries:     { name: "Berries",      emoji: "🫐", hunger: 8,  sell: 3,  color: "#5b3a8c" },
    sandwich:    { name: "Sandwich",     emoji: "🥪", hunger: 18, sell: 6,  color: "#d9a05b" },
    hotdog:      { name: "Hot Dog",      emoji: "🌭", hunger: 16, sell: 5,  color: "#c1440e" },
    marshmallow: { name: "Marshmallow",  emoji: "🍢", hunger: 6,  sell: 2,  color: "#f5f0e1" },
    fish:        { name: "Fresh Fish",   emoji: "🐟", hunger: 22, sell: 9,  color: "#6fa8c7" },
    pie:         { name: "Camp Pie",     emoji: "🥧", hunger: 26, sell: 12, color: "#e8b24a" },
    corn:        { name: "Roast Corn",   emoji: "🌽", hunger: 12, sell: 4,  color: "#f1c40f" },
  };
  const FOOD_KEYS = Object.keys(FOOD);

  // ---------- Entities ----------
  const player = {
    x: 0, y: 0, w: 34, h: 40,
    dir: { x: 0, y: 1 },
    hunger: 100,
    energy: 100,
    suspicion: 0,
    coins: 0,
    backpack: [], // array of food keys
    disguised: false,
    caughtFlash: 0,
    step: 0,
  };

  const rangers = [];
  const kids = [];

  // ---------- Time ----------
  let dayTime = 8 * 60; // minutes since midnight, start 08:00
  let day = 1;

  // ---------- Camera ----------
  const cam = { x: 0, y: 0 };

  // ---------- Toast messages ----------
  const tickerEl = document.getElementById("ticker");
  function toast(msg, ms = 2200) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    tickerEl.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity 0.4s";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 400);
    }, ms);
  }

  // ---------- World setup ----------
  function buildWorld() {
    obstacles.length = 0;
    trees.length = 0;
    tents.length = 0;
    buildings.length = 0;
    droppedDecor.length = 0;

    // --- Den (home) top-left ---
    den = { x: 140, y: 150, w: 230, h: 170 };
    // den rock walls (obstacles around the cave, leaving an entrance)
    addObstacle(den.x - 24, den.y - 24, den.w + 48, 24, "rock"); // top
    addObstacle(den.x - 24, den.y - 24, 24, den.h + 48, "rock"); // left
    addObstacle(den.x + den.w, den.y - 24, 24, den.h + 48, "rock"); // right
    // bottom wall has a gap (entrance) in the middle
    addObstacle(den.x - 24, den.y + den.h, 80, 24, "rock");
    addObstacle(den.x + den.w - 56, den.y + den.h, 80, 24, "rock");

    // --- General store (right side) ---
    store = { x: 1480, y: 240, w: 200, h: 150 };
    buildings.push({ ...store, label: "🏪 General Store", color: "#8d5524" });
    addObstacle(store.x, store.y, store.w, 110, "wall"); // building body, door at bottom

    // --- Laundry line (disguise) center-left ---
    laundry = { x: 470, y: 760, w: 120, h: 40 };

    // --- Tents / campsites ---
    const campSites = [
      { x: 760, y: 250 },
      { x: 1050, y: 420 },
      { x: 820, y: 620 },
      { x: 1180, y: 760 },
      { x: 600, y: 480 },
      { x: 1320, y: 560 },
    ];
    campSites.forEach((c) => {
      tents.push({ x: c.x, y: c.y, w: 90, h: 70 });
      addObstacle(c.x + 8, c.y + 24, 74, 40, "tent"); // tent body solid
      // picnic table beside the tent (holds food)
      const table = { x: c.x + 110, y: c.y + 10, w: 70, h: 46 };
      addObstacle(table.x, table.y, table.w, table.h, "table");
      tents[tents.length - 1].table = table;
    });

    // --- Lake (bottom center) ---
    const lake = { x: 700, y: 1080, w: 520, h: 280 };
    addObstacle(lake.x, lake.y, lake.w, lake.h, "water");
    obstacles[obstacles.length - 1].lake = true;

    // --- Trees scattered as cover / obstacles ---
    const rng = mulberry32(1337);
    let placed = 0;
    let attempts = 0;
    while (placed < 90 && attempts < 1200) {
      attempts++;
      const tx = 60 + rng() * (WORLD_W - 120);
      const ty = 60 + rng() * (WORLD_H - 120);
      const r = 16;
      const box = { x: tx - r, y: ty - 6, w: r * 2, h: 16 };
      // keep clear of key zones
      if (rectsOverlap(box, expand(den, 60))) continue;
      if (rectsOverlap(box, expand(store, 50))) continue;
      if (rectsOverlap(box, expand(lake, 30))) continue;
      let blocked = false;
      for (const t of tents) {
        if (rectsOverlap(box, expand({ ...t, w: 200 }, 30))) { blocked = true; break; }
      }
      if (blocked) continue;
      // avoid stacking trees
      let tooClose = false;
      for (const tr of trees) {
        if (Math.hypot(tr.x - tx, tr.y - ty) < 70) { tooClose = true; break; }
      }
      if (tooClose) continue;
      trees.push({ x: tx, y: ty, r });
      addObstacle(box.x, box.y, box.w, box.h, "tree");
      placed++;
    }

    // --- Food spawns: on picnic tables + berry bushes near trees ---
    foodSpawns = [];
    tents.forEach((t, i) => {
      const tableFoods = ["sandwich", "hotdog", "pie", "marshmallow", "corn", "fish"];
      const kind = tableFoods[i % tableFoods.length];
      foodSpawns.push({
        x: t.table.x + t.table.w / 2,
        y: t.table.y + t.table.h / 2,
        kind, taken: false, respawnAt: 0, onTable: true,
      });
    });
    // berry bushes
    for (let i = 0; i < 10; i++) {
      const tr = trees[Math.floor(rng() * trees.length)];
      foodSpawns.push({
        x: tr.x + (rng() * 40 - 20),
        y: tr.y + 26,
        kind: "berries", taken: false, respawnAt: 0, onTable: false,
      });
    }
  }

  function spawnEntities() {
    // Player starts at den entrance
    player.x = den.x + den.w / 2 - player.w / 2;
    player.y = den.y + den.h + 30;
    player.hunger = 100;
    player.energy = 100;
    player.suspicion = 0;
    player.coins = 0;
    player.backpack = [];
    player.disguised = false;

    // Kids inside the den
    kids.length = 0;
    const kidNames = ["Mossy", "Pebble", "Fern"];
    kidNames.forEach((name, i) => {
      kids.push({
        name,
        x: den.x + 40 + i * 65,
        y: den.y + 60 + (i % 2) * 40,
        fed: 35 + Math.random() * 15,
        bob: Math.random() * Math.PI * 2,
      });
    });

    // Rangers with patrol routes
    rangers.length = 0;
    rangers.push(makeRanger([
      { x: 760, y: 360 }, { x: 1100, y: 360 },
      { x: 1100, y: 700 }, { x: 760, y: 700 },
    ]));
    rangers.push(makeRanger([
      { x: 1480, y: 460 }, { x: 1480, y: 800 },
      { x: 1180, y: 900 }, { x: 1480, y: 460 },
    ]));

    dayTime = 8 * 60;
    day = 1;
  }

  function makeRanger(route) {
    return {
      x: route[0].x, y: route[0].y, w: 30, h: 40,
      route, target: 1,
      dir: { x: 0, y: 1 },
      speed: 1.5,
      alert: 0, // 0..1 personal alert, drives the cone color
      step: 0,
    };
  }

  // ---------- Math helpers ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function expand(r, m) {
    return { x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 };
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  // ---------- Movement & collision ----------
  function moveWithCollision(ent, dx, dy) {
    // axis-separated resolution
    ent.x += dx;
    for (const o of obstacles) {
      const box = { x: ent.x, y: ent.y, w: ent.w, h: ent.h };
      if (rectsOverlap(box, o)) {
        if (dx > 0) ent.x = o.x - ent.w;
        else if (dx < 0) ent.x = o.x + o.w;
      }
    }
    ent.y += dy;
    for (const o of obstacles) {
      const box = { x: ent.x, y: ent.y, w: ent.w, h: ent.h };
      if (rectsOverlap(box, o)) {
        if (dy > 0) ent.y = o.y - ent.h;
        else if (dy < 0) ent.y = o.y + o.h;
      }
    }
    ent.x = clamp(ent.x, 0, WORLD_W - ent.w);
    ent.y = clamp(ent.y, 0, WORLD_H - ent.h);
  }

  // ---------- Detection ----------
  function lineBlocked(x1, y1, x2, y2) {
    // sample a few points along the sightline; blocked if it crosses a tree/tent/wall
    const steps = 14;
    for (let i = 1; i < steps; i++) {
      const px = x1 + ((x2 - x1) * i) / steps;
      const py = y1 + ((y2 - y1) * i) / steps;
      for (const o of obstacles) {
        if (o.type === "tree" || o.type === "tent" || o.type === "wall" || o.type === "rock") {
          // use a slightly taller box for trees (canopy blocks view)
          const ob = o.type === "tree" ? { x: o.x, y: o.y - 30, w: o.w, h: o.h + 40 } : o;
          if (px >= ob.x && px <= ob.x + ob.w && py >= ob.y && py <= ob.y + ob.h) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function updateDetection(dt) {
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    let seenBy = 0;

    const VIEW_RANGE = 230;
    const VIEW_ANGLE = Math.PI / 3.2; // half-cone handled below

    for (const r of rangers) {
      const rcx = r.x + r.w / 2;
      const rcy = r.y + r.h / 2;
      const d = dist(pcx, pcy, rcx, rcy);

      let range = VIEW_RANGE;
      if (player.disguised) range *= 0.45;
      if (keys["shift"]) range *= 0.6; // sneaking shrinks how far you're noticed

      let canSee = false;
      if (d < range) {
        const toPlayer = Math.atan2(pcy - rcy, pcx - rcx);
        const facing = Math.atan2(r.dir.y, r.dir.x);
        let diff = Math.abs(angleDiff(toPlayer, facing));
        if (diff < VIEW_ANGLE || d < 46) {
          if (!lineBlocked(rcx, rcy, pcx, pcy)) {
            canSee = true;
          }
        }
      }

      if (canSee) {
        seenBy++;
        r.alert = clamp(r.alert + dt * 2.2, 0, 1);
        // closer + not sneaking + not disguised => faster suspicion
        let rate = 24;
        if (keys["shift"]) rate *= 0.5;
        if (player.disguised) rate *= 0.25;
        rate *= clamp(1.4 - d / range, 0.4, 1.4);
        player.suspicion = clamp(player.suspicion + rate * dt, 0, 100);
        // ranger turns toward player when alert
        if (r.alert > 0.5) {
          r.dir = { x: (pcx - rcx) / d, y: (pcy - rcy) / d };
        }
      } else {
        r.alert = clamp(r.alert - dt * 0.8, 0, 1);
      }
    }

    if (seenBy === 0) {
      player.suspicion = clamp(player.suspicion - 14 * dt, 0, 100);
    }

    if (player.suspicion >= 100) {
      caught();
    }
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // ---------- Ranger AI ----------
  function updateRangers(dt) {
    for (const r of rangers) {
      const t = r.route[r.target];
      const dx = t.x - r.x;
      const dy = t.y - r.y;
      const d = Math.hypot(dx, dy);
      const spd = (r.alert > 0.5 ? r.speed * 1.7 : r.speed);
      if (d < 4) {
        r.target = (r.target + 1) % r.route.length;
      } else if (r.alert < 0.5) {
        // only follow patrol when calm; when alert, detection code aims them
        r.dir = { x: dx / d, y: dy / d };
        moveWithCollision(r, r.dir.x * spd, r.dir.y * spd);
        r.step += spd;
      } else {
        // alert: advance toward player a bit
        moveWithCollision(r, r.dir.x * spd, r.dir.y * spd);
        r.step += spd;
      }
    }
  }

  // ---------- Interactions ----------
  function nearestFood() {
    const pcx = player.x + player.w / 2;
    const pcy = player.y + player.h / 2;
    let best = null, bestD = 60;
    for (const f of foodSpawns) {
      if (f.taken) continue;
      const d = dist(pcx, pcy, f.x, f.y);
      if (d < bestD) { bestD = d; best = f; }
    }
    return best;
  }

  function playerCenter() {
    return { x: player.x + player.w / 2, y: player.y + player.h / 2 };
  }
  function nearRect(r, pad = 50) {
    const c = playerCenter();
    return c.x > r.x - pad && c.x < r.x + r.w + pad &&
           c.y > r.y - pad && c.y < r.y + r.h + pad;
  }

  function handleInteract() {
    // Grab food
    const f = nearestFood();
    if (f) {
      if (player.backpack.length >= MAX_CARRY) {
        toast("🎒 Backpack full! Stash some food at the den.");
        return;
      }
      player.backpack.push(f.kind);
      f.taken = true;
      f.respawnAt = performance.now() + (f.onTable ? 18000 : 12000);
      if (f.onTable) {
        // taking from a table raises suspicion a touch (you were rummaging)
        player.suspicion = clamp(player.suspicion + 6, 0, 100);
      }
      toast(`${FOOD[f.kind].emoji} Grabbed a ${FOOD[f.kind].name}!`);
      return;
    }

    // Sell at store
    if (nearRect(store, 50)) {
      if (player.backpack.length === 0) {
        toast("🏪 Nothing to sell. Bring snacks!");
        return;
      }
      // keep the most filling items; sell the rest? -> sell ALL on press for simplicity,
      // but warn the player. We'll sell everything.
      let total = 0;
      for (const k of player.backpack) total += FOOD[k].sell;
      player.coins += total;
      const count = player.backpack.length;
      player.backpack = [];
      toast(`🪙 Sold ${count} item(s) for ${total} coins!`);
      return;
    }

    // Feed kids at den
    if (nearRect(den, 40)) {
      if (player.backpack.length === 0) {
        toast("🏕️ No food to share. The kids are waiting!");
        return;
      }
      // Feed the hungriest kid with the most filling item
      const item = player.backpack
        .map((k, i) => ({ k, i }))
        .sort((a, b) => FOOD[b.k].hunger - FOOD[a.k].hunger)[0];
      const kid = kids.slice().sort((a, b) => a.fed - b.fed)[0];
      kid.fed = clamp(kid.fed + FOOD[item.k].hunger * 2.2, 0, 100);
      player.backpack.splice(item.i, 1);
      toast(`${FOOD[item.k].emoji} ${kid.name} munches happily! 💚`);
      checkWin();
      return;
    }

    toast("🤔 Nothing to grab here.");
  }

  function handleDisguise() {
    if (nearRect(laundry, 46)) {
      player.disguised = !player.disguised;
      toast(player.disguised
        ? "🧢 Disguise on — you almost look like a camper."
        : "🦶 Disguise off — free to be furry.");
    } else {
      toast("🧺 Find the laundry line to grab a disguise.");
    }
  }

  // ---------- Eating (self) ----------
  // Auto-eat from backpack when very hungry? No — let player choose with key 'F'? Keep simple:
  // eating handled via backpack -> press 'f' to eat one item for yourself.
  function handleSelfEat() {
    if (player.backpack.length === 0) {
      toast("🍽️ Backpack empty — nothing to eat.");
      return;
    }
    // eat least valuable item to feed yourself
    const item = player.backpack
      .map((k, i) => ({ k, i }))
      .sort((a, b) => FOOD[a.k].sell - FOOD[b.k].sell)[0];
    player.hunger = clamp(player.hunger + FOOD[item.k].hunger, 0, 100);
    player.energy = clamp(player.energy + 6, 0, 100);
    player.backpack.splice(item.i, 1);
    toast(`${FOOD[item.k].emoji} You ate a ${FOOD[item.k].name}. Yum.`);
  }

  // ---------- Win / lose ----------
  function caught() {
    if (state !== State.PLAY) return;
    player.caughtFlash = 1;
    endGame("🚨 Caught!",
      `Ranger Dan slapped a "NO BIGFOOT" sign on the campsite and escorted you out. ` +
      `You brought home ${player.coins} coins before getting spotted. ` +
      `Sneak smarter — use the trees, sneak with Shift, and grab a disguise!`);
  }

  function checkWin() {
    if (kids.every((k) => k.fed >= 100)) {
      endGame("🌟 Best Papa in Pine Hollow!",
        `Every little Sasquatch is full and happy. You finished Day ${day} with ` +
        `${player.coins} coins and a belly full of pride. The legend lives on. 🦶`);
    }
  }

  function endGame(title, msg) {
    state = State.END;
    document.getElementById("end-title").textContent = title;
    document.getElementById("end-msg").textContent = msg;
    document.getElementById("end-overlay").classList.remove("hidden");
  }

  // ---------- Update ----------
  let lastT = performance.now();
  function update(dt) {
    // --- movement ---
    let dx = 0, dy = 0;
    if (keys["w"] || keys["arrowup"]) dy -= 1;
    if (keys["s"] || keys["arrowdown"]) dy += 1;
    if (keys["a"] || keys["arrowleft"]) dx -= 1;
    if (keys["d"] || keys["arrowright"]) dx += 1;

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      player.dir = { x: dx, y: dy };

      let speed = SPEED_WALK;
      if (keys["shift"]) speed = SPEED_SNEAK;          // quiet, low suspicion
      else if (keys["x"] && player.energy > 5) speed = SPEED_RUN; // sprint, burns energy

      moveWithCollision(player, dx * speed, dy * speed);
      player.step += speed;

      // energy: sneaking costs little, running costs more
      const drain = keys["shift"] ? 1.5 : 3.0;
      player.energy = clamp(player.energy - drain * dt, 0, 100);
    } else {
      // resting regains a little energy
      player.energy = clamp(player.energy + 4 * dt, 0, 100);
    }

    // --- single-fire keys ---
    if (consumePress("e")) handleInteract();
    if (consumePress("q")) handleDisguise();
    if (consumePress("f")) handleSelfEat();

    // --- stats decay ---
    player.hunger = clamp(player.hunger - 1.1 * dt, 0, 100);
    if (player.hunger <= 0) {
      endGame("😵 Too Hungry!",
        "Papa Bigfoot ran out of energy and had to crawl home empty-handed. " +
        "Eat a snack now and then with F!");
      return;
    }
    if (player.energy <= 0 && moving) {
      // exhausted: hunger drains faster
      player.hunger = clamp(player.hunger - 1.0 * dt, 0, 100);
    }

    // --- food respawn ---
    const now = performance.now();
    for (const f of foodSpawns) {
      if (f.taken && now >= f.respawnAt) f.taken = false;
    }

    // --- ranger + detection ---
    updateRangers(dt);
    updateDetection(dt);

    // --- kids get hungrier over time ---
    for (const k of kids) {
      k.fed = clamp(k.fed - 0.35 * dt, 0, 100);
      k.bob += dt * 2;
    }

    // --- time of day ---
    dayTime += (24 * 60 / DAY_LENGTH) * dt;
    if (dayTime >= 24 * 60) { dayTime -= 24 * 60; day++; }

    // --- camera follow ---
    cam.x = clamp(player.x + player.w / 2 - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    cam.y = clamp(player.y + player.h / 2 - VIEW_H / 2, 0, WORLD_H - VIEW_H);

    if (player.caughtFlash > 0) player.caughtFlash = Math.max(0, player.caughtFlash - dt);
  }

  // ---------- Rendering ----------
  function draw() {
    // sky/ground tint based on time of day
    const dayFrac = dayTime / (24 * 60);
    // darkness factor: dark at night (0.0 day .. 0.5 night)
    let dark = 0;
    if (dayFrac < 0.25) dark = 0.5 * (1 - dayFrac / 0.25);       // pre-dawn
    else if (dayFrac > 0.75) dark = 0.5 * ((dayFrac - 0.75) / 0.25); // dusk->night
    dark = clamp(dark, 0, 0.5);

    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    drawGround();
    drawPaths();
    drawLake();
    drawDen();
    drawBuildings();
    drawLaundry();
    drawTrees(false); // trunks/back
    drawTents();
    drawFood();
    drawKids();
    drawVisionCones();
    drawRangers();
    drawPlayer();
    drawTrees(true); // canopies on top for depth

    ctx.restore();

    // night overlay
    if (dark > 0.01) {
      ctx.fillStyle = `rgba(10, 20, 50, ${dark})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    // caught flash
    if (player.caughtFlash > 0) {
      ctx.fillStyle = `rgba(231, 76, 60, ${player.caughtFlash * 0.5})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    drawMinimap();
    drawInteractHint();
  }

  function drawGround() {
    // base grass with subtle checker
    for (let y = Math.floor(cam.y / TILE) * TILE; y < cam.y + VIEW_H; y += TILE) {
      for (let x = Math.floor(cam.x / TILE) * TILE; x < cam.x + VIEW_W; x += TILE) {
        const even = ((x / TILE) + (y / TILE)) % 2 === 0;
        ctx.fillStyle = even ? "#6a994e" : "#658f4a";
        ctx.fillRect(x, y, TILE, TILE);
      }
    }
  }

  function drawPaths() {
    ctx.fillStyle = "#c2a878";
    // a meandering main path connecting den -> camp -> store
    roundPath([
      { x: den.x + den.w / 2, y: den.y + den.h + 40 },
      { x: 620, y: 520 },
      { x: 960, y: 520 },
      { x: 1300, y: 480 },
      { x: store.x + store.w / 2, y: store.y + store.h + 20 },
    ], 40);
  }
  function roundPath(pts, width) {
    ctx.save();
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#c2a878";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawLake() {
    const lake = obstacles.find((o) => o.lake);
    if (!lake) return;
    ctx.fillStyle = "#3a7ca5";
    roundRect(lake.x, lake.y, lake.w, lake.h, 60);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundRect(lake.x + 30, lake.y + 24, lake.w - 60, 30, 20);
    ctx.fill();
    // sandy rim
    ctx.strokeStyle = "#e3d3a3";
    ctx.lineWidth = 10;
    roundRect(lake.x, lake.y, lake.w, lake.h, 60);
    ctx.stroke();
  }

  function drawDen() {
    // grassy mound
    ctx.fillStyle = "#4a6b3a";
    roundRect(den.x - 30, den.y - 30, den.w + 60, den.h + 60, 24);
    ctx.fill();
    // cave mouth
    ctx.fillStyle = "#241a12";
    roundRect(den.x + 10, den.y + 10, den.w - 20, den.h - 20, 18);
    ctx.fill();
    // rocks
    for (const o of obstacles) {
      if (o.type === "rock") {
        ctx.fillStyle = "#7d7363";
        roundRect(o.x, o.y, o.w, o.h, 8);
        ctx.fill();
      }
    }
    // sign
    ctx.fillStyle = "#fff";
    ctx.font = "bold 16px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("🏕️ Home Den", den.x + den.w / 2, den.y - 36);
  }

  function drawBuildings() {
    for (const b of buildings) {
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      roundRect(b.x + 6, b.y + 10, b.w, b.h, 10);
      ctx.fill();
      // body
      ctx.fillStyle = b.color;
      roundRect(b.x, b.y, b.w, b.h - 40, 8);
      ctx.fill();
      // roof
      ctx.fillStyle = "#5a3418";
      ctx.beginPath();
      ctx.moveTo(b.x - 12, b.y);
      ctx.lineTo(b.x + b.w / 2, b.y - 40);
      ctx.lineTo(b.x + b.w + 12, b.y);
      ctx.closePath();
      ctx.fill();
      // door
      ctx.fillStyle = "#2a1b0e";
      ctx.fillRect(b.x + b.w / 2 - 18, b.y + b.h - 80, 36, 40);
      // label
      ctx.fillStyle = "#fff";
      ctx.font = "bold 15px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(b.label, b.x + b.w / 2, b.y - 50);
      ctx.font = "12px Trebuchet MS";
      ctx.fillStyle = "#ffe8a3";
      ctx.fillText("Press E to sell", b.x + b.w / 2, b.y + b.h + 4);
    }
  }

  function drawLaundry() {
    const l = laundry;
    // two posts + line
    ctx.strokeStyle = "#5a3a1b";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y + l.h);
    ctx.lineTo(l.x, l.y - 10);
    ctx.moveTo(l.x + l.w, l.y + l.h);
    ctx.lineTo(l.x + l.w, l.y - 10);
    ctx.stroke();
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(l.x, l.y - 6);
    ctx.lineTo(l.x + l.w, l.y - 6);
    ctx.stroke();
    // hanging clothes (disguise)
    const clothes = ["🧢", "👕", "🧥"];
    ctx.font = "22px serif";
    ctx.textAlign = "center";
    clothes.forEach((c, i) => {
      ctx.fillText(c, l.x + 24 + i * 36, l.y + 16);
    });
    ctx.fillStyle = "#fff";
    ctx.font = "12px Trebuchet MS";
    ctx.fillText("🧺 Disguise (Q)", l.x + l.w / 2, l.y - 18);
  }

  function drawTrees(canopy) {
    for (const t of trees) {
      if (!canopy) {
        // trunk
        ctx.fillStyle = "#6f4e37";
        ctx.fillRect(t.x - 5, t.y - 4, 10, 22);
      } else {
        // canopy
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath();
        ctx.ellipse(t.x + 4, t.y - 14, t.r + 6, t.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2f5233";
        ctx.beginPath();
        ctx.arc(t.x, t.y - 18, t.r + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a6b41";
        ctx.beginPath();
        ctx.arc(t.x - 8, t.y - 22, t.r, 0, Math.PI * 2);
        ctx.arc(t.x + 9, t.y - 16, t.r - 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawTents() {
    for (const t of tents) {
      // picnic table
      const tb = t.table;
      ctx.fillStyle = "#9c6b3f";
      roundRect(tb.x, tb.y, tb.w, tb.h, 4);
      ctx.fill();
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(tb.x, tb.y + tb.h - 8, tb.w, 8);
      // tent
      ctx.fillStyle = "#c1444a";
      ctx.beginPath();
      ctx.moveTo(t.x, t.y + t.h);
      ctx.lineTo(t.x + t.w / 2, t.y);
      ctx.lineTo(t.x + t.w, t.y + t.h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#8f2f35";
      ctx.beginPath();
      ctx.moveTo(t.x + t.w / 2, t.y);
      ctx.lineTo(t.x + t.w / 2 - 12, t.y + t.h);
      ctx.lineTo(t.x + t.w / 2 + 12, t.y + t.h);
      ctx.closePath();
      ctx.fill();
      // campfire
      ctx.font = "20px serif";
      ctx.textAlign = "center";
      ctx.fillText("🔥", t.x - 18, t.y + t.h);
    }
  }

  function drawFood() {
    ctx.font = "22px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of foodSpawns) {
      if (f.taken) continue;
      // subtle shadow
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(f.x, f.y + 10, 10, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(FOOD[f.kind].emoji, f.x, f.y);
    }
    ctx.textBaseline = "alphabetic";
  }

  function drawKids() {
    for (const k of kids) {
      const bobY = Math.sin(k.bob) * 3;
      drawSasquatch(k.x, k.y + bobY, 0.55, false, k.fed < 30);
      // name + hunger pip
      ctx.fillStyle = "#fff";
      ctx.font = "11px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(k.name, k.x, k.y - 26);
      if (k.fed < 30) {
        ctx.font = "14px serif";
        ctx.fillText("💭🍖", k.x + 22, k.y - 28);
      }
    }
  }

  function drawSasquatch(cx, cy, scale, isPlayer, hungry) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const fur = isPlayer ? (player.disguised ? "#7a5c43" : "#6b4f3a") : "#7d5c44";
    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 30, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.fillStyle = fur;
    ctx.fillRect(-14, 6, 11, 26);
    ctx.fillRect(3, 6, 11, 26);
    // big feet
    ctx.fillStyle = "#3d2c1e";
    ctx.beginPath();
    ctx.ellipse(-9, 33, 9, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(9, 33, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillStyle = fur;
    roundRect(-20, -22, 40, 40, 16);
    ctx.fill();
    // arms
    ctx.fillRect(-28, -18, 10, 30);
    ctx.fillRect(18, -18, 10, 30);
    // belly
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.ellipse(0, -2, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.arc(0, -34, 18, 0, Math.PI * 2);
    ctx.fill();
    // face
    ctx.fillStyle = "#caa882";
    ctx.beginPath();
    ctx.ellipse(0, -30, 11, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#1d130b";
    ctx.beginPath();
    ctx.arc(-5, -34, 2.4, 0, Math.PI * 2);
    ctx.arc(5, -34, 2.4, 0, Math.PI * 2);
    ctx.fill();
    // mouth
    ctx.strokeStyle = "#1d130b";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (hungry) ctx.arc(0, -22, 3, Math.PI, Math.PI * 2); // frown
    else ctx.arc(0, -24, 3.4, 0, Math.PI); // smile
    ctx.stroke();

    // disguise hat
    if (isPlayer && player.disguised) {
      ctx.fillStyle = "#2d6a4f";
      roundRect(-15, -50, 30, 8, 3); ctx.fill();
      ctx.fillStyle = "#40916c";
      roundRect(-11, -60, 22, 12, 4); ctx.fill();
      // sunglasses
      ctx.fillStyle = "#111";
      ctx.fillRect(-9, -36, 7, 4);
      ctx.fillRect(2, -36, 7, 4);
    }

    ctx.restore();
  }

  function drawPlayer() {
    drawSasquatch(player.x + player.w / 2, player.y + player.h / 2, 1, true, player.hunger < 25);
    // sneaking puff
    if (keys["shift"] && state === State.PLAY) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "12px serif";
      ctx.textAlign = "center";
      ctx.fillText("…shh", player.x + player.w / 2 + 26, player.y);
    }
  }

  function drawRangers() {
    for (const r of rangers) {
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.ellipse(0, 22, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // legs
      ctx.fillStyle = "#3b3b3b";
      ctx.fillRect(-8, 6, 6, 16);
      ctx.fillRect(2, 6, 6, 16);
      // ranger uniform (khaki/green)
      ctx.fillStyle = "#4a7042";
      roundRect(-12, -14, 24, 26, 6);
      ctx.fill();
      // head
      ctx.fillStyle = "#e0b58b";
      ctx.beginPath();
      ctx.arc(0, -22, 9, 0, Math.PI * 2);
      ctx.fill();
      // ranger hat
      ctx.fillStyle = "#6b4f2a";
      roundRect(-11, -30, 22, 5, 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-7, -30); ctx.lineTo(0, -38); ctx.lineTo(7, -30); ctx.closePath();
      ctx.fill();
      // alert mark
      if (r.alert > 0.5) {
        ctx.fillStyle = "#ffd166";
        ctx.font = "bold 18px serif";
        ctx.textAlign = "center";
        ctx.fillText("!", 0, -42);
      } else if (r.alert > 0.15) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 16px serif";
        ctx.textAlign = "center";
        ctx.fillText("?", 0, -42);
      }
      ctx.restore();
    }
  }

  function drawVisionCones() {
    const VIEW_RANGE = 230;
    const VIEW_ANGLE = Math.PI / 3.2;
    for (const r of rangers) {
      const rcx = r.x + r.w / 2;
      const rcy = r.y + r.h / 2;
      const facing = Math.atan2(r.dir.y, r.dir.x);
      let range = VIEW_RANGE;
      if (player.disguised) range *= 0.45;
      const alpha = 0.12 + r.alert * 0.22;
      const col = r.alert > 0.5 ? `rgba(231,76,60,${alpha})` : `rgba(255,225,120,${alpha})`;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(rcx, rcy);
      ctx.arc(rcx, rcy, range, facing - VIEW_ANGLE, facing + VIEW_ANGLE);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawInteractHint() {
    let hint = null;
    const f = nearestFood();
    if (f) hint = `E — Grab ${FOOD[f.kind].name}`;
    else if (nearRect(den, 40) && player.backpack.length) hint = "E — Feed the kids";
    else if (nearRect(store, 50) && player.backpack.length) hint = "E — Sell food";
    else if (nearRect(laundry, 46)) hint = player.disguised ? "Q — Remove disguise" : "Q — Put on disguise";

    if (hint) {
      ctx.fillStyle = "rgba(20,33,15,0.85)";
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      const w = ctx.measureText(hint).width;
      const px = player.x + player.w / 2 - cam.x;
      const py = player.y - cam.y - 44;
      ctx.font = "bold 14px Trebuchet MS";
      const bw = ctx.measureText(hint).width + 20;
      roundRect(px - bw / 2, py - 18, bw, 26, 8);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffe8a3";
      ctx.textAlign = "center";
      ctx.fillText(hint, px, py);
    }
  }

  // minimap top-center-ish (small)
  function drawMinimap() {
    const mw = 150, mh = mw * (WORLD_H / WORLD_W);
    const ox = VIEW_W - mw - 14, oy = VIEW_H - mh - 14;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(15,25,12,0.8)";
    roundRect(ox - 4, oy - 4, mw + 8, mh + 8, 8); ctx.fill();
    const sx = mw / WORLD_W, sy = mh / WORLD_H;
    // den
    ctx.fillStyle = "#a3b18a";
    ctx.fillRect(ox + den.x * sx, oy + den.y * sy, den.w * sx, den.h * sy);
    // store
    ctx.fillStyle = "#8d5524";
    ctx.fillRect(ox + store.x * sx, oy + store.y * sy, store.w * sx, store.h * sy);
    // tents
    ctx.fillStyle = "#c1444a";
    for (const t of tents) ctx.fillRect(ox + t.x * sx, oy + t.y * sy, 4, 4);
    // rangers
    ctx.fillStyle = "#e63946";
    for (const r of rangers) ctx.fillRect(ox + r.x * sx - 1, oy + r.y * sy - 1, 4, 4);
    // player
    ctx.fillStyle = "#ffe8a3";
    ctx.fillRect(ox + player.x * sx - 1, oy + player.y * sy - 1, 4, 4);
    ctx.restore();
  }

  // ---------- Canvas helpers ----------
  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- HUD ----------
  const hungerFill = document.getElementById("hunger-fill");
  const energyFill = document.getElementById("energy-fill");
  const suspicionFill = document.getElementById("suspicion-fill");
  const coinsEl = document.getElementById("coins");
  const carryEl = document.getElementById("carry");
  const clockEl = document.getElementById("day-clock");
  const disguiseEl = document.getElementById("disguise-indicator");
  const familyList = document.getElementById("family-list");

  function updateHUD() {
    hungerFill.style.width = player.hunger + "%";
    energyFill.style.width = player.energy + "%";
    suspicionFill.style.width = player.suspicion + "%";
    coinsEl.textContent = "🪙 " + player.coins;
    carryEl.textContent = `🎒 ${player.backpack.length}/${MAX_CARRY}`;
    const hh = String(Math.floor(dayTime / 60)).padStart(2, "0");
    const mm = String(Math.floor(dayTime % 60)).padStart(2, "0");
    clockEl.textContent = `🕑 Day ${day} · ${hh}:${mm}`;
    disguiseEl.classList.toggle("hidden", !player.disguised);

    // family panel
    let html = "";
    for (const k of kids) {
      html += `<div class="family-member">
        <span>🦶 ${k.name}</span>
        <div class="mini-bar"><div class="mini-fill" style="width:${k.fed}%"></div></div>
      </div>`;
    }
    familyList.innerHTML = html;
  }

  // ---------- Main loop ----------
  function loop(now) {
    let dt = (now - lastT) / 1000;
    lastT = now;
    dt = Math.min(dt, 0.05); // clamp big frame gaps

    if (state === State.PLAY) {
      update(dt);
      draw();
      updateHUD();
    }
    requestAnimationFrame(loop);
  }

  // ---------- Start / restart ----------
  function startGame() {
    buildWorld();
    spawnEntities();
    document.getElementById("overlay").classList.add("hidden");
    document.getElementById("end-overlay").classList.add("hidden");
    state = State.PLAY;
    lastT = performance.now();
    toast("🦶 Sneak out and find some snacks!");
  }

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("restart-btn").addEventListener("click", startGame);

  // draw a static menu backdrop frame once
  buildWorld();
  spawnEntities();
  ctx.fillStyle = "#6a994e";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  requestAnimationFrame(loop);
})();
