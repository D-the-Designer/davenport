//! Atomic file operations. Discipline: write to a tmp sibling in the SAME
//! directory (same filesystem, so rename is atomic), fsync, then rename over
//! the destination. A forced termination leaves either the old state or a
//! `.dvtmp` orphan — never a half-written destination file.

use crate::Result;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const TMP_SUFFIX: &str = ".dvtmp";

fn tmp_sibling(dest: &Path) -> PathBuf {
    let mut name = dest
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unnamed".into());
    name.push_str(TMP_SUFFIX);
    dest.with_file_name(name)
}

/// Atomically write `bytes` to `dest`.
pub fn write_atomic(dest: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = tmp_sibling(dest);
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, dest)?;
    Ok(())
}

/// Atomically copy `src` into `dest` (tmp sibling of dest, then rename).
/// Used by import so a killed import never leaves a partial asset in a
/// state directory.
pub fn copy_atomic(src: &Path, dest: &Path) -> Result<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = tmp_sibling(dest);
    fs::copy(src, &tmp)?;
    let f = fs::File::open(&tmp)?;
    f.sync_all()?;
    drop(f);
    fs::rename(&tmp, dest)?;
    Ok(())
}

/// Append a line (adds the trailing newline) and fsync. The newline is the
/// commit marker: a record without one was never durable (see oplog torn-tail
/// recovery).
pub fn append_line_synced(path: &Path, line: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut f = fs::OpenOptions::new().create(true).append(true).open(path)?;
    f.write_all(line.as_bytes())?;
    f.write_all(b"\n")?;
    f.sync_all()?;
    Ok(())
}

/// Remove orphan `.dvtmp` files under `root` (recursive). Returns count.
/// Called on project open: this is forced-termination recovery for file
/// payloads.
pub fn sweep_orphan_tmp(root: &Path) -> Result<usize> {
    let mut removed = 0usize;
    if !root.is_dir() {
        return Ok(0);
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if p
                .file_name()
                .map(|n| n.to_string_lossy().ends_with(TMP_SUFFIX))
                .unwrap_or(false)
            {
                fs::remove_file(&p)?;
                removed += 1;
            }
        }
    }
    Ok(removed)
}
