//! native-engine M0 — `burgee migrate`'s specifier rewrite, on oxc's parser.
//!
//! Not a package and never published. It answers one question for `spec.md`: does a Rust
//! engine on oxc beat the JavaScript `migrate` by the 2x D-20261020-native-engine-order asks
//! for, and does it produce the same bytes?
//!
//! It does the per-file half of `migrate` only: walk, read, the byte pre-filter, parse, and
//! the rewrite of a specifier in the positions `migrate.ts` reads (`import … from`, `import 'x'`,
//! `export … from`, `import()`, `require()`, `import x = require()`, `typeof import()`, and the
//! `vi.*` / `jest.*` / `require.resolve` calls). The refusal rules (deep imports, computed
//! specifiers, façade names, sibling state) are not ported: a file the JavaScript build refuses
//! or keeps is left out of the byte comparison and counted, never compared.
//!
//!   burgee-migrate-spike rewrite <mapping.tsv> <file>
//!       print the rewritten file to stdout (the original when nothing moves)
//!   burgee-migrate-spike bench <mapping.tsv> <dir> [--threads N] [--runs R] [--emit DIR]
//!       time the phases over a project, one JSON line; --emit writes each rewritten file
//!
//! `mapping.tsv` is `from<TAB>to` per line, exported from the built `dist/migrate.js` MAPPING
//! by `export-mapping.mjs`, so both builds read one table.

use std::collections::HashMap;
use std::fs;
use std::io::Write as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use memchr::memmem;
use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Argument, CallExpression, Expression, ExportAllDeclaration, ExportFromDeclaration, ImportDeclaration,
    ImportExpression, StringLiteral, TSExternalModuleReference, TSImportType,
};
use oxc_ast_visit::{walk, Visit};
use oxc_parser::Parser;
use oxc_span::SourceType;

/// `migrate.ts` SOURCE_EXTENSIONS and SKIP, verbatim.
const EXTENSIONS: [&str; 8] = ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"];
const SKIP: [&str; 10] = ["node_modules", ".git", "dist", "build", "coverage", ".turbo", ".next", ".output", ".cache", ".vercel"];

/// `migrate.ts` CALLS: receiver.method calls whose first argument is a module specifier.
const CALLS: [(&str, &str); 13] = [
    ("vi", "mock"),
    ("vi", "doMock"),
    ("vi", "unmock"),
    ("vi", "doUnmock"),
    ("vi", "importActual"),
    ("vi", "importMock"),
    ("jest", "mock"),
    ("jest", "doMock"),
    ("jest", "unmock"),
    ("jest", "unstable_mockModule"),
    ("jest", "requireActual"),
    ("jest", "requireMock"),
    ("require", "resolve"),
];

struct Table {
    map: HashMap<String, String>,
    /// The packages the keys name, as `memmem` finders: `mentionsAHost`'s NEEDLE_BYTES.
    needles: Vec<memmem::Finder<'static>>,
}

fn package_of(specifier: &str) -> String {
    let parts: Vec<&str> = specifier.split('/').collect();
    let n = if specifier.starts_with('@') { 2 } else { 1 };
    parts[..n.min(parts.len())].join("/")
}

fn load_table(path: &Path) -> Table {
    let text = fs::read_to_string(path).expect("mapping.tsv");
    let mut map = HashMap::new();
    let mut hosts: Vec<String> = Vec::new();
    for line in text.lines().filter(|l| !l.is_empty()) {
        let (from, to) = line.split_once('\t').expect("from<TAB>to");
        map.insert(from.to_string(), to.to_string());
        let host = package_of(from);
        if !hosts.contains(&host) {
            hosts.push(host);
        }
    }
    let needles = hosts.into_iter().map(|h| memmem::Finder::new(h.as_bytes()).into_owned()).collect();
    Table { map, needles }
}

/// The edits one file needs: (start, end, replacement) over the bytes between the quotes.
struct Sites<'t> {
    table: &'t Table,
    source: &'t str,
    edits: Vec<(usize, usize, &'t str)>,
}

impl<'t> Sites<'t> {
    fn literal(&mut self, lit: &StringLiteral) {
        let (start, end) = (lit.span.start as usize + 1, lit.span.end as usize - 1);
        // The raw text between the quotes, as `migrate.ts` compares it: an escaped specifier is not one.
        let raw = &self.source[start..end];
        if let Some(to) = self.table.map.get(raw) {
            self.edits.push((start, end, to.as_str()));
        }
    }
}

