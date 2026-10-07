//! Arch-ade core: everything that is not UI and not Tauri glue.
//!
//! OS-specific behaviour lives only in [`platform`]; the rest of the crate is
//! written once and behaves identically on macOS, Windows and Linux.

pub mod ai;
pub mod autopilot;
pub mod config;
pub mod db;
pub mod dupes;
pub mod error;
pub mod fsops;
pub mod journal;
pub mod kind;
pub mod names;
pub mod onebyone;
pub mod organize;
pub mod plan;
pub mod platform;
pub mod preview;
pub mod protect;
pub mod rename;
pub mod rules;
pub mod scan;
pub mod scope;
pub mod source;
pub mod tags;
pub mod tools;
pub mod update;
pub mod watch;

pub use error::{Error, Result};
