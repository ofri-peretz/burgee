# Design — `paratext`

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/design.md).

**Accepted at the Design→Build gate 2026-09-13** under the owner's standing instruction to
proceed, recorded here rather than assumed. Most of R1–R7 was built before this design
existed; the design describes the built thing so the remaining requirements have a base to
be measured against. R8–R12 were the unbuilt half; **R8 and R10 are built as of 2026-09-14,
and R11 and R12 are blocked on files a package lane may not write** — each says which,
below, rather than staying an unexplained `Not built`.

---

## Requirements

- **R1** A *capability* is data: `{ name, osc, when, encode, fallback }`. `osc` is the
  sequence number, `when` the support predicate over a `Runtime`, `encode` a template that
  turns fields into the OSC payload, `fallback` a template for the static projection.
  Built: `capability.ts`.
- **R2 (Y5)** `emit(runtime, name, fields)` returns the encoded sequence when `when` holds
  and the rendered `fallback` otherwise. **It never returns an empty string and never emits
  OSC on an unknown terminal.** Built and tested ("the projection, which is the point").
- **R3** `register(capability)` adds or replaces by name; `reset()` clears; `capabilities()`
  lists. The seven built-ins register through the same call at import. Built.
- **R4** `check(candidate)` validates a capability against `schema.json` and returns the
  violations by path, so a plugin that misspells a field is told which. Built.
- **R5 (Y9)** One file reads `process`: `runtime.ts`, exporting `processRuntime()`. Every
  other function takes a `Runtime`. Built; `process-reference-lock` should list it.
- **R6** The template language (`{field}` substitution with `fieldsUsed()` for introspection)
  is the whole of the encoding — no per-capability code. Built and tested.
- **R7** Seven built-ins: `bell`, `clipboard` (OSC 52), `cwd` (OSC 7), `image` (OSC 1337),
  `link` (OSC 8), `notify` (OSC 9 / 777), `title` (OSC 0/2). Built.
- **R8 (Y3)** Default export call-compatible with `ansi-escapes` for its OSC members
  (`link`, `image`, `setCwd`, `beep`, `clearTerminal` is CSI and out of scope). **Built:
  `ansi-escapes.ts`, re-exported from `index.ts`.** Measured 2026-09-14: the row moved
  **0 / 4 -> 1 / 4, 25.0%**, which is this row's ceiling, and the case that turned green is
  `named export(s)` — the one of its four that touches OSC. The other three still fail on
  `cursorTo(2, 2)`, the clear sequence and `ESC [ ? 2026 h/l`, which is the correct result,
  not an outstanding task.

  Three decisions the build made, none of them obvious from the requirement:

  - **Every name `ansi-escapes` exports is declared; thirty-three of the thirty-seven are
    `undefined`.** A drop-in has to *load*, and ESM refuses a named import of a name the
    module does not export — so `import ansiEscapes, { cursorTo } from 'paratext'` was a
    `SyntaxError` that took the file down before a line of it ran. That was the whole of the
    0 / 4: not one assertion failed, the module never loaded. Declared-and-empty is the
    smallest thing that fixes it without implementing CSI, and TypeScript types each as
    `undefined`, so calling one is a **compile** error. The default export carries only the
    four that are implemented: an `undefined` CSI key on it would read as a claim being made
    and not kept.
  - **The root's `link` and `image` are now the incumbent's functions, not the capability
    records.** They collided, and the alternative was worse than a breaking change: a caller
    who swapped `from 'ansi-escapes'` for `from 'paratext'` would have got an object shaped
    nothing like a function, silently. The rule is stated rather than ad hoc — *a record
    export survives unless `ansi-escapes` has that name* — so `bell`, `clipboard`, `cwd`,
    `notify` and `title` are untouched, and the two that moved are `capability('link')` and
    `capability('image')`.
  - **`image`'s encode template gained `[;preserveAspectRatio={…}][;size={…}]`**, upstream's
    last two options in upstream's order, which makes `image()` byte-identical to the
    incumbent rather than merely call-compatible. `size` is optional in the protocol and
    required by xterm.js, which is why upstream always writes it.

  One defect this found, worth recording because the test that found it was written for a
  different reason. `ansi-escapes.ts` is `emit()` over three built-in capabilities, and
  `emit()` answers an *unregistered* name with whatever text the caller passed — by design,
  because output is not the place to discover a typo. Reached with an empty registry it
  therefore returned `Docs` for `link('Docs', url)`: no error, no bytes, and the URL quietly
  gone. The module now registers the built-ins itself rather than trusting whoever imported
  it. This is closeout's `onExit()` failure in a different package.
