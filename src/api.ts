import { invoke } from "@tauri-apps/api/core";
import type {
  Activity, AppInfo, Destination, DupeGroup, PlanOut, PlanSummary, Preview, RenameOptions, RenameRow, Rule, RulesPlanOut,
  RulesState, RunReport, ScanOptions, ScanResult, UpdateInfo, Watched,
} from "./types";

export const api = {
  appInfo: () => invoke<AppInfo>("app_info"),
  defaultFolders: () => invoke<{ label: string; path: string }[]>("default_folders"),
  openFolder: (path: string, options: ScanOptions) => invoke<ScanResult>("open_folder", { path, options }),
  addDestination: (path: string) => invoke<string>("add_destination", { path }),
  rescan: (options: ScanOptions) => invoke<ScanResult>("rescan", { options }),
  preview: (path: string) => invoke<Preview>("preview", { path }),
  readBytes: (path: string) => invoke<ArrayBuffer>("read_bytes", { path }),
  findDuplicates: (paths: string[]) => invoke<DupeGroup[]>("find_duplicates", { paths }),
  renamePreview: (paths: string[], options: RenameOptions) => invoke<RenameRow[]>("rename_preview", { paths, options }),
  planRename: (paths: string[], options: RenameOptions) => invoke<PlanOut>("plan_rename", { paths, options }),
  planTrash: (paths: string[]) => invoke<PlanOut>("plan_trash", { paths }),
  planMove: (paths: string[], dest: string) => invoke<PlanOut>("plan_move", { paths, dest }),
  applyPlan: (id: number) => invoke<RunReport>("apply_plan", { id }),
  undo: () => invoke<RunReport | null>("undo"),
  redo: () => invoke<RunReport | null>("redo"),
  journalState: () => invoke<{ canUndo: boolean; canRedo: boolean }>("journal_state"),
  history: () => invoke<PlanSummary[]>("history"),
  getSettings: () => invoke<Record<string, unknown>>("get_settings"),
  setSetting: (key: string, value: unknown) => invoke<void>("set_setting", { key, value }),
  userThemes: () => invoke<unknown[]>("user_themes"),
  rulesGet: () => invoke<RulesState>("rules_get"),
  rulesSave: (rules: Rule[]) => invoke<void>("rules_save", { rules }),
  /** Saved enabled rules on the open folder, or `rules` (unsaved, all treated as on). */
  planRules: (folder?: string, rules?: Rule[]) => invoke<RulesPlanOut>("plan_rules", { folder, rules }),
  ruleDestinations: (rules: Rule[]) => invoke<Destination[]>("rule_destinations", { rules }),
  allowDestination: (path: string, create: boolean) => invoke<string>("allow_destination", { path, create }),
  watchedFolders: () => invoke<Watched>("watched_folders"),
  setWatchedFolders: (folders: string[]) => invoke<Watched>("set_watched_folders", { folders }),
  ruleActivity: () => invoke<Activity[]>("rule_activity"),
  updateInfo: () => invoke<UpdateInfo | null>("update_info"),
};
