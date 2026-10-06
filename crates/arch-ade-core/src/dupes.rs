//! Duplicate finder: size -> partial hash (head + tail) -> full blake3.

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use rayon::prelude::*;
use serde::Serialize;

use crate::config::PARTIAL_HASH_BYTES;
use crate::db::Db;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DupeGroup {
    pub size: u64,
    pub hash: String,
    pub files: Vec<String>,
    /// Bytes that would be freed by keeping one copy.
    pub wasted: u64,
}

#[derive(Clone, Debug)]
pub struct Candidate {
    pub path: PathBuf,
    pub size: u64,
    pub mtime: i64,
}

fn partial_hash(path: &Path, size: u64) -> Option<String> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut h = blake3::Hasher::new();
    h.update(&size.to_le_bytes());
    let mut buf = vec![0u8; PARTIAL_HASH_BYTES.min(size) as usize];
    f.read_exact(&mut buf).ok()?;
    h.update(&buf);
    if size > PARTIAL_HASH_BYTES * 2 {
        f.seek(SeekFrom::End(-(PARTIAL_HASH_BYTES as i64))).ok()?;
        f.read_exact(&mut buf).ok()?;
        h.update(&buf);
    }
    Some(h.finalize().to_hex().to_string())
}

fn full_hash(path: &Path) -> Option<String> {
    let mut h = blake3::Hasher::new();
    h.update_reader(std::fs::File::open(path).ok()?).ok()?;
    Some(h.finalize().to_hex().to_string())
}

fn group_by<K, F>(items: Vec<Candidate>, f: F) -> Vec<Vec<Candidate>>
where
    K: std::hash::Hash + Eq + Send,
    F: Fn(&Candidate) -> Option<K> + Sync,
{
    let keyed: Vec<(K, Candidate)> = items.into_par_iter().filter_map(|c| f(&c).map(|k| (k, c))).collect();
    let mut map: HashMap<K, Vec<Candidate>> = HashMap::new();
    for (k, c) in keyed {
        map.entry(k).or_default().push(c);
    }
    map.into_values().filter(|g| g.len() > 1).collect()
}

/// `progress(done, total)` is called as full hashes complete.
pub fn find(candidates: Vec<Candidate>, db: Option<&Db>, progress: &(dyn Fn(usize, usize) + Sync)) -> Vec<DupeGroup> {
    let by_size = group_by(candidates.into_iter().filter(|c| c.size > 0).collect(), |c| Some(c.size));
    let by_partial: Vec<Vec<Candidate>> =
        by_size.into_iter().flat_map(|g| group_by(g, |c| partial_hash(&c.path, c.size))).collect();

    let total: usize = by_partial.iter().map(Vec::len).sum();
    let done = AtomicUsize::new(0);
    let hashed = |c: &Candidate| {
        let key = c.path.to_string_lossy();
        let cached = db.and_then(|db| db.get_full_hash(&key, c.mtime, c.size).ok().flatten());
        let h = cached.or_else(|| {
            let h = full_hash(&c.path)?;
            if let Some(db) = db {
                let _ = db.put_full_hash(&key, c.mtime, c.size, &h);
            }
            Some(h)
        });
        progress(done.fetch_add(1, Ordering::Relaxed) + 1, total);
        h
    };

    let mut groups: Vec<DupeGroup> = by_partial
        .into_iter()
        .flat_map(|g| group_by(g, hashed))
        .map(|g| {
            let size = g[0].size;
            let hash = full_hash_of_group(&g, db);
            let mut files: Vec<String> = g.iter().map(|c| c.path.to_string_lossy().into_owned()).collect();
            files.sort();
            DupeGroup { size, hash, wasted: size * (files.len() as u64 - 1), files }
        })
        .collect();
    groups.sort_by(|a, b| b.wasted.cmp(&a.wasted).then_with(|| a.files[0].cmp(&b.files[0])));
    groups
}

fn full_hash_of_group(g: &[Candidate], db: Option<&Db>) -> String {
    let c = &g[0];
    db.and_then(|db| db.get_full_hash(&c.path.to_string_lossy(), c.mtime, c.size).ok().flatten())
        .or_else(|| full_hash(&c.path))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cand(p: PathBuf) -> Candidate {
        let md = std::fs::metadata(&p).unwrap();
        Candidate { size: md.len(), mtime: 0, path: p }
    }

    #[test]
    fn finds_true_duplicates_only() {
        let d = tempfile::tempdir().unwrap();
        let big_a: Vec<u8> = (0..300_000u32).map(|i| (i % 251) as u8).collect();
        let mut big_b = big_a.clone();
        big_b[150_000] ^= 1; // same size, same head and tail, different middle
        let files = [
            ("a1", b"same content".to_vec()),
            ("a2", b"same content".to_vec()),
            ("b", b"diff content".to_vec()), // same size as a*
            ("empty1", vec![]),
            ("empty2", vec![]),
            ("big1", big_a.clone()),
            ("big2", big_a),
            ("big3", big_b),
        ];
        let mut cands = vec![];
        for (n, c) in &files {
            let p = d.path().join(n);
            std::fs::write(&p, c).unwrap();
            cands.push(cand(p));
        }
        let db = Db::open_in_memory().unwrap();
        let groups = find(cands, Some(&db), &|_, _| {});
        assert_eq!(groups.len(), 2, "{groups:?}");
        assert!(groups[0].files.iter().all(|f| f.contains("big1") || f.contains("big2")));
        assert_eq!(groups[0].files.len(), 2);
        assert_eq!(groups[1].files.len(), 2);
        assert_eq!(groups[1].wasted, 12);
    }
}