impl<'a, 't> Visit<'a> for Sites<'t> {
    fn visit_import_declaration(&mut self, it: &ImportDeclaration<'a>) {
        self.literal(&it.source);
        walk::walk_import_declaration(self, it);
    }
    fn visit_export_from_declaration(&mut self, it: &ExportFromDeclaration<'a>) {
        self.literal(&it.source);
        walk::walk_export_from_declaration(self, it);
    }
    fn visit_export_all_declaration(&mut self, it: &ExportAllDeclaration<'a>) {
        self.literal(&it.source);
        walk::walk_export_all_declaration(self, it);
    }
    fn visit_import_expression(&mut self, it: &ImportExpression<'a>) {
        if let Expression::StringLiteral(s) = &it.source {
            self.literal(s);
        }
        walk::walk_import_expression(self, it);
    }
    fn visit_ts_import_type(&mut self, it: &TSImportType<'a>) {
        self.literal(&it.source);
        walk::walk_ts_import_type(self, it);
    }
    fn visit_ts_external_module_reference(&mut self, it: &TSExternalModuleReference<'a>) {
        self.literal(&it.expression);
        walk::walk_ts_external_module_reference(self, it);
    }
    fn visit_call_expression(&mut self, it: &CallExpression<'a>) {
        let names_a_module = match &it.callee {
            Expression::Identifier(id) => id.name == "require",
            Expression::StaticMemberExpression(m) => match &m.object {
                Expression::Identifier(obj) => CALLS.iter().any(|(r, f)| obj.name == *r && m.property.name == *f),
                _ => false,
            },
            _ => false,
        };
        if names_a_module {
            if let Some(Argument::StringLiteral(s)) = it.arguments.first() {
                self.literal(s);
            }
        }
        walk::walk_call_expression(self, it);
    }
}

enum Outcome {
    /// No host named anywhere in the bytes: never decoded, never parsed.
    Filtered,
    Unchanged,
    Rewritten(String),
    /// oxc reported a syntax error; the JavaScript scan does not parse, so it would still read this file.
    ParseError,
}

fn mentions_a_host(bytes: &[u8], table: &Table) -> bool {
    table.needles.iter().any(|f| f.find(bytes).is_some())
}

fn rewrite(path: &Path, bytes: &[u8], table: &Table, allocator: &mut Allocator) -> Outcome {
    if !mentions_a_host(bytes, table) {
        return Outcome::Filtered;
    }
    let Ok(source) = std::str::from_utf8(bytes) else { return Outcome::ParseError };
    // JSX in `.js` is common (docusaurus has 16 such files); oxlint parses `.js` with JSX on, and so does this.
    let source_type = SourceType::from_path(path).unwrap_or_default();
    let source_type = if source_type.is_javascript() { source_type.with_jsx(true) } else { source_type };
    allocator.reset();
    let ret = Parser::new(allocator, source, source_type).parse();
    if ret.diagnostics.has_errors() {
        return Outcome::ParseError;
    }
    let mut sites = Sites { table, source, edits: Vec::new() };
    sites.visit_program(&ret.program);
    if sites.edits.is_empty() {
        return Outcome::Unchanged;
    }
    sites.edits.sort_by_key(|e| e.0);
    let mut out = String::with_capacity(source.len() + 64);
    let mut at = 0;
    for (start, end, to) in &sites.edits {
        out.push_str(&source[at..*start]);
        out.push_str(to);
        at = *end;
    }
    out.push_str(&source[at..]);
    Outcome::Rewritten(out)
}

/// `migrate.ts` sourceFiles: relative, slash-separated, SKIP directories pruned.
fn source_files(root: &Path, at: &Path, found: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(root.join(at)) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let rel = at.join(&*name);
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            if !SKIP.contains(&&*name) {
                source_files(root, &rel, found);
            }
        } else if let Some(ext) = Path::new(&*name).extension().and_then(|e| e.to_str()) {
            if EXTENSIONS.contains(&ext) {
                found.push(rel);
            }
        }
    }
}

fn ms(since: Instant) -> f64 {
    since.elapsed().as_secs_f64() * 1000.0
}

fn median(xs: &mut [f64]) -> f64 {
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    xs[xs.len() / 2]
}

