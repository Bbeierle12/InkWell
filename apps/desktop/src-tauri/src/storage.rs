//! Document storage — engine-independent persistence backed by SQLite.
//!
//! Documents were historically persisted in the webview's IndexedDB, which is
//! managed by WebKitGTK and therefore tied to the specific WebKit engine/version
//! that renders the UI. A WebKit version skew (e.g. an AppImage bundling an older
//! engine than the system one that upgraded the on-disk format) can make that
//! store unreadable, silently hiding documents. This module moves the source of
//! truth into a Rust-owned SQLite database in the app data directory so
//! persistence no longer depends on the webview engine.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// A stored document. Field names serialize as camelCase to mirror the frontend
/// `StoredDocument`, so the JSON shape is identical across the Tauri IPC boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredDocument {
    pub id: String,
    pub title: String,
    /// TipTap editor JSON (`editor.getJSON()`).
    pub content: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub deleted_at: Option<i64>,
    pub word_count: i64,
}

/// Resolve the on-disk database path: `<data_dir>/inkwell/documents.db`.
///
/// Uses `dirs::data_dir()` (not the per-identifier webview dir) to match the
/// convention already used by `check_models_status` and to stay stable across
/// dev, the `.deb`, and the AppImage.
pub fn db_path() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("Could not determine data directory")?;
    Ok(base.join("inkwell").join("documents.db"))
}

/// Open (creating if needed) a connection at `path` and ensure the schema exists.
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    init_schema(&conn)?;
    Ok(conn)
}

#[cfg(test)]
pub fn open_in_memory() -> rusqlite::Result<Connection> {
    let conn = Connection::open_in_memory()?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS documents (
             id          TEXT PRIMARY KEY,
             title       TEXT NOT NULL,
             content     TEXT NOT NULL,
             created_at  INTEGER NOT NULL,
             updated_at  INTEGER NOT NULL,
             tags        TEXT NOT NULL,
             pinned      INTEGER NOT NULL,
             deleted_at  INTEGER,
             word_count  INTEGER NOT NULL
         );",
    )
}

fn row_to_doc(row: &rusqlite::Row) -> rusqlite::Result<StoredDocument> {
    let content_str: String = row.get("content")?;
    let tags_str: String = row.get("tags")?;
    Ok(StoredDocument {
        id: row.get("id")?,
        title: row.get("title")?,
        content: serde_json::from_str(&content_str).unwrap_or(serde_json::Value::Null),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        tags: serde_json::from_str(&tags_str).unwrap_or_default(),
        pinned: row.get::<_, i64>("pinned")? != 0,
        deleted_at: row.get("deleted_at")?,
        word_count: row.get("word_count")?,
    })
}

/// Insert or replace a document (id is the primary key).
pub fn put(conn: &Connection, doc: &StoredDocument) -> rusqlite::Result<()> {
    let content = serde_json::to_string(&doc.content).unwrap_or_else(|_| "null".into());
    let tags = serde_json::to_string(&doc.tags).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "INSERT INTO documents
            (id, title, content, created_at, updated_at, tags, pinned, deleted_at, word_count)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
            title=excluded.title, content=excluded.content,
            created_at=excluded.created_at, updated_at=excluded.updated_at,
            tags=excluded.tags, pinned=excluded.pinned,
            deleted_at=excluded.deleted_at, word_count=excluded.word_count",
        rusqlite::params![
            doc.id,
            doc.title,
            content,
            doc.created_at,
            doc.updated_at,
            tags,
            doc.pinned as i64,
            doc.deleted_at,
            doc.word_count,
        ],
    )?;
    Ok(())
}

/// Fetch a single document by id.
pub fn get(conn: &Connection, id: &str) -> rusqlite::Result<Option<StoredDocument>> {
    let mut stmt = conn.prepare("SELECT * FROM documents WHERE id = ?1")?;
    let mut rows = stmt.query_map([id], row_to_doc)?;
    match rows.next() {
        Some(row) => Ok(Some(row?)),
        None => Ok(None),
    }
}

