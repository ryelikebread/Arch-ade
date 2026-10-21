//! IPC for local AI categorization. Suggestions run on a worker thread and
//! stream to the UI as `ai-progress` events; approving them produces a
//! normal plan that goes through the same review, dry run and journal.

use std::panic::AssertUnwindSafe;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use arch_ade_core::ai::hints;
use arch_ade_core::ai::ollama::{Breaker, Llm, ModelInfo, Ollama};
use arch_ade_core::ai::review::{self, Approved};
use arch_ade_core::ai::suggest::{Suggester, Suggestion};
use arch_ade_core::ai::whitelist::{self, Whitelist};
use arch_ade_core::ai::{self, AiSettings};
use arch_ade_core::preview::Ctx;
use arch_ade_core::{platform, scan, Error};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::commands::{blocking, save, PlanOut, Res};
use crate::Shared;

/// A vision model on a laptop CPU can take a while per image.
const MODEL_TIMEOUT: Duration = Duration::from_secs(180);

static BUSY: AtomicBool = AtomicBool::new(false);
static CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiState {
    settings: AiSettings,
    whitelists: Vec<Whitelist>,
    decisions: i64,
    pdftotext: bool,
    ffprobe: bool,
}

#[tauri::command]
pub fn ai_state(state: State<'_, Shared>) -> Res<AiState> {
    let s = state.inner();
    Ok(AiState {
        settings: ai::load_settings(&s.db)?,
        whitelists: whitelist::load_all(&s.db)?,
        decisions: hints::count(&s.db)?,
        pdftotext: s.tools.pdftotext.is_some(),
        ffprobe: s.tools.ffprobe.is_some(),
    })
}

#[tauri::command]
pub fn ai_save_settings(state: State<'_, Shared>, settings: AiSettings) -> Res<()> {
    ai::save_settings(&state.db, &settings)
}

#[tauri::command]
pub fn ai_save_whitelists(state: State<'_, Shared>, whitelists: Vec<Whitelist>) -> Res<()> {
    whitelist::save_all(&state.db, &whitelists)
}

#[tauri::command]
pub fn ai_forget(state: State<'_, Shared>) -> Res<()> {
    hints::clear(&state.db)
}

