//! SQLite storage: settings, caches and the operation journal.

use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{Connection, OptionalExtension};

use crate::Result;

const MIGRATIONS: &[&str] = &[
    // v1
    r#"
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE thumbs (
        path TEXT NOT NULL, px INTEGER NOT NULL, mtime INTEGER NOT NULL, size INTEGER NOT NULL,
        png BLOB, PRIMARY KEY (path, px));
    CREATE TABLE meta_cache (
        path TEXT NOT NULL, kind TEXT NOT NULL, mtime INTEGER NOT NULL, size INTEGER NOT NULL,
        json TEXT NOT NULL, PRIMARY KEY (path, kind));
    CREATE TABLE hashes (
        path TEXT PRIMARY KEY, mtime INTEGER NOT NULL, size INTEGER NOT NULL,
        partial TEXT, full TEXT);
    CREATE TABLE plans (
        id INTEGER PRIMARY KEY,
        created INTEGER NOT NULL,
        label TEXT NOT NULL,
        status TEXT NOT NULL,
        applied_at INTEGER,
        undone_at INTEGER,
        plan_json TEXT NOT NULL);
    CREATE TABLE ops (
        id INTEGER PRIMARY KEY,
        plan_id INTEGER NOT NULL REFERENCES plans(id),
        run INTEGER NOT NULL,
        direction TEXT NOT NULL,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        src TEXT,
        dst TEXT,
        receipt TEXT,
        status TEXT NOT NULL,
        error TEXT,
        reverses INTEGER,
        at INTEGER NOT NULL);
    CREATE INDEX ops_plan_run ON ops(plan_id, run);
    "#,
];

pub struct Db {
    conn: Mutex<Connection>,
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        Self::init(Connection::open(path)?)
    }

    pub fn open_in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "synchronous", "FULL")?;
        let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
        for (i, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
            conn.execute_batch(&format!("BEGIN; {sql} PRAGMA user_version = {}; COMMIT;", i + 1))?;
        }
        Ok(Db { conn: Mutex::new(conn) })
    }

    pub fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<serde_json::Value>> {
        let v: Option<String> =
            self.conn().query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional()?;
        Ok(v.and_then(|s| serde_json::from_str(&s).ok()))
    }

    pub fn set_setting(&self, key: &str, value: &serde_json::Value) -> Result<()> {
        self.conn().execute(
            "INSERT INTO settings(key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value.to_string()),
        )?;
        Ok(())
    }

    pub fn all_settings(&self) -> Result<serde_json::Map<String, serde_json::Value>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        let mut map = serde_json::Map::new();
        for row in rows {
            let (k, v) = row?;
            if let Ok(v) = serde_json::from_str(&v) {
                map.insert(k, v);
            }
        }
        Ok(map)
    }

    /// Cached PNG thumbnail if the file hasn't changed since it was made.
    /// `Some(None)` means "we tried before and there is no thumbnail".
    pub fn get_thumb(&self, path: &str, px: u32, mtime: i64, size: u64) -> Result<Option<Option<Vec<u8>>>> {
        Ok(self
            .conn()
            .query_row(
                "SELECT png FROM thumbs WHERE path = ?1 AND px = ?2 AND mtime = ?3 AND size = ?4",
                (path, px, mtime, size as i64),
                |r| r.get::<_, Option<Vec<u8>>>(0),
            )
            .optional()?)
    }

    pub fn put_thumb(&self, path: &str, px: u32, mtime: i64, size: u64, png: Option<&[u8]>) -> Result<()> {
        self.conn().execute(
            "INSERT OR REPLACE INTO thumbs(path, px, mtime, size, png) VALUES (?1, ?2, ?3, ?4, ?5)",
            (path, px, mtime, size as i64, png),
        )?;
        Ok(())
    }

    pub fn get_meta(&self, path: &str, kind: &str, mtime: i64, size: u64) -> Result<Option<serde_json::Value>> {
        let v: Option<String> = self
            .conn()
            .query_row(
                "SELECT json FROM meta_cache WHERE path = ?1 AND kind = ?2 AND mtime = ?3 AND size = ?4",
                (path, kind, mtime, size as i64),
                |r| r.get(0),
            )
            .optional()?;
        Ok(v.and_then(|s| serde_json::from_str(&s).ok()))
    }

    pub fn put_meta(&self, path: &str, kind: &str, mtime: i64, size: u64, json: &serde_json::Value) -> Result<()> {
        self.conn().execute(
            "INSERT OR REPLACE INTO meta_cache(path, kind, mtime, size, json) VALUES (?1, ?2, ?3, ?4, ?5)",
            (path, kind, mtime, size as i64, json.to_string()),
        )?;
        Ok(())
    }

    pub fn get_full_hash(&self, path: &str, mtime: i64, size: u64) -> Result<Option<String>> {
        Ok(self
            .conn()
            .query_row(
                "SELECT full FROM hashes WHERE path = ?1 AND mtime = ?2 AND size = ?3 AND full IS NOT NULL",
                (path, mtime, size as i64),
                |r| r.get(0),
            )
            .optional()?)
    }

    pub fn put_full_hash(&self, path: &str, mtime: i64, size: u64, full: &str) -> Result<()> {
        self.conn().execute(
            "INSERT OR REPLACE INTO hashes(path, mtime, size, full) VALUES (?1, ?2, ?3, ?4)",
            (path, mtime, size as i64, full),
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_and_stores_settings() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("x.sqlite");
        {
            let db = Db::open(&p).unwrap();
            db.set_setting("theme", &serde_json::json!("arcade-night")).unwrap();
        }
        let db = Db::open(&p).unwrap(); // re-open: migrations must be idempotent
        assert_eq!(db.get_setting("theme").unwrap(), Some(serde_json::json!("arcade-night")));
        assert_eq!(db.get_setting("missing").unwrap(), None);
    }
}
