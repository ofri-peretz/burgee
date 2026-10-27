//! `oxmutate-instrument --root <dir> --mutate <dir relative to root> --out <mutants.json> [--stryker-compat]`
//!
//! Instruments every non-spec, non-test, non-index `.ts`/`.js` file under `<root>/<mutate>`
//! (recursively, skipping `node_modules`) in place, in parallel, and writes the mutant list in the
//! Stryker report shape. A file that fails to instrument is reported on stderr and left untouched;
//! the exit code is 1 if any did. The parity harness
//! for the native core; the product drives `instrument` through the Node binding.
use oxmutate_native::instrument::{instrument, Options};
use rayon::prelude::*;
use serde_json::json;
use std::{env, fs, path::Path, time::Instant};

fn arg(name: &str) -> Option<String> {
    let args: Vec<String> = env::args().collect();
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1).cloned())
}

fn main() {
    let root = arg("--root").expect("--root");
    let mutate = arg("--mutate").expect("--mutate");
    let out = arg("--out").expect("--out");
    let options = Options { stryker_compat: env::args().any(|a| a == "--stryker-compat"), ..Options::default() };
    let dir = Path::new(&root).join(&mutate);
    let mut files = Vec::new();
    collect(&dir, &mut files);
    files.sort();
    let t0 = Instant::now();
    let results: Vec<_> = files
        .par_iter()
        .map(|p| {
            let rel = p.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/");
            let src = fs::read_to_string(p).unwrap();
            match instrument(&rel, &src, &options) {
                Ok(r) => {
                    if let Some(code) = &r.code {
                        fs::write(p, code).unwrap();
                    }
                    Ok((rel, src, r))
                }
                Err(e) => Err(e),
            }
        })
        .collect();
    let failures: Vec<&String> = results.iter().filter_map(|r| r.as_ref().err()).collect();
    for e in &failures {
        eprintln!("{e}");
    }
    let results: Vec<_> = results.iter().filter_map(|r| r.as_ref().ok()).collect();
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    let mut report = json!({ "schemaVersion": "1", "thresholds": { "high": 80, "low": 60 }, "files": {} });
    let mut total = 0;
    for (rel, src, r) in &results {
        total += r.mutants.len();
        let mutants: Vec<_> = r.mutants.iter().map(|m| {
            let mut j = json!({
                "id": m.id, "mutatorName": m.mutator_name, "replacement": m.replacement, "status": "Pending",
                "location": { "start": { "line": m.start.line, "column": m.start.column }, "end": { "line": m.end.line, "column": m.end.column } }
            });
            if let Some(reason) = &m.ignored {
                j["status"] = json!("Ignored");
                j["statusReason"] = json!(reason);
            }
            j
        }).collect();
        report["files"][rel] = json!({ "language": "typescript", "source": src, "mutants": mutants });
    }
    fs::write(&out, report.to_string()).unwrap();
    let mut by_mutator = std::collections::BTreeMap::<&str, usize>::new();
    for (_, _, r) in &results {
        for m in &r.mutants {
            *by_mutator.entry(m.mutator_name).or_default() += 1;
        }
    }
    println!("{}", json!({ "files": results.len(), "failed": failures.len(), "mutants": total, "byMutator": by_mutator, "instrumentMs": ms }));
    if !failures.is_empty() {
        std::process::exit(1);
    }
}

fn collect(dir: &Path, files: &mut Vec<std::path::PathBuf>) {
    for p in fs::read_dir(dir).expect("mutate dir").filter_map(|e| e.ok().map(|e| e.path())) {
        let n = p.file_name().unwrap().to_string_lossy().to_string();
        if p.is_dir() {
            if n != "node_modules" && !p.is_symlink() {
                collect(&p, files);
            }
        } else if (n.ends_with(".ts") || n.ends_with(".js")) && !n.ends_with(".d.ts") && !n.contains(".spec.") && !n.contains(".test.") && !n.starts_with("index.") {
            files.push(p);
        }
    }
}
