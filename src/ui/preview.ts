import { convertFileSrc } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { api } from "../api";
import { formatDate, formatSize } from "../lib/format";
import type { FileEntry, Preview } from "../types";
import { h } from "./dom";

// Content shown in the iframe can't run scripts (sandbox) and can't load
// anything from the network (CSP), so previews never leave the machine.
const FRAME_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

function sandboxed(html: string): HTMLIFrameElement {
  const doc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<style>body{font:14px/1.5 system-ui,sans-serif;margin:12px;color:#222;background:#fff}img{max-width:100%}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:2px 6px}</style>${html}`;
  // Empty sandbox: no scripts, no forms, no same-origin access, no top navigation.
  return h("iframe", { sandbox: "", srcdoc: doc, referrerpolicy: "no-referrer" });
}

function dataPng(b64: string) {
  return `data:image/png;base64,${b64}`;
}

export class PreviewPane {
  readonly el: HTMLElement;
  private title = h("h2", {}, "Preview");
  private body = h("div", { class: "body" });
  private details = h("div", { class: "details" });
  private seq = 0;

  private fullBtn = h("button", { class: "preview-full", title: "Full screen (Space; Esc to leave)", onclick: () => this.toggleFull() }, "Full screen");

  /** `fullScreen`: offer the full-screen button (the main window). */
  constructor(opts: { fullScreen?: boolean } = {}) {
    this.el = h("aside", { class: "preview" }, h("div", { class: "preview-head" }, this.title, ...(opts.fullScreen ? [this.fullBtn] : [])), this.body, this.details);
    this.clear();
  }

  get full(): boolean {
    return this.el.classList.contains("full");
  }

  /** Fill the window with the preview; arrow keys keep moving through files. */
  toggleFull(on = !this.full) {
    this.el.classList.toggle("full", on);
    this.fullBtn.textContent = on ? "Exit full screen" : "Full screen";
  }

  clear(message = "Select a file to preview it.") {
    this.seq++;
    this.title.textContent = "Preview";
    this.body.replaceChildren(h("p", { class: "note" }, message));
    this.details.replaceChildren();
  }

  async show(entry: FileEntry) {
    const my = ++this.seq;
    this.title.textContent = entry.name;
    this.body.replaceChildren(h("p", { class: "note" }, "Loading…"));
    this.details.replaceChildren(this.detailTable(entry, null));
    let p: Preview;
    try {
      p = await api.preview(entry.path);
    } catch (e) {
      if (my !== this.seq) return;
      this.body.replaceChildren(h("p", { class: "warn" }, String(e)));
      return;
    }
    if (my !== this.seq) return; // a newer selection won
    this.body.replaceChildren(...(await this.render(p, my)));
    this.details.replaceChildren(this.detailTable(entry, p));
  }

  private async render(p: Preview, my: number): Promise<Node[]> {
    const b = p.body;
    const out: Node[] = [];
    switch (b.type) {
      case "imageFile":
        out.push(h("div", { class: "preview-image" }, h("img", { src: convertFileSrc(b.path), alt: p.name })));
        if (b.width) out.push(h("p", { class: "note" }, `${b.width} × ${b.height}`));
        break;
      case "imagePng":
        out.push(h("div", { class: "preview-image" }, h("img", { src: dataPng(b.pngBase64), alt: p.name })));
        out.push(h("p", { class: "note" }, [b.note, b.width ? `${b.width} × ${b.height} preview` : ""].filter(Boolean).join(" · ")));
        break;
      case "text":
        out.push(...this.text(b.text, b.syntax));
        if (b.truncated) out.push(h("p", { class: "note" }, "Showing the beginning of the file."));
        break;
      case "table": {
        if (b.sheets.length > 1) out.push(h("p", { class: "note" }, `Sheet 1 of ${b.sheets.length}: ${b.sheets[0]}`));
        const [head, ...rest] = b.rows;
        out.push(
          h(
            "table",
            { class: "grid" },
            head ? h("tr", {}, ...head.map((c) => h("th", {}, c))) : null,
            ...rest.map((r) => h("tr", {}, ...r.map((c) => h("td", { title: c }, c)))),
          ),
        );
        if (b.truncated) out.push(h("p", { class: "note" }, "Showing the first rows and columns."));
        break;
      }
      case "document":
        out.push(...b.paragraphs.map((t) => h("p", {}, t)));
        if (b.truncated) out.push(h("p", { class: "note" }, "Showing the beginning of the document."));
        break;
      case "pdf":
        out.push(await this.pdf(b.path, my));
        break;
      case "gdoc":
        out.push(
          h("p", {}, h("strong", {}, b.title)),
          b.account ? h("p", { class: "note" }, `Account: ${b.account}`) : h("span"),
          b.url
            ? h("button", { onclick: () => openUrl(b.url!) }, "Open in browser")
            : h("p", { class: "note" }, "No link in this file."),
          h("p", { class: "note" }, "This is a Google Drive shortcut; the document itself lives online."),
        );
        break;
      case "archive":
        out.push(
          h("p", { class: "note" }, `${b.total}${b.truncated ? "+" : ""} entries · listed with ${b.via} · never extracted`),
          h(
            "table",
            { class: "list" },
            ...b.entries.map((e) =>
              h("tr", {}, h("td", {}, e.name), h("td", { class: "num" }, e.isDir || e.size == null ? "" : formatSize(e.size))),
            ),
          ),
        );
        break;
      case "media":
        out.push(this.media(b.path, b.video, b.playable, b.posterBase64));
        break;
      case "metadataOnly":
        if (p.thumbnailBase64) out.push(h("div", { class: "preview-image" }, h("img", { src: dataPng(p.thumbnailBase64), alt: "" })));
        out.push(h("p", { class: "note" }, b.reason || "No preview for this type."));
        break;
    }
    for (const w of p.warnings) out.push(h("p", { class: "warn" }, w));
    return out;
  }

  private text(text: string, syntax: "plain" | "markdown" | "json" | "html"): Node[] {
    if (syntax === "markdown") {
      const html = DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
      return [sandboxed(html)];
    }
    if (syntax === "html") {
      const showSource = h("button", {}, "Show source");
      const frame = sandboxed(DOMPurify.sanitize(text, { WHOLE_DOCUMENT: true }));
      const src = h("pre", { hidden: true }, text);
      showSource.addEventListener("click", () => {
        src.hidden = !src.hidden;
        frame.hidden = !src.hidden;
        showSource.textContent = src.hidden ? "Show source" : "Show page";
      });
      return [showSource, frame, src, h("p", { class: "note" }, "Rendered without scripts or network access.")];
    }
    if (syntax === "json") {
      try {
        return [h("pre", {}, JSON.stringify(JSON.parse(text), null, 2))];
      } catch {
        /* truncated or invalid: show as-is */
      }
    }
    return [h("pre", {}, text)];
  }

  private media(path: string, video: boolean, playable: boolean, poster: string | null): Node {
    const wrap = h("div", {});
    const posterImg = poster ? h("img", { src: dataPng(poster), alt: "", style: "max-width:100%" }) : null;
    const fallback = () =>
      wrap.replaceChildren(
        ...(posterImg ? [posterImg] : []),
        h("p", { class: "note" }, "This format can't be played here; showing metadata only."),
      );
    if (!playable) {
      fallback();
      return wrap;
    }
    const el = video
      ? h("video", { controls: true, preload: "metadata", src: convertFileSrc(path), poster: poster ? dataPng(poster) : undefined })
      : h("audio", { controls: true, preload: "metadata", src: convertFileSrc(path) });
    el.addEventListener("error", fallback);
    wrap.append(el);
    return wrap;
  }

  private async pdf(path: string, my: number): Promise<Node> {
    const box = h("div", { class: "pdf" });
    try {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const bytes = new Uint8Array(await api.readBytes(path));
      // Rendering only: pdf.js never runs embedded JavaScript, and CSP blocks network loads.
      const doc = await pdfjs.getDocument({ data: bytes, enableXfa: false }).promise;
      box.append(h("p", { class: "note" }, `${doc.numPages} page${doc.numPages === 1 ? "" : "s"}`));
      const pages = Math.min(doc.numPages, 10);
      for (let i = 1; i <= pages; i++) {
        if (my !== this.seq) break;
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = h("canvas", { width: viewport.width, height: viewport.height });
        box.append(canvas);
        await page.render({ canvas, viewport }).promise;
      }
      if (doc.numPages > pages) box.append(h("p", { class: "note" }, `First ${pages} pages shown.`));
    } catch (e) {
      box.append(h("p", { class: "warn" }, `Could not render PDF: ${e}`));
    }
    return box;
  }

  private detailTable(e: FileEntry, p: Preview | null): HTMLElement {
    const rows: [string, string][] = [
      ["Path", e.path],
      ["Size", e.isDir ? "" : `${formatSize(e.size)} (${e.size.toLocaleString()} bytes)`],
      ["Kind", p ? `${p.kindLabel} · ${p.mime}` : e.kindLabel],
      ["Created", formatDate(e.created)],
      ["Modified", formatDate(e.modified)],
      ["Added", formatDate(e.added)],
    ];
    const s = e.source;
    if (s) {
      if (s.url) rows.push(["Downloaded from", s.url]);
      if (s.referrer) rows.push(["Referrer", s.referrer]);
      rows.push(["App", s.app ? (s.appConfidence === "inferred" ? `${s.app} (inferred from URL)` : s.app) : "unknown"]);
      if (s.downloadedAt) rows.push(["Downloaded", formatDate(s.downloadedAt * 1000)]);
      if (s.zone != null) rows.push(["Security zone", String(s.zone)]);
    }
    if (p) rows.push(...p.details);
    return h(
      "table",
      {},
      ...rows.filter(([, v]) => v !== "").map(([k, v]) => h("tr", {}, h("td", {}, k), h("td", {}, v))),
    );
  }
}
