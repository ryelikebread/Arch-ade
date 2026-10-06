use std::path::{Path, PathBuf};

use super::{freedesktop, Os, Platform, RawSource, TrashReceipt};
use crate::names::NameRules;
use crate::tools::{self, Tools};
use crate::Result;

pub struct Linux;

impl Platform for Linux {
    fn os(&self) -> Os {
        Os::Linux
    }
    fn name_rules(&self) -> NameRules {
        NameRules::Linux
    }
    fn modifier_label(&self) -> &'static str {
        "Ctrl"
    }

    fn trash(&self, path: &Path) -> Result<TrashReceipt> {
        super::trash_via_crate(path)
    }
    fn restore(&self, receipt: &TrashReceipt) -> Result<()> {
        super::restore_via_crate(receipt)
    }

    fn raw_source(&self, path: &Path) -> RawSource {
        let get = |k: &str| xattr::get(path, k).ok().flatten().map(|v| String::from_utf8_lossy(&v).into_owned());
        RawSource {
            xdg_origin: get("user.xdg.origin.url"),
            xdg_referrer: get("user.xdg.referrer.url"),
            ..Default::default()
        }
    }

    fn added_time(&self, _path: &Path) -> Option<i64> {
        None
    }

    fn os_thumbnail(&self, path: &Path, px: u32, tools: &Tools) -> Option<Vec<u8>> {
        let dir = tempfile::tempdir().ok()?;
        let out = dir.path().join("thumb.png");
        let mime = crate::kind::mime_for(path);
        if mime.starts_with("video/") {
            if let Some(bin) = &tools.ffmpegthumbnailer {
                let args: Vec<String> = vec![
                    "-i".into(),
                    path.to_string_lossy().into(),
                    "-o".into(),
                    out.to_string_lossy().into(),
                    "-s".into(),
                    px.to_string(),
                    "-c".into(),
                    "png".into(),
                ];
                if tools::run(bin, &args, tools::THUMB_TIMEOUT).is_ok() {
                    if let Ok(b) = std::fs::read(&out) {
                        return Some(b);
                    }
                }
            }
        }
        let t = freedesktop::find_for(mime)?;
        let argv = freedesktop::argv(&t, path, &out, px);
        let (bin, args) = argv.split_first()?;
        let bin = which(bin)?;
        tools::run(&bin, args, tools::THUMB_TIMEOUT).ok()?;
        std::fs::read(&out).ok()
    }

    fn extra_tool_dirs(&self) -> Vec<PathBuf> {
        vec![]
    }
}

fn which(bin: &str) -> Option<PathBuf> {
    if bin.contains('/') {
        return Some(PathBuf::from(bin));
    }
    tools::find_in(bin, &[])
}
