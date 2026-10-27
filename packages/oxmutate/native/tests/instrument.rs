//! Regression locks for the native instrumenter. Each test names the defect it would have caught.
use oxmutate_native::instrument::{instrument, IgnoreRule, Options};
use std::collections::HashSet;

fn mutants(src: &str) -> Vec<(String, String)> {
    instrument("t.ts", src, &Options::default())
        .unwrap()
        .mutants
        .into_iter()
        .map(|m| (m.mutator_name.to_string(), m.replacement))
        .collect()
}

fn has(src: &str, mutator: &str, replacement: &str) -> bool {
    mutants(src).iter().any(|(m, r)| m == mutator && r == replacement)
}

/// 2026-10-26, es-toolkit `chunkBy`: the whole `if` test and its first operand both mutate to
/// `false` from the same start; ids without the end position collided and armed both at once.
#[test]
fn nested_mutants_with_the_same_start_get_distinct_ids() {
    let out = instrument("t.ts", "function f(i: number, k: boolean) { if (i === 0 || k) { return 1; } return 2; }", &Options::default()).unwrap();
    let ids: HashSet<_> = out.mutants.iter().map(|m| m.id.clone()).collect();
    assert_eq!(ids.len(), out.mutants.len());
}

/// M1 finding (JS prototype): operator swaps built from the operands' spans dropped the
/// parentheses that belong to the parent: `(a ?? 0) + 1` became `a ?? 0) - 1`.
#[test]
fn operator_swaps_keep_parentheses() {
    assert!(has("const x = (a ?? 0) + 1;", "ArithmeticOperator", "(a ?? 0) - 1"));
    assert!(has("const y = Math.random() * (i + 1);", "ArithmeticOperator", "Math.random() / (i + 1)"));
}

#[test]
fn unary_and_method_removal_keep_their_operands_parentheses() {
    assert!(has("const z = !(a && b);", "BooleanLiteral", "(a && b)"));
    assert!(has("const s = (a || b).trim();", "MethodExpression", "(a || b)"));
}

/// Stryker 10.0.0 skips `as` casts and enums; oxmutate mutates them unless asked for parity.
#[test]
fn casts_are_mutated_by_default_and_skipped_in_stryker_compat() {
    let src = "const x = (a + 1) as number;";
    assert!(has(src, "ArithmeticOperator", "a - 1"));
    let compat = instrument("t.ts", src, &Options { stryker_compat: true, ..Options::default() }).unwrap();
    assert!(compat.mutants.is_empty());
}

#[test]
fn type_annotations_are_never_mutated() {
    assert!(mutants("type T = 'a' | 'b'; interface I { x: true }").is_empty());
}

/// Stryker's nameIfAnonymous: `const f = () => …` keeps `f.name` once wrapped.
#[test]
fn wrapped_anonymous_functions_keep_their_name() {
    let out = instrument("t.ts", "const f = () => 1 + 2;", &Options::default()).unwrap();
    let code = out.code.unwrap();
    assert!(code.contains("(() => { const f = () =>") && code.contains("; return f; })()"), "{code}");
}

/// Stryker's CallExpression filter: an expression statement is emptied only when it is the
/// subtree's sole mutant.
#[test]
fn call_statements_are_emptied_only_when_alone() {
    assert!(has("log(x);", "CallExpression", ";"));
    assert!(!has("log(x + 1);", "CallExpression", ";"));
}

#[test]
fn string_keys_imports_and_directives_are_not_mutated() {
    let m = mutants("import a from 'a'; const o = { 'k': 1 }; export * from 'b';");
    assert!(m.iter().all(|(mutator, _)| mutator != "StringLiteral"));
}

#[test]
fn function_bodies_are_block_statements() {
    assert!(has("function f() { return 1; }", "BlockStatement", "{}"));
    assert!(!has("function f() {}", "BlockStatement", "{}"));
}

#[test]
fn optional_chains_lose_their_question_mark() {
    assert!(has("const v = a?.b.c;", "OptionalChaining", "a.b"));
    assert!(has("const w = f?.(1);", "OptionalChaining", "f(1)"));
}

#[test]
fn columns_count_utf16_after_non_ascii_text() {
    let out = instrument("t.ts", "// 한국어 🎉\nconst a = 1 + 2;", &Options::default()).unwrap();
    let m = out.mutants.iter().find(|m| m.mutator_name == "ArithmeticOperator").unwrap();
    assert_eq!((m.start.line, m.start.column), (2, 11));
}

