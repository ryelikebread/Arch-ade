//! Library-style names for audio and video from their embedded tags
//! (ffprobe). No model involved; every result still goes through review.
//!
//! - Music: `Artist - Album - 03 - Title`, or `Artist - Title`
//! - TV:    `Show - S01E02 - Title`
//! - Film:  `Title (1999)`

use serde::Serialize;

use crate::kind::Kind;

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaTags {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub track: Option<u32>,
    pub year: Option<String>,
    pub show: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub genre: Option<String>,
}

impl MediaTags {
    pub fn is_empty(&self) -> bool {
        *self == MediaTags::default()
    }
}

/// Tags from ffprobe's JSON: container tags first, then stream tags, keys
/// matched case-insensitively (formats disagree on case).
pub fn from_ffprobe(json: &serde_json::Value) -> MediaTags {
    let mut maps: Vec<&serde_json::Map<String, serde_json::Value>> = Vec::new();
    if let Some(t) = json.pointer("/format/tags").and_then(|t| t.as_object()) {
        maps.push(t);
    }
    if let Some(streams) = json.get("streams").and_then(|s| s.as_array()) {
        maps.extend(streams.iter().filter_map(|s| s.get("tags").and_then(|t| t.as_object())));
    }
    let get = |keys: &[&str]| -> Option<String> {
        maps.iter().find_map(|m| {
            m.iter().find_map(|(k, v)| {
                let v = v.as_str()?.trim();
                (keys.iter().any(|want| k.eq_ignore_ascii_case(want)) && !v.is_empty()).then(|| v.to_string())
            })
        })
    };
    let number = |keys: &[&str]| get(keys).and_then(|v| leading_number(&v));
    MediaTags {
        title: get(&["title"]),
        artist: get(&["artist", "album_artist", "albumartist", "performer", "author"]),
        album: get(&["album"]),
        track: number(&["track", "tracknumber"]),
        year: get(&["date", "year", "creation_date"]).and_then(|d| {
            let y: String = d.chars().take(4).collect();
            (y.len() == 4 && y.chars().all(|c| c.is_ascii_digit())).then_some(y)
        }),
        show: get(&["show", "tvshow", "series"]),
        season: number(&["season_number", "season"]),
        episode: number(&["episode_sort", "episode_number", "episode"]),
        genre: get(&["genre"]),
    }
}

/// "3/12" -> 3, "07" -> 7.
fn leading_number(s: &str) -> Option<u32> {
    let digits: String = s.trim().chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// A file name stem (no extension) built from the tags, and the
/// subcategory it suggests (`TV`, `Movies`), or `None` without a title.
pub fn library_name(kind: Kind, t: &MediaTags) -> Option<(String, Option<&'static str>)> {
    let clean = |s: &Option<String>| s.as_deref().map(super::suggest::clean_part).filter(|s| !s.is_empty());
    let (title, artist, album) = (clean(&t.title), clean(&t.artist), clean(&t.album));
    match kind {
        Kind::Audio => {
            let title = title?;
            Some((
                match (artist, album, t.track) {
                    (Some(a), Some(al), Some(n)) => format!("{a} - {al} - {n:02} - {title}"),
                    (Some(a), _, _) => format!("{a} - {title}"),
                    (None, _, _) => title,
                },
                None,
            ))
        }
        Kind::Video => {
            if let (Some(show), Some(s), Some(e)) = (clean(&t.show), t.season, t.episode) {
                let mut name = format!("{show} - S{s:02}E{e:02}");
                if let Some(title) = title.filter(|x| !x.eq_ignore_ascii_case(&show)) {
                    name.push_str(&format!(" - {title}"));
                }
                return Some((name, Some("TV")));
            }
            let title = title?;
            Some(match &t.year {
                Some(y) => (format!("{title} ({y})"), Some("Movies")),
                None => (title, None),
            })
        }
        _ => None,
    }
}
