//! The typed command registry — the single entry point every surface
//! (GUI, CLI, agent) calls through. One `Command` in, one `Outcome` out.
//! No surface gets a shortcut around this: if the GUI can do it, the CLI
//! and an agent can invoke the exact same `Command` and get the exact
//! same `Outcome`. This is the four-way parity contract from lib.rs.
//!
//! `Command` and `Outcome` are serde-serializable so this same enum pair
//! can cross the Tauri IPC boundary as JSON without a second definition.

use crate::files;
use crate::index::{AssetRow, Index};
use crate::project::Project;
use crate::{Result, State};
use std::path::PathBuf;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "command")]
pub enum Command {
    Import {
        container: String,
        sources: Vec<PathBuf>,
        keep_originals: bool,
    },
    SetState {
        asset: String,
        to: State,
    },
    Duplicate {
        asset: String,
    },
    Delete {
        asset: String,
    },
    List,
    Rebuild,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "outcome")]
pub enum Outcome {
    Imported { assets: Vec<String> },
    StateSet { asset: String, to: State, path: String },
    Duplicated { asset: String },
    Deleted { asset: String },
    Listing { assets: Vec<AssetRow> },
    Rebuilt { asset_count: usize },
}

/// Execute a `Command` against a project, returning its `Outcome`.
/// This is the only function GUI/CLI/agent surfaces call — none of them
/// touch `files::` or `index::` directly. That's what makes the three
/// surfaces provably identical rather than independently maintained.
pub fn execute(project: &Project, cmd: Command) -> Result<Outcome> {
    match cmd {
        Command::Import { container, sources, keep_originals } => {
            let out = files::import(project, &container, &sources, keep_originals)?;
            Ok(Outcome::Imported {
                assets: out.into_iter().map(|o| o.asset).collect(),
            })
        }
        Command::SetState { asset, to } => {
            let path = files::set_state(project, &asset, to)?;
            Ok(Outcome::StateSet {
                asset,
                to,
                path: path.display().to_string(),
            })
        }
        Command::Duplicate { asset } => {
            let out = files::duplicate(project, &asset)?;
            Ok(Outcome::Duplicated { asset: out.asset })
        }
        Command::Delete { asset } => {
            files::delete(project, &asset)?;
            Ok(Outcome::Deleted { asset })
        }
        Command::List => {
            // Rebuild-then-list keeps List always accurate against disk —
            // an operator who added/removed files outside Davenport since
            // the last read still sees ground truth, not a stale cache.
            let mut idx = Index::open(project)?;
            idx.rebuild(project)?;
            Ok(Outcome::Listing { assets: idx.all()? })
        }
        Command::Rebuild => {
            let mut idx = Index::open(project)?;
            let asset_count = idx.rebuild(project)?;
            Ok(Outcome::Rebuilt { asset_count })
        }
    }
}
