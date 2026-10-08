// Builds the built-in skins' sprite sheets and manifests:
//   node scripts/build-skins.mjs            (all of them)
//   node scripts/build-skins.mjs royal      (just one)
// Every scripts/skins/<id>.mjs except lib.mjs is a skin. Writes
// src/skins/builtin/<id>/{sheet.png,manifest.json}. Commit the output.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pack, png } from "./skins/lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "scripts/skins");
const only = process.argv[2];
for (const f of readdirSync(dir).sort()) {
  if (!f.endsWith(".mjs") || f === "lib.mjs" || (only && f !== `${only}.mjs`)) continue;
  const skin = await import(pathToFileURL(join(dir, f)).href);
  const { sheet, rects } = pack(skin.sprites);
  const out = join(root, "src/skins/builtin", skin.manifest.id);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "sheet.png"), png(sheet));
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ ...skin.manifest, sprites: rects }, null, 1) + "\n");
  console.log(`${skin.manifest.id}: ${Object.keys(rects).length} sprites, sheet ${sheet.w}x${sheet.h}`);
}
