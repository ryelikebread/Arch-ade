// Builds the built-in skins' sprite sheets and manifests:
//   node scripts/build-skins.mjs
// Writes src/skins/builtin/<id>/{sheet.png,manifest.json}. Commit the output.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pack, png } from "./skins/lib.mjs";
import * as space from "./skins/space.mjs";
import * as volcano from "./skins/volcano.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const skin of [volcano, space]) {
  const { sheet, rects } = pack(skin.sprites);
  const out = join(root, "src/skins/builtin", skin.manifest.id);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "sheet.png"), png(sheet));
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ ...skin.manifest, sprites: rects }, null, 1) + "\n");
  console.log(`${skin.manifest.id}: ${Object.keys(rects).length} sprites, sheet ${sheet.w}x${sheet.h}`);
}
