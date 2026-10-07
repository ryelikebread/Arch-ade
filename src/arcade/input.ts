// One input layer for every mini-game: arrows/WASD to move, Space/Z/J to
// fire, X/K/Shift for the second button, and the mouse for paddle games.

import type { Button, Input } from "./types";

const KEYS: Record<string, Button> = {
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  " ": "fire", z: "fire", Z: "fire", j: "fire", J: "fire",
  x: "alt", X: "alt", k: "alt", K: "alt", Shift: "alt",
};

export function buttonFor(key: string): Button | null {
  return KEYS[key] ?? null;
}

export class KeyInput implements Input {
  private down = new Set<Button>();
  private edge = new Set<Button>();
  private px: number | null = null;
  private click = false;

  keydown(key: string): boolean {
    const b = buttonFor(key);
    if (!b) return false;
    if (!this.down.has(b)) this.edge.add(b);
    this.down.add(b);
    return true;
  }

  keyup(key: string): boolean {
    const b = buttonFor(key);
    if (!b) return false;
    this.down.delete(b);
    return true;
  }

  pointer(x: number | null) {
    this.px = x;
  }

  pointerDown() {
    this.click = true;
  }

  /** Forget everything held (the window lost focus, or the game was paused). */
  release() {
    this.down.clear();
    this.edge.clear();
    this.click = false;
  }

  /** Call after each update: "pressed" only lasts one tick. */
  endTick() {
    this.edge.clear();
    this.click = false;
  }

  held(b: Button) {
    return this.down.has(b);
  }

  pressed(b: Button) {
    return this.edge.has(b);
  }

  pointerX() {
    return this.px;
  }

  clicked() {
    return this.click;
  }
}
