#!/usr/bin/env node
// Regex mutator parity: weapon-regex 2.0.6 under Stryker 10.0.0's settings vs the Rust port.
//
//   node packages/oxmutate/native/scripts/regex-parity.mjs [--bin <oxmutate-regex>] [--corpus-only] [src dirs…]
//
// Source dirs default to packages/*/src.
//
// The corpus is every regex literal and `new RegExp('…', '…')` string argument that Babel (Stryker's
// parser) finds in the given source trees, plus the examples in weapon-regex's README. Each pattern
// is mutated by weapon-regex exactly as Stryker's regex-mutator.js calls it (mutationLevels [1], JS
// flavor, flags passed through, a parse failure yields nothing) and by `oxmutate-regex`, and the
// ordered replacement lists are compared. Exits non-zero on any difference.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const require = createRequire(join(repo, 'package.json'));
const babel = require('@babel/parser');
const weaponRegex = await import(join(repo, 'node_modules/weapon-regex/main.js'));

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const [v] = args.splice(i, 2).slice(1);
  return v;
};
const bin = flag('--bin') ?? join(here, '../target/release/oxmutate-regex');
const corpusOnly = args.includes('--corpus-only') && args.splice(args.indexOf('--corpus-only'), 1);
const roots = args.length
  ? args
  : readdirSync(join(repo, 'packages')).map((p) => join(repo, 'packages', p, 'src')).filter((p) => existsSync(p));

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'target' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(name) && !name.endsWith('.d.ts')) yield p;
  }
}

// Babel walk: the two node shapes Stryker's regex mutator accepts.
function collect(node, out, source) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'RegExpLiteral') out.push({ pattern: node.pattern, flags: node.flags, source });
  if (
    node.type === 'NewExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'RegExp' &&
    node.arguments[0]?.type === 'StringLiteral'
  ) {
    const f = node.arguments[1];
    out.push({ pattern: node.arguments[0].value, flags: f?.type === 'StringLiteral' ? f.value : undefined, source });
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach((c) => collect(c, out, source));
    else if (v && typeof v === 'object') collect(v, out, source);
  }
}

const corpus = [];
for (const root of roots) {
  for (const file of files(root)) {
    let ast;
    try {
      ast = babel.parse(readFileSync(file, 'utf8'), {
        sourceType: 'module',
        plugins: [['typescript', {}], 'jsx', 'decorators'].filter((p) => !(file.endsWith('.ts') && p === 'jsx')),
        errorRecovery: true,
      });
    } catch {
      continue;
    }
    collect(ast.program, corpus, file.slice(repo.length + 1));
  }
}
// weapon-regex README examples (each mutator's "Original" column, and the getting-started pattern).
const readme = readFileSync(join(repo, 'node_modules/weapon-regex/README.md'), 'utf8');
corpus.push({ pattern: '^abc(d+|[xyz])$', flags: undefined, source: 'weapon-regex README' });
for (const m of readme.matchAll(/^\| `([^`]+)`\s+\| `[^`]*`\s+\|$/gm)) corpus.push({ pattern: m[1], flags: undefined, source: 'weapon-regex README' });
for (const p of ['\\p{Alpha}', '\\P{Alpha}']) corpus.push({ pattern: p, flags: 'u', source: 'weapon-regex README' });
// Shapes where weapon-regex's tree differs from oxc's (lone anchors as `Or` / group children, `\v`,
// empty groups it cannot parse, modifiers, flags), so the port is checked on them even when the
// source trees hold none.
const edge = [
  ['a()'], ['(?:)'], ['(|a)'], ['a|'], ['[]'], ['[^]'], ['(?=)'], ['^'], ['$'], ['^|a'], ['a|^|b'], ['a|$'], ['(^)'], ['(?:$)'],
  ['(?=^)'], ['(?<!$)x'], ['^$'], ['^a$|^b$'], ['^|^'], ['\\v'], ['\\v', 'u'], ['[\\d\\v]'], ['\\p{L}', 'u'], ['\\p{L}'],
  ['[\\p{L}\\P{N}]', 'u'], ['\\p{Script=Latin}+', 'u'], ['a{2}?'], ['(?i:a)'], ['(?-i:a)b'], ['\\A', 'u'], ['😀+'], ['😀+', 'u'],
  ['x{,5}'], ['a{'], ['(?<n>^a)\\k<n>'], ['\\cJ'], ['(?<=a)b(?<!c)'], ['(?!a)+'], ['(a)\\1'], ['[a-z]+'], ['\\/'],
  ['\\-'], ['\\-', 'u'], ['a\nb$'], ['\\b\\B^$'], ['(?:a|^)+?'], ['[^\\s\\S]*', 'gim'], ['\\W{2,}', 'giu'], ['((a)|b)*$', 'dy'],
  ['[\\w\\-]+@[\\w.\\-]+', 'v'], ['[[a-z]--[aeiou]]', 'v'], ['[\\q{abc|d}x]', 'v'], ['^\\u{1F600}$', 'u'], ['\\x41\\u0042\\0\\t', 's'],
];
for (const [pattern, flags] of edge) corpus.push({ pattern, flags, source: 'edge cases' });

// Dedupe on (pattern, flags).
const seen = new Set();
const unique = corpus.filter((c) => {
  const k = JSON.stringify([c.pattern, c.flags ?? null]);
  return !seen.has(k) && seen.add(k);
});
if (corpusOnly) {
  console.log(JSON.stringify(unique, null, 1));
  process.exit(0);
}

// Stryker 10.0.0 regex-mutator.js `mutatePattern`.
function stryker(pattern, flags) {
  if (!pattern.length) return { mutants: [] };
  try {
    return { mutants: weaponRegex.mutate(pattern, flags, { mutationLevels: [1] }).map((m) => m.pattern) };
  } catch (e) {
    return { mutants: [], error: String(e.message ?? e).split('\n')[0] };
  }
}

const input = JSON.stringify(unique.map(({ pattern, flags }) => ({ pattern, flags: flags ?? null })));
const rust = JSON.parse(execFileSync(bin, { input, maxBuffer: 1 << 28 }).toString());

let same = 0;
let sameSet = 0;
const diffs = [];
unique.forEach((c, i) => {
  const w = stryker(c.pattern, c.flags);
  const r = rust[i];
  if (JSON.stringify(w.mutants) === JSON.stringify(r)) {
    same++;
    sameSet++;
    return;
  }
  const ws = [...w.mutants].sort();
  const rs = [...r].sort();
  if (JSON.stringify(ws) === JSON.stringify(rs)) sameSet++;
  diffs.push({
    pattern: c.pattern,
    flags: c.flags,
    source: c.source,
    weaponError: w.error,
    onlyWeapon: w.mutants.filter((m) => !r.includes(m)),
    onlyRust: r.filter((m) => !w.mutants.includes(m)),
    orderOnly: JSON.stringify(ws) === JSON.stringify(rs),
  });
});
const totalMutants = unique.reduce((n, c) => n + stryker(c.pattern, c.flags).mutants.length, 0);
console.log(JSON.stringify({ patterns: unique.length, weaponMutants: totalMutants, identicalOrdered: same, identicalSets: sameSet, differences: diffs }, null, 2));
process.exit(diffs.length ? 1 : 0);
