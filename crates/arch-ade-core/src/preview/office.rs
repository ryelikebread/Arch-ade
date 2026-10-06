use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;

use super::Body;
use crate::config::{TABLE_PREVIEW_COLS, TABLE_PREVIEW_ROWS, TEXT_PREVIEW_BYTES};
use crate::{Error, Result};

const MAX_PARAGRAPHS: usize = 2_000;
/// Refuse to inflate more than this from a single zip member (zip-bomb guard).
const MAX_XML_BYTES: u64 = 32 * 1024 * 1024;

/// CSV/TSV with quoted fields.
pub fn csv(path: &Path) -> Result<Body> {
    let tsv = crate::kind::ext_of(path) == "tsv";
    let raw = std::fs::read(path)?;
    let truncated_bytes = raw.len() > TEXT_PREVIEW_BYTES * 4;
    let text = String::from_utf8_lossy(&raw[..raw.len().min(TEXT_PREVIEW_BYTES * 4)]).into_owned();
    let (rows, truncated) = parse_delimited(&text, if tsv { '\t' } else { sniff_delim(&text) });
    Ok(Body::Table { rows, truncated: truncated || truncated_bytes, sheets: vec![] })
}

fn sniff_delim(text: &str) -> char {
    let first = text.lines().next().unwrap_or("");
    [',', ';', '\t', '|'].into_iter().max_by_key(|d| first.matches(*d).count()).unwrap_or(',')
}

pub fn parse_delimited(text: &str, delim: char) -> (Vec<Vec<String>>, bool) {
    let mut rows = vec![];
    let mut row = vec![];
    let mut field = String::new();
    let mut in_quotes = false;
    let mut chars = text.trim_start_matches('\u{feff}').chars().peekable();
    while let Some(c) = chars.next() {
        if in_quotes {
            match c {
                '"' if chars.peek() == Some(&'"') => {
                    chars.next();
                    field.push('"');
                }
                '"' => in_quotes = false,
                _ => field.push(c),
            }
            continue;
        }
        match c {
            '"' if field.is_empty() => in_quotes = true,
            c if c == delim => row.push(std::mem::take(&mut field)),
            '\r' => {}
            '\n' => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
                if rows.len() > TABLE_PREVIEW_ROWS {
                    break;
                }
            }
            _ => field.push(c),
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    let truncated = rows.len() > TABLE_PREVIEW_ROWS;
    rows.truncate(TABLE_PREVIEW_ROWS);
    for r in rows.iter_mut() {
        r.truncate(TABLE_PREVIEW_COLS);
    }
    (rows, truncated)
}

fn zip_member(path: &Path, name: &str) -> Result<String> {
    let f = std::fs::File::open(path)?;
    let mut z = zip::ZipArchive::new(f).map_err(|e| Error::Other(e.to_string()))?;
    let member = z.by_name(name).map_err(|e| Error::Other(e.to_string()))?;
    let mut s = String::new();
    member.take(MAX_XML_BYTES).read_to_string(&mut s)?;
    Ok(s)
}

/// Paragraph text from word/document.xml.
pub fn docx(path: &Path) -> Result<Body> {
    let xml = zip_member(path, "word/document.xml")?;
    let (paragraphs, truncated) = docx_paragraphs(&xml)?;
    Ok(Body::Document { paragraphs, truncated })
}

pub fn docx_paragraphs(xml: &str) -> Result<(Vec<String>, bool)> {
    let mut reader = quick_xml::Reader::from_str(xml);
    let mut paras = vec![];
    let mut cur = String::new();
    let mut in_text = false;
    loop {
        match reader.read_event().map_err(|e| Error::Other(e.to_string()))? {
            Event::Start(e) if e.name().as_ref() == "w:t" => in_text = true,
            Event::End(e) if e.name().as_ref() == "w:t" => in_text = false,
            Event::Empty(e) if e.name().as_ref() == "w:tab" => cur.push('\t'),
            Event::Empty(e) if e.name().as_ref() == "w:br" => cur.push('\n'),
            Event::Text(t) if in_text => cur.push_str(&t.xml10_content()),
            Event::GeneralRef(r) if in_text => {
                if let Ok(Some(ch)) = r.resolve_char_ref() {
                    cur.push(ch);
                } else {
                    match r.as_ref() {
                        "amp" => cur.push('&'),
                        "lt" => cur.push('<'),
                        "gt" => cur.push('>'),
                        "quot" => cur.push('"'),
                        "apos" => cur.push('\''),
                        _ => {}
                    }
                }
            }
            Event::End(e) if e.name().as_ref() == "w:p" => {
                paras.push(std::mem::take(&mut cur));
                if paras.len() >= MAX_PARAGRAPHS {
                    return Ok((paras, true));
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok((paras, false))
}

/// First sheet as a table, plus the list of sheet names.
pub fn xlsx(path: &Path) -> Result<Body> {
    use calamine::Reader;
    let mut wb = calamine::open_workbook_auto(path).map_err(|e| Error::Other(e.to_string()))?;
    let sheets = wb.sheet_names().to_vec();
    let first = sheets.first().cloned().ok_or_else(|| Error::Other("workbook has no sheets".into()))?;
    let range = wb.worksheet_range(&first).map_err(|e| Error::Other(e.to_string()))?;
    let truncated = range.height() > TABLE_PREVIEW_ROWS || range.width() > TABLE_PREVIEW_COLS;
    let rows = range
        .rows()
        .take(TABLE_PREVIEW_ROWS)
        .map(|r| r.iter().take(TABLE_PREVIEW_COLS).map(|c| c.to_string()).collect())
        .collect();
    Ok(Body::Table { rows, truncated, sheets })
}

/// Google Drive desktop stubs (.gdoc etc.) are small JSON files with a URL.
pub fn gdoc(path: &Path) -> Result<Body> {
    let text = std::fs::read_to_string(path)?;
    let v: serde_json::Value = serde_json::from_str(&text)?;
    let title = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let url = v
        .get("url")
        .and_then(|u| u.as_str())
        .map(str::to_string)
        .or_else(|| v.get("doc_id").and_then(|d| d.as_str()).map(|id| format!("https://docs.google.com/open?id={id}")))
        .filter(|u| u.starts_with("https://"));
    let account = v.get("email").and_then(|e| e.as_str()).map(str::to_string);
    Ok(Body::Gdoc { title, url, account })
}
