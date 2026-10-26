//! `oxmutate-instrument --root <dir> --mutate <dir relative to root> --out <mutants.json> [--stryker-compat]`
//!
//! Instruments every non-spec, non-test, non-index `.ts`/`.js` file under `<root>/<mutate>` in
//! place, in parallel, and writes the mutant list in the Stryker report shape. The parity harness
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
    let options = Options { stryker_compat: env::args().any(|a| a == "--stryker-compat") };
    let dir = Path::new(&root).join(&mutate);
    let mut files: Vec<_> = fs::read_dir(&dir)
        .expect("mutate dir")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let n = p.file_name().unwrap().to_string_lossy();
            (n.ends_with(".ts") || n.ends_with(".js")) && !n.contains(".spec.") && !n.contains(".test.") && !n.starts_with("index.")
        })
        .collect();
    files.sort();
    let t0 = Instant::now();
    let results: Vec<_> = files
        .par_iter()
        .map(|p| {
            let rel = p.strip_prefix(&root).unwrap().to_string_lossy().replace('\\', "/");
            let src = fs::read_to_string(p).unwrap();
            let r = instrument(&rel, &src, options).unwrap_or_else(|e| panic!("{e}"));
            if let Some(code) = &r.code {
                fs::write(p, code).unwrap();
            }
            (rel, src, r)
        })
        .collect();
    let ms = t0.elapsed().as_secs_f64() * 1000.0;
    let mut report = json!({ "schemaVersion": "1", "thresholds": { "high": 80, "low": 60 }, "files": {} });
    let mut total = 0;
    for (rel, src, r) in &results {
        total += r.mutants.len();
        let mutants: Vec<_> = r.mutants.iter().map(|m| json!({
            "id": m.id, "mutatorName": m.mutator_name, "replacement": m.replacement, "status": "Pending",
            "location": { "start": { "line": m.start.line, "column": m.start.column }, "end": { "line": m.end.line, "column": m.end.column } }
        })).collect();
        report["files"][rel] = json!({ "language": "typescript", "source": src, "mutants": mutants });
    }
    fs::write(&out, report.to_string()).unwrap();
    println!("{}", json!({ "files": results.len(), "mutants": total, "instrumentMs": ms }));
}
