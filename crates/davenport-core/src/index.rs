//! `.davenport/index.sqlite` — rebuildable index. Disposable by doctrine:
//! delete it and `rebuild()` reconstructs an equivalent index from disk truth
//! enriched with oplog history (original names, import timestamps,
//! provenance). Disk wins on existence; the log wins on history.

use crate::naming::parse_asset_name;
use crate::oplog::{Op, Provenance, Record};
use crate::project::Project;
use crate::{Result, State};
use rusqlite::Connection;
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct AssetRow {
    pub name: String,
    pub state: State,
    pub seq: Option<u32>,
    pub original_name: Option<String>,
    pub imported_at: Option<u64>,
    pub provenance: String,
    pub size_bytes: u64,
}

pub struct Index {
    conn: Connection,
}

impl Index {
    pub fn open(project: &Project) -> Result<Index> {
        let conn = Connection::open(project.index_path())?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS assets (
                name TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                seq INTEGER,
                original_name TEXT,
                imported_at INTEGER,
                provenance TEXT NOT NULL,
                size_bytes INTEGER NOT NULL
            );",
        )?;
        Ok(Index { conn })
    }

    /// Full rebuild: scan disk (truth for existence), enrich from oplog
    /// (truth for history), replace index contents. Also reconciles: emits
    /// EXTERNAL_ADD / EXTERNAL_REMOVE records for drift so the log converges
    /// on reality with INFERRED provenance. Zero phantom records: everything
    /// in the index after rebuild exists on disk (§27.5 criteria 3 and 4).
    pub fn rebuild(&mut self, project: &Project) -> Result<usize> {
        // 1. Disk scan: name -> (state, size)
        let mut on_disk: HashMap<String, (State, u64)> = HashMap::new();
        for st in State::ALL {
            let dir = project.state_dir(st);
            if !dir.is_dir() {
                continue;
            }
            for entry in fs::read_dir(&dir)? {
                let entry = entry?;
                let p = entry.path();
                if p.is_file() {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let size = entry.metadata()?.len();
                    on_disk.insert(name, (st, size));
                }
            }
        }

        // 2. Oplog replay: history per asset name.
        #[derive(Default, Clone)]
        struct Hist {
            seq: Option<u32>,
            original_name: Option<String>,
            imported_at: Option<u64>,
            provenance: Option<String>,
            known: bool, // ever appeared in the log as existing
        }
        let mut hist: HashMap<String, Hist> = HashMap::new();
        let records: Vec<Record> = project.oplog().read_all()?;
        for rec in &records {
            match &rec.op {
                Op::IMPORT {
                    asset,
                    seq,
                    original_name,
                    ..
                } => {
                    let h = hist.entry(asset.clone()).or_default();
                    h.seq = Some(*seq);
                    h.original_name = Some(original_name.clone());
                    h.imported_at = Some(rec.ts);
                    h.provenance = Some(format!("{:?}", rec.provenance));
                    h.known = true;
                }
                Op::DUPLICATE { source, asset, seq } => {
                    let src = hist.get(source).cloned().unwrap_or_default();
                    let h = hist.entry(asset.clone()).or_default();
                    h.seq = Some(*seq);
                    h.original_name = src.original_name.clone();
                    h.imported_at = Some(rec.ts);
                    h.provenance = Some("RECORDED".into());
                    h.known = true;
                }
                Op::STATE_CHANGE { asset, new_name, .. } => {
                    if let Some(mut h) = hist.remove(asset) {
                        h.known = true;
                        hist.insert(new_name.clone(), h);
                    } else {
                        hist.entry(new_name.clone()).or_default().known = true;
                    }
                }
                Op::EXTERNAL_ADD { asset, seq, .. } => {
                    let h = hist.entry(asset.clone()).or_default();
                    h.seq = *seq;
                    h.imported_at = Some(rec.ts);
                    h.provenance = Some("INFERRED".into());
                    h.known = true;
                }
                Op::DELETE { asset } | Op::EXTERNAL_REMOVE { asset } => {
                    hist.remove(asset);
                }
                _ => {}
            }
        }

        // 3. Reconciliation records for drift.
        for (name, (st, _)) in &on_disk {
            let known = hist.get(name).map(|h| h.known).unwrap_or(false);
            if !known {
                let parsed = parse_asset_name(name);
                project.oplog().append(
                    Provenance::INFERRED,
                    Op::EXTERNAL_ADD {
                        asset: name.clone(),
                        container: parsed
                            .as_ref()
                            .map(|(p, _)| p.clone())
                            .unwrap_or_else(|| "EXTERNAL".into()),
                        state: *st,
                        seq: parsed.map(|(_, s)| s),
                    },
                )?;
            }
        }
        for name in hist.keys() {
            if !on_disk.contains_key(name) {
                project.oplog().append(
                    Provenance::INFERRED,
                    Op::EXTERNAL_REMOVE {
                        asset: name.clone(),
                    },
                )?;
            }
        }

        // 4. Replace index contents from disk truth + history enrichment.
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM assets", [])?;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO assets
                 (name, state, seq, original_name, imported_at, provenance, size_bytes)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )?;
            for (name, (st, size)) in &on_disk {
                let h = hist.get(name).cloned().unwrap_or_default();
                stmt.execute(rusqlite::params![
                    name,
                    st.dir_name(),
                    h.seq,
                    h.original_name,
                    h.imported_at,
                    h.provenance.unwrap_or_else(|| "INFERRED".into()),
                    size,
                ])?;
            }
        }
        tx.commit()?;
        Ok(on_disk.len())
    }

    pub fn all(&self) -> Result<Vec<AssetRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT name, state, seq, original_name, imported_at, provenance, size_bytes
             FROM assets ORDER BY name",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(AssetRow {
                name: r.get(0)?,
                state: State::parse(&r.get::<_, String>(1)?).unwrap_or(State::RAW),
                seq: r.get(2)?,
                original_name: r.get(3)?,
                imported_at: r.get(4)?,
                provenance: r.get(5)?,
                size_bytes: r.get(6)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn get(&self, name: &str) -> Result<Option<AssetRow>> {
        Ok(self.all()?.into_iter().find(|a| a.name == name))
    }
}
