import { invoke } from "@tauri-apps/api/core";
import type {
  AppInfo, DupeGroup, PlanOut, PlanSummary, Preview, RenameOptions, RenameRow, RunReport, ScanOptions, ScanResult,
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
};
