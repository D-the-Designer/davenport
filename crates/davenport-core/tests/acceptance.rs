//! §27.5 acceptance criteria (from the v1.2 build contracts, reconstructed
//! via the 2026-07-14 handoff). One test per criterion, numbered.

use davenport_core::commands::{execute, Command, Outcome};
use davenport_core::files;
use davenport_core::index::Index;
use davenport_core::oplog::{Op, Provenance};
use davenport_core::project::Project;
use davenport_core::State;
use std::fs;
use std::path::PathBuf;

fn setup() -> (tempfile::TempDir, Project) {
    let tmp = tempfile::tempdir().unwrap();
    let proj = Project::create(&tmp.path().join("PROJ"), "PROJ").unwrap();
    (tmp, proj)
}

fn make_sources(dir: &std::path::Path, specs: &[(&str, &[u8])]) -> Vec<PathBuf> {
    fs::create_dir_all(dir).unwrap();
    specs
        .iter()
        .map(|(name, bytes)| {
            let p = dir.join(name);
            fs::write(&p, bytes).unwrap();
            p
        })
        .collect()
}

/// 1. 500-asset batch import with deliberate original-name collisions:
/// every asset gets a unique deterministic name; original names preserved.
#[test]
fn c1_batch_import_500_with_collisions() {
    let (tmp, proj) = setup();
    let src_dir = tmp.path().join("incoming");
    // 500 files across 5 subdirs of 100, ALL named the same to force
    // collisions on original_name.
    // 500 files in per-file dirs so all 500 can share the original name
    // "shot.png" — a deliberate maximal collision set.
    let mut sources = Vec::new();
    for d in 0..5 {
        for i in 0..100 {
            let pd = src_dir.join(format!("batch{d}/f{i}"));
            fs::create_dir_all(&pd).unwrap();
            let p = pd.join("shot.png");
            fs::write(&p, format!("payload-{d}-{i}")).unwrap();
            sources.push(p);
        }
    }
    assert_eq!(sources.len(), 500);
    let out = files::import(&proj, "Brand Package", &sources, true).unwrap();
    assert_eq!(out.len(), 500);
    // Unique deterministic names, sequential.
    let mut names: Vec<_> = out.iter().map(|o| o.asset.clone()).collect();
    let unique: std::collections::HashSet<_> = names.iter().cloned().collect();
    assert_eq!(unique.len(), 500);
    names.sort();
    assert_eq!(names[0], "BRAND-PACKAGE_0001.png");
    assert_eq!(names[499], "BRAND-PACKAGE_0500.png");
    // All on disk in RAW; originals untouched (KEEP default).
    for o in &out {
        assert!(o.path.is_file());
    }
    for s in &sources {
        assert!(s.is_file(), "original was deleted despite KEEP");
    }
    // Original name preserved in index metadata for every asset.
    let mut idx = Index::open(&proj).unwrap();
    idx.rebuild(&proj).unwrap();
    let rows = idx.all().unwrap();
    assert_eq!(rows.len(), 500);
    assert!(rows.iter().all(|r| r.original_name.as_deref() == Some("shot.png")));
    assert!(files::assert_no_tmp(&proj.files_root()));
}

/// 2. State moves verify REAL path changes on disk.
#[test]
fn c2_state_moves_real_paths() {
    let (tmp, proj) = setup();
    let sources = make_sources(&tmp.path().join("in"), &[("a.jpg", b"x")]);
    let out = files::import(&proj, "RAIL", &sources, true).unwrap();
    let asset = &out[0].asset;
    let raw_path = proj.state_dir(State::RAW).join(asset);
    assert!(raw_path.is_file());

    let new_path = files::set_state(&proj, asset, State::APPROVED).unwrap();
    assert!(!raw_path.exists(), "file still in RAW after state change");
    assert!(new_path.is_file());
    assert_eq!(new_path, proj.state_dir(State::APPROVED).join(asset));

    // And again to FINAL.
    let final_path = files::set_state(&proj, asset, State::FINAL).unwrap();
    assert!(!new_path.exists());
    assert!(final_path.is_file());
}

