//! Deterministic asset naming: CONTAINER_NNNN.ext.
//! Filenames are always predictable — an agent (or a human in Terminal) can
//! address any asset without querying anything. Original filenames live in
//! metadata, never in the name.

/// Sanitize a container name into a filename prefix: ALL CAPS, ASCII
/// alphanumerics, everything else collapsed to a single hyphen.
pub fn container_prefix(container: &str) -> String {
    let mut out = String::with_capacity(container.len());
    let mut last_hyphen = false;
    for c in container.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_uppercase());
            last_hyphen = false;
        } else if !last_hyphen && !out.is_empty() {
            out.push('-');
            last_hyphen = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() {
        out.push_str("ASSET");
    }
    out
}

/// Lowercased extension from an original filename, if any.
pub fn extension_of(original: &str) -> Option<String> {
    std::path::Path::new(original)
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
}

/// CONTAINER_NNNN.ext (or extensionless).
pub fn asset_name(prefix: &str, seq: u32, ext: Option<&str>) -> String {
    match ext {
        Some(e) if !e.is_empty() => format!("{prefix}_{seq:04}.{e}"),
        _ => format!("{prefix}_{seq:04}"),
    }
}

/// Parse a deterministic asset name back into (prefix, seq). Extension is
/// ignored. Returns None for names that don't follow the convention (which is
/// how reconciliation spots externally-added files).
pub fn parse_asset_name(name: &str) -> Option<(String, u32)> {
    let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or(name);
    let (prefix, num) = stem.rsplit_once('_')?;
    if prefix.is_empty() || num.len() != 4 {
        return None;
    }
    let seq: u32 = num.parse().ok()?;
    Some((prefix.to_string(), seq))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_sanitizes() {
        assert_eq!(container_prefix("Brand Package"), "BRAND-PACKAGE");
        assert_eq!(container_prefix("rail_walkers!!"), "RAIL-WALKERS");
        assert_eq!(container_prefix("///"), "ASSET");
    }

    #[test]
    fn names_round_trip() {
        let n = asset_name("BRAND", 7, Some("png"));
        assert_eq!(n, "BRAND_0007.png");
        assert_eq!(parse_asset_name(&n), Some(("BRAND".into(), 7)));
        assert_eq!(parse_asset_name("freeform.png"), None);
    }
}
