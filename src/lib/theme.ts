// Color schemes are JSON files: a name plus a small fixed palette.

export const COLOR_KEYS = [
  "bg", "panel", "panel2", "ink", "dim", "accent", "accent2", "danger", "ok", "select", "grid",
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export interface Theme {
  id: string;
  name: string;
  colors: Record<ColorKey, string>;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Returns the theme if it's well-formed, otherwise a list of problems. */
export function validateTheme(v: unknown): Theme | string[] {
  const errs: string[] = [];
  if (typeof v !== "object" || v === null) return ["theme must be an object"];
  const t = v as Record<string, unknown>;
  if (typeof t.id !== "string" || !/^[a-z0-9-]+$/.test(t.id)) errs.push("id must be lowercase letters, digits, dashes");
  if (typeof t.name !== "string" || !t.name) errs.push("name is required");
  const colors = t.colors as Record<string, unknown> | undefined;
  if (typeof colors !== "object" || colors === null) {
    errs.push("colors is required");
  } else {
    for (const k of COLOR_KEYS) {
      if (typeof colors[k] !== "string" || !HEX.test(colors[k] as string)) errs.push(`colors.${k} must be #rrggbb`);
    }
  }
  return errs.length ? errs : (v as Theme);
}

export function applyTheme(t: Theme, root: HTMLElement = document.documentElement) {
  for (const k of COLOR_KEYS) root.style.setProperty(`--${k}`, t.colors[k]);
  root.dataset.theme = t.id;
}