/// 3. Delete-and-rebuild equivalence: remove index.sqlite entirely; rebuild
/// reconstructs an equivalent index with provenance (original names, import
/// order) recovered from the oplog.
#[test]
fn c3_delete_and_rebuild_equivalence() {
    let (tmp, proj) = setup();
    let sources = make_sources(
        &tmp.path().join("in"),
        &[("one.png", b"1"), ("two.png", b"22"), ("three.png", b"333")],
    );
    files::import(&proj, "COMOD", &sources, true).unwrap();
    files::set_state(&proj, "COMOD_0002.png", State::APPROVED).unwrap();

    let mut idx = Index::open(&proj).unwrap();
    idx.rebuild(&proj).unwrap();
    let before = idx.all().unwrap();
    drop(idx);

    fs::remove_file(proj.index_path()).unwrap();
    assert!(!proj.index_path().exists());

    let mut idx2 = Index::open(&proj).unwrap();
    idx2.rebuild(&proj).unwrap();
    let after = idx2.all().unwrap();

    assert_eq!(before, after, "rebuilt index differs from original");
    // Provenance specifics recovered from oplog, not disk:
    let two = after.iter().find(|r| r.name == "COMOD_0002.png").unwrap();
    assert_eq!(two.original_name.as_deref(), Some("two.png"));
    assert_eq!(two.state, State::APPROVED);
    assert_eq!(two.seq, Some(2));
    assert!(two.imported_at.is_some());
    assert_eq!(two.provenance, "RECORDED");
}

/// 4. External change reconciliation with zero phantom records: files added
/// or removed behind Davenport's back are absorbed; nothing in the index
/// lacks a disk file.
#[test]
fn c4_external_change_reconciliation() {
    let (tmp, proj) = setup();
    let sources = make_sources(&tmp.path().join("in"), &[("a.png", b"a"), ("b.png", b"b")]);
    files::import(&proj, "EXT", &sources, true).unwrap();
    let mut idx = Index::open(&proj).unwrap();
    idx.rebuild(&proj).unwrap();

    // Operator adds a file directly in Finder/Terminal...
    fs::write(proj.state_dir(State::WORKING).join("freehand.psd"), b"psd").unwrap();
    // ...and deletes one Davenport imported.
    fs::remove_file(proj.state_dir(State::RAW).join("EXT_0001.png")).unwrap();

    idx.rebuild(&proj).unwrap();
    let rows = idx.all().unwrap();
    // Zero phantoms: every row's file exists.
    for r in &rows {
        let found = State::ALL
            .iter()
            .any(|st| proj.state_dir(*st).join(&r.name).is_file());
        assert!(found, "phantom index record: {}", r.name);
    }
    assert!(rows.iter().any(|r| r.name == "freehand.psd"));
    assert!(!rows.iter().any(|r| r.name == "EXT_0001.png"));
    // Reconciliation wrote INFERRED records to the log.
    let ops = proj.oplog().read_all().unwrap();
    assert!(ops.iter().any(|r| matches!(&r.op, Op::EXTERNAL_ADD { asset, .. } if asset == "freehand.psd" ) && r.provenance == Provenance::INFERRED));
    assert!(ops.iter().any(|r| matches!(&r.op, Op::EXTERNAL_REMOVE { asset } if asset == "EXT_0001.png")));
}

