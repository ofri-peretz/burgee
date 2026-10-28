//! `oxmutate-regex < corpus.json`
//!
//! Reads a JSON array of `{ "pattern": string, "flags": string | null }` and prints, per entry, the
//! Regex mutator's replacement patterns (`regex::regex_mutants`). The Rust half of
//! `scripts/regex-parity.mjs`, which diffs it against weapon-regex under Stryker's settings.
use oxmutate_native::regex::regex_mutants;
use std::io::Read;

#[derive(serde::Deserialize)]
struct Entry {
    pattern: String,
    flags: Option<String>,
}

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("stdin");
    let corpus: Vec<Entry> = serde_json::from_str(&input).expect("a JSON array of { pattern, flags }");
    let out: Vec<Vec<String>> = corpus.iter().map(|e| regex_mutants(&e.pattern, e.flags.as_deref())).collect();
    println!("{}", serde_json::to_string(&out).unwrap());
}