/// burgee/paratext, 2026-10-26: `??` mixed with `&&` without parentheses is a SyntaxError, and
/// the swap of the outer `??` in `a ?? b ?? ''` produced exactly that.
#[test]
fn logical_swaps_keep_coalesce_unmixed() {
    let out = instrument("t.ts", "const x = a ?? b ?? '';", &Options::default()).unwrap();
    assert!(out.mutants.iter().any(|m| m.mutator_name == "LogicalOperator" && m.replacement == "(a ?? b) && ''"));
    let code = out.code.unwrap();
    assert!(!code.contains("a ?? b && ''"), "{code}");
}

/// burgee/paratext, 2026-10-26: in oxc 0.155 `export … from 'x'` is an ExportFromDeclaration, and
/// its specifier was wrapped in a mutant switch.
#[test]
fn module_specifiers_are_never_mutated_or_wrapped() {
    for src in ["export { default, a } from './a.js';", "export * from './b.js';", "export * as c from './c.js';", "import d from './d.js' with { type: 'json' };"] {
        let out = instrument("t.ts", src, &Options::default()).unwrap();
        assert!(out.mutants.is_empty(), "{src}: {:?}", out.mutants.iter().map(|m| (&m.mutator_name, &m.replacement)).collect::<Vec<_>>());
    }
}

/// 2026-10-27, controlroom `tabs.ts`: a `case 'x':` whose test is mutated (StringLiteral) inside a
/// case whose body is mutated too. The body was sliced from the rendered case by a source offset,
/// which the instrumented test had moved: the output cut a mutant id in half and did not parse.
#[test]
fn a_mutated_case_test_keeps_its_case_body_intact() {
    let src = "export function f(a: string): number { switch (a) { case 'x': return 1; case 'y': { return 2; } } return 0; }";
    let out = instrument("t.ts", src, &Options::default()).expect("instrumented code parses");
    assert!(out.mutants.iter().any(|m| m.mutator_name == "StringLiteral" && m.replacement == "\"\""));
}

fn regex(src: &str) -> Vec<String> {
    mutants(src).into_iter().filter(|(m, _)| m == "Regex").map(|(_, r)| r).collect()
}

/// Stryker's 17th mutator: a regex literal's Regex mutants are weapon-regex 2.0.6's level-1
/// patterns, in its order (expected strings printed by weapon-regex itself).
#[test]
fn regex_literal_mutants_equal_weapon_regex() {
    assert_eq!(regex("const r = /^abc(d+|[xyz])$/;"), ["/abc(d+|[xyz])$/", "/^abc(d+|[xyz])/", "/^abc(d|[xyz])$/", "/^abc(d+|[^xyz])$/"]);
    assert_eq!(regex(r"const r = /(?<=a)\d{2,}?(?!b)/;"), [r"/(?<!a)\d{2,}?(?!b)/", r"/(?<=a)\d(?!b)/", r"/(?<=a)\D{2,}?(?!b)/", r"/(?<=a)\d{2,}?(?=b)/"]);
    assert_eq!(regex(r"const r = /^\s*|\s*$/;"), [r"/\s*|\s*$/", r"/^\s|\s*$/", r"/^\S*|\s*$/", r"/^\s*|\s*/", r"/^\s*|\s$/", r"/^\s*|\S*$/"]);
}

