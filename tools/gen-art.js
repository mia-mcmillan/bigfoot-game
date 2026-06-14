/*
 * Generates game art via the Gemini / Imagen API.
 *
 * The API key is read ONLY from the GEMINI_API_KEY environment variable and is
 * never written to disk. Generated images are saved to assets/raw/.
 *
 * Usage:
 *   GEMINI_API_KEY=... node tools/gen-art.js list          # list models the key can access
 *   GEMINI_API_KEY=... node tools/gen-art.js <name>        # generate one asset
 *   GEMINI_API_KEY=... node tools/gen-art.js all           # generate everything
 *
 * Set IMAGE_MODEL to override the model (default: imagen-3.0-generate-002).
 */

"use strict";
const fs = require("fs");
const path = require("path");

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.IMAGE_MODEL || "imagen-3.0-generate-002";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
const OUT = path.join(__dirname, "..", "assets", "raw");

// Shared style so every asset feels like one game.
const STYLE =
  "cute cozy cartoon vector illustration, soft flat shading, warm storybook " +
  "palette, forest greens and earthy browns, clean thick outlines, " +
  "in the friendly art style of the game Sneaky Sasquatch";

// Assets to generate. `bg` = describe a flat background we can later key out for
// sprites that need transparency.
const ASSETS = {
  icon: {
    aspect: "1:1",
    prompt: `App icon: a friendly brown Bigfoot (Sasquatch) face peeking out, ` +
      `centered, on a forest-green rounded background, bold and simple, ` +
      `readable at small sizes. ${STYLE}.`,
  },
  title: {
    aspect: "16:9",
    prompt: `A wide title-screen scene of a sunny pine forest campground at ` +
      `golden hour: tents, a picnic table, distant mountains, a cozy cave den, ` +
      `no text. Leave the upper-middle area calm for a logo. ${STYLE}.`,
  },
  bigfoot: {
    aspect: "1:1",
    prompt: `Full-body friendly brown Bigfoot dad standing facing the viewer, ` +
      `top-down-friendly game character sprite, centered, on a solid flat ` +
      `magenta (#ff00ff) background. ${STYLE}.`,
  },
  mama: {
    aspect: "1:1",
    prompt: `Full-body friendly Bigfoot mom with a small flower, game character ` +
      `sprite, centered, on a solid flat magenta (#ff00ff) background. ${STYLE}.`,
  },
  kid: {
    aspect: "1:1",
    prompt: `Full-body tiny cute baby Bigfoot, game character sprite, centered, ` +
      `on a solid flat magenta (#ff00ff) background. ${STYLE}.`,
  },
  ranger: {
    aspect: "1:1",
    prompt: `Full-body park ranger in a khaki-green uniform and ranger hat, ` +
      `game character sprite, centered, on a solid flat magenta (#ff00ff) ` +
      `background. ${STYLE}.`,
  },
  tent: {
    aspect: "1:1",
    prompt: `A single red camping tent, top-down-friendly game prop, centered, ` +
      `on a solid flat magenta (#ff00ff) background. ${STYLE}.`,
  },
  tree: {
    aspect: "1:1",
    prompt: `A single round pine/fir tree seen slightly from above, game prop, ` +
      `centered, on a solid flat magenta (#ff00ff) background. ${STYLE}.`,
  },
};

if (!KEY) {
  console.error("ERROR: set GEMINI_API_KEY in the environment.");
  process.exit(1);
}

async function listModels() {
  const res = await fetch(`${BASE}/models?key=${KEY}&pageSize=200`);
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json, null, 2));
  for (const m of json.models || []) {
    const methods = (m.supportedGenerationMethods || []).join(", ");
    console.log(`${m.name}\n    methods: ${methods}`);
  }
}

// Returns base64 PNG/JPEG bytes for a prompt, trying Imagen predict first and
// falling back to a Gemini image-generation generateContent call.
async function generate(prompt, aspect) {
  // --- Imagen predict ---
  if (MODEL.startsWith("imagen")) {
    const res = await fetch(`${BASE}/models/${MODEL}:predict?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: aspect },
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(json, null, 2));
    const b64 = json.predictions && json.predictions[0] &&
      (json.predictions[0].bytesBase64Encoded || json.predictions[0].image);
    if (!b64) throw new Error("No image in Imagen response: " + JSON.stringify(json).slice(0, 300));
    return b64;
  }

  // --- Gemini generateContent (image modality) ---
  const res = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json, null, 2));
  const parts = (((json.candidates || [])[0] || {}).content || {}).parts || [];
  for (const p of parts) {
    if (p.inlineData && p.inlineData.data) return p.inlineData.data;
  }
  throw new Error("No image in Gemini response: " + JSON.stringify(json).slice(0, 300));
}

async function genOne(name) {
  const a = ASSETS[name];
  if (!a) throw new Error(`Unknown asset "${name}". Known: ${Object.keys(ASSETS).join(", ")}`);
  fs.mkdirSync(OUT, { recursive: true });
  process.stdout.write(`Generating ${name} ... `);
  const b64 = await generate(a.prompt, a.aspect);
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  console.log(`saved assets/raw/${name}.png (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
}

(async () => {
  const cmd = process.argv[2];
  try {
    if (!cmd || cmd === "list") {
      await listModels();
    } else if (cmd === "all") {
      for (const name of Object.keys(ASSETS)) await genOne(name);
    } else {
      await genOne(cmd);
    }
  } catch (err) {
    console.error("\nFAILED:\n" + (err && err.message ? err.message : err));
    process.exit(1);
  }
})();
