// One table of shortcuts; "Mod" means Cmd on macOS and Ctrl elsewhere.

export type Action =
  | "open" | "undo" | "redo" | "selectAll" | "rename" | "trash" | "move" | "duplicates" | "search"
  | "help" | "history" | "up" | "down" | "toggleDryRun" | "escape" | "rules" | "categorize" | "fileByFile";

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

interface Binding {
  action: Action;
  key: string;
  mod?: boolean;
  shift?: boolean;
  label?: string;
}

export const BINDINGS: Binding[] = [
  { action: "open", key: "o", mod: true },
  { action: "undo", key: "z", mod: true },
  { action: "redo", key: "z", mod: true, shift: true },
  { action: "redo", key: "y", mod: true },
  { action: "selectAll", key: "a", mod: true },
  { action: "rename", key: "F2" },
  { action: "rename", key: "r", mod: true, shift: true },
  { action: "trash", key: "Delete" },
  { action: "trash", key: "Backspace", mod: true },
  { action: "move", key: "m", mod: true, shift: true },
  { action: "duplicates", key: "d", mod: true, shift: true },
  { action: "search", key: "f", mod: true },
  { action: "history", key: "h", mod: true, shift: true },
  { action: "toggleDryRun", key: "t", mod: true, shift: true },
  { action: "rules", key: "l", mod: true, shift: true },
  { action: "categorize", key: "k", mod: true, shift: true },
  { action: "fileByFile", key: "f", mod: true, shift: true },
  { action: "help", key: "F1" },
  { action: "help", key: "?", shift: true },
  { action: "up", key: "ArrowUp" },
  { action: "down", key: "ArrowDown" },
  { action: "escape", key: "Escape" },
];

export function match(e: KeyLike, isMac: boolean): Action | null {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  // On macOS Ctrl is not our modifier; on others Meta (Win key) is not.
  const otherMod = isMac ? e.ctrlKey : e.metaKey;
  if (otherMod || e.altKey) return null;
  for (const b of BINDINGS) {
    const keyMatch = b.key.length === 1 ? e.key.toLowerCase() === b.key : e.key === b.key;
    if (!keyMatch) continue;
    if (!!b.mod !== mod) continue;
    // "?" needs Shift on most layouts; treat shift as implied for it.
    if (b.key !== "?" && !!b.shift !== e.shiftKey) continue;
    return b.action;
  }
  return null;
}

export function label(action: Action, isMac: boolean): string {
  const b = BINDINGS.find((x) => x.action === action);
  if (!b) return "";
  const parts: string[] = [];
  if (b.mod) parts.push(isMac ? "Cmd" : "Ctrl");
  if (b.shift && b.key !== "?") parts.push("Shift");
  parts.push(b.key.length === 1 ? b.key.toUpperCase() : b.key);
  return parts.join("+");
}
