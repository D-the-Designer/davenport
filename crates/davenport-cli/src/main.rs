//! `davenport` — CLI with full command parity to the GUI and agent surfaces.
//! Same typed commands, same outcomes (as JSON with --json).
//!
//! KEEP is the default on import: originals are never deleted unless
//! --trash-originals is passed. Batch = one command, no per-item prompts;
//! confirmation policy belongs to interactive shells, not here.

use davenport_core::commands::{execute, Command, Outcome};
use davenport_core::project::Project;
use davenport_core::State;
use std::path::PathBuf;
use std::process::ExitCode;

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("DAVENPORT ERROR: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cmd = args.first().map(String::as_str).unwrap_or("");
    match cmd {
        "new" => {
            let dir = req(&args, 1, "project-dir")?;
            let name = flag_value(&args, "--name").unwrap_or_else(|| dir_name(&dir));
            Project::create(&PathBuf::from(&dir), &name)?;
            println!("PROJECT CREATED  {dir}");
            Ok(())
        }
        "import" => {
            let dir = req(&args, 1, "project-dir")?;
            let container = req(&args, 2, "container")?;
            let sources: Vec<PathBuf> = args[3..]
                .iter()
                .filter(|a| !a.starts_with("--"))
                .map(PathBuf::from)
                .collect();
            if sources.is_empty() {
                return Err("import: no source files given".into());
            }
            let keep = !args.iter().any(|a| a == "--trash-originals");
            let project = Project::open(&PathBuf::from(&dir))?;
            let out = execute(
                &project,
                Command::Import { container, sources, keep_originals: keep },
            )?;
            if let Outcome::Imported { assets } = out {
                for a in &assets {
                    println!("IMPORTED  {a}");
                }
                println!(
                    "{} ASSET(S)  ORIGINALS {}",
                    assets.len(),
                    if keep { "KEPT" } else { "TRASHED" }
                );
            }
            Ok(())
        }
        "state" => {
            let dir = req(&args, 1, "project-dir")?;
            let asset = req(&args, 2, "asset")?;
            let st = req(&args, 3, "state")?;
            let to = State::parse(&st).ok_or("state must be RAW|WORKING|APPROVED|FINAL")?;
            let project = Project::open(&PathBuf::from(&dir))?;
            if let Outcome::StateSet { asset, to, path } =
                execute(&project, Command::SetState { asset, to })?
            {
                println!("{asset}  ->  {to}  ({path})");
            }
            Ok(())
        }
        "dup" => {
            let dir = req(&args, 1, "project-dir")?;
            let asset = req(&args, 2, "asset")?;
            let project = Project::open(&PathBuf::from(&dir))?;
            if let Outcome::Duplicated { asset } = execute(&project, Command::Duplicate { asset })? {
                println!("DUPLICATED  {asset}");
            }
            Ok(())
        }
        "delete" => {
            let dir = req(&args, 1, "project-dir")?;
            let asset = req(&args, 2, "asset")?;
            let project = Project::open(&PathBuf::from(&dir))?;
            if let Outcome::Deleted { asset } = execute(&project, Command::Delete { asset })? {
                println!("DELETED  {asset}");
            }
            Ok(())
        }
        "list" => {
            let dir = req(&args, 1, "project-dir")?;
            let project = Project::open(&PathBuf::from(&dir))?;
            if let Outcome::Listing { assets } = execute(&project, Command::List)? {
                if args.iter().any(|a| a == "--json") {
                    println!("{}", serde_json::to_string_pretty(&assets)?);
                } else {
                    println!(
                        "{:<28} {:<9} {:>5}  {:<20} PROVENANCE",
                        "ASSET", "STATE", "SEQ", "ORIGINAL"
                    );
                    for a in assets {
                        out(format_args!(
                            "{:<28} {:<9} {:>5}  {:<20} {}",
                            a.name,
                            a.state,
                            a.seq.map(|s| s.to_string()).unwrap_or_else(|| "-".into()),
                            a.original_name.unwrap_or_else(|| "-".into()),
                            a.provenance
                        ))?;
                    }
                }
            }
            Ok(())
        }
        "rebuild" => {
            let dir = req(&args, 1, "project-dir")?;
            let project = Project::open(&PathBuf::from(&dir))?;
            if let Outcome::Rebuilt { asset_count } = execute(&project, Command::Rebuild)? {
                println!("INDEX REBUILT  {asset_count} ASSET(S)");
            }
            Ok(())
        }
        "log" => {
            let dir = req(&args, 1, "project-dir")?;
            let n: usize = flag_value(&args, "--tail")
                .and_then(|v| v.parse().ok())
                .unwrap_or(usize::MAX);
            let project = Project::open(&PathBuf::from(&dir))?;
            let recs = project.oplog().read_all()?;
            let start = recs.len().saturating_sub(n);
            for r in &recs[start..] {
                out(format_args!("{}", serde_json::to_string(r)?))?;
            }
            Ok(())
        }
        "" | "help" | "--help" => {
            print!("{USAGE}");
            Ok(())
        }
        other => Err(format!("unknown command: {other}\n{USAGE}").into()),
    }
}

const USAGE: &str = "\
DAVENPORT — FILES CLI
  davenport new <project-dir> [--name NAME]
  davenport import <project-dir> <container> <file>... [--trash-originals]
  davenport state <project-dir> <asset> <RAW|WORKING|APPROVED|FINAL>
  davenport dup <project-dir> <asset>
  davenport delete <project-dir> <asset>
  davenport list <project-dir> [--json]
  davenport rebuild <project-dir>
  davenport log <project-dir> [--tail N]
";

/// Print a line to stdout; a closed pipe (e.g. `| head`) is a clean exit,
/// not an error — agents pipe this CLI constantly.
fn out(line: std::fmt::Arguments) -> Result<(), Box<dyn std::error::Error>> {
    use std::io::Write;
    let mut so = std::io::stdout().lock();
    match writeln!(so, "{line}") {
        Err(e) if e.kind() == std::io::ErrorKind::BrokenPipe => std::process::exit(0),
        r => Ok(r?),
    }
}

fn req(args: &[String], i: usize, what: &str) -> Result<String, String> {
    args.get(i)
        .filter(|a| !a.starts_with("--"))
        .cloned()
        .ok_or_else(|| format!("missing argument: {what}\n{USAGE}"))
}

fn flag_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

fn dir_name(dir: &str) -> String {
    PathBuf::from(dir)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "PROJECT".into())
}
