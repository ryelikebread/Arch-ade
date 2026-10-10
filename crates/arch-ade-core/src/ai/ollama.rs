//! A small client for a local Ollama server (`/api/tags`, `/api/chat`).
//!
//! Only loopback URLs are accepted, proxies are never used, and requests are
//! non-streaming JSON, so the same code runs on macOS, Windows and Linux.

use std::time::Duration;

use serde::{Deserialize, Serialize};

/// One chat turn: a system prompt, a user prompt and optional images.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct ChatRequest {
    pub model: String,
    pub system: String,
    pub user: String,
    /// Base64 JPEG/PNG images for a vision model.
    pub images: Vec<String>,
    /// JSON schema the reply must follow (Ollama structured outputs).
    pub schema: serde_json::Value,
    pub temperature: f32,
    pub seed: Option<i64>,
}

/// Anything that can answer a [`ChatRequest`]; Ollama in the app, a fake in tests.
pub trait Llm: Send + Sync {
    fn chat(&self, req: &ChatRequest) -> Result<String, String>;
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub name: String,
    pub size: u64,
}

/// `http://localhost:11434`, `http://127.0.0.1:…` or `http://[::1]:…` only.
pub fn check_local_url(url: &str) -> Result<(), String> {
    let rest = url
        .strip_prefix("http://")
        .ok_or_else(|| "the Ollama address must start with http:// (it runs on this computer)".to_string())?;
    let authority = rest.split('/').next().unwrap_or("");
    if authority.contains('@') {
        return Err("the Ollama address may not contain a user name".into());
    }
    let host = if let Some(v6) = authority.strip_prefix('[') {
        v6.split(']').next().unwrap_or("")
    } else {
        authority.rsplit_once(':').map_or(authority, |(h, _)| h)
    };
    let local =
        host.eq_ignore_ascii_case("localhost") || host.parse::<std::net::IpAddr>().is_ok_and(|ip| ip.is_loopback());
    if local {
        Ok(())
    } else {
        Err(format!("{host:?} is not this computer; Arch-ade only talks to a local Ollama (localhost / 127.0.0.1)"))
    }
}

pub struct Ollama {
    base: String,
    agent: ureq::Agent,
}

impl Ollama {
    pub fn new(url: &str, timeout: Duration) -> Result<Self, String> {
        check_local_url(url)?;
        let config = ureq::Agent::config_builder()
            .proxy(None) // never route local traffic through a proxy
            .max_redirects(0) // a redirect could point off the machine
            .timeout_global(Some(timeout))
            .http_status_as_error(false)
            .build();
        Ok(Ollama { base: url.trim_end_matches('/').to_string(), agent: ureq::Agent::new_with_config(config) })
    }

    /// Installed models, or why Ollama can't be reached.
    pub fn models(&self) -> Result<Vec<ModelInfo>, String> {
        let mut resp = self.agent.get(format!("{}/api/tags", self.base)).call().map_err(unreachable)?;
        let status = resp.status().as_u16();
        let body = resp.body_mut().read_to_string().map_err(|e| e.to_string())?;
        if status != 200 {
            return Err(format!("Ollama answered {status}: {}", error_text(&body)));
        }
        #[derive(Deserialize)]
        struct Tags {
            models: Vec<ModelInfo>,
        }
        let tags: Tags = serde_json::from_str(&body).map_err(|e| format!("unexpected reply from Ollama: {e}"))?;
        Ok(tags.models)
    }
}

