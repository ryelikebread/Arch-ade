//! Update-notification hook (stub). Arch-ade is local-only, so nothing here
//! talks to the network. The app asks an [`UpdateSource`] at startup; the
//! only source today reads an optional manifest file from the app-data
//! folder, which is how the optional and required flows can be tried out.
//! A real feed can be added later as another `UpdateSource`.
//!
//! Manifest (`<app data>/update-manifest.json`):
//! `{"version": "0.2.0", "required": false, "notes": "...", "url": "https://..."}`

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    /// Required updates block the app until installed; optional ones show a
    /// dismissible notice.
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub url: Option<String>,
}

pub trait UpdateSource {
    /// The newest release this source knows of, if any.
    fn latest(&self) -> Option<UpdateInfo>;
}

/// Reads [`UpdateInfo`] from a JSON file, if present.
pub struct ManifestFile(pub PathBuf);

impl ManifestFile {
    pub fn default_location() -> Self {
        ManifestFile(crate::config::app_data_dir().join("update-manifest.json"))
    }
}

impl UpdateSource for ManifestFile {
    fn latest(&self) -> Option<UpdateInfo> {
        let text = std::fs::read_to_string(&self.0).ok()?;
        match serde_json::from_str::<UpdateInfo>(&text) {
            Ok(info) => Some(info),
            Err(e) => {
                tracing::warn!("ignoring {}: {e}", self.0.display());
                None
            }
        }
    }
}

/// What the UI should show for `current` given what the source offers.
pub fn check(source: &dyn UpdateSource, current: &str) -> Option<UpdateInfo> {
    let info = source.latest()?;
    let url_ok = info.url.as_deref().is_none_or(|u| u.starts_with("https://"));
    (newer(&info.version, current) && url_ok).then_some(info)
}

/// Semver-ish comparison of dotted numbers; pre-release suffixes sort before
/// the release (1.0.0-beta < 1.0.0).
pub fn newer(candidate: &str, current: &str) -> bool {
    fn parts(v: &str) -> (Vec<u64>, Option<&str>) {
        let v = v.trim().trim_start_matches('v');
        let (nums, pre) = match v.split_once('-') {
            Some((n, p)) => (n, Some(p)),
            None => (v, None),
        };
        (nums.split('.').map(|p| p.parse().unwrap_or(0)).collect(), pre)
    }
    let (a, apre) = parts(candidate);
    let (b, bpre) = parts(current);
    let len = a.len().max(b.len());
    for i in 0..len {
        let (x, y) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if x != y {
            return x > y;
        }
    }
    match (apre, bpre) {
        (None, Some(_)) => true,
        (Some(x), Some(y)) => x > y,
        _ => false,
    }
}

pub fn manifest_path() -> PathBuf {
    ManifestFile::default_location().0
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixed(Option<UpdateInfo>);
    impl UpdateSource for Fixed {
        fn latest(&self) -> Option<UpdateInfo> {
            self.0.clone()
        }
    }

    fn info(v: &str, required: bool) -> UpdateInfo {
        UpdateInfo { version: v.into(), required, notes: String::new(), url: Some("https://example.com".into()) }
    }

    #[test]
    fn versions() {
        assert!(newer("0.2.0", "0.1.9"));
        assert!(newer("1.0", "0.9.9"));
        assert!(newer("v1.0.1", "1.0.0"));
        assert!(newer("1.0.0", "1.0.0-beta"));
        assert!(!newer("1.0.0-beta", "1.0.0"));
        assert!(!newer("0.1.0", "0.1.0"));
        assert!(!newer("0.0.9", "0.1.0"));
    }

    #[test]
    fn optional_and_required_flows() {
        assert_eq!(check(&Fixed(None), "0.1.0"), None);
        assert_eq!(check(&Fixed(Some(info("0.1.0", false))), "0.1.0"), None, "same version is not an update");
        assert!(!check(&Fixed(Some(info("0.2.0", false))), "0.1.0").unwrap().required);
        assert!(check(&Fixed(Some(info("0.2.0", true))), "0.1.0").unwrap().required);
        let mut insecure = info("0.2.0", false);
        insecure.url = Some("http://example.com".into());
        assert_eq!(check(&Fixed(Some(insecure)), "0.1.0"), None, "only https links are offered");
    }

    #[test]
    fn manifest_file() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("m.json");
        assert_eq!(ManifestFile(p.clone()).latest(), None);
        std::fs::write(&p, r#"{"version":"9.9.9","required":true}"#).unwrap();
        assert_eq!(ManifestFile(p.clone()).latest().unwrap().version, "9.9.9");
        std::fs::write(&p, "not json").unwrap();
        assert_eq!(ManifestFile(p).latest(), None);
    }
}