/// 5. Forced-termination recovery during import and during index update:
/// orphan tmp payloads are swept on open; a half-written index file is
/// disposable by doctrine (delete + rebuild = criterion 3), so recovery
/// must leave FILES/ clean and the log parseable.
#[test]
fn c5_forced_termination_recovery() {
    let (tmp, proj) = setup();
    let sources = make_sources(&tmp.path().join("in"), &[("ok.png", b"ok")]);
    files::import(&proj, "KILL", &sources, true).unwrap();

    // Simulate a kill mid-import: an orphan .dvtmp payload in RAW.
    fs::write(
        proj.state_dir(State::RAW).join("KILL_0002.png.dvtmp"),
        b"partial",
    )
    .unwrap();
    // Simulate a kill mid-oplog-append: torn tail without newline.
    let logp = proj.oplog().path().to_path_buf();
    let mut bytes = fs::read(&logp).unwrap();
    bytes.extend_from_slice(br#"{"ts":1,"provenance":"RECORDED","op":"IMPORT","asset":"KIL"#);
    fs::write(&logp, &bytes).unwrap();

    let root = proj.root().to_path_buf();
    drop(proj);
    let reopened = Project::open(&root).unwrap();

    // Orphan swept, torn tail repaired, recovery logged.
    assert!(files::assert_no_tmp(&reopened.files_root()));
    let ops = reopened.oplog().read_all().unwrap();
    let recoveries = ops
        .iter()
        .filter(|r| matches!(&r.op, Op::RECOVERY { .. }))
        .count();
    assert!(recoveries >= 2, "expected tmp sweep + torn tail recovery records");
    // Log is fully parseable and the real asset survived.
    assert!(reopened
        .oplog()
        .read_all()
        .unwrap()
        .iter()
        .any(|r| matches!(&r.op, Op::IMPORT { asset, .. } if asset == "KILL_0001.png")));
    assert!(files::path_of(&reopened, "KILL_0001.png").is_ok());
}

/// 6. Sequence-number non-reuse across restarts: delete the highest asset,
/// reopen the project, import again — the dead sequence number is never
/// reassigned (history in the append-only log guarantees it).
#[test]
fn c6_sequence_non_reuse_across_restarts() {
    let (tmp, proj) = setup();
    let s1 = make_sources(&tmp.path().join("in1"), &[("x.png", b"x"), ("y.png", b"y")]);
    files::import(&proj, "SEQ", &s1, true).unwrap();
    files::delete(&proj, "SEQ_0002.png").unwrap();

    // Restart.
    let root = proj.root().to_path_buf();
    drop(proj);
    let proj2 = Project::open(&root).unwrap();

    let s2 = make_sources(&tmp.path().join("in2"), &[("z.png", b"z")]);
    let out = files::import(&proj2, "SEQ", &s2, true).unwrap();
    assert_eq!(out[0].asset, "SEQ_0003.png", "sequence number was reused");
    assert_eq!(out[0].seq, 3);
}

/// 7. Torn-oplog-tail tolerance: a log ending in a partial record still
/// reads (partial line ignored), and repair preserves every complete record.
#[test]
fn c7_torn_oplog_tail_tolerance() {
    let (tmp, proj) = setup();
    let sources = make_sources(&tmp.path().join("in"), &[("a.png", b"a")]);
    files::import(&proj, "TORN", &sources, true).unwrap();

    let logp = proj.oplog().path().to_path_buf();
    let complete = proj.oplog().read_all().unwrap().len();
    let mut bytes = fs::read(&logp).unwrap();
    bytes.extend_from_slice(b"{\"ts\":99,\"provenance\":\"RECO");
    fs::write(&logp, &bytes).unwrap();

    // Reads ignore the torn tail without repair.
    assert_eq!(proj.oplog().read_all().unwrap().len(), complete);

    // Repair truncates the torn record and logs the recovery.
    assert!(proj.oplog().repair_torn_tail().unwrap());
    let after = proj.oplog().read_all().unwrap();
    assert_eq!(after.len(), complete + 1); // + RECOVERY record
    assert!(matches!(&after.last().unwrap().op, Op::RECOVERY { .. }));
    // Subsequent appends land cleanly.
    files::set_state(&proj, "TORN_0001.png", State::WORKING).unwrap();
    assert_eq!(proj.oplog().read_all().unwrap().len(), complete + 2);
}

/// Command-registry parity smoke test: the same operations through the typed
/// command layer (what GUI/CLI/agents call).
#[test]
fn command_registry_parity() {
    let (tmp, proj) = setup();
    let sources = make_sources(&tmp.path().join("in"), &[("p.png", b"p")]);
    let o = execute(
        &proj,
        Command::Import {
            container: "CMD".into(),
            sources,
            keep_originals: true,
        },
    )
    .unwrap();
    let asset = match o {
        Outcome::Imported { assets } => assets[0].clone(),
        _ => panic!(),
    };
    execute(&proj, Command::SetState { asset: asset.clone(), to: State::APPROVED }).unwrap();
    let listing = execute(&proj, Command::List).unwrap();
    match listing {
        Outcome::Listing { assets } => {
            assert_eq!(assets.len(), 1);
            assert_eq!(assets[0].state, State::APPROVED);
        }
        _ => panic!(),
    }
}