/// The replacement keeps the literal's flags as written, and the `new RegExp('…', '…')` string
/// argument is mutated with its flags (here `u`) and printed the way Babel prints a string.
#[test]
fn regex_mutants_keep_their_flags() {
    assert_eq!(regex(r"const r = /^[^\W_]+$/giu;"), [r"/[^\W_]+$/giu", r"/^[^\W_]+/giu", r"/^[^\W_]$/giu", r"/^[\W_]+$/giu", r"/^[^\w_]+$/giu"]);
    assert_eq!(regex(r"const r = new RegExp('^\\d+$', 'u');"), [r#""\\d+$""#, r#""^\\d+""#, r#""^\\d$""#, r#""^\\D+$""#]);
    assert!(regex(r"const r = RegExp('^\\d+$');").is_empty(), "a call without `new` is not an obvious regex string");
}

/// A pattern oxc's regex parser rejects (possessive quantifiers, which weapon-regex accepts) gets
/// no Regex mutants and the file still instruments.
#[test]
fn an_unparsable_pattern_has_no_regex_mutants() {
    let out = instrument("t.ts", "const a = /ab++/; const b = new RegExp('a{2}{3}'); const c = 1 + 2;", &Options::default()).expect("instruments");
    assert!(out.mutants.iter().all(|m| m.mutator_name != "Regex"));
    assert!(out.mutants.iter().any(|m| m.mutator_name == "ArithmeticOperator"));
}

/// weapon-regex reads `\v` as a predefined class and negates it to `\V`, an early SyntaxError under
/// `u` that would fail the whole file; that one literal mutant is dropped, the string one is kept.
#[test]
fn regex_literal_mutants_that_do_not_compile_are_dropped() {
    assert_eq!(regex(r"const r = /\v/;"), [r"/\V/"]);
    assert!(regex(r"const r = /\v/u;").is_empty());
    assert_eq!(regex(r"const r = new RegExp('\\v', 'u');"), [r#""\\V""#]);
}

/// linegauge check.ts, 2026-10-27: an optional member or call on a parenthesized object kept the
/// object's `)` but lost its `(` (the replacement was built from the object's span, the node's
/// span starts at the paren), so the instrumented file did not parse.
#[test]
fn optional_chains_on_parenthesized_objects_keep_both_parens() {
    let cases = [
        ("const f = (p: unknown) => (p as { w?: number } | null)?.w;", "(p as { w?: number } | null).w"),
        ("const g = (a as B)?.c;", "(a as B).c"),
        ("const h = (a satisfies B)?.c;", "(a satisfies B).c"),
        ("const i = (<B>a)?.c;", "(<B>a).c"),
        ("const j = (a || b)?.c;", "(a || b).c"),
        ("const k = (a as B)?.[c];", "(a as B)[c]"),
        ("const l = (a as F)?.(1);", "(a as F)(1)"),
    ];
    for (src, replacement) in cases {
        let out = instrument("t.ts", src, &Options::default()).unwrap_or_else(|e| panic!("{src}: {e}"));
        assert!(out.mutants.iter().any(|m| m.mutator_name == "OptionalChaining" && m.replacement == replacement), "{src}: {:?}", out.mutants.iter().map(|m| (&m.mutator_name, &m.replacement)).collect::<Vec<_>>());
    }
}

/// 2026-10-27, every burgee package's `cli.ts`: the runtime header went above `#!/usr/bin/env node`,
/// and a hashbang anywhere but the first line does not parse.
#[test]
fn a_hashbang_stays_the_first_line() {
    let out = instrument("cli.ts", "#!/usr/bin/env node\nconst a = 1 + 2;\n", &Options::default()).expect("instrumented code parses");
    assert!(out.code.unwrap().starts_with("#!/usr/bin/env node\n"));
}

/// 2026-10-27, controlroom `ink/components.ts` and burgee `yargs/v17-yargs.ts`: a string key in a
/// destructuring pattern (`{ 'aria-label': x }`) and a string module export name
/// (`export { a as 'module.exports' }`) were wrapped in a mutant switch, which does not parse.
/// Stryker leaves the key alone (ObjectProperty key); an export name has no expression to mutate.
#[test]
fn destructuring_keys_and_module_export_names_are_not_mutated() {
    for src in ["function f({ 'aria-label': a }: { 'aria-label'?: string }) { return a; }", "const a = 1; export { a as 'module.exports' };", "export { 'a' as b } from './c.js';"] {
        let out = instrument("t.ts", src, &Options::default()).unwrap_or_else(|e| panic!("{src}: {e}"));
        assert!(out.mutants.iter().all(|m| m.replacement != "\"\""), "{src}: {:?}", out.mutants.iter().map(|m| (&m.mutator_name, &m.replacement)).collect::<Vec<_>>());
    }
}

// ── Ignore rules (Stryker's `ignorers`, as data) ────────────────────────────────────────────────

fn ignoring(rules: &[(&str, Option<&str>)]) -> Options {
    Options { ignore: rules.iter().map(|(call, reason)| IgnoreRule { call: (*call).into(), reason: reason.map(Into::into) }).collect(), ..Options::default() }
}

/// An ignored call's mutants are reported with Stryker's `Ignored` reason, not dropped, and get no
/// switch: the call's text is unchanged in the instrumented code.
#[test]
fn an_ignored_call_reports_its_mutants_and_places_none() {
    let src = "export function f(y: number) { console.log('x' + y); return y - 1; }";
    let out = instrument("t.ts", src, &ignoring(&[("console.*", None)])).unwrap();
    let inside: Vec<_> = out.mutants.iter().filter(|m| matches!(m.mutator_name, "StringLiteral" | "ArithmeticOperator" | "CallExpression") && m.start.column < 52).collect();
    assert!(inside.iter().any(|m| m.mutator_name == "StringLiteral"), "{:?}", out.mutants);
    assert!(inside.iter().all(|m| m.ignored.as_deref() == Some("ignored by rule call: console.*")), "{inside:?}");
    let code = out.code.expect("the return statement's mutants are still placed");
    for m in &inside {
        assert!(!code.contains(&format!("oxmAct(\"{}\")", m.id)), "{} is placed: {code}", m.id);
        assert!(!code.contains(&format!("\"{}\"", m.id)), "{} is covered: {code}", m.id);
    }
    assert!(code.contains("console.log('x' + y);"), "{code}");
    // The arithmetic mutant outside the call stays live.
    let live = out.mutants.iter().find(|m| m.replacement == "y + 1").expect("y - 1 mutant");
    assert!(live.ignored.is_none() && code.contains(&format!("oxmAct(\"{}\")", live.id)));
    // A rule's own reason is reported as written.
    let out = instrument("t.ts", src, &ignoring(&[("console.log", Some("log text is not behaviour"))])).unwrap();
    assert!(out.mutants.iter().any(|m| m.mutator_name == "StringLiteral" && m.ignored.as_deref() == Some("log text is not behaviour")));
}

#[test]
fn a_call_the_rule_does_not_match_is_unaffected() {
    let src = "logger.log('a'); myconsole.log('b'); console.log.bind(console)('c'); console.warn('d');";
    let out = instrument("t.ts", src, &ignoring(&[("console.*", None)])).unwrap();
    let reason = |text: &str| out.mutants.iter().find(|m| m.mutator_name == "StringLiteral" && src[..src.find(text).unwrap()].chars().count() as u32 + 1 == m.start.column).unwrap().ignored.clone();
    assert_eq!(reason("'a'"), None);
    assert_eq!(reason("'b'"), None);
    assert_eq!(reason("'c'"), None, "`*` is one segment: console.log.bind is not console.*");
    assert!(reason("'d'").is_some(), "the positive control: console.warn matches");
}

#[test]
fn ignoring_a_call_keeps_every_mutant_id() {
    let src = "export function f(a: number[], y: number) { if (y > 0) { logger?.debug(`n=${y}`, a.filter((v) => v > y)); } return a.length + y; }";
    let plain = instrument("t.ts", src, &Options::default()).unwrap();
    let ruled = instrument("t.ts", src, &ignoring(&[("logger.debug", None)])).unwrap();
    let ids = |o: &oxmutate_native::instrument::Instrumented| o.mutants.iter().filter(|m| m.mutator_name != "CallExpression").map(|m| m.id.clone()).collect::<Vec<_>>();
    assert_eq!(ids(&plain), ids(&ruled));
    assert!(ruled.mutants.iter().any(|m| m.ignored.is_some()), "the rule matched `logger?.debug`");
    assert!(plain.mutants.iter().all(|p| ruled.mutants.iter().any(|m| m.id == p.id)), "a rule never removes a mutant");
    for m in &ruled.mutants {
        if let Some(p) = plain.mutants.iter().find(|p| p.id == m.id) {
            assert_eq!((p.mutator_name, &p.replacement, &p.start, &p.end), (m.mutator_name, &m.replacement, &m.start, &m.end));
        }
    }
}

/// Stryker's ignorer covers the node's whole subtree: a function passed to an ignored call is
/// ignored too, however deep.
#[test]
fn a_function_inside_an_ignored_call_is_ignored() {
    let src = "export function f(xs: number[]) { this.log.debug(() => xs.map(function (x) { return x * 2; })); return xs; }";
    let out = instrument("t.ts", src, &ignoring(&[("**.debug", None)])).unwrap();
    let inner: Vec<_> = out.mutants.iter().filter(|m| matches!(m.mutator_name, "ArrowFunction" | "ArithmeticOperator") || (m.mutator_name == "BlockStatement" && m.start.column > 40)).collect();
    assert_eq!(inner.len(), 3, "{:?}", out.mutants);
    assert!(inner.iter().all(|m| m.ignored.is_some()), "{inner:?}");
    let outer = out.mutants.iter().find(|m| m.mutator_name == "BlockStatement" && m.start.column < 40).unwrap();
    assert!(outer.ignored.is_none());
}
