//! Where a file was downloaded from, and by which app.
//!
//! The OS-specific part (reading xattrs / alternate data streams) is in
//! [`crate::platform`]; this module turns those raw values into one shape.
//! Nothing is guessed silently: every app value says whether the OS reported
//! it or we inferred it from the URL.

use serde::Serialize;

use crate::platform::RawSource;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppConfidence {
    /// The OS recorded the downloading app (macOS quarantine agent).
    Reported,
    /// Derived from the download URL's domain.
    Inferred,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub url: Option<String>,
    pub referrer: Option<String>,
    pub domain: Option<String>,
    pub app: Option<String>,
    pub app_confidence: AppConfidence,
    /// Unix seconds, from the macOS quarantine record.
    pub downloaded_at: Option<i64>,
    /// Windows security zone (3 = Internet).
    pub zone: Option<u32>,
}

impl SourceInfo {
    pub fn is_empty(&self) -> bool {
        self.url.is_none() && self.app.is_none() && self.zone.is_none()
    }
}

pub fn resolve(raw: &RawSource) -> SourceInfo {
    let mut url = None;
    let mut referrer = None;
    let mut zone = None;
    let mut app = None;
    let mut downloaded_at = None;

    if let Some(bytes) = &raw.where_froms {
        let list = parse_where_froms(bytes);
        url = list.first().cloned();
        referrer = list.get(1).cloned();
    }
    if let Some(q) = &raw.quarantine {
        if let Some(rec) = parse_quarantine(q) {
            app = rec.agent;
            downloaded_at = rec.timestamp;
        }
    }
    if let Some(z) = &raw.zone_identifier {
        let zi = parse_zone_identifier(z);
        url = url.or(zi.host_url);
        referrer = referrer.or(zi.referrer_url);
        zone = zi.zone_id;
    }
    url = url.or_else(|| raw.xdg_origin.clone());
    referrer = referrer.or_else(|| raw.xdg_referrer.clone());

    let url = url.filter(|u| !u.is_empty() && u != "about:internet");
    let domain = url.as_deref().and_then(domain_of);
    let (app, app_confidence) = match app {
        Some(a) => (Some(a), AppConfidence::Reported),
        None => match domain.as_deref().and_then(infer_app_from_domain) {
            Some(a) => (Some(a.to_string()), AppConfidence::Inferred),
            None => (None, AppConfidence::Unknown),
        },
    };
    SourceInfo { url, referrer, domain, app, app_confidence, downloaded_at, zone }
}

/// `kMDItemWhereFroms` is a binary plist holding an array of strings.
pub fn parse_where_froms(bytes: &[u8]) -> Vec<String> {
    match plist::Value::from_reader(std::io::Cursor::new(bytes)) {
        Ok(plist::Value::Array(items)) => {
            items.into_iter().filter_map(|v| v.into_string()).filter(|s| !s.is_empty()).collect()
        }
        Ok(plist::Value::String(s)) => vec![s],
        _ => vec![],
    }
}

