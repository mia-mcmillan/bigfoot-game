/*
 * Generates the PWA app icons (no external deps) by rasterizing a Bigfoot
 * footprint on a forest-green field and encoding PNGs with zlib.
 *
 * Run with: node tools/make-icons.js
 * Outputs: icons/icon-192.png, icons/icon-512.png, icons/icon-180.png
 */

"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---- tiny PNG (RGBA, 8-bit) encoder ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // 10,11,12 = compression/filter/interlace = 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- drawing ----
function draw(S) {
  const buf = Buffer.alloc(S * S * 4);
  const green = [58, 90, 64];     // #3a5a40
  const greenDk = [42, 66, 47];
  const cream = [244, 239, 226];  // #f4efe2

  // background: subtle vertical gradient
  for (let y = 0; y < S; y++) {
    const t = y / S;
    const r = Math.round(green[0] * (1 - t) + greenDk[0] * t);
    const g = Math.round(green[1] * (1 - t) + greenDk[1] * t);
    const b = Math.round(green[2] * (1 - t) + greenDk[2] * t);
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }

  // foot shape = union of ellipses (heel + ball) and toe circles.
  // coverage sampled 3x3 per pixel for light anti-aliasing.
  const ellipse = (px, py, cx, cy, rx, ry) => {
    const dx = (px - cx) / rx, dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
  const shapes = [
    // [cx, cy, rx, ry] in fractions of S
    [0.5, 0.64, 0.19, 0.24], // heel
    [0.5, 0.42, 0.23, 0.17], // ball
  ];
  // toes: 5 circles arcing above the ball
  const toes = [
    [0.33, 0.30, 0.052],
    [0.42, 0.255, 0.058],
    [0.52, 0.245, 0.060],
    [0.62, 0.265, 0.055],
    [0.70, 0.305, 0.048],
  ];

  const covered = (px, py) => {
    for (const [cx, cy, rx, ry] of shapes) {
      if (ellipse(px, py, cx * S, cy * S, rx * S, ry * S)) return true;
    }
    for (const [cx, cy, r] of toes) {
      if (ellipse(px, py, cx * S, cy * S, r * S, r * S)) return true;
    }
    return false;
  };

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hits = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          if (covered(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hits++;
        }
      }
      if (hits === 0) continue;
      const a = hits / 9;
      const i = (y * S + x) * 4;
      buf[i]     = Math.round(buf[i] * (1 - a) + cream[0] * a);
      buf[i + 1] = Math.round(buf[i + 1] * (1 - a) + cream[1] * a);
      buf[i + 2] = Math.round(buf[i + 2] * (1 - a) + cream[2] * a);
    }
  }
  return buf;
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512, 180]) {
  const png = encodePNG(size, size, draw(size));
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icons/icon-${size}.png (${png.length} bytes)`);
}
