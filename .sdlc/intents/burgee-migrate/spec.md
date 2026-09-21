# Design — `burgee migrate`

## Requirements

> Requirement ids here are `A…` for *adoption*. `M1`–`M6` are already burgee's own floor ids
> — `run-evals` reads an `M7` in an intent as a citation of a floor the umbrella does not
> define, and it caught exactly that on the first draft of this file. `M1`–`M6` would have
> been worse: they resolve, silently, to somebody else's requirements.

- **A1** `detect(dir)` returns which hosts a project uses, from two independent sources:
  `package.json` dependencies (`commander`, `yargs`) and the module specifiers actually
  imported in source. They can disagree — a dependency that is declared and unused, or used
  and undeclared — and both halves are reported, because the second is the one that decides
  whether a rewrite is complete.
- **A2** `rewrite(source)` maps a module specifier and returns the new source plus what
  changed. The whole mapping is data:
  | From | To |
  | :--- | :--- |
  | `commander` | `burgee/commander` |
  | `yargs` | `burgee/yargs` |
  | `yargs/yargs` | `burgee/yargs` |
  | `yargs/helpers` | `burgee/yargs/helpers` |
- **A3** Both module systems: `import … from 'x'`, `import 'x'`, `export … from 'x'`,
  `await import('x')`, `require('x')`. A specifier inside a string that is not one of those
  positions is not a specifier and is left alone.
- **A4** **Refusals are named, never guessed at.** A deep import (`commander/lib/command.js`,
  `yargs/build/…`) reaches internals the façade does not promise, so the file is left
  untouched and the report names the file, the line and the specifier. Same for a dynamic
  specifier that is not a literal.
- **A5** No partial file. A file is written only when every host specifier in it mapped; one
  refusal leaves the whole file as it was, so the tree is never half-migrated.
- **A6** Refuses on a dirty git tree unless `--force`, and writes nothing under `--dry-run`.
  The review surface is `git diff`, which the maintainer already knows how to read.
- **A7** The report carries three numbers, each read rather than typed: dependencies before
  and after (from `package.json`), the graded pass rate for each host touched (from
  `compat-oracle`'s baseline), and the file and import counts.
- **A8** `--json` emits the whole report as data — `{ files, imports, mapped, refused,
  dependencies, graded }` — and the exit code is `ExitCode.DataError` when anything was
  refused, so an agent branches on the code and reads the reason from `refused`.
- **A9** It is a burgee command. `--help`, `--help --json`, `--schema`, the exit-code
  contract and `fix:` on failure are the framework's, not this feature's.
- **A10** **It is fast enough that nobody waits.** One pass over each file's text, no parse,
  no AST, no second read — and a measured budget rather than an adjective: **a 1,000-file
  project in under 500 ms, and any single file in under 1 ms**, wall-clock, on the CI runner.
  The budget is a gate in `migrate.bench.test.ts`, not a sentence in a README. A codemod a
  person watches is a codemod they run once and never again, and the whole purpose of this
  command is that trying burgee costs four minutes rather than an afternoon.

## Design

**Specifiers, not syntax trees.** The rewrite is over module specifiers, so it does not need
a parser and therefore does not need a dependency (rule 2). The scan walks source text for
the five specifier positions in A3 and rewrites the quoted string in place; everything else
in the file, including formatting and comments, is untouched by construction. This is the
whole reason the feature can exist with zero dependencies, and it is also why A4 exists: a
position this scan cannot classify is refused rather than guessed.

**Why one pass and no AST (A10).** Reading a file, parsing it to a syntax tree, editing the
tree and printing it back costs roughly two orders of magnitude more than scanning the text
once for five known positions — and it would also cost a dependency, which rule 2 forbids.
The two constraints agree, which is rare and worth saying: the fast choice and the
zero-dependency choice are the same choice here. Files are read and rewritten concurrently,
bounded by the open-file limit rather than by a thread pool.

**Why refusal beats best-effort.** A codemod that half-works is worse than one that declines,
because the failure surfaces later as a runtime error in someone else's CLI, and the first
thing they will blame is burgee. A5 makes the unit of success the file, so the worst case is
"nothing changed here, and here is why".

**Where the numbers come from.** A7's compat figures are the same baseline the compat page
renders, read at runtime. A number typed into a report template is a number that goes stale
silently — this repository has published four of those and caught them all late.

## Verification

`examples/demo-cli-commander` already holds the same program written twice: once against
`commander`, once against `burgee/commander`. That pair is not a fixture written for this
feature — it predates it — which is what makes it a real gate.

1. **`migrate` over the commander variant produces the burgee variant's imports, byte for
   byte.** If the codemod and the hand-written drop-in disagree, one of them is wrong.
2. The same for `examples/demo-cli-yargs`.
3. The migrated variant's own tests pass — the codemod is graded by the program still
   working, not by the diff looking right.
4. A deep import is refused with file and line; the file on disk is unchanged afterwards.
5. A file mixing a mappable and a refused specifier is left entirely unchanged (A5).
6. `--json` round-trips: every count in the human report is present in the document.
7. **A10 is measured, not asserted**: a generated 1,000-file tree migrates inside 500 ms and
   the slowest single file inside 1 ms, failing on the number rather than on a feeling.

**Proven red before green** — each of the six runs against a mutation of the implementation
before the implementation exists, and the mutations are named in the test file: mapping
`yargs/helpers` to `burgee/yargs` (the subpath dropped), rewriting inside a non-specifier
string, writing a file with one refusal in it, reporting a typed compat number instead of the
baseline's, and exiting zero with refusals present.

## Rejected alternatives

- **jscodeshift / ts-morph / recast.** Correct for a general codemod and impossible here:
  rule 2 is zero runtime dependencies, and the rewrite surface is a quoted string, not an
  expression. The cost of the narrow scan is A4 — some positions are refused rather than
  handled — and that cost is paid visibly, in a report, rather than silently.
- **Interactive by default.** The second audience is an agent. A prompt is a wall.
- **Rewriting API calls, not just imports.** `program.parse()` is the same call on both
  sides — that is what 1360 / 1360 means. A codemod that edited call sites would be claiming
  the façade is *not* drop-in, which would be the opposite of the product.

## Out of scope

- oclif, cac, citty, meow. They are not drop-in hosts today (D-004 schedules three of them
  last); a migration path to a façade that does not exist is D-007's mistake.
- Rewriting `package.json` dependencies. The report says what became removable; removing it
  is the maintainer's commit, not ours.
- A `--revert`. `git checkout` is the revert, and A6 guarantees there is something to revert to.
