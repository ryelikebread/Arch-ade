// Tiny DOM helpers; the app has no framework.

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = String(v);
    else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c);
  return el;
}

/** A modal <dialog> with title, content and action buttons. Resolves when closed. */
export function modal(opts: {
  title: string;
  content: Node;
  actions?: HTMLElement[];
  left?: Node | string;
  small?: boolean;
  onClose?: () => void;
}): { dialog: HTMLDialogElement; close: () => void } {
  const dialog = h("dialog", { class: opts.small ? "small" : "" });
  const close = () => {
    dialog.close();
  };
  dialog.addEventListener("close", () => {
    dialog.remove();
    opts.onClose?.();
  });
  dialog.append(
    h(
      "div",
      { class: "dlg" },
      h("h3", {}, opts.title),
      h("div", { class: "content" }, opts.content),
      h(
        "div",
        { class: "actions" },
        h("span", { class: "left" }, opts.left ?? ""),
        ...(opts.actions ?? []),
        h("button", { onclick: close }, opts.actions?.length ? "Cancel" : "Close"),
      ),
    ),
  );
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}
