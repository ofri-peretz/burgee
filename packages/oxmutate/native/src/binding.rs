//! The Node binding: one call instruments many files, in parallel across cores (rayon), and
//! returns plain objects. Errors are per file, so one unparsable file does not lose the rest.
use napi_derive::napi;
use rayon::prelude::*;

use crate::instrument::{instrument, IgnoreRule, Options};

#[napi(object)]
pub struct SourceFile {
    /// Repository-relative path; it is also the namespace of the file's stable mutant ids.
    pub path: String,
    pub source: String,
}

#[napi(object)]
pub struct InstrumentOptions {
    pub stryker_compat: Option<bool>,
    /// Stryker's `ignorers`, as data. See `IgnoreRule` for the glob dialect.
    pub ignore: Option<Vec<IgnoreCallRule>>,
}

/// `{ call: "console.*", reason?: "…" }`: no mutant inside a matching call (or a statement that is
/// that call) is placed; each is reported with `ignoredReason`.
#[napi(object)]
pub struct IgnoreCallRule {
    pub call: String,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct Location {
    pub line: u32,
    pub column: u32,
}

#[napi(object)]
pub struct MutantRecord {
    pub id: String,
    pub mutator_name: String,
    pub replacement: String,
    pub start: Location,
    pub end: Location,
    /// Set when an ignore rule covers the mutant (Stryker's `Ignored` status and its
    /// `statusReason`). The mutant has no switch in `code`; its id is the one it has unignored.
    pub ignored_reason: Option<String>,
}

#[napi(object)]
pub struct InstrumentedFile {
    pub path: String,
    /// Absent when the file has no mutants: it is left untouched.
    pub code: Option<String>,
    pub mutants: Vec<MutantRecord>,
    pub error: Option<String>,
}

#[napi]
pub fn instrument_files(files: Vec<SourceFile>, options: Option<InstrumentOptions>) -> Vec<InstrumentedFile> {
    let options = options.map_or_else(Options::default, |o| Options {
        stryker_compat: o.stryker_compat.unwrap_or(false),
        ignore: o.ignore.unwrap_or_default().into_iter().map(|r| IgnoreRule { call: r.call, reason: r.reason }).collect(),
    });
    files
        .into_par_iter()
        .map(|f| match instrument(&f.path, &f.source, &options) {
            Ok(r) => InstrumentedFile {
                path: f.path,
                code: r.code,
                mutants: r
                    .mutants
                    .into_iter()
                    .map(|m| MutantRecord {
                        id: m.id,
                        mutator_name: m.mutator_name.to_string(),
                        replacement: m.replacement,
                        start: Location { line: m.start.line, column: m.start.column },
                        end: Location { line: m.end.line, column: m.end.column },
                        ignored_reason: m.ignored,
                    })
                    .collect(),
                error: None,
            },
            Err(e) => InstrumentedFile { path: f.path, code: None, mutants: Vec::new(), error: Some(e) },
        })
        .collect()
}

/// The native core's version, so the JavaScript side can refuse a mismatched binary.
#[napi]
#[must_use]
pub fn native_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
