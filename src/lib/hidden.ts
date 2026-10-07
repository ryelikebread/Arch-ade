// Tells you when the window is hidden or minimized, so animation and sound
// can stop. Minimizing doesn't always fire visibilitychange in a webview,
// so the window's own minimized state is checked on resize too.

import { getCurrentWindow } from "@tauri-apps/api/window";

export function onWindowHidden(cb: (hidden: boolean) => void): () => void {
  const cleanup: (() => void)[] = [];
  // Resizes fire often; only report actual changes.
  let last = document.hidden;
  const report = (v: boolean) => {
    if (v === last) return;
    last = v;
    cb(v);
  };
  const onVis = () => report(document.hidden);
  document.addEventListener("visibilitychange", onVis);
  cleanup.push(() => document.removeEventListener("visibilitychange", onVis));
  let gone = false;
  getCurrentWindow()
    .onResized(async () => report(document.hidden || (await getCurrentWindow().isMinimized())))
    .then((un) => (gone ? un() : cleanup.push(un)))
    .catch(() => {});
  return () => {
    gone = true;
    cleanup.forEach((f) => f());
  };
}