- **R9 (Y7)** `ansi-escapes`, `terminal-link`, `term-img` vendored into `compat-oracle`,
  graded `--control` first; CSI cases of `ansi-escapes` recorded as out-of-scope in the
  baseline rather than as failures. **One of three built, and the two that are not name an
  installed package rather than a judgement.** Measured 2026-09-14, and none of it is a
  tarball: `npm pack ansi-escapes && tar tzf … | grep -c test` is `0`, so all three suites
  come from a shallow clone at the annotated release tag (`ansi-escapes` v7.3.0 →
  `73e652ef`, `terminal-link` v5.0.0 → `975358c3`, `term-img` v7.1.0 → `c495c815`).

  | suite | control | target `paratext` | state |
  | :-- | --: | --: | :-- |
  | `ansi-escapes` 7.3.0 | **4 / 4, 100.0%** | **1 / 4, 25.0%** — the ceiling | active, baselined |
  | `terminal-link` 5.0.0 | did not run | — | planned, suite not committed |
  | `term-img` 7.1.0 | did not run | — | planned, suite committed |

  Three things this measurement settled, all of which were open before it:

  - **The zero was R8, stated by the host's own suite, and it is no longer zero.** The
    target run's TAP was one line — `SyntaxError: The requested module 'paratext' does not
    provide an export named 'default'`. Since R8 the same run reports `1..4 / # pass 1`,
    with `named export(s)` green and the three CSI cases red.
    **`baseline/ansi-escapes.json` still records `passed: 0` and is the integrator's file
    to raise**; the gate ratchets downward only, so the improvement does not fail it.

    The row is graded against the package root because that is where R8 puts
    the compatible default; naming a `paratext/ansi-escapes` façade would have published
    the oracle's `target not built yet` note instead of a number, which is the mistake
    `cli-table3`'s row in `hosts.ts` exists to stop.
  - **The ceiling on this row is 1 / 4, not 4 / 4.** `default export`, `clearTerminal` and
    `synchronized output` assert CSI — `cursorTo(2, 2)`, the clear sequence, `ESC [ ? 2026
    h/l` — which this design puts out of scope. Only `named export(s)` touches OSC. The
    three cannot be subtracted as `excludes`: ava's TAP prints counts and no per-case
    names, and `summarize()` refuses an exclusion it cannot name. So the ceiling is prose
    in the host entry, and 25% on this row means *complete*, not *a quarter*.
  - **`term-img`'s suite runs headless**, which was the real question about it. Every one
    of its 18 cases sets `TERM_PROGRAM` / `KONSOLE_VERSION` / `process.platform` by hand
    and asserts a returned string or a thrown `UnsupportedTerminalError`; nothing is
    rendered and no tty is touched. It is ungraded only because `term-img` is in neither
    manifest.

  What each blocked row needs, exactly — all of it in files a package lane may not write:

  - `terminal-link`: `terminal-link` **and** `supports-hyperlinks` declared in the root
    manifest. The second is not optional for the control alone — its ten cases `import
    supportsHyperlinks from 'supports-hyperlinks'` in the *test*, so the target run needs
    it too. Committing the vendored suite without it turns `vendored-suite.test.ts` red,
    which is why the suite is not in `vendor/`. It also needs `rootPackage()` in
    `compat-oracle/src/vendor.ts` to carry the host's `ava: { serial: true }`, or ten
    cases that mutate one shared module object run concurrently.
  - `term-img`: `term-img` declared in the root manifest, and a `controlFailures` allowance
    for `iTerm2 support`, which calls `iterm2-version()` and reads the installed iTerm2's
    Info.plist — green on a Mac, red on a Linux runner.
  - Both: a missing incumbent does not produce a red row, it produces
    `ERR_MODULE_NOT_FOUND` out of `packageRoot()` inside `writeInternalShims` and takes the
    whole `npm run compat` process down. Worth a guard in `run.ts` so one absent package
    costs one row rather than every row.

  **Until all three land, the npm description's "drop-in" claim is removed** (decision 3 of
  the ecosystem plan) — one row of three, at zero, is not a drop-in claim.