/// List all documents, newest-updated first (matches the old `getAllDocuments`).
/// Includes soft-deleted (trashed) documents; the frontend filters those.
pub fn list(conn: &Connection) -> rusqlite::Result<Vec<StoredDocument>> {
    let mut stmt = conn.prepare("SELECT * FROM documents ORDER BY updated_at DESC")?;
    let rows = stmt.query_map([], row_to_doc)?;
    rows.collect()
}

/// Hard-delete a document by id (mirrors `removeDocument`).
pub fn delete(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM documents WHERE id = ?1", [id])?;
    Ok(())
}

// ── Tauri commands (thin wrappers; open a connection per call) ──

fn conn_or_err() -> Result<Connection, String> {
    let path = db_path()?;
    open(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn documents_list() -> Result<Vec<StoredDocument>, String> {
    list(&conn_or_err()?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn document_get(id: String) -> Result<Option<StoredDocument>, String> {
    get(&conn_or_err()?, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn document_put(doc: StoredDocument) -> Result<(), String> {
    put(&conn_or_err()?, &doc).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn document_delete(id: String) -> Result<(), String> {
    delete(&conn_or_err()?, &id).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample(id: &str, updated: i64) -> StoredDocument {
        StoredDocument {
            id: id.into(),
            title: "T".into(),
            content: json!({"type": "doc", "content": []}),
            created_at: 1,
            updated_at: updated,
            tags: vec!["a".into()],
            pinned: false,
            deleted_at: None,
            word_count: 3,
        }
    }

    #[test]
    fn put_get_roundtrip() {
        let conn = open_in_memory().unwrap();
        let doc = sample("doc_1", 10);
        put(&conn, &doc).unwrap();
        assert_eq!(get(&conn, "doc_1").unwrap().unwrap(), doc);
    }

    #[test]
    fn get_missing_returns_none() {
        let conn = open_in_memory().unwrap();
        assert!(get(&conn, "nope").unwrap().is_none());
    }

    #[test]
    fn put_upserts_in_place() {
        let conn = open_in_memory().unwrap();
        put(&conn, &sample("doc_1", 10)).unwrap();
        let mut updated = sample("doc_1", 20);
        updated.title = "Renamed".into();
        put(&conn, &updated).unwrap();
        let got = get(&conn, "doc_1").unwrap().unwrap();
        assert_eq!(got.title, "Renamed");
        assert_eq!(got.updated_at, 20);
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn list_sorted_by_updated_desc() {
        let conn = open_in_memory().unwrap();
        put(&conn, &sample("a", 10)).unwrap();
        put(&conn, &sample("b", 30)).unwrap();
        put(&conn, &sample("c", 20)).unwrap();
        let ids: Vec<String> = list(&conn).unwrap().into_iter().map(|d| d.id).collect();
        assert_eq!(ids, vec!["b", "c", "a"]);
    }

    #[test]
    fn soft_delete_is_a_put_with_deleted_at() {
        let conn = open_in_memory().unwrap();
        let mut doc = sample("doc_1", 10);
        put(&conn, &doc).unwrap();
        doc.deleted_at = Some(12345);
        put(&conn, &doc).unwrap();
        assert_eq!(get(&conn, "doc_1").unwrap().unwrap().deleted_at, Some(12345));
        // still present in list (frontend filters trashed docs)
        assert_eq!(list(&conn).unwrap().len(), 1);
    }

    #[test]
    fn hard_delete_removes_row() {
        let conn = open_in_memory().unwrap();
        put(&conn, &sample("doc_1", 10)).unwrap();
        delete(&conn, "doc_1").unwrap();
        assert!(get(&conn, "doc_1").unwrap().is_none());
        assert_eq!(list(&conn).unwrap().len(), 0);
    }

    #[test]
    fn content_and_tags_json_preserved() {
        let conn = open_in_memory().unwrap();
        let mut doc = sample("doc_1", 10);
        doc.content = json!({
            "type": "doc",
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": "hello world"}]}]
        });
        doc.tags = vec!["work".into(), "draft".into()];
        put(&conn, &doc).unwrap();
        let got = get(&conn, "doc_1").unwrap().unwrap();
        assert_eq!(got.content, doc.content);
        assert_eq!(got.tags, doc.tags);
    }
}
