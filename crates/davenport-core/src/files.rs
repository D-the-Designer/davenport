//! Davenport Files operations. Every operation:
//! 1. performs the real filesystem change atomically,
//! 2. appends a RECORDED oplog entry,
//! and is exposed identically to GUI, CLI, and agents via `commands`.

use crate::fsatomic::copy_atomic;
use crate::naming::{asset_name, container_prefix, extension_of};
use crate::oplog::{Op, Provenance};
use crate::project::Project;
use crate::{Error, Result, State};
use std::fs;
use std::path::{Path, PathBuf};

pub struct ImportOutcome {
    pub asset: String,
    pub path: PathBuf,
    pub seq: u32,
}

/// Import external files into `container` (a name used for the prefix) at
/// state RAW (imports always land RAW). Copies — never moves — unless
/// `keep_originals` is false, in which case originals are deleted AFTER a
/// successful copy. KEEP is the safe default; callers must opt in to delete.
pub fn import(
    project: &Project,
    container: &str,
    sources: &[PathBuf],
    keep_originals: bool,
) -> Result<Vec<ImportOutcome>> {
    let prefix = container_prefix(container);
    let mut next = project.oplog().max_seq(&prefix)? + 1;
    let mut out = Vec::with_capacity(sources.len());
    for src in sources {
        if !src.is_file() {
            return Err(Error::Invalid(format!("not a file: {}", src.display())));
        }
        let original = src
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = extension_of(&original);
        let name = asset_name(&prefix, next, ext.as_deref());
        let dest = project.state_dir(State::RAW).join(&name);
        copy_atomic(src, &dest)?;
        project.oplog().append(
            Provenance::RECORDED,
            Op::IMPORT {
                asset: name.clone(),
                container: container.to_string(),
                state: State::RAW,
                seq: next,
                original_name: original,
                origin_path: Some(src.display().to_string()),
                kept_original: keep_originals,
            },
        )?;
        if !keep_originals {
            fs::remove_file(src)?;
        }
        out.push(ImportOutcome {
            asset: name,
            path: dest,
            seq: next,
        });
        next += 1;
    }
    Ok(out)
}

fn locate(project: &Project, asset: &str) -> Result<(State, PathBuf)> {
    for st in State::ALL {
        let p = project.state_dir(st).join(asset);
        if p.is_file() {
            return Ok((st, p));
        }
    }
    Err(Error::Invalid(format!("asset not found on disk: {asset}")))
}

/// Change an asset's state: MOVE the real file between state directories.
/// The name is unchanged (state lives in the path, not the name).
pub fn set_state(project: &Project, asset: &str, to: State) -> Result<PathBuf> {
    let (from, src) = locate(project, asset)?;
    if from == to {
        return Ok(src);
    }
    let dest = project.state_dir(to).join(asset);
    fs::create_dir_all(dest.parent().unwrap())?;
    fs::rename(&src, &dest)?;
    project.oplog().append(
        Provenance::RECORDED,
        Op::STATE_CHANGE {
            asset: asset.to_string(),
            from,
            to,
            new_name: asset.to_string(),
        },
    )?;
    Ok(dest)
}

/// Duplicate an asset within the project. A distinct operation from import
/// (contract requirement): new sequence number, same container prefix,
/// lands beside the source in the same state.
pub fn duplicate(project: &Project, asset: &str) -> Result<ImportOutcome> {
    let (st, src) = locate(project, asset)?;
    let (prefix, _) = crate::naming::parse_asset_name(asset)
        .ok_or_else(|| Error::Invalid(format!("asset name not deterministic: {asset}")))?;
    let seq = project.oplog().max_seq(&prefix)? + 1;
    let ext = extension_of(asset);
    let name = asset_name(&prefix, seq, ext.as_deref());
    let dest = project.state_dir(st).join(&name);
    copy_atomic(&src, &dest)?;
    project.oplog().append(
        Provenance::RECORDED,
        Op::DUPLICATE {
            source: asset.to_string(),
            asset: name.clone(),
            seq,
        },
    )?;
    Ok(ImportOutcome {
        asset: name,
        path: dest,
        seq,
    })
}

/// Delete an asset (removes the real file, logs it).
pub fn delete(project: &Project, asset: &str) -> Result<()> {
    let (_, path) = locate(project, asset)?;
    fs::remove_file(&path)?;
    project.oplog().append(
        Provenance::RECORDED,
        Op::DELETE {
            asset: asset.to_string(),
        },
    )?;
    Ok(())
}

/// Convenience: absolute path of an asset if present.
pub fn path_of(project: &Project, asset: &str) -> Result<PathBuf> {
    Ok(locate(project, asset)?.1)
}

/// List assets straight from disk (no index needed) — (name, state, size).
pub fn scan_disk(project: &Project) -> Result<Vec<(String, State, u64)>> {
    let mut out = Vec::new();
    for st in State::ALL {
        let dir = project.state_dir(st);
        if !dir.is_dir() {
            continue;
        }
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            if entry.path().is_file() {
                out.push((
                    entry.file_name().to_string_lossy().into_owned(),
                    st,
                    entry.metadata()?.len(),
                ));
            }
        }
    }
    out.sort();
    Ok(out)
}

/// Guard used by tests: no `.dvtmp` files anywhere under FILES/.
pub fn assert_no_tmp(files_root: &Path) -> bool {
    fn walk(dir: &Path) -> bool {
        if let Ok(rd) = fs::read_dir(dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() {
                    if !walk(&p) {
                        return false;
                    }
                } else if p.to_string_lossy().ends_with(crate::fsatomic::TMP_SUFFIX) {
                    return false;
                }
            }
        }
        true
    }
    walk(files_root)
}