fn bench(table: &Table, dir: &Path, threads: usize, runs: usize, emit: Option<&Path>) {
    let (mut walk_t, mut read_t, mut filter_t, mut parse_t, mut total_t) = (vec![], vec![], vec![], vec![], vec![]);
    let (mut files_n, mut bytes_n, mut admitted, mut rewritten, mut errors) = (0, 0, 0, 0, 0);
    for run in 0..runs {
        let started = Instant::now();
        let mut files = Vec::new();
        source_files(dir, Path::new(""), &mut files);
        walk_t.push(ms(started));
        files_n = files.len();
        let last = run + 1 == runs;
        if threads <= 1 {
            // Phased, as the JavaScript harness is: read all, filter all, parse what is left.
            let t = Instant::now();
            let bufs: Vec<Vec<u8>> = files.iter().map(|f| fs::read(dir.join(f)).unwrap_or_default()).collect();
            read_t.push(ms(t));
            bytes_n = bufs.iter().map(Vec::len).sum();
            let t = Instant::now();
            let keep: Vec<usize> = (0..bufs.len()).filter(|&i| mentions_a_host(&bufs[i], table)).collect();
            filter_t.push(ms(t));
            admitted = keep.len();
            let t = Instant::now();
            let mut allocator = Allocator::default();
            let (mut rw, mut er) = (0, 0);
            for &i in &keep {
                match rewrite(&files[i], &bufs[i], table, &mut allocator) {
                    Outcome::Rewritten(out) => {
                        rw += 1;
                        if last {
                            if let Some(e) = emit {
                                write_emit(e, &files[i], &out);
                            }
                        }
                    }
                    Outcome::ParseError => {
                        er += 1;
                        if last && std::env::var_os("SPIKE_LIST_ERRORS").is_some() {
                            eprintln!("parse error: {}", files[i].display());
                        }
                    }
                    _ => {}
                }
            }
            parse_t.push(ms(t));
            (rewritten, errors) = (rw, er);
        } else {
            // One pipeline per worker: read, filter, parse, rewrite, file by file.
            let next = AtomicUsize::new(0);
            let counts = Mutex::new((0usize, 0usize, 0usize, 0usize));
            std::thread::scope(|s| {
                for _ in 0..threads {
                    s.spawn(|| {
                        let mut allocator = Allocator::default();
                        let (mut b, mut a, mut rw, mut er) = (0, 0, 0, 0);
                        loop {
                            let i = next.fetch_add(1, Ordering::Relaxed);
                            let Some(f) = files.get(i) else { break };
                            let bytes = fs::read(dir.join(f)).unwrap_or_default();
                            b += bytes.len();
                            match rewrite(f, &bytes, table, &mut allocator) {
                                Outcome::Filtered => {}
                                Outcome::Unchanged => a += 1,
                                Outcome::Rewritten(out) => {
                                    a += 1;
                                    rw += 1;
                                    if last {
                                        if let Some(e) = emit {
                                            write_emit(e, f, &out);
                                        }
                                    }
                                }
                                Outcome::ParseError => {
                                    a += 1;
                                    er += 1;
                                }
                            }
                        }
                        let mut c = counts.lock().unwrap();
                        *c = (c.0 + b, c.1 + a, c.2 + rw, c.3 + er);
                    });
                }
            });
            (bytes_n, admitted, rewritten, errors) = counts.into_inner().unwrap();
        }
        total_t.push(ms(started));
    }
    let m = |v: &mut Vec<f64>| if v.is_empty() { -1.0 } else { median(v) };
    println!(
        "{{\"dir\":{:?},\"threads\":{},\"runs\":{},\"files\":{},\"bytes\":{},\"admitted\":{},\"rewritten\":{},\"parseErrors\":{},\"walk\":{:.2},\"read\":{:.2},\"prefilter\":{:.2},\"parseRewrite\":{:.2},\"total\":{:.2}}}",
        dir.display(),
        threads,
        runs,
        files_n,
        bytes_n,
        admitted,
        rewritten,
        errors,
        m(&mut walk_t),
        m(&mut read_t),
        m(&mut filter_t),
        m(&mut parse_t),
        m(&mut total_t)
    );
}

fn write_emit(root: &Path, rel: &Path, out: &str) {
    let path = root.join(rel);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, out).unwrap();
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let flag = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned();
    match args.get(1).map(String::as_str) {
        Some("rewrite") => {
            let table = load_table(Path::new(&args[2]));
            let path = Path::new(&args[3]);
            let bytes = fs::read(path).expect("file");
            let mut allocator = Allocator::default();
            let out = match rewrite(path, &bytes, &table, &mut allocator) {
                Outcome::Rewritten(s) => s.into_bytes(),
                Outcome::ParseError => {
                    eprintln!("parse error: {}", path.display());
                    std::process::exit(2);
                }
                _ => bytes,
            };
            std::io::stdout().write_all(&out).unwrap();
        }
        Some("bench") => {
            let table = load_table(Path::new(&args[2]));
            let threads = flag("--threads").map_or(1, |t| t.parse().unwrap());
            let runs = flag("--runs").map_or(5, |t| t.parse().unwrap());
            let emit = flag("--emit").map(PathBuf::from);
            bench(&table, Path::new(&args[3]), threads, runs, emit.as_deref());
        }
        _ => {
            eprintln!("usage: burgee-migrate-spike rewrite <mapping.tsv> <file> | bench <mapping.tsv> <dir> [--threads N] [--runs R] [--emit DIR]");
            std::process::exit(64);
        }
    }
}