/// "Test connection": the models installed in Ollama at `url`.
#[tauri::command]
pub async fn ai_models(url: String) -> Res<Vec<ModelInfo>> {
    blocking(move || {
        let o = Ollama::new(&url, Duration::from_secs(5)).map_err(Error::Plan)?;
        o.models().map_err(Error::Other)
    })
    .await
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Progress {
    done: usize,
    total: usize,
    suggestion: Option<Suggestion>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuggestOut {
    suggestions: Vec<Suggestion>,
    /// Why the model wasn't used, when the AI is on but unreachable.
    ai_error: Option<String>,
    cancelled: bool,
    /// Files skipped because something went wrong while reading them.
    failed: Vec<String>,
}

/// Suggestions for `paths` (files only; folders are skipped). With the AI on,
/// Ollama is checked once up front; if it's down, everything falls back to
/// tags, past decisions and the whitelist, and `ai_error` says why.
#[tauri::command]
pub async fn ai_suggest(
    app: AppHandle,
    state: State<'_, Shared>,
    paths: Vec<String>,
    settings: AiSettings,
) -> Res<SuggestOut> {
    if BUSY.swap(true, Ordering::SeqCst) {
        return Err(Error::Other("suggestions are already running".into()));
    }
    // Cleared however the run ends, so Suggest never gets stuck as "running".
    struct Idle;
    impl Drop for Idle {
        fn drop(&mut self) {
            BUSY.store(false, Ordering::SeqCst);
        }
    }
    let _idle = Idle;
    CANCEL.store(false, Ordering::SeqCst);
    let s = state.inner().clone();
    blocking(move || run_suggest(&app, &s, &paths, &settings)).await
}

fn run_suggest(app: &AppHandle, s: &Shared, paths: &[String], settings: &AiSettings) -> Res<SuggestOut> {
    let wl = whitelist::active(&s.db, &settings.whitelist_id)?;
    let mut ai_error = None;
    let ollama = if settings.enabled {
        match Ollama::new(&settings.url, MODEL_TIMEOUT).and_then(|o| o.models().map(|m| (o, m))) {
            Ok((o, models)) => {
                let have = |m: &str| models.iter().any(|x| x.name == m || x.name == format!("{m}:latest"));
                let missing: Vec<&str> = [settings.text_model.as_str(), settings.vision_model.as_str()]
                    .into_iter()
                    .filter(|m| !have(m))
                    .collect();
                if !missing.is_empty() {
                    ai_error =
                        Some(not_used(&format!("not installed in Ollama: {} (ollama pull …)", missing.join(", "))));
                }
                Some(o)
            }
            Err(e) => {
                ai_error = Some(not_used(&e));
                None
            }
        }
    } else {
        None
    };
    let breaker = ollama.as_ref().map(|o| Breaker::new(o));
    let llm: Option<&dyn Llm> = breaker.as_ref().map(|b| b as &dyn Llm);
    let sg = Suggester {
        db: &s.db,
        ctx: Ctx { db: &s.db, tools: &s.tools, platform: platform::current() },
        settings,
        whitelist: &wl,
        llm,
    };
    let files: Vec<PathBuf> = paths.iter().filter_map(|p| s.scope.check(Path::new(p)).ok()).collect();
    let total = files.len();
    let mut out = Vec::new();
    let mut failed = Vec::new();
    let mut cancelled = false;
    for (i, p) in files.iter().enumerate() {
        if CANCEL.load(Ordering::SeqCst) {
            cancelled = true;
            break;
        }
        // One line per file in the terminal, so if the app ever dies the last
        // line names the file it was working on.
        eprintln!("[categorize] {}/{total} {}", i + 1, p.display());
        let started = Instant::now();
        let parent = p.parent().unwrap_or(p);
        // A bug tripped by one odd file skips that file instead of ending the run.
        let sug = std::panic::catch_unwind(AssertUnwindSafe(|| {
            scan::entry_for(parent, p, false, platform::current()).filter(|e| !e.is_dir).map(|e| sg.suggest(&e))
        }));
        let sug = match sug {
            Ok(Some(sug)) => sug,
            Ok(None) => continue,
            Err(_) => {
                eprintln!("[categorize] skipped {} after an internal error", p.display());
                failed.push(p.to_string_lossy().into_owned());
                let _ = app.emit("ai-progress", Progress { done: i + 1, total, suggestion: None });
                continue;
            }
        };
        if let Some(w) = &sug.warning {
            eprintln!("[categorize]   {:.1}s, {w}", started.elapsed().as_secs_f32());
        }
        let _ = app.emit("ai-progress", Progress { done: i + 1, total, suggestion: Some(sug.clone()) });
        out.push(sug);
    }
    if let Some(b) = &breaker {
        if let Some(why) = b.tripped() {
            ai_error.get_or_insert(format!(
                "The AI stopped answering partway through, so the rest were suggested without it ({why})."
            ));
        } else if let Some(why) = b.images_off() {
            ai_error.get_or_insert(format!(
                "The AI failed on an image, so later images were judged by name and details only ({why})."
            ));
        }
    }
    Ok(SuggestOut { suggestions: out, ai_error, cancelled, failed })
}

fn not_used(why: &str) -> String {
    format!("AI not used: {why}. Showing suggestions without it.")
}

#[tauri::command]
pub fn ai_cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

/// Plan the approved suggestions. Category folders go under `dest`
/// (default: the open folder), which must already be in scope.
#[tauri::command]
pub async fn ai_plan(
    state: State<'_, Shared>,
    items: Vec<Approved>,
    dest: Option<String>,
    whitelist_id: String,
) -> Res<PlanOut> {
    let s = state.inner().clone();
    blocking(move || {
        let dest = match dest {
            Some(d) => PathBuf::from(d),
            None => crate::lock(&s.root).clone().ok_or_else(|| Error::Other("no folder open".into()))?,
        };
        // Only folders inside it are created or written; the planner checks each one.
        let dest = s.scope.check_readable(&dest)?;
        let rp = review::plan(&s.scope, platform::name_rules(), &dest, &whitelist_id, &items);
        let out = save(&s, rp.plan)?;
        if let Some(id) = out.id {
            review::save_pending(&s.db, id, &rp.decisions)?;
        }
        Ok(out)
    })
    .await
}
