// Tells you when the window is hidden or minimized, so animation and sound
// can stop. Minimizing doesn't always fire visibilitychange in a webview,
// so the window's own minimized state is checked on resize too.

import { getCurrentWindow } from "@tauri-apps/api/window";

export function onWindowHidden(cb: (hidden: boolean) => void): () => void {
  const cleanup: (() => void)[] = [];
  const onVis = () => cb(document.hidden);
  document.addEventListener("visibilitychange", onVis);
  cleanup.push(() => document.removeEventListener("visibilitychange", onVis));
  let gone = false;
  let win: ReturnType<typeof getCurrentWindow>;
  try {
    win = getCurrentWindow();
  } catch {
    // Not inside the app (a dev preview page): visibilitychange is enough.
    return () => cleanup.forEach((f) => f());
  }
  win
    .onResized(async () => cb(document.hidden || (await win.isMinimized())))
    .then((un) => (gone ? un() : cleanup.push(un)))
    .catch(() => {});
  return () => {
    gone = true;
    cleanup.forEach((f) => f());
  };
}
