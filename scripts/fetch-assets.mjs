#!/usr/bin/env node
/**
 * Downloads the free glTF models the game can use and writes them to
 * public/models as single-file .glb, plus public/CREDITS.md.
 *
 * Sources:
 *   - Zsky, "Low Poly Military Vehicles" (CC-BY 4.0) via Poly Pizza
 *   - Quaternius, "Tank" (CC0) via Poly Pizza
 *
 * helicopter.glb, carrier.glb, jet.glb and tent.glb are not fetched here:
 * Sketchfab needs a signed-in download. They are "AH-64 Apache" by Thomas
 * Koenders, "Gerald Ford Aircraft Carrier" by Uxman, "F-16 Fighter Jet" by
 * iedalton and "Jungle Tent" by SyntheticMN, all CC-BY 4.0, each reduced with:
 *   npx @gltf-transform/cli optimize <in> public/models/<name>.glb \
 *     --texture-size <1024|512> --texture-compress webp --compress false \\
 *     --simplify false --join false
 * Keep --join false: merging meshes that share a material fuses the rotors
 * into the fuselage, and the game finds them by shape.
 *
 * Every model is optional: the game builds primitive placeholders for any
 * file that is missing, so a failed download never blocks development.
 *
 * Usage: node scripts/fetch-assets.mjs
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const exec = promisify(execFile);
const OUT = path.resolve("public/models");

// Poly Pizza model ids -> the file name the game expects.
const POLY_MODELS = [
  // The player's aircraft now comes from Sketchfab; Zsky's helicopter is unused.
  { id: "hG2Qr0A3zR", file: null, title: null, author: "Zsky", license: "CC-BY 4.0" },
  { id: "jWS1CLA0RO", file: "tank.glb", title: "Tank", author: "Quaternius", license: "CC0" },
  { id: "4JxDoxLnRd", file: null, title: null, author: "Zsky", license: "CC-BY 4.0" },
  { id: "7GG1xDtc8l", file: null, title: null, author: "Zsky", license: "CC-BY 4.0" },
  { id: "9SwnIlPjNv", file: null, title: null, author: "Zsky", license: "CC-BY 4.0" },
  { id: "AcSdGGrgYP", file: null, title: null, author: "Zsky", license: "CC-BY 4.0" },
  { id: "EWp0hGvZPV", file: null, title: null, author: "Zsky", license: "CC-BY 4.0" },
  { id: "NHjJnFYYCc", file: null, title: null, author: "Zsky", license: "CC-BY 4.0" },
  { id: "S1jUTRmAjD", file: null, title: null, author: "Zsky", license: "CC-BY 4.0" },
  { id: "wouBxOe3CD", file: null, title: null, author: "Zsky", license: "CC-BY 4.0" },
];

// Zsky bundle titles -> game file names (resolved from the page title).
const TITLE_TO_FILE = {
  Tank: "zsky-tank.glb",
  "Light Tank": "light-tank.glb",
  Jeep: "jeep.glb",
  Truck: "truck.glb",
  // "Military Boat" is superseded by the Sketchfab patrol boat (see the header); its file would overwrite it.
  "Military Boat": null,
};

async function fetchText(url) {
  const res = await fetch(url, { headers: { "user-agent": "thunder-strike-asset-fetch" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "user-agent": "thunder-strike-asset-fetch" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

async function optimise(file) {
  // Dedupe and prune with gltf-transform; fall back to the raw file if it fails.
  try {
    const tmp = file + ".tmp.glb";
    await exec("npx", ["--yes", "@gltf-transform/cli", "optimize", file, tmp, "--compress", "false", "--texture-compress", "false", "--simplify", "false"], { timeout: 120000 });
    const { size } = await stat(tmp);
    if (size > 0) {
      await exec("mv", [tmp, file]);
    }
  } catch (err) {
    console.warn(`  optimise skipped: ${err.message.split("\n")[0]}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const credits = [];
  for (const m of POLY_MODELS) {
    const pageUrl = `https://poly.pizza/m/${m.id}`;
    try {
      const html = await fetchText(pageUrl);
      const glb = html.match(/static\.poly\.pizza\/([a-f0-9-]+)\.glb/);
      const titleMatch = html.match(/og:title" content="([^"]+?) - Free Model/) || html.match(/<title>([^<|]+)/);
      const title = (m.title || (titleMatch ? titleMatch[1].trim() : "")).replace(/ by .*$/, "").trim();
      const file = m.file || TITLE_TO_FILE[title];
      if (!glb) throw new Error("no glb link on page");
      if (!file) {
        console.log(`- ${m.id} "${title}" not needed, skipping`);
        continue;
      }
      const dest = path.join(OUT, file);
      const bytes = await download(`https://${glb[0]}`, dest);
      console.log(`+ ${file} <- ${title} by ${m.author} (${(bytes / 1024).toFixed(0)} KB)`);
      await optimise(dest);
      credits.push(`- **${title}** by ${m.author}, ${m.license}, ${pageUrl}`);
    } catch (err) {
      console.warn(`! ${m.id}: ${err.message}`);
    }
  }

  const md = [
    "# Credits",
    "",
    "Thunder Strike is a tribute to Desert Strike (Electronic Arts, 1992).",
    "",
    "## 3D models",
    "",
    "Models fetched by `scripts/fetch-assets.mjs`. Where a model is missing the game builds a primitive placeholder.",
    "",
    ...credits,
    "",
    "Zsky's models are licensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).",
    "Quaternius models are CC0 (public domain).",
    "",
    "## Sound",
    "",
    "All sound effects are synthesised at runtime with the Web Audio API.",
    "",
  ].join("\n");
  await writeFile(path.resolve("public/CREDITS.md"), md);
  console.log(`wrote public/CREDITS.md with ${credits.length} entries`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
