//! Regression locks for the native instrumenter. Each test names the defect it would have caught.
use oxmutate_native::instrument::{instrument, Options};
use std::collections::HashSet;

fn mutants(src: &str) -> Vec<(String, String)> {
    instrument("t.ts", src, Options::default())
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
    let out = instrument("t.ts", "function f(i: number, k: boolean) { if (i === 0 || k) { return 1; } return 2; }", Options::default()).unwrap();
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
    let compat = instrument("t.ts", src, Options { stryker_compat: true }).unwrap();
    assert!(compat.mutants.is_empty());
}

#[test]
fn type_annotations_are_never_mutated() {
    assert!(mutants("type T = 'a' | 'b'; interface I { x: true }").is_empty());
}

/// Stryker's nameIfAnonymous: `const f = () => …` keeps `f.name` once wrapped.
#[test]
fn wrapped_anonymous_functions_keep_their_name() {
    let out = instrument("t.ts", "const f = () => 1 + 2;", Options::default()).unwrap();
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
    let out = instrument("t.ts", "// 한국어 🎉\nconst a = 1 + 2;", Options::default()).unwrap();
    let m = out.mutants.iter().find(|m| m.mutator_name == "ArithmeticOperator").unwrap();
    assert_eq!((m.start.line, m.start.column), (2, 11));
}

/// burgee/paratext, 2026-10-26: `??` mixed with `&&` without parentheses is a SyntaxError, and
/// the swap of the outer `??` in `a ?? b ?? ''` produced exactly that.
#[test]
fn logical_swaps_keep_coalesce_unmixed() {
    let out = instrument("t.ts", "const x = a ?? b ?? '';", Options::default()).unwrap();
    assert!(out.mutants.iter().any(|m| m.mutator_name == "LogicalOperator" && m.replacement == "(a ?? b) && ''"));
    let code = out.code.unwrap();
    assert!(!code.contains("a ?? b && ''"), "{code}");
}

/// burgee/paratext, 2026-10-26: in oxc 0.155 `export … from 'x'` is an ExportFromDeclaration, and
/// its specifier was wrapped in a mutant switch.
#[test]
fn module_specifiers_are_never_mutated_or_wrapped() {
    for src in ["export { default, a } from './a.js';", "export * from './b.js';", "export * as c from './c.js';", "import d from './d.js' with { type: 'json' };"] {
        let out = instrument("t.ts", src, Options::default()).unwrap();
        assert!(out.mutants.is_empty(), "{src}: {:?}", out.mutants.iter().map(|m| (&m.mutator_name, &m.replacement)).collect::<Vec<_>>());
    }
}