- **R10 (plugin-contract)** `schema.json` becomes the family schema with paratext's shape
  under `capabilities`. **Half built (PLAN 1.1).** The schema half is done: the capability
  shape is `$defs/capability`, reached through a `capabilities` key, and all three
  `packages/*/src/schema.json` hash to one value. `check()` reads
  `$defs/capabilityDocument` and takes either shape, the bare one with a `deprecated:` line
  (PLAN D2 — accepted for one minor release, removed at 1.0). *One object registering into
  all three hosts* is not built: paratext still has no `src/plugin.ts` and no `register()`
  that takes a plugin document, which is PLAN 1.7's work.
  **The `src/plugin.ts` half is now built too.** paratext hosts `capabilities` (R5a): a
  plugin object arrives, every key another layer owns is ignored without complaint, and
  `attach()` hands the contributions to the same `register()` the built-ins go through.
  Three refusal codes, all of them already in flagstaff's `PluginErrorCode`, so the
  vocabulary lock needed nothing added — `E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT`, and
  `E_NO_STATIC_PROJECTION` for a capability with no `fallback`, which is the same defect
  flagstaff raises it for in a component and caique in a widget.

  **That file was the point, not the feature.** `scripts/plugin-schema-lock.test.ts` and
  `scripts/schema-sync.mjs` both find a host by looking for `src/plugin.ts`. Until it
  existed paratext's copy of the family schema was outside the lock that keeps the copies
  byte-identical: it happened to match flagstaff's, and nothing in the repository would have
  said so if it stopped. The rest of R10 — validation reading the published schema rather
  than a second copy of its rules — is `validate()` delegating to `check()`.

  **It cost flagstaff five byte budgets and they are not raised.** `dist/schema.json` goes
  3,451 B -> 6,531 B, and every flagstaff entry that reaches the plugin registry carries it:
  `.` 31,474/29,000, `./plugin` 14,623/12,000, `./spinner` 15,551/12,500, `./tasks`
  15,962/13,000, `./box` 17,282/15,000 — ten red assertions in
  `packages/flagstaff/src/weight.test.ts`, none of them touched here. The budget is per
  *entry point*, the schema is one *file*, and folding a section in makes every host pay for
  every other host's contract. Two ways out, and the second is the one to take: raise the
  five budgets (the product claims survive — `./spinner` at 15,551 B is still under ora's
  17,891 B), or split publication from bundling — keep one byte-identical `src/schema.json`
  as the contract each package exports, and have `schema-to-dist.mjs` project it to the
  sections that host actually validates.
- **R11 (Y8)** Ceilings in `.sdlc/bands/foundation-ceilings.json`; a B4 row. **Not built,
  and not buildable from this package's lane.** Both artefacts live outside
  `packages/paratext/**`: the ceilings file is under `.sdlc/bands/**`, which the lane
  boundary assigns to the integrator, and a B4 row is a `benchmarks/` entry. The file does
  not exist yet at all (`ls .sdlc/bands/` on 2026-09-14: `artifact-size-baseline.json`,
  `control-bands.history.json`, `control-bands.json`, `release-budgets.json`,
  `scoreboard-public.json`), so this is a first creation rather than an edit — one more
  reason it belongs to whoever owns the directory. The number the row would carry now
  exists and is measured: **1 / 4, 25.0%, against a stated ceiling of 1 / 4.**
- **R12** First same-repo consumer: `flagstaff/table` and `flagstaff/box` link paths via
  `paratext`. Proves Y1's arrow down and gives the consolidation a number. **Not built, and
  not buildable from this package's lane** — the edit is in `packages/flagstaff/**`, which
  is another lane's, and flagstaff is also where the five byte budgets R10 records sit, so
  the consumer change and the budget argument want to land together rather than in two
  passes. paratext's side of it is ready: `emit(runtime, 'link', { text, url })` and the
  `link(text, url)` R8 added are both callable with a `Runtime` flagstaff already has, and
  neither reads `process`.

## Design

```text
packages/paratext/src/
  capability.ts   R1–R4  the record, the registry, emit(), check()
  template.ts     R6     {field} substitution, fieldsUsed()
  builtins.ts     R7     seven records, registered at import
  runtime.ts      R5     Runtime shape; the one process read
  schema.json     R4/R10 the contract; to become the family's
  index.ts               re-exports; R8's default export lands here
```

