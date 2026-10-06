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
  /** Set on folders that are project roots; their contents are protected. */
  project: string | null;
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
  | { type: "trash"; path: string }
  | { type: "copy"; from: string; to: string }
  | { type: "archive"; from: string; to: string }
  | { type: "tag"; path: string; tags: string[] };

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
  pdftotext: string | null;
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

// ---------- rules (see crates/arch-ade-core/src/rules.rs) ----------

export type AgeDate = "added" | "created" | "modified" | "downloaded";
export type SizeValue = number | string;

export type Test =
  | { type: "kind"; kinds: Kind[] }
  | { type: "extension"; extensions: string[] }
  | { type: "sourceDomain"; domains: string[] }
  | { type: "sourceUrl"; pattern: string }
  | { type: "app"; apps: string[] }
  | { type: "size"; atLeast?: SizeValue; atMost?: SizeValue }
  | { type: "age"; date?: AgeDate; olderThanDays?: number; newerThanDays?: number }
  | { type: "nameRegex"; pattern: string; caseSensitive?: boolean };

export type Condition = Test & { not?: boolean };

export type IfExists = "rename" | "skip";

export type RuleAction =
  | { type: "move"; to: string; ifExists?: IfExists }
  | { type: "copy"; to: string; ifExists?: IfExists }
  | { type: "rename"; pattern: string }
  | { type: "tag"; tags: string[] }
  | { type: "trash" }
  | { type: "archive"; to: string; removeOriginal?: boolean; ifExists?: IfExists };

export interface Rule {
  id: string;
  name: string;
  enabled?: boolean;
  auto?: boolean;
  group?: string;
  folders?: string[];
  match?: "all" | "any";
  conditions: Condition[];
  actions: RuleAction[];
}

export interface RulesState {
  rules: Rule[];
  templates: Rule[];
  tagsSupported: boolean;
}

export interface RuleMatch {
  path: string;
  ruleId: string;
  ruleName: string;
  destination: string | null;
  skipped: string | null;
}

export interface RulesPlanOut extends PlanOut {
  matches: RuleMatch[];
  ruleErrors: string[];
}

export interface Destination {
  ruleId: string;
  path: string;
  exists: boolean;
  allowed: boolean;
}

export interface Watched {
  folders: string[];
  pending: number;
}

export interface Activity {
  id: number;
  at: number;
  folder: string;
  path: string;
  ruleId: string;
  ruleName: string;
  outcome: "skipped" | "dryRun" | "applied" | "failed";
  destination: string | null;
  planId: number | null;
  message: string | null;
}

export interface ActivityEvent {
  folder: string;
  outcome: "skipped" | "dryRun" | "applied" | "failed";
  files: number;
  label: string;
  planId: number | null;
  error: string | null;
}

export interface UpdateInfo {
  version: string;
  required: boolean;
  notes: string;
  url: string | null;
}

// ---------- Phase 3: local AI categorization ----------

export type AiMode = "refined" | "consistent";

export interface AiSettings {
  enabled: boolean;
  url: string;
  textModel: string;
  visionModel: string;
  mode: AiMode;
  renameOnly: boolean;
  analyzeImages: boolean;
  whitelistId: string;
}

export interface Subcategory {
  name: string;
  keywords: string[];
}

export interface Category {
  name: string;
  description: string;
  subcategories: Subcategory[];
  kinds: Kind[];
  extensions: string[];
  keywords: string[];
}

export interface Whitelist {
  id: string;
  name: string;
  categories: Category[];
  fallback: string;
}

export interface AiState {
  settings: AiSettings;
  whitelists: Whitelist[];
  decisions: number;
  pdftotext: boolean;
  ffprobe: boolean;
}

export type SuggestionSource = "ai" | "hint" | "media" | "guess";

export interface Suggestion {
  path: string;
  name: string;
  kind: Kind;
  category: string;
  subcategory: string;
  newName: string;
  source: SuggestionSource;
  reason: string;
  newSubcategory: boolean;
  screenshot: boolean;
  warning: string | null;
  domain: string | null;
}

export interface SuggestOut {
  suggestions: Suggestion[];
  aiError: string | null;
  cancelled: boolean;
}

export interface AiProgress {
  done: number;
  total: number;
  suggestion: Suggestion | null;
}

export interface Approved {
  path: string;
  category: string;
  subcategory: string;
  newName: string;
  source: string;
  domain: string | null;
}

export interface ModelInfo {
  name: string;
  size: number;
}
