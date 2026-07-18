//! `.davenport/operations.jsonl` — the append-only semantic operation log.
//! One JSON object per line. The trailing newline is the commit marker.
//!
//! Provenance ladder (contract): RECORDED (written by Davenport at the moment
//! it performed the operation) > OPERATOR_NOTE (a human said so) > INFERRED
//! (reconstructed from disk evidence, e.g. reconciliation) > PROPOSED (an
//! agent suggests it happened / should happen; not yet fact).
//!
//! The log is ground truth for history. The SQLite index may be deleted at
//! any time and rebuilt from disk + this log with no loss (§27.5 criterion 3).

use crate::fsatomic::append_line_synced;
use crate::{now_ms, Result, State};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[allow(non_camel_case_types)] // ALL CAPS on the wire is Davenport convention
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Provenance {
    RECORDED,
    OPERATOR_NOTE,
    INFERRED,
    PROPOSED,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op")]
#[allow(non_camel_case_types)]
pub enum Op {
    PROJECT_CREATED {
        name: String,
    },
    IMPORT {
        asset: String,
        container: String,
        state: State,
        seq: u32,
        original_name: String,
        origin_path: Option<String>,
        kept_original: bool,
    },
    STATE_CHANGE {
        asset: String,
        from: State,
        to: State,
        new_name: String,
    },
    DUPLICATE {
        source: String,
        asset: String,
        seq: u32,
    },
    DELETE {
        asset: String,
    },
    /// Reconciliation found a file on disk the log didn't know about.
    EXTERNAL_ADD {
        asset: String,
        container: String,
        state: State,
        seq: Option<u32>,
    },
    /// Reconciliation found a logged asset missing from disk.
    EXTERNAL_REMOVE {
        asset: String,
    },
    /// Recovery events (torn tail truncated, orphan tmp swept).
    RECOVERY {
        detail: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Record {
    pub ts: u64,
    pub provenance: Provenance,
    #[serde(flatten)]
    pub op: Op,
}

pub struct OpLog {
    path: PathBuf,
}

impl OpLog {
    pub fn at(dot_davenport: &Path) -> OpLog {
        OpLog {
            path: dot_davenport.join("operations.jsonl"),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn append(&self, provenance: Provenance, op: Op) -> Result<Record> {
        let rec = Record {
            ts: now_ms(),
            provenance,
            op,
        };
        let line = serde_json::to_string(&rec)?;
        debug_assert!(!line.contains('\n'));
        append_line_synced(&self.path, &line)?;
        Ok(rec)
    }

    /// Read every complete record. A torn final line (no trailing newline —
    /// the write never committed) is ignored (§27.5 criterion 7).
    pub fn read_all(&self) -> Result<Vec<Record>> {
        let bytes = match fs::read(&self.path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e.into()),
        };
        let mut out = Vec::new();
        for line in complete_lines(&bytes) {
            if line.trim().is_empty() {
                continue;
            }
            match serde_json::from_str::<Record>(line) {
                Ok(r) => out.push(r),
                // A corrupt interior line is skipped, not fatal: the log must
                // tolerate damage, and disk reconciliation covers the gap.
                Err(_) => continue,
            }
        }
        Ok(out)
    }

    /// If the log ends in a torn (uncommitted) record, truncate it to the last
    /// complete line and append a RECOVERY record noting the repair.
    /// Returns true if a repair happened. Called on project open.
    pub fn repair_torn_tail(&self) -> Result<bool> {
        let bytes = match fs::read(&self.path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(e) => return Err(e.into()),
        };
        if bytes.is_empty() || bytes.ends_with(b"\n") {
            return Ok(false);
        }
        let keep = bytes
            .iter()
            .rposition(|&b| b == b'\n')
            .map(|i| i + 1)
            .unwrap_or(0);
        let f = fs::OpenOptions::new().write(true).open(&self.path)?;
        f.set_len(keep as u64)?;
        f.sync_all()?;
        drop(f);
        self.append(
            Provenance::INFERRED,
            Op::RECOVERY {
                detail: format!("torn oplog tail truncated ({} bytes)", bytes.len() - keep),
            },
        )?;
        Ok(true)
    }

    /// Highest sequence number ever assigned per container prefix, from the
    /// full log. Because the log is append-only, deleted assets still count —
    /// this is what guarantees sequence non-reuse across restarts (§27.5
    /// criterion 6).
    pub fn max_seq(&self, prefix: &str) -> Result<u32> {
        let mut max = 0u32;
        for rec in self.read_all()? {
            let seq = match &rec.op {
                Op::IMPORT {
                    container, seq, ..
                } if crate::naming::container_prefix(container) == prefix => Some(*seq),
                Op::DUPLICATE { asset, seq, .. } | Op::IMPORT { asset, seq, .. }
                    if asset.starts_with(&format!("{prefix}_")) =>
                {
                    Some(*seq)
                }
                Op::EXTERNAL_ADD { seq: Some(s), asset, .. }
                    if asset.starts_with(&format!("{prefix}_")) =>
                {
                    Some(*s)
                }
                _ => None,
            };
            if let Some(s) = seq {
                if s > max {
                    max = s;
                }
            }
        }
        Ok(max)
    }
}

/// Iterator over complete (newline-terminated) lines; drops a torn tail.
fn complete_lines(bytes: &[u8]) -> impl Iterator<Item = &str> {
    let end = bytes
        .iter()
        .rposition(|&b| b == b'\n')
        .map(|i| i + 1)
        .unwrap_or(0);
    bytes[..end]
        .split(|&b| b == b'\n')
        .filter_map(|l| std::str::from_utf8(l).ok())
}
