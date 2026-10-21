// Dev-only (dev/skin.html, not in the app build): every animation of a skin
// as a strip of stills, so art can be checked in a screenshot.
//   ?skin=<id>          which skin (default: the first built-in one)
//   &steps=6            stills per animation (spread over 0..1)
//   &scale=2            pixel scale
//   &only=trash         just one action (with its variants)
//   &t=0.5              one still per animation at that moment
//   &idle=1             the live scene between decisions (&n=3: after 3 decisions,
//                       once the last animation has finished)
// Example: /dev/skin.html?skin=royal&steps=8

import { listSkins, loadSkin } from "./index";
import { SKIN_EVENTS, type Animation } from "./format";
import { Stage } from "./stage";
import "../pixel/font";

const q = new URLSearchParams(location.search);

async function main() {
  const { skins } = await listSkins();
  const choice = skins.find((s) => s.id === q.get("skin")) ?? skins.find((s) => s.manifest);
  const loaded = choice && (await loadSkin(choice));
  if (!loaded) throw new Error(`no skin ${q.get("skin")}; have ${skins.map((s) => s.id).join(", ")}`);
  const m = loaded.manifest;
  const stage = new Stage(loaded);
  const scale = Number(q.get("scale") ?? 2);
  const steps = Number(q.get("steps") ?? 6);
  const ts = q.has("t") ? [Number(q.get("t"))] : Array.from({ length: steps }, (_, i) => (i + 0.5) / steps);
  const captions = { name: "report.pdf", newName: "Q3 Report.pdf", dest: "Documents", kind: "PDF" };
  stage.setFile("pdf"); // starts loading the file icon
  await new Promise((r) => setTimeout(r, 300));
  const rows: [string, Animation][] = [];
  for (const ev of SKIN_EVENTS) {
    if (q.has("only") && q.get("only") !== ev) continue;
    if (m.animations[ev]) rows.push([ev, m.animations[ev]!]);
    (m.variants?.[ev] ?? []).forEach((a, i) => rows.push([`${ev} v${i + 2}`, a]));
  }
  const [w, h] = m.size;
  if (q.has("idle")) {
    // The live stage: scenery animating, the file waiting for a decision.
    // Each decision plays its animation; the last one ends after a few seconds.
    for (let i = 0; i < Number(q.get("n") ?? 0); i++) stage.play("keep", "pdf", captions);
    stage.setFile("pdf");
    stage.canvas.style.width = `${w * scale}px`;
    document.body.append(stage.canvas);
    return;
  }
  for (const [label, anim] of rows) {
    const row = document.createElement("div");
    row.className = "row";
    const b = document.createElement("b");
    b.textContent = label;
    row.append(b);
    for (const t of ts) {
      stage.still(anim, t, "pdf", captions);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.style.width = `${w * scale}px`;
      c.getContext("2d")!.drawImage(stage.canvas, 0, 0);
      c.title = `t=${t.toFixed(2)}`;
      row.append(c);
    }
    document.body.append(row);
  }
  stage.destroy();
}

main().catch((e) => {
  const pre = document.createElement("pre");
  pre.textContent = String(e?.stack ?? e);
  document.body.append(pre);
});