**Why a registry and not a function table.** Terminals invent OSC codes faster than a
package ships. Kitty's graphics protocol, WezTerm's user-vars, Ghostty's progress bar — each
arrived between releases of `ansi-escapes`. A capability that is data can be added by a
plugin the week the terminal ships; a function cannot. This is also why R10 matters more
here than in roundel: a theme is nice to plug in, a capability is *necessary* to plug in.

**Why the fallback is not optional.** `terminal-link` on an unsupported terminal prints the
URL after the text in parentheses. `ansi-escapes` prints the raw OSC. `term-img` throws. Three
packages, three answers, and the *caller* cannot know which without reading source. Here
the capability says what it degrades to, and `emit()` never has a third behaviour.

**Order.** R9 first (it grades R7 and tells us where R8 must match) → R8 → R10 (with the
roundel/flagstaff schemas, one PR) → R11 → R12.

## Verification

- `npm test -w paratext` — **43 tests** across eleven groups (23 before R8).
- `sha256sum packages/*/src/schema.json | awk '{print $1}' | sort -u | wc -l` — 1 (R10).
  Since `src/plugin.ts` exists, `scripts/plugin-schema-lock.test.ts` and
  `scripts/schema-sync.mjs` now *see* paratext and assert this themselves, which is the
  half of R10 that was missing.
- `npx eslint . --max-warnings 0` — a **separate CI job** from `npm run ci:local`, and the
  one this work's changes were caught by. The default export needs the inline
  `import-next/no-default-export` disable linegauge's and closeout's drop-in facades carry,
  for the same stated reason.
- **Weight, measured rather than assumed.** `npm pack --dry-run` on paratext:
  main **14,001 B / 44,678 B** -> this change **16,163 B / 48,808 B** (+15.4% gzipped,
  +9.2% unpacked), after adopting `scripts/strip-comments.mjs` in the build as burgee,
  flagstaff and roundel already do — without it the two new modules cost 24,526 B / 76,484 B.
  paratext has no `weight.test.ts`. `.sdlc/bands/artifact-size-baseline.json` still records
  **9,221 B / 30,484 B**, which *main already exceeds by 51.8% / 46.6%* with none of this
  work in it — the PLAN 1.1 schema fold moved it and the file was not refreshed. Raising it
  is the integrator's edit, and the two numbers should be re-recorded together.
- `npm run compat -- ansi-escapes --control` — 4 / 4, and **1 / 4, 25.0%** below that as of
  2026-09-14; then `npm run compat -- ansi-escapes`, which ratchets against
  `packages/compat-oracle/baseline/ansi-escapes.json`. Both gates were proven live rather
  than assumed: raising that file's `passed` to 1 exits 1 with "0 passing, baseline was 1",
  and raising `reference` to 5 exits 1 with "4 of its own 5 cases registered". Add
  `terminal-link term-img` to the command when their rows go active.

  **Run it from a checkout that resolves `paratext` to itself.** A worktree with no
  `node_modules` of its own resolves the bare specifier up to the parent checkout's, so the
  oracle grades *that* tree and reports the change as having done nothing — measured here on
  2026-09-14, an identical `0 / 4` with no arrow for a build that was already green. `node
  --input-type=module -e "console.log(import.meta.resolve('paratext'))"` is the check, and it
  costs a second.
- **The check that would have caught the original problem** — the original problem is a
  package on npm with no intent. `scripts/intent-artifacts-lock.test.ts` gains the rule:
  every `packages/<name>` with a published version has `.sdlc/intents/<name>/intent.md` and
  `design.md`. Proven to fail by moving this directory aside.

## Rejected alternatives

- **Extending `ansi-escapes` upstream.** Its maintainer declined runtime detection by
  design ("emit and let the terminal ignore"); the fallback behaviour is the whole
  difference and cannot be a PR.
- **Detecting support by querying the terminal (DA1/XTVERSION).** Round-trips on stdin,
  hangs under a pipe, and still cannot answer per-capability. A table plus a fallback is
  honest about what is knowable.
- **A fixed list of built-ins with no `register`.** Rejected for the reason in "Why a
  registry".

## Out of scope

- CSI: cursor, erase, scroll regions (`ansi-escapes`' larger half). That is `closeout` (to
  undo) and `flagstaff` (to draw).
- Reading files for `image`. The caller owns I/O; this package owns bytes-to-escape.
- Any styling. `link` returns the text unstyled; wrap it in a `roundel` token.