impl Llm for Ollama {
    fn chat(&self, req: &ChatRequest) -> Result<String, String> {
        let mut user = serde_json::json!({ "role": "user", "content": req.user });
        if !req.images.is_empty() {
            user["images"] = serde_json::json!(req.images);
        }
        let mut options = serde_json::json!({ "temperature": req.temperature });
        if let Some(seed) = req.seed {
            options["seed"] = seed.into();
        }
        let body = serde_json::json!({
            "model": req.model,
            "stream": false,
            "format": req.schema,
            "options": options,
            "messages": [{ "role": "system", "content": req.system }, user],
        });
        let mut resp = self.agent.post(format!("{}/api/chat", self.base)).send_json(&body).map_err(unreachable)?;
        let status = resp.status().as_u16();
        let text = resp.body_mut().read_to_string().map_err(|e| e.to_string())?;
        if status == 404 {
            return Err(format!("model {:?} is not installed (run: ollama pull {})", req.model, req.model));
        }
        if status != 200 {
            return Err(model_error(status, &error_text(&text)));
        }
        let v: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("unexpected reply from Ollama: {e}"))?;
        v.pointer("/message/content")
            .and_then(|c| c.as_str())
            .map(str::to_string)
            .ok_or_else(|| "Ollama's reply had no message".to_string())
    }
}

fn unreachable(e: ureq::Error) -> String {
    match e {
        ureq::Error::Timeout(_) => "Ollama took too long to answer".into(),
        ureq::Error::Io(_) | ureq::Error::ConnectionFailed | ureq::Error::HostNotFound => {
            "Ollama isn't running (start the Ollama app, or run `ollama serve`)".into()
        }
        other => other.to_string(),
    }
}

/// Ollama answers 500 when the model runner itself dies, usually because
/// the model didn't fit in memory or choked on an image.
fn model_error(status: u16, err: &str) -> String {
    let lower = err.to_ascii_lowercase();
    if lower.contains("runner process has terminated") || lower.contains("model runner has unexpectedly stopped") {
        format!(
            "the model crashed inside Ollama ({err}); this is usually too little free memory: close other apps, pick a smaller model, or turn off Analyze images"
        )
    } else {
        format!("Ollama answered {status}: {err}")
    }
}

/// Wraps a model for one run so a failing Ollama can't drag the run out:
/// after [`Breaker::LIMIT`] failures in a row (down, crashing or timing out)
/// the model isn't asked again, and after the first failure with an image
/// attached, images aren't sent again (the suggester then asks by name only).
/// Without this, every remaining file waits out its own timeout or makes
/// Ollama reload a model that keeps crashing.
pub struct Breaker<'a> {
    inner: &'a dyn Llm,
    state: std::sync::Mutex<BreakerState>,
}

#[derive(Default)]
struct BreakerState {
    in_a_row: u32,
    last: Option<String>,
    image_error: Option<String>,
}

impl<'a> Breaker<'a> {
    pub const LIMIT: u32 = 3;

    pub fn new(inner: &'a dyn Llm) -> Self {
        Breaker { inner, state: Default::default() }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, BreakerState> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Why images stopped being sent, once they have.
    pub fn images_off(&self) -> Option<String> {
        self.state().image_error.clone()
    }

    /// Why the breaker tripped, once it has.
    pub fn tripped(&self) -> Option<String> {
        let st = self.state();
        (st.in_a_row >= Self::LIMIT).then(|| st.last.clone().unwrap_or_default())
    }
}

impl Llm for Breaker<'_> {
    fn chat(&self, req: &ChatRequest) -> Result<String, String> {
        if let Some(last) = self.tripped() {
            return Err(format!("not asked: the model failed {} times in a row (last: {last})", Self::LIMIT));
        }
        if !req.images.is_empty() && self.state().image_error.is_some() {
            return Err("images are off for the rest of this run after an earlier one failed".into());
        }
        let out = self.inner.chat(req);
        let mut st = self.state();
        match &out {
            Ok(_) => (st.in_a_row, st.last) = (0, None),
            Err(e) => {
                st.in_a_row += 1;
                st.last = Some(e.clone());
                if !req.images.is_empty() {
                    st.image_error = Some(e.clone());
                }
            }
        }
        out
    }
}

fn error_text(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string))
        .unwrap_or_else(|| body.chars().take(200).collect())
}
