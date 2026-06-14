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
const SPRITES = path.join(ASSETS, "sprites");

// Sprite name -> target size. h = target height (px); w = target width.
const SPRITE_SIZES = {
  bigfoot: { h: 220 },
  mama: { h: 210 },
  kid: { h: 150 },
  ranger: { h: 210 },
  tent: { w: 240 },
  tree: { h: 240 },
};

// Remove the flat magenta backdrop -> transparency, with a soft edge + despill.
function chromaKeyMagenta(img) {
  const d = img.bitmap.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    // distance from pure magenta (255, 0, 255)
    const dist = Math.sqrt((r - 255) ** 2 + g * g + (b - 255) ** 2);
    if (dist < 100) {
      d[i + 3] = 0; // fully background
    } else if (dist < 185) {
      d[i + 3] = Math.round(((dist - 100) / 85) * 255); // soft edge
      // despill: pull pink fringe back toward neutral
      if (b > g + 25 && r > g + 25) {
        d[i] = Math.round(g + (r - g) * 0.5);
        d[i + 2] = Math.round(g + (b - g) * 0.5);
      }
    }
  }
}

// Crop to the bounding box of non-transparent pixels (+ small padding).
function trimAlpha(img) {
  const { data, width, height } = img.bitmap;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return; // fully transparent, skip
  const pad = 4;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  img.crop({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
}

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

  // Sprites: chroma-key magenta -> transparent, trim, resize.
  fs.mkdirSync(SPRITES, { recursive: true });
  for (const [name, size] of Object.entries(SPRITE_SIZES)) {
    const raw = path.join(RAW, `${name}.png`);
    if (!fs.existsSync(raw)) { console.log(`skip ${name} (no raw)`); continue; }
    const img = await Jimp.read(raw);
    chromaKeyMagenta(img);
    trimAlpha(img);
    const ar = img.bitmap.width / img.bitmap.height;
    const w = size.w || Math.round(size.h * ar);
    const h = size.h || Math.round(size.w / ar);
    img.resize({ w, h });
    await img.write(path.join(SPRITES, `${name}.png`));
    console.log(`wrote assets/sprites/${name}.png (${w}x${h})`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
