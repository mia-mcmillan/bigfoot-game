/*
 * Post-processes the raw Gemini art into web/PWA-ready assets.
 *   - icon.png  -> icons/icon-{512,192,180}.png (resized PWA icons)
 *   - title.png -> assets/title.jpg (downscaled start-screen background)
 *
 * Run with: node tools/process-art.js
 */

"use strict";
const fs = require("fs");
const path = require("path");
const { Jimp } = require("jimp");

const RAW = path.join(__dirname, "..", "assets", "raw");
const ICONS = path.join(__dirname, "..", "icons");
const ASSETS = path.join(__dirname, "..", "assets");

(async () => {
  fs.mkdirSync(ICONS, { recursive: true });

  // App icon -> square PWA sizes.
  const icon = await Jimp.read(path.join(RAW, "icon.png"));
  for (const size of [512, 192, 180]) {
    const c = icon.clone().resize({ w: size, h: size });
    await c.write(path.join(ICONS, `icon-${size}.png`));
    console.log(`wrote icons/icon-${size}.png`);
  }

  // Title art -> downscaled JPEG background (~1280px wide).
  const title = await Jimp.read(path.join(RAW, "title.png"));
  const tw = 1280;
  const th = Math.round((title.bitmap.height * tw) / title.bitmap.width);
  title.resize({ w: tw, h: th });
  const buf = await title.getBuffer("image/jpeg", { quality: 82 });
  fs.writeFileSync(path.join(ASSETS, "title.jpg"), buf);
  console.log(`wrote assets/title.jpg (${tw}x${th}, ${(buf.length / 1024).toFixed(0)} KB)`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
