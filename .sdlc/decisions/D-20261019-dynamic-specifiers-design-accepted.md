---
id: D-20261019-dynamic-specifiers-design-accepted
subject: 'migrate-dynamic-specifiers: is the Stage 2 design accepted for Build?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-19'
date: '2026-10-19'
superseded_by: —
---

**Accepted. [`migrate-dynamic-specifiers/spec.md`](../intents/migrate-dynamic-specifiers/spec.md),
as re-grounded on `main` at `1dcf064a03`, is the design Build implements, and the intent moves
`draft → approved`.** Accepted by the coordinator under the owner's delegation
(burgee-owner-delegates-tradeoffs): the owner delegated Design→Build accepts on 2026-10-12, and the
agent that builds the change does not approve it.

**The design.** `burgee migrate` stops refusing a file for a computed specifier of three shapes,
read from tokens with no data flow:

- R1, `cwd-path`: `path.join(` or `path.resolve(`, from `process.cwd()` or `__dirname`, then quoted
  literals only (madge's `require(path.join(process.cwd(), 'package.json'))`);
- R2, `argv-member`: exactly `argv.x`, `args.x`, `options.x`, `opts.x` or `flags.x`
  (postcss-cli's `import(argv.parser)`);
- R3, `argv-element`: a name bound as the first parameter of a callback passed to
  `argv.x.map|forEach|flatMap|filter(` (postcss-cli's `argv.use.map(async (plugin) => import(plugin))`).

R4 is the guard. Take any string, template or regular expression outside a specifier, in a file with
a computed specifier. If it names an incumbent the run moves:

- every computed specifier in that file is refused;
- the file holds that incumbent as well as the ones it imports, so it moves in no file;
- the file is refused even when it imports none.

R5 keeps every other computed specifier refused, and closes `import(str)`, which `main` reads as a
literal. R6 reports the passed sites as `dynamic` in `--json` and in a text section. They are never a
refusal, never a hold and never the exit code. A Quint model, `dynamic.qnt`, checks that no
incumbent a computed name could load is moved, together with U12-4.

**Alternatives the design rejects:**

- an `--allow-dynamic <file>` flag (the intent rejected it);
- data flow, which is an AST and still cannot see argv values (D-050);
- refusing the file but holding only what it imports, which was the staged spec's R4: it moves the
  incumbent the string names in every other file, and the model's `stepImportsOnly` is its
  counterexample;
- holding only the incumbent a literal names, without refusing the file (data flow again);
- guarding on incumbents the run does not move;
- reading quoted strings only, which lets `` `${dir}/chalk` `` pass;
- an 8-token window for R3, which binds `function name`'s name;
- brace-depth scoping for R3's bindings;
- bare `join(` / `resolve(` without `path.`;
- no Quint model.

**Cost accepted.**

- A file that names a moved incumbent in a string beside a computed specifier is now refused and
  holds it. A run `main` called `complete` can become `partial`, with exit 1. That run had left two
  copies of the incumbent.
- A name built in another file is not seen. Out of scope says so.
- It ships as a `minor` for `burgee`, held by the release window.
