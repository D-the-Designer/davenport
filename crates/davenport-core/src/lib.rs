//! davenport-core — the filesystem-native heart of Davenport Files.
//!
//! Doctrine (non-negotiable, from the build contracts):
//! - Real files in real folders are ground truth.
//! - `.davenport/index.sqlite` is a rebuildable index, never a source of truth.
//! - `.davenport/operations.jsonl` is the append-only semantic operation log,
//!   with the RECORDED / OPERATOR_NOTE / INFERRED / PROPOSED provenance ladder.
//! - State changes move real files between RAW/WORKING/APPROVED/FINAL folders.
//! - Assets are auto-renamed on import: CONTAINER_NNNN.ext; original filename
//!   is preserved in metadata, never lost.
//! - Every durable operation is available with four-way parity:
//!   keyboard / accessibility / CLI / agent (see `commands`).

pub mod commands;
pub mod files;
pub mod fsatomic;
pub mod index;
pub mod naming;
pub mod oplog;
pub mod project;

use std::fmt;

#[derive(Debug)]
pub enum Error {
    Io(std::io::Error),
    Sql(rusqlite::Error),
    Json(serde_json::Error),
    Invalid(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io(e) => write!(f, "io: {e}"),
            Error::Sql(e) => write!(f, "sqlite: {e}"),
            Error::Json(e) => write!(f, "json: {e}"),
            Error::Invalid(m) => write!(f, "invalid: {m}"),
        }
    }
}
impl std::error::Error for Error {}
impl From<std::io::Error> for Error {
    fn from(e: std::io::Error) -> Self {
        Error::Io(e)
    }
}
impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        Error::Sql(e)
    }
}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        Error::Json(e)
    }
}

pub type Result<T> = std::result::Result<T, Error>;

/// The four asset states. A state IS a directory; changing state moves the file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, serde::Serialize, serde::Deserialize)]
pub enum State {
    RAW,
    WORKING,
    APPROVED,
    FINAL,
}

impl State {
    pub const ALL: [State; 4] = [State::RAW, State::WORKING, State::APPROVED, State::FINAL];
    pub fn dir_name(self) -> &'static str {
        match self {
            State::RAW => "RAW",
            State::WORKING => "WORKING",
            State::APPROVED => "APPROVED",
            State::FINAL => "FINAL",
        }
    }
    pub fn parse(s: &str) -> Option<State> {
        match s.to_ascii_uppercase().as_str() {
            "RAW" => Some(State::RAW),
            "WORKING" => Some(State::WORKING),
            "APPROVED" => Some(State::APPROVED),
            "FINAL" => Some(State::FINAL),
            _ => None,
        }
    }
}

impl fmt::Display for State {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.dir_name())
    }
}

/// Milliseconds since the Unix epoch. No chrono dependency; the log is
/// machine-sortable and any tool from the last 40 years can read an integer.
pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
