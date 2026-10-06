//! Arch-ade core: everything that is not UI and not Tauri glue.
//!
//! OS-specific behaviour lives only in [`platform`]; the rest of the crate is
//! written once and behaves identically on macOS, Windows and Linux.

pub mod config;
pub mod db;
pub mod dupes;
pub mod error;
pub mod journal;
pub mod kind;
pub mod names;
pub mod plan;
pub mod platform;
pub mod preview;
pub mod rename;
pub mod scan;
pub mod scope;
pub mod source;
pub mod tools;
pub mod watch;

pub use error::{Error, Result};