/// A boolean stored as a plist (e.g. `kMDItemIsScreenCapture`).
pub fn plist_bool(bytes: &[u8]) -> Option<bool> {
    match plist::Value::from_reader(std::io::Cursor::new(bytes)).ok()? {
        plist::Value::Boolean(b) => Some(b),
        plist::Value::Integer(i) => i.as_signed().map(|n| n != 0),
        _ => None,
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct Quarantine {
    pub timestamp: Option<i64>,
    pub agent: Option<String>,
}

/// `com.apple.quarantine` is `flags;hex-seconds;agent;uuid`.
pub fn parse_quarantine(s: &str) -> Option<Quarantine> {
    let mut parts = s.trim_end_matches('\0').split(';');
    let _flags = parts.next()?;
    let timestamp = parts.next().and_then(|t| i64::from_str_radix(t, 16).ok());
    let agent = parts.next().map(str::trim).filter(|a| !a.is_empty()).map(str::to_string);
    Some(Quarantine { timestamp, agent })
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct ZoneIdentifier {
    pub zone_id: Option<u32>,
    pub host_url: Option<String>,
    pub referrer_url: Option<String>,
}

/// The `:Zone.Identifier` stream is a small INI file.
pub fn parse_zone_identifier(s: &str) -> ZoneIdentifier {
    let mut z = ZoneIdentifier::default();
    for line in s.trim_start_matches('\u{feff}').lines() {
        let Some((k, v)) = line.split_once('=') else { continue };
        let v = v.trim().to_string();
        match k.trim() {
            "ZoneId" => z.zone_id = v.parse().ok(),
            "HostUrl" => z.host_url = Some(v),
            "ReferrerUrl" => z.referrer_url = Some(v),
            _ => {}
        }
    }
    z
}

pub fn domain_of(url: &str) -> Option<String> {
    let rest = url.split_once("://").map(|(_, r)| r)?;
    let host = rest.split(['/', '?', '#']).next()?;
    let host = host.rsplit('@').next()?;
    let host = host.split(':').next()?.trim_start_matches("www.").to_ascii_lowercase();
    (!host.is_empty()).then_some(host)
}

/// Domains that reliably mean "this came through app X". Only used when the
/// OS did not record the app itself.
const DOMAIN_APPS: &[(&str, &str)] = &[
    ("slack.com", "Slack"),
    ("slack-edge.com", "Slack"),
    ("slack-files.com", "Slack"),
    ("discordapp.com", "Discord"),
    ("discordapp.net", "Discord"),
    ("discord.com", "Discord"),
    ("teams.microsoft.com", "Microsoft Teams"),
    ("zoom.us", "Zoom"),
    ("web.whatsapp.com", "WhatsApp"),
    ("web.telegram.org", "Telegram"),
    ("mail.google.com", "Gmail"),
    ("outlook.office.com", "Outlook"),
    ("outlook.live.com", "Outlook"),
    ("drive.google.com", "Google Drive"),
    ("drive.usercontent.google.com", "Google Drive"),
    ("docs.google.com", "Google Docs"),
    ("dropbox.com", "Dropbox"),
    ("dropboxusercontent.com", "Dropbox"),
    ("onedrive.live.com", "OneDrive"),
    ("github.com", "GitHub"),
    ("githubusercontent.com", "GitHub"),
    ("gitlab.com", "GitLab"),
];

pub fn infer_app_from_domain(domain: &str) -> Option<&'static str> {
    DOMAIN_APPS.iter().find(|(d, _)| domain == *d || domain.ends_with(&format!(".{d}"))).map(|(_, a)| *a)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quarantine() {
        let q = parse_quarantine("0083;65a1b2c3;Google Chrome;A1B2C3D4-0000").unwrap();
        assert_eq!(q.agent.as_deref(), Some("Google Chrome"));
        assert_eq!(q.timestamp, Some(0x65a1b2c3));
        let q = parse_quarantine("0081;65a1b2c3;;").unwrap();
        assert_eq!(q.agent, None);
    }

    #[test]
    fn zone_identifier() {
        let z = parse_zone_identifier(
            "[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://github.com/x/y/releases\r\nHostUrl=https://objects.githubusercontent.com/a.zip\r\n",
        );
        assert_eq!(z.zone_id, Some(3));
        assert_eq!(z.host_url.as_deref(), Some("https://objects.githubusercontent.com/a.zip"));
        assert_eq!(z.referrer_url.as_deref(), Some("https://github.com/x/y/releases"));
    }

    #[test]
    fn where_froms_binary_plist() {
        let v = plist::Value::Array(vec![
            "https://files.slack.com/files-pri/T1/report.pdf".into(),
            "https://app.slack.com/".into(),
        ]);
        let mut buf = Vec::new();
        v.to_writer_binary(&mut buf).unwrap();
        assert_eq!(parse_where_froms(&buf).len(), 2);
    }

    #[test]
    fn resolve_prefers_reported_app() {
        let mut buf = Vec::new();
        plist::Value::Array(vec!["https://files.slack.com/x.pdf".into()]).to_writer_binary(&mut buf).unwrap();
        let raw = RawSource {
            where_froms: Some(buf),
            quarantine: Some("0083;65a1b2c3;Slack;uuid".into()),
            ..Default::default()
        };
        let s = resolve(&raw);
        assert_eq!(s.app.as_deref(), Some("Slack"));
        assert_eq!(s.app_confidence, AppConfidence::Reported);
        assert_eq!(s.domain.as_deref(), Some("files.slack.com"));
    }

    #[test]
    fn resolve_infers_or_reports_unknown() {
        let raw = RawSource {
            zone_identifier: Some("[ZoneTransfer]\nZoneId=3\nHostUrl=https://codeload.github.com/a/b/zip\n".into()),
            ..Default::default()
        };
        let s = resolve(&raw);
        assert_eq!(s.app.as_deref(), Some("GitHub"));
        assert_eq!(s.app_confidence, AppConfidence::Inferred);

        let raw = RawSource { xdg_origin: Some("https://example.org/f.iso".into()), ..Default::default() };
        let s = resolve(&raw);
        assert_eq!(s.app, None);
        assert_eq!(s.app_confidence, AppConfidence::Unknown);
        assert_eq!(s.domain.as_deref(), Some("example.org"));

        assert!(resolve(&RawSource::default()).is_empty());
    }

    #[test]
    fn domains() {
        assert_eq!(domain_of("https://user@www.Example.com:8080/a?b").as_deref(), Some("example.com"));
        assert_eq!(domain_of("not a url"), None);
        assert_eq!(infer_app_from_domain("notslack.com"), None);
        assert_eq!(infer_app_from_domain("files.slack.com"), Some("Slack"));
    }
}
