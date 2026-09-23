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

- **A12** *(added 2026-09-23, D-137)* **One run migrates the whole family, not two hosts.**
  Every drop-in `compat-oracle` grades **level** with its incumbent — the incumbent's own
  suite passes as many cases against the replacement as against the incumbent itself, in the
  same harness — is rewritten: `chalk` → `roundel/chalk`, `ora` → `flagstaff/ora`,
  `string-width` → `linegauge`, `cross-spawn` → `bellpull/cross-spawn`, `signal-exit` →
  `closeout/signal-exit` and the rest. The list is `DROP_INS` in `compat.ts`, re-derived from
  the oracle's host table by `scripts/migrate-drop-ins-lock.test.ts`; the control counts come
  from the published compatibility page. A drop-in that is not level yet (dotenv, cosmiconfig,
  clack, meow, rc, ansi-escapes, terminal-link, term-img) is reported under `partial` with its
  grade and never rewritten. The report names the family packages to add and prints `next`,
  the install-and-uninstall command for the package manager the lockfile names.

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

## Amendments — what building it proved wrong

Six things in the sections above did not survive contact with the implementation. They are
recorded here rather than edited away, because a design that quietly agrees with whatever
got built has stopped being a gate.

- **A8 named an exit code that does not exist.** `ExitCode.DataError` is not in E1, which has
  six codes and a lock (`scripts/exit-code-lock.test.ts`) that reads them out of
  `exit-code.ts`; a seventh would be a contract change in a lane that does not own the
  contract. The code shipped is `ExitCode.RUNTIME` — *the command ran and did not do the
  whole job* — which is also the right one: `USAGE` (2) tells an agent to rewrite the
  command, and there is nothing wrong with the command.
- **A8's other half needed a framework capability that did not exist.** `emit` had exactly
  one success path and it left with `OK`, so a command could emit a document *or* fail, never
  both: `ctx.exit` unwinds before the result is written and prints nothing, and a throw puts a
  message where the document goes. A report with no code means running it twice; a code with
  no report means parsing prose for a file name. `emit` now honours an `exitCode` named in a
  command's own result, the way `changedOf` already honours `changed` — **162 bytes** measured
  (60,661 → 60,823 on the root entry, 80,017 → 81,293 on `./cli`), and the ratchets were
  raised with the measurement in `weight.test.ts` rather than quietly.
- **A10's budget cannot be measured as a single wall clock.** Over 1,000 files the command is
  1,000 reads, 667 writes and 17 ms of scanning, so one number grades the filesystem. On the
  development host at load average 33 on 14 cores the same build measured 390 ms and 4,515 ms
  minutes apart, and **the raw I/O floor alone — the same reads and writes with no scanning —
  measured 960 to 1,325 ms**, so no implementation could have passed. The gate is now three
  numbers, each failing on its own: the scan under 100 ms (17 measured), the slowest single
  file under 1 ms (0.074 measured), and the whole command under 500 ms **or** inside this
  host's own measured I/O floor plus the scan's budget — which on an idle machine is the
  design's 500 ms unchanged, and on a loaded one is the only claim left that the code can be
  held to: *the codemod costs less than reading and writing the same files*.
- **The commander gate is byte-for-byte on the value import, not on the file.**
  `demo-cli-commander/src/program.ts` and `src/burgee.ts` each keep a *type-only* import of
  real commander on purpose — the demo casts burgee's classes to commander's declared types,
  and that cast is the drop-in claim stated as a type. The codemod rewrites a type-only
  import like any other, which is right for a user and wrong for this one fixture. Asserted
  separately, as a difference that exists and is understood, rather than special-cased in the
  codemod.
- **`yargs-parser` is in the intent's example output and not in A2's table.** The table is
  what shipped: four mappings, and `burgee/yargs/parser` is reachable but not produced by
  `migrate`. The example's *"commander, yargs, yargs-parser removed"* counts a transitive
  dependency the command does not claim.

- **A2 assumed every name an import asks for exists on the other side.** It did not:
  `burgee/yargs` exported no `Argv`, `Arguments` or `CommandModule`, so
  `import type { Argv } from 'yargs'` became an import of nothing, and every TypeScript +
  yargs adoption target came out of the codemod not compiling
  (`.sdlc/research/adoption-targets.md`). The façades now export the incumbents' whole type
  surface, and the rewrite gained **A11 — a rewrite moves only names the target exports**:
  each `import`/`export … from` clause is read off the tokens the scan already has and checked
  against `FACADE_EXPORTS`, a table `facade-types.test.ts` holds equal to what `tsc` sees in
  `dist`. A type-only statement naming something the façade lacks stays on the incumbent and
  is reported under `kept`, with a note, and the host is then not called removable; any
  other import of a missing name is refused as `unknown-export` under A5. Still a scan, still
  no parser: the check is a set lookup per named binding.

Found on the way, outside this lane and not fixed here: **an option declared in kebab-case
never reaches its handler.** `toParseConfig` kebabs a spec's name for the parser and
`canonical` camelCases it back, so a spec declared `'dry-run'` parses, resolves to nothing,
and hands the handler `undefined` — the flag has no effect and nothing says so. `burgee brand`
(`--allow-low-contrast`, `--bordure-width`) and `burgee dev` (`--no-watch`) are all declared
that way today. It was found by running `migrate` through the built binary; every in-process
case passed.
