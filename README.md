# 🦶 Sneaky Bigfoot

A top-down stealth life-sim inspired by **Sneaky Sasquatch** — but you play as
**Papa Bigfoot**, a gentle cryptid living with **Mama Bigfoot and their two
kids** in the woods of Pine Hollow.

Sneak through the campground, swipe snacks from picnic tables and berry bushes,
dodge the patrolling park rangers, earn coins at the general store, and — most
importantly — carry dinner home to feed your kids.

## ▶️ How to play

It's a single self-contained web game. Just open `index.html` in any modern
browser:

```bash
# from the project folder
open index.html        # macOS
xdg-open index.html    # Linux
# ...or serve it:
python3 -m http.server 8000   # then visit http://localhost:8000
```

No build step, no dependencies.

## 🎮 Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` / Arrows | Move |
| `Shift` | Sneak — slow, quiet, much harder to spot |
| `X` | Sprint — fast, but burns energy |
| `E` | Grab food / Feed the kids (at the den) / Sell food (at the store) |
| `F` | Eat a snack from your backpack to refill your own hunger |
| `Q` | Put on / take off a disguise (at the laundry line) |

## 🧠 Gameplay

- **Hunger** slowly drains — eat snacks (`F`) so you don't pass out.
- **Energy** drops when you move (sprinting costs more); standing still recovers it.
- **Suspicion** rises when a ranger sees you. Fill it and you're **caught**.
  - Sneak (`Shift`), hide behind **trees**, and wear a **disguise** to stay unseen.
  - Rangers have visible **vision cones** — yellow when calm, red when alerted.
- **Backpack** holds up to 6 food items. Sell them for **coins** at the 🏪 store,
  or bring them home.
- **The Family**: Mama Bigfoot and your two kids (Mossy & Pebble) get hungrier
  over time. Return to the 🏕️ den and press `E` to feed them.

## 🏆 Win / lose

- **Win**: feed your whole family (Mama + both kids) to full.
- **Lose**: get caught by a ranger (suspicion hits 100%), or let your own hunger
  hit zero.

## 📲 Install it (PWA)

Sneaky Bigfoot is a Progressive Web App, so you can install it and play offline:

- **Desktop (Chrome/Edge):** click the install icon in the address bar.
- **Android (Chrome):** menu → *Add to Home screen*.
- **iOS (Safari):** Share → *Add to Home Screen*.

Once installed it launches in its own window and works with no connection,
thanks to a service worker (`sw.js`) that caches the app shell, plus a web app
manifest (`manifest.json`) and icons in `icons/`.

## 🛠️ Tech

Plain HTML5 Canvas + vanilla JavaScript, no framework. Character/prop art is
generated with the Gemini image API (`tools/gen-art.js`), background-keyed and
resized with `tools/process-art.js`, and drawn as sprites — with a procedural
shape fallback if a sprite fails to load. Playable with keyboard or on-screen
touch controls (iPad/mobile).

- `index.html` — markup, HUD, screens, touch controls
- `style.css` — styling + responsive/touch layout
- `game.js` — world generation, entities, ranger AI, stealth detection, sprite rendering
- `assets/sprites/` — generated character & prop art; `assets/raw/` — source renders
