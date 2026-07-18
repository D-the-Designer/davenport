//! Project structure and lifecycle.
//!
//! ~/Davenport/[PROJECT]/
//! ├── davenport.config          ← workspace layout (owned by the shell, not core)
//! ├── FILES/
//! │   ├── RAW/ WORKING/ APPROVED/ FINAL/
//! │   └── [user folders]/
//! └── .davenport/
//!     ├── operations.jsonl      ← ground-truth history (append-only)
//!     └── index.sqlite          ← rebuildable index, disposable

use crate::fsatomic::sweep_orphan_tmp;
use crate::oplog::{Op, OpLog, Provenance};
use crate::{Error, Result, State};
use std::fs;
use std::path::{Path, PathBuf};

pub struct Project {
    root: PathBuf,
    oplog: OpLog,
}

impl Project {
    pub fn files_root_of(root: &Path) -> PathBuf {
        root.join("FILES")
    }

    pub fn dot_dir_of(root: &Path) -> PathBuf {
        root.join(".davenport")
    }

    /// Create a new project directory structure. Errors if root exists and is
    /// non-empty without Davenport structure? No — idempotent: creates what's
    /// missing, never destroys.
    pub fn create(root: &Path, name: &str) -> Result<Project> {
        fs::create_dir_all(root)?;
        let files = Self::files_root_of(root);
        for st in State::ALL {
            fs::create_dir_all(files.join(st.dir_name()))?;
        }
        fs::create_dir_all(Self::dot_dir_of(root))?;
        let oplog = OpLog::at(&Self::dot_dir_of(root));
        let p = Project {
            root: root.to_path_buf(),
            oplog,
        };
        p.oplog.append(
            Provenance::RECORDED,
            Op::PROJECT_CREATED { name: name.into() },
        )?;
        Ok(p)
    }

    /// Open an existing project. Runs forced-termination recovery:
    /// sweeps orphan tmp payloads and repairs a torn oplog tail (§27.5
    /// criteria 5 and 7).
    pub fn open(root: &Path) -> Result<Project> {
        if !Self::files_root_of(root).is_dir() {
            return Err(Error::Invalid(format!(
                "not a Davenport project (no FILES/): {}",
                root.display()
            )));
        }
        fs::create_dir_all(Self::dot_dir_of(root))?;
        let oplog = OpLog::at(&Self::dot_dir_of(root));
        oplog.repair_torn_tail()?;
        let swept = sweep_orphan_tmp(&Self::files_root_of(root))?;
        if swept > 0 {
            oplog.append(
                Provenance::INFERRED,
                Op::RECOVERY {
                    detail: format!("swept {swept} orphan tmp file(s)"),
                },
            )?;
        }
        Ok(Project {
            root: root.to_path_buf(),
            oplog,
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn files_root(&self) -> PathBuf {
        Self::files_root_of(&self.root)
    }
    pub fn dot_dir(&self) -> PathBuf {
        Self::dot_dir_of(&self.root)
    }
    pub fn oplog(&self) -> &OpLog {
        &self.oplog
    }
    pub fn state_dir(&self, st: State) -> PathBuf {
        self.files_root().join(st.dir_name())
    }
    pub fn index_path(&self) -> PathBuf {
        self.dot_dir().join("index.sqlite")
    }
}
