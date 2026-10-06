// Shapes returned by the Rust commands (see src-tauri/src/commands.rs).

export type Kind =
  | "folder" | "image" | "rawImage" | "heic" | "vector" | "pdf" | "text" | "markdown" | "json"
  | "csv" | "html" | "docx" | "xlsx" | "gdoc" | "audio" | "video" | "archive" | "diskImage"
  | "installer" | "unknown";

export interface SourceInfo {
  url: string | null;
  referrer: string | null;
  domain: string | null;
  app: string | null;
  appConfidence: "reported" | "inferred" | "unknown";
  downloadedAt: number | null;
  zone: number | null;
}

export interface FileEntry {
  path: string;
  rel: string;
  name: string;
  ext: string;
  kind: Kind;
  kindLabel: string;
  isDir: boolean;
  isSymlink: boolean;
  size: number;
  created: number | null;
  modified: number | null;
  added: number | null;
  source: SourceInfo | null;
}

export interface ScanResult {
  root: string;
  entries: FileEntry[];
  errors: string[];
}

export interface ScanOptions {
  recursive: boolean;
  includeHidden: boolean;
  maxDepth: number;
}

export type PreviewBody =
  | { type: "imageFile"; path: string; width: number | null; height: number | null }
  | { type: "imagePng"; pngBase64: string; width: number | null; height: number | null; note: string | null }
  | { type: "text"; text: string; truncated: boolean; syntax: "plain" | "markdown" | "json" | "html" }
  | { type: "table"; rows: string[][]; truncated: boolean; sheets: string[] }
  | { type: "document"; paragraphs: string[]; truncated: boolean }
  | { type: "pdf"; path: string }
  | { type: "gdoc"; title: string; url: string | null; account: string | null }
  | { type: "archive"; entries: { name: string; size: number | null; isDir: boolean }[]; total: number; truncated: boolean; via: string }
  | { type: "media"; path: string; video: boolean; playable: boolean; posterBase64: string | null }
  | { type: "metadataOnly"; reason: string };

export interface Preview {
  path: string;
  name: string;
  kind: Kind;
  kindLabel: string;
  mime: string;
  size: number;
  body: PreviewBody;
  details: [string, string][];
  thumbnailBase64: string | null;
  warnings: string[];
}

export type Op =
  | { type: "mkdir"; path: string }
  | { type: "move"; from: string; to: string }
  | { type: "trash"; path: string };

export interface Plan {
  label: string;
  ops: (Op & { expect?: unknown })[];
  issues: { path: string; message: string; blocking: boolean }[];
}

export interface PlanOut {
  id: number | null;
  plan: Plan;
  dryRun: boolean;
}

export interface RunReport {
  planId: number;
  label: string;
  direction: "apply" | "undo" | "redo";
  done: number;
  skipped: number;
  total: number;
  error: string | null;
  status: string;
}

export interface PlanSummary {
  id: number;
  label: string;
  status: string;
  created: number;
  appliedAt: number | null;
  undoneAt: number | null;
  opCount: number;
}

export interface RenameOptions {
  pattern: string;
  start: number;
  step: number;
  dateSource: "modified" | "created";
}

export interface RenameRow {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  status: "ok" | "unchanged" | "invalid" | "duplicate" | "exists";
  message: string | null;
}

export interface DupeGroup {
  size: number;
  hash: string;
  files: string[];
  wasted: number;
}

export interface Tools {
  ffprobe: string | null;
  ffmpeg: string | null;
  exiftool: string | null;
  bsdtar: string | null;
  sevenzip: string | null;
  qlmanage: string | null;
  ffmpegthumbnailer: string | null;
}

export interface AppInfo {
  name: string;
  version: string;
  os: "macos" | "windows" | "linux";
  modifier: "Cmd" | "Ctrl";
  tools: Tools;
  dataDir: string;
  interruptedPlans: number[];
}
