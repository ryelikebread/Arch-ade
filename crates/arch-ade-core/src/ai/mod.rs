//! Optional local AI categorization (Phase 3).
//!
//! Arch-ade suggests a category, subcategory and new name for each file; the
//! user reviews every suggestion, and only approved ones become a normal
//! dry-run [`crate::plan::Plan`] applied through the journal. Suggestions come
//! from, in order of preference:
//!
//! - embedded audio/video tags ([`media`]), which need no model at all;
//! - a local Ollama server ([`ollama`]), text model for documents and a
//!   vision model for images and screenshots;
//! - past approved decisions ([`hints`]), which are also fed to the model as
//!   examples, and are what keeps working with the AI switched off;
//! - the whitelist's own kind/extension/keyword mapping ([`whitelist`]).
//!
//! Nothing here talks to anything but a loopback address.

pub mod facts;
pub mod hints;
pub mod media;
pub mod ollama;
pub mod review;
pub mod suggest;
pub mod whitelist;

use serde::{Deserialize, Serialize};

use crate::db::Db;
use crate::Result;

pub const SETTINGS_KEY: &str = "ai";

/// How the model is asked to behave.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    /// Specific subcategories (the model may propose a new one under a known
    /// category, flagged for review) and more descriptive names.
    Refined,
    /// Only whitelisted categories/subcategories, deterministic sampling, and a
    /// strong past decision for a similar file wins over the model.
    #[default]
    Consistent,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AiSettings {
    /// Use Ollama at all. Off by default: everything still works from tags,
    /// past decisions and the whitelist.
    pub enabled: bool,
    /// Must be a loopback address (see [`ollama::check_local_url`]).
    pub url: String,
    pub text_model: String,
    pub vision_model: String,
    pub mode: Mode,
    /// Suggest names only; files stay in their folder.
    pub rename_only: bool,
    /// Send image pixels to the vision model (otherwise images are judged by
    /// name and metadata only).
    pub analyze_images: bool,
    pub whitelist_id: String,
}

pub const DEFAULT_URL: &str = "http://127.0.0.1:11434";
pub const DEFAULT_VISION_MODEL: &str = "gemma3:4b";
/// LLaVA 1.6 on Mistral 7B, the alternate vision model.
pub const ALT_VISION_MODEL: &str = "llava:7b";

impl Default for AiSettings {
    fn default() -> Self {
        AiSettings {
            enabled: false,
            url: DEFAULT_URL.into(),
            text_model: DEFAULT_VISION_MODEL.into(),
            vision_model: DEFAULT_VISION_MODEL.into(),
            mode: Mode::Consistent,
            rename_only: false,
            analyze_images: true,
            whitelist_id: whitelist::DEFAULT_ID.into(),
        }
    }
}

pub fn load_settings(db: &Db) -> Result<AiSettings> {
    Ok(match db.get_setting(SETTINGS_KEY)? {
        Some(v) => serde_json::from_value(v).unwrap_or_default(),
        None => AiSettings::default(),
    })
}

pub fn save_settings(db: &Db, s: &AiSettings) -> Result<()> {
    ollama::check_local_url(&s.url).map_err(crate::Error::Plan)?;
    db.set_setting(SETTINGS_KEY, &serde_json::to_value(s)?)
}

#[cfg(test)]
mod tests;
