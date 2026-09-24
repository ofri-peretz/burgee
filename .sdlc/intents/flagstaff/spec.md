# Design — flagstaff

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Amended and re-accepted by the owner on 2026-09-08** (PR #62, merged by the owner, which is
the acceptance): the façade section — the `roundel/chalk` seam, the process-lock exemption and
its justification, and the weight comparison — was rewritten by the PR that introduced
`flagstaff/ora`. Recorded here because a design edited by the build it authorises cannot stand
as its own approval, and a merge leaves no trace in the design of what was accepted. See the
matching note on constraint 2 of [`output-stack-compat`](../output-stack-compat/intent.md).

**Amended again, and accepted by the owner at the Design→Build gate on 2026-09-09** (PR #82):
R2 gains a component's optional `sample`, and R8 is widened from "exit 1 on a schema error" to
the seven refusals `check` actually emits. What was accepted, and the alternative not taken in
each case, is recorded under "Accepted at the Design→Build gate (2026-09-09)" below.

---

## Requirements

- **R1** `hoist(component, rt)` returns `{ update(state), lower() }`. On `tty` it repaints
  in place through `node:readline` cursor ops on a clock injected via `rt.clock`
  (`now()`, `schedule(fn, ms)`); on `pipe` and `ci` it writes `component.static(state)`
  once per *state change*; on `json` it writes one NDJSON event
  `{ "event": "<name>", "state": … }` per change to `rt.stderr`; on `accessible` it writes
  the static text with no cursor ops. Mode comes from `roundel/policy`, never computed here.
- **R2** A component is `{ name, static(state): string, frame?(t, state): string,
  sample?: { running, done } }`; `register()` throws `E_NO_STATIC_PROJECTION` with `fix`
  when `static` is missing. `sample` is the two states the component is *shown* with by
  `flagstaff check` and the docs gallery; the loop never reads it, because a component's
  real state comes from the program. It is inert data (plugin-contract R7), and the
  registry deep-copies and freezes it, so declaring one does not hand the registry a
  reference into the plugin author's own object.
- **R3** A plugin is `{ name, spinners?, glyphs?, tokens?, components? }`, validated at
  `register()` against `schema.json` shipped in the tarball. A spinner is
  `{ frames: string[], interval: number, static: string }`.
- **R4** Built-ins `spinner`, `progress`, `tasks`, `box`, `table` are registered through
  the public `register()` from `src/builtins.ts`; a test asserts no private path exists.
- **R5** Under any mode but `tty`, the loop writes no `\r` and no *cursor* escape; a
  conformance case greps a piped run. Colour is not a cursor: under roundel's revised R2 an
  explicit ask (`FORCE_COLOR`, `--color`) wins in any mode, so an SGR sequence may appear
  off a terminal and that is correct. The earlier wording here said "no ESC sequence", which
  was false as written and untestable as intended — the intent has always said cursor.
- **R6** Façades, each its own subpath and graded by the incumbent's suite in
  `compat-oracle`: `flagstaff/ora`, `flagstaff/log-update`, `flagstaff/boxen`,
  `flagstaff/table` (cli-table3).
- **R7** No layout engine: `src/` has no `layout*` file and declares no measure pass of its
  own; `box` and `columns` are string functions over `width`/`wrap`, which live in
  `linegauge` since F1 and arrive here as imports. (`src/width.ts` was where they lived when
  this line was written.) The lock is on the declaration, not the filename — #61 noted that a
  `readdir` filter for `layout*` waves through a layout engine called `measure.ts`.
- **R8** `flagstaff check <file>` (the package `bin`) loads a plugin file, validates it, and
  prints its rendering in all five modes side by side; exit 2 on a usage error, and **exit 1
  on any refusal**, each carrying a code from `PluginErrorCode` and a `fix`.

  **Widened 2026-09-09.** This said "exit 1 on a schema error", which was narrower than what
  the command actually refuses and left the extra refusals looking unspecified. `check`
  emits five codes: the three `validate()` raises inside `register()` — `E_PLUGIN_SCHEMA`,
  `E_NO_STATIC_PROJECTION`, `E_PLUGIN_CONTRACT` — and two only a renderer can discover, `E_NO_CONTRIBUTION` (the plugin validates and
  contributes nothing flagstaff can render, which is how a misspelled top-level key tells on
  itself, since the schema allows unknown keys on purpose) and `E_COMPONENT_THREW` (a
  component's `static` threw on the state it was shown with, naming the modes it broke in).
  All five are members of one union in `plugin.ts` that has **eight**: `E_UNKNOWN_SPINNER` and
  `E_UNKNOWN_BORDER` come from `lookupSpinner()` and `lookupBorder()` — `check` looks up only
  a spinner it has just registered, and no border — and `E_UNKNOWN_KIND` is caique's. None is
  spelled at a call site, and **every one reaching `check`, wherever it was raised, leaves
  through one handler** that prints its code and its `fix`: a plugin file that registers
  itself on import throws before `main()` has a line of its own. *Corrected 2026-09-22*, when
  this paragraph was found wrong three ways (below).
- **R9** Deterministic: with a fake clock, a spinner's TTY output for N ticks is a fixed
  string; a snapshot test runs 20 times in CI.
- **R11** `flagstaff/import`: `fromCliSpinners(json)` and `fromCliBoxes(json)` turn the two
  existing data corpora (≈80 spinners, the border-style set) into registered plugins with a
  derived `static` (the first frame, or the label). The gallery opens full; a third-party
  plugin starts as a copy of one. No corpus is bundled *into the core* — weight (U5) — the
  user supplies it. The one exception is `flagstaff/ora`, which re-exports cli-spinners'
  corpus because ora's `spinners` export is part of the API being graded; it is 20.3 KB
  behind that subpath and the isolation lock keeps every other entry away from it.
- **R10** Subpath isolation and weight rules per entry; ceilings: `./spinner` ≤ ora,
  `./box` ≤ boxen, `./table` ≤ cli-table3, `./log-update` ≤ log-update — recorded when
  vendored. Depends on in-family packages only — `closeout`, `linegauge`, `paratext`, `roundel`
  (restated 2026-09-23, D-130; first written *"depends on `roundel` only"*).

  **"Depends on `roundel` only" has been false since 2026-09-09** and is corrected under
  *Where this document and the code disagree*; as of 2026-09-16 the list is `closeout`,
  `linegauge`, `paratext`, `roundel`.

- **R12** `./box` and `./table` render a path or a url as a terminal hyperlink **through
  `paratext`**, never through an escape written here. A cell may be `{ text, href }`; a box
  may be given `{ href }`. The sequence on a terminal believed to do OSC 8, `text (url)`
  everywhere else, and the destination survives into the static projection — an agent and a
  screen reader get the url, a pipe gets no control byte. **Built (2026-09-16)** — `src/link.ts`,
  and the number this requirement is really about is in the "What shipped" entry below.

  This is `paratext` R12 from the other side: the first same-repo consumer of that package.
  The requirement is filed here too because the edit is here, and a requirement that lives
  only in the other lane's design is one this package's reader never sees.

### Evidence

Issue ids from [what 230 issues say about the output stack](../../research/output-stack-open-issues.md),
one row per requirement; the section number is the cluster the reading comes from. A row
with no issue behind it is a hypothesis and is measured before it locks.

| R | Issues that support it | Standing |
| :-- | :-- | :-- |
| R1 | ora #120 (21 reactions, output while spinning), #49, #90 (locked: stdout swallowed before `.stop()`); log-update #48 (declined: one live line above a log), #60 (`debug` on another stream); listr2 #698 (pin a line), #716 (UI to stderr, data to stdout), #732 (events for an outside consumer); clack #304 (merge `log` and `stream`), #510 (`\r` frames captured) — §2, §3 | cited |
| R2 | clack #585 (accessible mode: every repaint re-announced), #510; ink D#734 (Gemini CLI and screen readers); Inquirer #1783 (`select` renders one row under mintty), D#1356 (one line per answer); ora #116 (two spinners overwrite each other); log-update #59 (declined: "a table renderer that returns a string") — §2, U3 | cited |
| R3 | clack #36 (themes, variants, icons), #345 (expose the style, not the rendering), #379; ora #255 (`logSymbols` optional), #240 (change the default icons); boxen #106, #99, #94; cli-table3 #352, #355; ink D#641 — every one a key in a plugin object — §9, U4 | cited |
| R4 | no issue distinguishes built-in components from third-party ones | hypothesis — measure before lock |
| R5 | clack #510 (`\r` frames in captured output), #585; cli-table3 #357 (ANSI under `NO_COLOR=1`); listr2 #687, #716 — §1, §2 | cited |
| R6 | picocolors #100, #92 (what an ungraded migration costs); ora #234 (ora 8 breaks the prompt library beneath it), #260 (declined: a type widened in a patch), #238 (behaviour differs by Node version); cli-table3 #357 (README documents an unreleased version) — §8, §18, U11 | cited |
| R7 | ora #231 (declined: "try Ink"); ink #765, #222, #834, #978, D#555, D#959 (the layout engine's own backlog) — §16, U8. Width: boxen #90; cli-table3 #322, #356; clack #556, #306, #116; listr2 #708; ink D#716 — §5 | cited for the ceiling; the width function is a hypothesis until measured against `string-width` (§5) |
| R8 | clack #533 (9 comments, agents driving CLIs), #525; Inquirer D#1699 (a binary per prompt for scripts); ink D#776 (an author records asciinema so an agent can see the app) — U9 | **measurable as of 2026-09-08**: `evals/cases/flagstaff-plugin-from-schema.json` is the one-turn eval — schema + README in, a plugin `flagstaff check` accepts out. Still unmeasured until it has run with a credential; what is proven is that the case discriminates (green on a correct plugin, red when `static` is removed) |
| R9 | ora #90 (locked: "I can't write tests for stdout because they're gone"); clack #307 (colours under vitest), #508 (mocking under bun); Inquirer D#1979; ink #773 (a frame renders before layout completes) — §21, §4 | cited |
| R11 | no issue asks for a spinner or border corpus importer; ora #240 wants different icons, not a corpus | hypothesis, still — built 2026-09-08 at 838 B because it was nearly free, not because it was measured. Whether anyone imports a corpus is unmeasured, and the cost of being wrong is one subpath nobody imports |
| R10 | ink #976 (a DEV-only dependency installed for everyone); ora #229 (segfault in the dependency tree), #247 (the chalk 5.6.1 compromise reaching ora's users); listr2 #759, #724, #707, #771 (peer range drift against its own adapter); chalk #617 — §14, U5, U1 | cited |

## Design

```text
packages/flagstaff/src/
  loop.ts         hoist(): mode switch → repaint | static-per-change | ndjson | plain
  projection.ts   the per-mode writers; the only module that emits cursor ops
  plugin.ts       register(), validate() against schema.json, the plugin registry
  schema.json     the contract (also copied to apps/docs llms.txt at build)
  width.ts        display width of a string (East Asian wide, combining, ANSI-stripped)
  components/     spinner.ts progress.ts tasks.ts box.ts table.ts   (each: static + frame)
  builtins.ts     registers the five above through the public API
  facades/        ora.ts log-update.ts boxen.ts table.ts
  cli.ts          `flagstaff check <file>`
  index.ts        re-exports, no side effects
```

**The static projection is the primary artifact.** `frame()` is optional and decorative;
`static()` is required and is what the pipe, the agent, the screen reader, the docs gallery
and `flagstaff check` all read. This inverts ora's model, where the animation is the thing
and non-TTY is a fallback, and it is what makes a third-party plugin safe by construction.

**The plugin gallery is a projection too.** `apps/docs` renders every registered plugin's
`static('running')` at build time; nothing is hand-drawn.

**Order.** `loop` + `projection` with `spinner` only → `plugin` + `schema` + `check` →
the U9 eval (an agent writes a plugin from the schema) → `progress`, `tasks`, `box`,
`table` → façades one at a time, each with its scoreboard row before the next.

## Verification

- `npm test -w flagstaff` — R1 per-mode snapshots with a fake clock, R2/R3 registration
  errors, R4 built-ins-through-public-API, R5 no-escape grep, R7 file-list lock, R9
  determinism ×20, isolation, weight, shape (Z1).
- `examples/` conformance: the five plugin cases (tty animates, pipe one line per state,
  json events, accessible text, missing `static` refused).
- `npm run compat -- ora` (then log-update, boxen, cli-table3).
- `npm run evals` — U9: schema + one example → a passing plugin in one turn.
- `npx vitest run --config vitest.root.config.ts scripts/plugin-error-vocabulary-lock.test.ts`
  — R8's vocabulary: every `'E_…'` a host ships is a member of its `PluginErrorCode`, and
  no host declares a code the vocabulary home does not know.
- The check that would have caught the original problem (clack #510, `\r` spam captured by
  agents): R5's grep on a piped run, red today against ora, green here by construction.

## What shipped (2026-09-08, the first slice)

`packages/flagstaff/src/`: `loop.ts` (`hoist`, `manualClock`), `projection.ts` (the four
writers; the only file that emits a cursor sequence, and it writes the three it needs by
hand — `node:readline`'s helpers want a `Writable` where the loop only has a `Writer`),
`plugin.ts` (`register`, `validate` against `schema.json`, the registry as Maps so a
plugin's keys cannot reach a prototype), `builtins.ts` (data only, a type-only import,
registered by `plugin.ts` through the public `register()`), `spinner.ts`, `cli.ts`
(`flagstaff check`). Entries: `.`, `./loop`, `./plugin`, `./spinner`; `bin: flagstaff`.
Locks: R1 per-mode transcripts, R2/R3 refusals with codes and fixes, R4 the built-ins'
import list, R5 the escape grep, R7 the file list, R9 twenty identical runs, isolation,
weight (`./loop` 5,000 · `./plugin` 10,000 · `./spinner` 11,000 · `.` 16,000 B), shape from
two packed tarballs. The schema validator is sixty lines over the subset the schema uses,
because a JSON Schema library is a dependency the package will not carry.

Not yet: the boxen and cli-table3 façades (R6, both blocked on a decision rather than a
port — see `output-stack-compat`). `tokens` are kept in the registry for whoever flies
the theme — `register()` does not call roundel's `fly()`, because that needs a runtime and
would pull the theme into every plugin import.

## What shipped (R6, ora — 2026-09-08)

`flagstaff/ora`: ora 9.4.1 ported method for method, **99 / 99 on ora's own suite**, and its
eight dependencies folded in with it — the spinner corpus as `src/spinners.json` (cli-spinners
3.2.0, unedited, attributed in `THIRD-PARTY.md`), the display width as `src/width.ts` (R7:
`Intl.Segmenter`, an RGI-emoji rule and a 122-range East Asian Width table, graded case by
case against `string-width` 8 in `width.test.ts`), the colours through `roundel/chalk`, and
cursor control, the log symbols, the stdin discarder and the two environment probes written
out in fifty lines.

**The façade does not sit on `hoist()`, and that is the design.** ora's model is the inverse
of this package's: the animation is primary and non-TTY is a fallback. A façade that
reinterpreted its host would fail the host's own suite, and the suite is the only claim
being made. `subpath-isolation.test.ts` locks the separation in both directions — `ora.js`
reaches `spinners.json` and `width.js` and nothing else, and no core entry reaches any of
them. So a program migrates its spinner in one import, pays no frame loop for it, and
adopts `hoist()` later or never.

The weight: 46,330 B for the subpath, 55,641 B with `roundel/chalk`'s 9,311 counted,
against ora 9.4.1's own 113,577 B across seventeen packages — **49%**, in two packages
instead of seventeen. Both sides counted the same way, which is what makes it reproduce:
shipped code and data (`.js`/`.mjs`/`.cjs` plus the `.json` a module imports, never
`package.json`); ours the import graph walked from `dist/`, ora's every package that graph
touches in ora's own resolved tree — nested `node_modules` winning, so chalk 5.6.2 and
string-width 8.2.2 — counted whole. Counting ora the stricter way, only the 27 files its
graph reaches, gives 101,809 B and ours is 55% of that. R10's ceiling is met and recorded in
`weight.test.ts` with the method and the per-package breakdown beside it.

`process` is read here, and the process-reference lock lists the file with the reason:
`process.stderr` is ora's default stream, stdout and stderr are what it hooks so a
`console.log` lands above the frame, stdin is what the discarder puts in raw mode,
`process.kill` re-signals a swallowed Ctrl+C and re-raises a termination signal after the
cursor restore, and the probes read the environment.

How much of that ora's suite actually grades, counted rather than claimed: **one** test
swaps `process.stdout.write` / `process.stderr.write` ("hooks both stdout and stderr"), and
**one** swaps `process.kill` to watch the discarder re-signal `SIGINT`. There is no
`process.env` and no `process.stdin` reference in the suite at all. So those two are ported
to the real process because ora's *behaviour* depends on them, not because the 99 prove it —
and the cursor restore, which the 99 are likewise silent about, is graded by `ora.test.ts`
here instead. Every other file in the package takes its world as an argument.

Two things in the oracle moved to make this possible, and both are improvements on their
own: a host's `testGlob` is now applied by the vendor step and the runner (ora's suite lives
at the repo root beside `index.js`, so "every `.js` in the test dir" would have vendored the
implementation and run it), and a host may declare the `env` its own `npm test` sets — ora
defines its `_`-prefixed test hooks only under `NODE_ENV=test`. Applying the glob also
removed one file from commander's count: `testHelpers.js` is a helper with no tests, and
node's runner had been counting the file itself as a passing test. commander's honest
number is 1360 / 1360, and the baseline says so.

## What shipped (R6, log-update — 2026-09-08)

`flagstaff/log-update`: log-update 8.0.0 ported, **99 / 99 on log-update's own suite**,
which renders every frame through a real terminal emulator and asserts the screen rather
than the bytes — the strongest grading of the four render hosts. Six dependencies folded
in: the wrapping is `src/wrap.ts` (wrap-ansi 10, ported and graded differentially against
the real package over a seeded sweep in `wrap.test.ts`), the width is `src/width.ts` again,
strip-ansi is `node:util`, ansi-escapes is ten lines, and cli-cursor is `src/cursor.ts` —
shared with `flagstaff/ora`, which ports the same chain.

**It carries no port of `slice-ansi`, and that is a design decision rather than a gap.**
log-update clips a frame to the terminal's height by asking `sliceAnsi` to drop a computed
number of visible columns and then correcting the estimate in a loop, because a slice in
the middle of a styled run has to reopen the styles that were active at the cut. But
`wrap()` has already closed every style at a row break and reopened it after — that is what
makes each row stand on its own — so after wrapping, clipping is `lines.slice(n)`, and
needs no ANSI state tracking at all. 1,070 lines of tokenizer are not written, and the
host's own suite cannot tell the two implementations apart.

The weight: 29,573 B for the subpath, against log-update's own 113,368 B across sixteen
packages — and it reaches **no package at all**, not even roundel. `wrap.ts` carries the
SGR close codes itself, because bold opening with 1 and closing with 22 is ECMA-48 rather
than any library's table; that took `roundel/chalk` off the wrapper and off `./box` and
`./table` with it. Sixteen packages become none, at a quarter of the bytes. `width.js` and
`cursor.js` are shared with `./ora`; neither façade reaches the other, and neither reaches
the core.

`wrap.ts` is the third piece of shared machinery, after the width function and the spinner
corpus, and it is the one `box` and `table` need next — which is why it is its own module
rather than folded into the façade that first wanted it.

### `src/cursor.ts` — the fourth, and the one that was a defect first

`cli-cursor` → `restore-cursor` → `signal-exit` is in ora's dependency tree and in
log-update's, and both façades need the same thing from it: put the cursor back however the
process dies. The first version of each got it wrong in the same way — `process.once('exit',
…)` and nothing else, which node does not run when a signal with no listener terminates the
process, so Ctrl+C mid-frame left the user with no cursor. It was fixed in the ora façade
before #62 merged and shipped, unfixed, in the log-update façade merged in #66; extracting
one module is what stops there being a third copy to get wrong.

Two conditions make it more than a one-liner, and both are graded, per façade, against the
built `dist/` entry in a child process that is really signalled:

- **It re-raises.** Installing a signal listener suppresses node's default termination, so
  a handler that only restores turns Ctrl+C into a no-op. Asserted by `killedBy`; red on
  the `'exit'`-only version for SIGINT, SIGTERM and SIGHUP, in both `ora.test.ts` and
  `log-update.test.ts`.
- **It re-raises only when `process.listenerCount(signal) === 0`.** A program that
  installed its own `SIGINT` handler asked not to be killed, and a renderer does not get to
  overrule it. This one is easy to claim and hard to check: with the guard deleted the child
  is still not killed and still exits on its own code, because the unconditional re-raise is
  caught by the program's *own* handler. What changes is that the handler is entered **twice
  for one Ctrl+C**, so the assertion is a count of entries and not a boolean.

`SIGBREAK` is filtered in by `os.constants.signals` rather than by a platform name, which
is also why the module needs no `try`/`catch`: `process.on()` accepts a signal the platform
does not know and simply never fires it, so there was no exception to swallow.

## What shipped (R4, the remaining built-ins — 2026-09-08)

`progress`, `tasks`, `box` and `table`, each a `Component` of the same shape a third-party
plugin writes, each on its own subpath.

**The static projection is not a stripped drawing, and that is the whole design.** Each of
these draws something on a terminal that is meaningless off one, so each answers the
question separately:

| component | on a terminal | everywhere else |
| :-- | :-- | :-- |
| `progress` | a bar of blocks | `12/30 files · 40%` — the numbers, which is what an agent parses and a person hears |
| `tasks` | every task, the running one animated | one line per task that has **settled**; a pipe is not told six times that step 3 is still running |
| `box` | the border, the padding, the title set into the top rule | `title: text` — a border is noise a screen reader reads character by character |
| `table` | the grid | one line per row of `header: value` pairs, parseable without knowing the drawing |

`box` and `table` are string functions over `width()` and `wrap()` (R7) and are exported as
such — `box(text, options)` and `table(rows, options)` — because most callers want the
string, not a component. There is no layout engine and no measure pass; the file list lock
still holds. `table` shrinks its widest column one cell at a time until the table fits,
which is deliberately simpler than proportional shrinking: proportional looks cleverer and
reads worse, because it narrows the columns that were already narrow.

`progress` carries no elapsed-time estimate. A rate computed from two samples is a guess
presented as a fact, and it is the first thing to go wrong in a pipeline that stalls.

Weight, measured: `./progress` 971 B; `./tasks` 9,773 B, because its glyphs and its spinner
style come from the registry; `./box` 24,764 B and `./table` 24,612 B, most of which is the
wrapper and the width function they share, so a program importing both pays for them once.
Every one of them reaches `roundel/tokens` and nothing else — `wrap.ts` carries its own SGR
table, so no built-in pulls `roundel/chalk`. The root entry is 44,348 B, which is the
argument for the subpaths rather than against them.

The width locks are the load-bearing tests: every drawn row of a box is measured to exactly
the width it was given, wide characters included, and no table overruns its own. That is
the bug `width()` exists to prevent, so it is checked rather than assumed.

**Where this lands against R4, stated plainly.** R4 says the five built-ins are registered
through the public `register()` from `builtins.ts`, so that the built-ins cannot grow an
API a plugin cannot reach. What actually goes through that door is what a plugin may
*replace* — the glyphs and the spinner styles — and the lock on it still holds. The five
components do not: they are factories taking options (`progress({ width })`,
`table(rows, { head, align })`), and the schema's `components` shape is a bare
`{ static, frame?, interval? }` with no options at all. So a third-party plugin can
contribute a component, but not a *parameterised* one, and the built-ins have a capability
plugins do not.

That is a real gap in U4, not a technicality, and it is left open on purpose rather than
closed by cheapening the built-ins: the alternative is either to widen the schema to carry
a factory (data that is code, which is what the plugin contract exists to avoid) or to
drop the options and make every caller re-implement a 24-column bar. `plugin-contract` (28)
is where this belongs, because it is the same question across all four layers. Recorded
here so the next reader does not have to rediscover that `register()` and the component
factories are two doors, not one.

## What shipped (R11, the importers — 2026-09-08)

`flagstaff/import`: `fromCliSpinners(json, opts)` and `fromCliBoxes(json)`, each turning a
corpus the caller already has into an ordinary plugin — same `register()`, same schema,
replaceable by another. 838 B, and it reaches **nothing**: its only imports are types,
which `verbatimModuleSyntax` erases, so the file that turns eighty spinners into a plugin
costs less than one of them. Neither corpus is bundled (U5), and a test asserts that
`dependencies` is still exactly `['roundel']`.

Both are graded against the real packages rather than a fixture of our own shape:
`cli-spinners` and `cli-boxes` are devDependencies here, so the day either changes its JSON
the test fails, which is the only way this claim stays true.

**Two things changed to make a corpus a first-class plugin, and both are improvements.**

*The schema gained `borders`*, and the five styles `box()` draws with moved out of
`box.ts` into `builtins.ts` as plugin data, beside the spinners. `box()` now resolves a
named border through the registry, the way `tasks` already resolves its glyphs. That is
what lets `register(fromCliBoxes(cliBoxes))` make `box('…', { border: 'arrow' })` work
without `box.ts` knowing `arrow` exists — and it costs `./box` the plugin host, 24,710 →
34,223 B. A caller who wants neither passes a style object and a bundler drops the rest.
Recorded rather than hidden: this is the price of R11, paid on one subpath.

*The design said the derived `static` should be "the first frame", and that was wrong when
it met the corpus.* A frozen `⠋` or `▰` is an animation stopped mid-stride, not a
projection — it tells a pipe, an agent and a screen reader nothing that `…` does not tell
them better. The default is `'…'`, and `staticFor` is there because it is the author's call
rather than this function's.

## What shipped (U9, the eval — 2026-09-08)

`evals/cases/flagstaff-plugin-from-schema.json`. The prompt gives an agent `schema.json`
and the README and asks for a plugin at a fixed path; the expectations run
`flagstaff check` on whatever it wrote and require exit 0, the `pulse: ok` line, and a
non-empty `pipe` projection.

**The case was proven to discriminate before it was committed**, which is the only thing
that makes an eval worth its runtime: green against a correct plugin, and red against the
same plugin with its `static` removed — where `check` exits 1 with

```
E_NO_STATIC_PROJECTION: pulse has no static projection
  fix: give it a `static`: the text a pipe, an agent or a screen reader gets instead of the animation
```

That refusal *is* the hypothesis. R8 claims an agent can go from the schema to a working
plugin in one turn because `check` tells it what is wrong in terms it can act on; a case
that only ever passed would measure neither half.

What is still unmeasured is the one-turn claim itself — layer 2 needs a credential, and
reports `skipped` without one. So R8's evidence row moves from "hypothesis, measure before
lock" to "measurable", not to "measured". The difference matters and the row says so.

## What shipped (#58, #59 — one door into the registry, a check that grades — 2026-09-09)

Two defects, and the two design decisions that closing them needed. `registered()` handed the
live registry out, so `set`/`delete`/`clear` were a second door past `validate()` (#58); and
`check` invented a state for every component, rendered the wrong thing, and said `ok` (#59).
The code for both is in `plugin.ts` and `cli.ts`; what follows is what the design now owes.

### `sample` on a component (R2, plugin-contract R5/R7)

`sample?: { running, done }` — the two states `flagstaff check` and the docs gallery render a
component with. Without one, `check` prints the shape it assumed rather than assuming it in
silence:

```
  sample      assumed {"running":{"phase":"running"},"done":{"phase":"done"}} — give the component a `sample` to choose its own
```

That line is the whole of #59. A grader that invents a state renders the wrong thing and then
grades its own invention; a grader that says which state it used is wrong out loud, which an
author can act on. When a component *does* declare one, `check` says where it came from.

It is inert data, so plugin-contract R7 — "a plugin is data" — still holds: an object with
two required keys, admitting objects, arrays, strings, numbers and booleans and nothing that
can carry behaviour. The registry deep-copies it and freezes each level on the way out, so an
author who edits their object after `register()` does not write back through the registry.

**caique's widget shape takes the key too.** plugin-contract R5 says a widget is "the same
shape a flagstaff component has"; that requirement is *sameness*, so it is now recorded there
as part of the widget shape. Not implemented here — caique's widget host is its own PR, and
this design records the obligation rather than reaching across a package boundary to meet it.

### The two new exit codes, into the typed union (R8, plugin-contract R8)

`E_NO_CONTRIBUTION` and `E_COMPONENT_THREW` were bare string literals in `cli.ts`, outside
`PluginErrorCode`. Both are now members of it — the union stays the single source, there is no
second list — and `refuse()` in `cli.ts` takes `PluginErrorCode` rather than `string`, so an
invented code on that path fails `typecheck`:

```
packages/flagstaff/src/cli.ts(158,34): error TS2345: Argument of type '"E_MADE_UP"' is not assignable to parameter of type 'PluginErrorCode'.
```

**It costs nothing.** The union is a type, erased at build time, and the comments are
stripped: `./plugin` 11,490 B, `./spinner` 12,418 B, `./box` 35,445 B, `./tasks` 12,829 B and
`.` 49,633 B, byte-identical before and after. No budget moved.

### The lock, and the proof it can fail

The type seam only guards `refuse()`. `scripts/plugin-error-vocabulary-lock.test.ts` guards
the vocabulary itself: it derives the host list from the tree (`src/plugin.ts` exists, the
marker `plugin-schema-lock.test.ts` already uses), reads each host's `PluginErrorCode`
declaration out of its source, and asserts every `'E_…'` literal that host ships is a member —
and that no host declares a code the vocabulary home does not know.

It reads source text rather than importing a `const` array deliberately. plugin-contract R3
forbids one layer importing another, so a runtime list could never be shared with roundel or
caique — the only place R8's claim bites — and it would cost ~195 B on `./spinner`, which has
82 B of headroom against its ora ceiling. The type is the single source; the lock reads it.

**Four mutations, each red before the fix went in.** The first is the one that matters: it is
invisible to the typechecker, because it never goes through `refuse()`.

1. A code emitted straight through `write()`, bypassing the typed seam — `tsc` exits **0**:

   ```
   AssertionError: not in flagstaff's PluginErrorCode; declare it there rather than inline, or this is a code the family never agreed to: expected [ Array(1) ] to deeply equal []

   - Expected
   + Received

   - []
   + [
   +   "packages/flagstaff/src/cli.ts:158 → E_BROKE_LATE",
   + ]
   ```

2. The union reverted to the five it had on main — the exact state this PR found, reproduced:

   ```
   - []
   + [
   +   "packages/flagstaff/src/cli.ts:158 → E_NO_CONTRIBUTION",
   +   "packages/flagstaff/src/cli.ts:173 → E_COMPONENT_THREW",
   + ]
   ```

3. roundel declaring an `E_BAD_TOKEN` flagstaff does not know — a downstream layer forking
   the vocabulary, which is R8's actual failure mode:

   ```
   AssertionError: declared in roundel but not in flagstaff — add it there too, so one author's fix reads the same in every layer (R8): expected [ 'E_BAD_TOKEN' ] to deeply equal []
   ```

4. An invented code through `refuse()` — caught by `typecheck`, quoted above.

## Accepted at the Design→Build gate (2026-09-09)

Recorded next to what it governs, not in a commit message: repo rule 1 is that a decision
living only in a chat log cannot be reviewed, diffed or replayed, and rule 3 is that a human
accepts at Design→Build — not the agent that wrote the code.

**The optional `sample`, and caique taking the key too.** Accepted. R7 holds because the key
is inert data. *The alternative not taken:* scope `sample` to flagstaff and let caique's
widget shape diverge — cheaper now, and it spends plugin-contract R5, because two shapes that
differ by a key are two shapes to document and no lock can call them one.

**The two exit codes into the typed union.** Accepted, with the lock. *The alternative not
taken:* take the behaviour and leave the vocabulary untyped as a follow-up — which is how the
codes came to be literals in the first place. The refusals work either way, so nothing would
have forced the follow-up, and R8 would have stayed a claim no check could test.


### Note added 2026-09-16 — what this acceptance did not have in front of it

**The acceptance above stands as given and is not rewritten here; this note is not a second
one.** It records a fact about the document the acceptance was given on, so that whoever gave
it can decide whether it still holds.

On 2026-09-09, and until today, this design recorded a per-requirement status for **four of
its twelve requirements** — R4, R6, R11 and R12, each through a `## What shipped (…)` heading.
The other eight — R1, R2, R3, R5, R7, R8, R9, R10 — had no status in either shape
`scripts/plan-progress.ts` reads, which is what `designGap('flagstaff')` reported in those
words. The two decisions accepted above are narrow and each is argued on its own; what the
signature sat on top of was a requirements list eight rows of which said nothing about whether
they had been met.

They now do, in [§ What is built (2026-09-16)](#what-is-built-2026-09-16), established from
`packages/flagstaff/src/` rather than from this document's prose about itself. Of the eight,
**six read `Built`** (R1, R2, R3, R5, R7, R9) and **two read `Not built`** (R8 and R10; R8
was built on 2026-09-22) — and
one of the four that already had a heading, R4, reads `Not built` too, against the same
`## What shipped (R4, …)` entry that concedes the gap in its own last paragraph. Seven
requirements were restated where the wording, not the code, was what was wrong.

Rule 3 is why this is a note and not an edit to the line above it: the agent that wrote the
code does not approve it, and the same agent line reconciling a design cannot retire a
human's signature on it or write a replacement. Three red rows and seven restatements are a
material change to what the accepted document says; whether the acceptance survives that is
the owner's call, not this lane's.

## The surface a consumer gets, derived from the tree (2026-09-15)

R1–R11 say what flagstaff is *for*, and the "What shipped" log says how it got here. Neither
is a list a consumer can scan, and flagstaff has the largest `exports` map in the family —
fourteen entries and a `bin`. This is that list.

**Derived, not transcribed.** One row per entry in `packages/flagstaff/package.json`'s
`exports` map; the names are the exported declarations of the source file each subpath's
`dist/` path is built from. Re-derive with `node -p "Object.keys(require('./packages/flagstaff/package.json').exports)"`
and `grep '^export' packages/flagstaff/src/<file>.ts`.

| Subpath | What a consumer gets | What it is for |
| :-- | :-- | :-- |
| `flagstaff` | `export *` of `box`, `import`, `loop`, `plugin`, `progress`, `spinner`, `table`, `tasks` — the core, and **no façade and no CLI** | the whole engine in one import |
| `flagstaff/loop` | `hoist`, `manualClock`; `Runtime`, `Hoisted`, `ManualClock` | raise a component, update it, lower it — and the fake clock that makes a frame sequence a fixed string |
| `flagstaff/plugin` | `register`, `validate`, `registered`, `lookupSpinner`, `lookupBorder`, `glyph`, `CONTRACT`, `PluginError`; `Plugin`, `Component`, `SpinnerDef`, `BorderStyle`, `PluginErrorCode` | the extension point — see below |
| `flagstaff/spinner` | `spinner`; `SpinnerState`, `SpinnerStatus` | a spinner component over a registered style |
| `flagstaff/progress` | `progress`; `ProgressState`, `ProgressOptions` | a progress bar whose static projection is a counted line |
| `flagstaff/tasks` | `tasks`; `Task`, `TaskStatus`, `TasksState`, `TasksOptions` | a task list whose static projection is the settled tasks |
| `flagstaff/box` | `box`, `boxComponent`; `BoxOptions`, `BoxState` | a bordered box as a string, or as a component |
| `flagstaff/table` | `table`, `tableComponent`; `Row`, `TableOptions`, `TableState` | a grid as a string, or as a component. **This is not the cli-table3 façade** — see below |
| `flagstaff/import` | `fromCliSpinners`, `fromCliBoxes`; `CliSpinner`, `CliBox`, `FromCliSpinnersOptions`, `FromCliBoxesOptions` | turn a cli-spinners or cli-boxes corpus the caller already has into a `Plugin` object |
| `flagstaff/ora` | default `ora`, `Ora`, `oraPromise`, `spinners`; `Options`, `PersistOptions`, `PromiseOptions`, `OraStream`, `Color`, `Affix`, `SpinnerDefinition` | the drop-in path for `ora` (R6) |
| `flagstaff/log-update` | default, `createLogUpdate`, `logUpdateStderr`; `LogUpdate`, `LogUpdateStream`, `LogUpdateOptions` | the drop-in path for `log-update` (R6) |
| `flagstaff/boxen` | default `boxen`, `_borderStyles`; `BoxenOptions`, `BoxenBorderStyle`, `Spacing` | the drop-in path for `boxen` (R6) |
| `flagstaff/cli-table3` | default `Table`, plus `Cell`, `ColSpanCell`, `RowSpanCell`, `strlen`, `pad`, `truncate`, `wordWrap`, `hyperlink`, `mergeOptions`, `makeTableLayout`, `computeWidths`, `computeHeights`; `TableChars`, `TableStyle`, `TableOptions` | the drop-in path for `cli-table3` (R6). The internals are exported because its suite grades them |
| `flagstaff/schema.json` | the family plugin schema, as a file | what a plugin author or an agent validates against |
| `bin: flagstaff` | `flagstaff check <file>` | load a plugin file, register it, render every contribution in all five modes, and grade it |

**`flagstaff/table` and `flagstaff/cli-table3` are two different products**, and R6 conflates
them. `./table` is the built-in grid component of R4; `./cli-table3` is the graded drop-in.
A reader following R6's text imports the wrong one. Recorded below rather than fixed by
editing R6.

### How a consumer extends it

Flagstaff hosts **five keys** — more than any other layer — and it is the only host that
validates against `schema.json` rather than by hand. `packages/flagstaff/src/plugin.ts` and
`packages/flagstaff/src/schema.json` are the truth together: `plugin.ts` walks the subset of
JSON Schema the file uses, then adds two checks the schema cannot express.

| Key | What a plugin contributes | Shape |
| :-- | :-- | :-- |
| `tokens` | a roundel theme | a token name to `#rrggbb` |
| `glyphs` | the symbols every built-in draws its statuses with — `ok`, `fail`, `warn`, `info`, `running` | a meaning to a non-empty string |
| `spinners` | spinner styles | `{ frames: string[], interval: integer ≥ 1, static: string }`, all three required |
| `borders` | box border styles | cli-boxes' eight corner and edge keys, exactly, all required |
| `components` | whole renderables | `{ static, frame?, sample?, interval? }` — `static` required |

`name` is required; `contract` is optional and must not exceed `CONTRACT`, which is `1`.

**Everything is data except two functions, and that is the contract.** A component's `static`
and its optional `frame` are the only behaviour a plugin may carry. `sample` — the two named
states `flagstaff check` and the docs gallery *show* the component with — is inert data, and
the registry deep-copies and freezes it, so declaring one does not hand the registry a
reference into the author's own object. The loop never reads `sample`: a running component's
state comes from the program.

**What is validated, and in what order.** `validate()` walks the plugin against the schema
first, so the refusal names a path (`plugin.spinners.moon.static: required`). A missing
`static` under `spinners` or `components` is then re-raised with its own code, because it is
the one mistake a plugin author makes on purpose. After the schema: `contract` is compared,
and every component's `static` is re-checked as an actual function — JSON Schema can say the
key must be present but not that its value is callable.

**What is refused, with which code.**

| Code | Raised by | When |
| :-- | :-- | :-- |
| `E_PLUGIN_SCHEMA` | `validate()` | anything the schema walk rejects |
| `E_NO_STATIC_PROJECTION` | `validate()` | a spinner or component with no `static`, or a component whose `static` is not a function |
| `E_PLUGIN_CONTRACT` | `validate()` | a `contract` newer than this flagstaff knows |
| `E_UNKNOWN_SPINNER` | `lookupSpinner()` | a style nobody registered — the message lists the styles that exist |
| `E_UNKNOWN_BORDER` | `lookupBorder()` | a border nobody registered, same listing |
| `E_NO_CONTRIBUTION` | `flagstaff check` | the plugin validates and contributes nothing flagstaff can render — how a misspelled top-level key tells on itself |
| `E_COMPONENT_THREW` | `flagstaff check` | a component's `static` threw on the state it was shown with, naming the modes it broke in |

`E_UNKNOWN_KIND` is an eighth member of the same union. It is caique's, and it lives here
because this union is the vocabulary every host in the family shares (plugin-contract R8).

**What happens on a bad plugin.** `register()` calls `validate()` first and throws a
`PluginError` — `code`, `message`, `fix` — before touching the registry, so a refused plugin
changes nothing. `flagstaff check <file>` is the same door with a report around it: exit 2 on
a usage error, exit 1 on a refusal, exit 0 with a per-mode rendering otherwise.

**What a plugin may and may not decide.**

- **It may replace a built-in glyph, spinner or border.** The built-ins go through the same
  public `register()` at import, so a later registration of the same name wins. That is the
  intended override path.
- **There is no `reset()` and no way to unregister.** Flagstaff is the only host in the
  family without one; roundel, caique, closeout and bellpull all have it. A program that
  wants to re-plug at runtime cannot, and a test must tolerate what an earlier test
  registered. Recorded below.
- **There is no `contributions()`.** `registered()` returns copies of the five `Map`s, so a
  caller can see *what won* but not *who was shadowed*. The other four hosts report shadowing.
- **A plugin cannot reach the registry except through `register()`.** `registered()` hands
  back copies for exactly this reason: handing the live `Map`s out made `set` and `delete` a
  second door through which a spinner with no `static` could arrive without meeting
  `validate()`.
- **Keys flagstaff does not read are allowed and are not an error.** `check` lists them under
  `unknown` with the sentence "a key another package in the family reads is allowed here",
  which is what makes one plugin object work across whatever subset of the family is
  installed. Note that `capabilities` — paratext's key, and the one block of the shared schema
  flagstaff does not read — is reported this way too.

### What flagstaff does not do, and why

Beyond "Out of scope" below:

- **No layout engine.** `box` and `table` are string functions over `width` and `wrap`, which
  live in `linegauge` and arrive here as imports. R7 locks the declaration, not the filename,
  because a `readdir` filter for `layout*` waves through a layout engine called `measure.ts`.
- **No signal handling of its own.** `src/runtime.ts` records that no file here installs a
  signal listener any more; the cursor and the exit paths are `closeout`'s.
- **It bundles no corpus into the core.** `flagstaff/import` turns a corpus the *caller*
  supplies into a plugin. The single exception is `flagstaff/ora`, which re-exports
  cli-spinners' corpus because ora's `spinners` export is part of the API being graded, and
  the isolation lock keeps every other entry away from it.

## What shipped (R12, the hyperlink — 2026-09-16)

`flagstaff` is the first package in the family to depend on `paratext`. `.sdlc/bands/composition.json`
had `paratext` on `awaiting` with the reason *"needs a narrow `paratext/link` subpath with no
registry side effect"*; that subpath shipped on 2026-09-15, so this is the edge it was waiting
for. `edges` 8 → 9.

**Which paratext entry, measured rather than assumed.** `paratext/link` — **2,410 B** across
four modules (`link`, `runtime`, `supports`, `template`), registering nothing. The root is
**20,221 B** across ten and runs `registerBuiltins()` at import, which a package declaring
`sideEffects: false` should not put in a bundler's graph. 17,811 B of difference against a
`./table` entry whose whole budget was 4,000 B. Measured in paratext's own `dist/`, because
flagstaff's `walk()` stops at a bare specifier and would have reported the two as identical.

**What it cost here.** `./table` +1,675 B (3,316 → 4,991, budget 4,000 → 6,000), `./box`
+1,502 B (17,282 → 18,784, budget 18,500 → 20,000), `.` +2,058 B (29,874 → 31,932, budget
unchanged at 33,000), `./cli-table3` +109 B (28,759 → 28,868, budget unchanged at 29,000 and
now 132 B inside it). The bytes are `src/link.ts` (1,038 B) and the `runtime.ts` seam (81 B),
not an OSC 8 implementation — there is none in this package.

**Degradation is paratext's to decide, and it is graded both ways.** `src/link.ts` asks
`supportsLink(runtime)` for *layout* — off a terminal the url is content and belongs in the
columns, on one it is carried by a sequence that measures zero — and `linkFor(runtime)` for
the bytes. No file here names `isTTY` or `TERM` to make that call. `link.test.ts` writes every
expectation as *what `paratext/link` returns for the same input*, so an expectation spelled
`]8;;…` could not silently pass against a hand-rolled copy; the `TERM=dumb`-on-a-tty case
is the one that proves the runtime is passed through rather than re-derived.

**The inline copy is gone.** `cli-table3.ts` held the only other OSC 8 in the package — an
array-joined sequence in `hyperlink()` and a `HYPERLINK_TAG` terminator. Both now come from
paratext. The façade still emits unconditionally, because upstream's `hyperlink()` is an
escape builder and `utils-test.js` grades its exact bytes with no terminal in the call; the
runtime it is rendered against is a named constant saying so. cli-table3 still grades **29 /
29**, and the whole oracle is unchanged at ▲ 0 on every row. The standing rule is now a lock:
*no published file in this package spells an OSC 8 sequence of its own*, read off `dist/` so
that `cli-table3.ts`'s prose about upstream issue #338 does not trip it. Proven to fail — with
the previous `cli-table3.ts` restored and rebuilt, that case is the one and only red, while
the two byte-identity cases stay green.

## Where this document and the code disagree (2026-09-15)

Recorded rather than tidied away. Flagstaff's design is the oldest and longest in the family
and has been edited forward eight times; most of what follows is a requirement that was
corrected in a "What shipped" entry below but never in the requirement itself, which means a
reader who stops at the requirements list is misled.

- **R6 names `flagstaff/table` as the cli-table3 façade.** It is not. `./cli-table3` is the
  façade; `./table` is the built-in grid component of R4. Two different modules, and the one
  R6 names is the wrong one.
- **R6's façades are recorded as unbuilt while two of them ship.** The "What shipped" log
  still says the boxen and cli-table3 façades are *"not yet … blocked on a decision rather
  than a port"*, and there is no shipped entry for either — while `src/boxen.ts` and
  `src/cli-table3.ts` exist, are in the `exports` map, carry weight budgets in
  `src/weight.test.ts`, and are named in `packages/compat-oracle/src/demand.ts`.
- **R10's "Depends on `roundel` only" is false, and the test now asserts the opposite.**
  `package.json` declares `closeout`, `linegauge` and `roundel`. R10 says a test asserts
  `dependencies` is exactly `['roundel']`; `src/shape.test.ts` asserts the three-element list,
  under the heading "0 external, 3 same-repo". The requirement was overtaken and not rewritten.
- **R4's "built-ins … are registered through the public `register()`" is true of three kinds
  and false of the five it names.** `src/builtins.ts` carries `glyphs`, `spinners` and
  `borders` and **no `components` key**; the five components named in R4 — `spinner`,
  `progress`, `tasks`, `box`, `table` — are exported functions, not registry entries. A
  shipped entry below concedes this; R4 does not.
- **R8 attributes two codes to `register()` that it cannot raise.** `E_UNKNOWN_SPINNER` and
  `E_UNKNOWN_BORDER` come from `lookupSpinner()` and `lookupBorder()`. `validate()` raises
  three codes, not five. And `check` never calls `lookupBorder`, so `E_UNKNOWN_BORDER` is
  unreachable from the command R8 is about. *Fixed 2026-09-22: R8 restated.*
- **R8's "each carrying a code … and a `fix`" does not hold on one path.** `cli.ts` calls
  `spinner(style)` outside its `try`/`catch`, so a `PluginError` from that call lands in the
  rejection handler, which writes the message alone — no code prefix, no `fix` line — and
  exits 1. *Fixed 2026-09-22: that handler is now the one every refusal leaves through.*
- **R8 says "all seven are members of one union"; the union has eight.** The eighth is
  `E_UNKNOWN_KIND`, caique's, added when that host landed. The design mentions it nowhere.
  *Fixed 2026-09-22: R8 names all eight.*
- **R1's `hoist` signature is wrong.** It is not `hoist(component, rt)`: `initial` is a
  required third argument and an options object a fourth, and the returned value carries a
  readonly `mode` alongside `update` and `lower`.
- **R1's "through `node:readline` cursor ops" is not what the code does.** `src/projection.ts`
  writes CSI sequences by hand and imports nothing from `node:readline`. A shipped entry
  records this; R1 does not.
- **R3's plugin shape is short by two keys.** It says `{ name, spinners?, glyphs?, tokens?,
  components? }`. The type and the schema also carry `contract?` and `borders?`, and `borders`
  is a contribution kind with its own lookup and its own error code.
- **R7 names a `columns` function that does not exist.** No `columns` export exists anywhere
  in `packages/`. The two string functions are `box()` and `table()`.
- **R11 describes a `static` the importers do not derive.** R11 says the derived `static` is
  "the first frame, or the label"; `src/import.ts` defaults it to an ellipsis. R11 also says
  the importers turn the corpora "into registered plugins" — they return a `Plugin` object and
  register nothing, which is the right design and the wrong sentence.
- **The `src/` tree in the `## Design` section does not match the package.** It lists
  `width.ts`, `components/` and `facades/`; `src/` is flat and has none of them. The
  ora and log-update entries further describe `src/width.ts`, `src/wrap.ts`, `src/cursor.ts`
  and their tests as flagstaff's own files — all four now live in `linegauge` or `closeout`,
  and the design has a whole subsection about `src/cursor.ts` that no longer describes a file
  in this package.
- **"log-update … reaches no package at all, not even roundel" is no longer true.** Its weight
  test allows `closeout/cursor`, `closeout/restore-cursor` and `linegauge/wrap`.
- **R5 is stated as an invariant of the package and one shipped subpath is exempt.**
  `src/log-update.test.ts` records that `flagstaff/log-update` writes cursor escapes off a
  terminal, because its incumbent's suite requires it, and narrows the assertion to the
  carriage return. The exemption is real and correct; the design never records it.
- **Every byte figure in this document is stale but two.** The budgets in
  `src/weight.test.ts` are the live numbers and five of them were deliberately raised on
  2026-09-14 for the capability schema; the design's sentence "No budget moved" predates that.
  No figures are restated here — a number copied into prose rots separately from the
  assertion that holds it, which is how this list got long.
- **`apps/docs` does not copy `schema.json` into `llms.txt`,** and the docs gallery is not
  rendered at docs build time from `static('running')`: `gallery.mdx` is a committed file
  written by `scripts/gallery-page.ts` under its own `npm run` script, and it renders through
  `hoist()` in all five modes with sample states.
- **The `examples/` conformance cases the Verification section promises do not exist.** No
  file under `examples/` mentions flagstaff. The equivalent coverage is in-package, in
  `src/builtins.test.ts` and `src/cli.test.ts`.
- **`./schema.json` and `./boxen` and `./cli-table3` are shipped subpaths this design never
  names as exports.** The schema is described as "shipped in the tarball" and is also an
  export map entry a consumer can import.

## What is built (2026-09-16)

**One row per requirement, established from the tree rather than from this document's prose
about itself.** Until today this design recorded a status for four of its twelve requirements
— R4, R6, R11 and R12, each through a `## What shipped (…)` heading — and
`designGap('flagstaff')` reported *"R1, R2, R3, R5, R7, R8, R9, R10 not recorded as built"*.
Eight of twelve had no status of any kind, and the design carried a Design→Build acceptance
anyway. That is the case PLAN D3's own note names: *"the grep proves the wording landed; it
cannot prove a human meant it."* The dated note under the acceptance says so where the
acceptance is.

**The Status cell holds two words and nothing else**, `Built` or `Not built`, because the
checker matches `**Built**` exactly. A row saying `Built` without a check in the last column
is a claim, so every row names one; two rows read `Not built`, and that is the point of
having the column rather than a defect in it.

| R | Status | Where | The check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `src/loop.ts` — `hoist()`, the mode from `roundel/policy` and nothing computed here; `src/projection.ts` — the four writers, the only module that emits a cursor op. Signature, the `readline` claim and the pipe wording all restated below | `loop.test.ts` → *"R1 · one component, five modes"*: the tty transcript, the NDJSON events on stderr with stdout untouched, the no-frame case, the multi-line erase, and `update`/`lower` after `lower` |
| R2 | **Built** | `src/plugin.ts` — `Component<S>` is `{ name, static, frame?, sample?, interval? }`; `validate()` raises `E_NO_STATIC_PROJECTION` with a `fix` for a missing `static` and for a `static` that is not a function; the registry deep-copies and freezes `sample` on the way out | `plugin.test.ts` → *"R2 · a contribution without a static projection is refused"* (both cases), *"a registered contribution is frozen"*, *"mutating the object you registered does not change what was registered"*; `cli.test.ts` → *"names the state a component was rendered with, and takes the component's own when it declares one"* |
| R3 | **Built** | `src/plugin.ts` walks `src/schema.json` — the sixty-line subset validator, no JSON Schema dependency — and `dist/schema.json` ships in the tarball as `flagstaff/schema.json`. The key list is two short in R3's text and is restated below | `plugin.test.ts` → *"R3 · validated against schema.json"*, *"a newer contract than this host knows is refused with the upgrade named"*, and *"the shipped schema is the source schema"* |
| R4 | **Built** | Restated by D-125: glyphs, spinners and borders — the contribution kinds — are registered through the public door (`src/builtins.ts` is a plugin like any other); `spinner`, `progress`, `tasks`, `box` and `table` are factories taking options the component shape cannot express, and are not contributions | `plugin.test.ts`; `scripts/plugin-example-lock.test.ts` registers the same kinds from outside |
| R5 | **Built** | `src/projection.ts` — only `TtyProjection` writes `HIDE_CURSOR`, `SHOW_CURSOR` or a CSI erase; `staticProjection` and `jsonProjection` are text and a newline. One shipped subpath is exempt and the exemption is restated below | `loop.test.ts` → *"R5 · off a terminal, no carriage return and no cursor escape"*; `builtins.test.ts` → *"R5 · every built-in is text off a terminal"*; `ora.test.ts` → *"R5 · a migrated spinner on a pipe writes text and nothing else"*, incl. the CI case where the stream claims to be a terminal; `log-update.test.ts` → *"R5 · the façade writes no carriage return, on a terminal or off one"* and *"never a bare cursor-home either"* |
| R6 | **Built** | All four façades ship as their own subpaths and all four are graded by the incumbent's own suite. R6 names `flagstaff/table` as the cli-table3 façade and that is the wrong module — restated below | `npm run compat`, 2026-09-16: `ora` **99 / 99**, `log-update` **99 / 99**, `boxen` **84 / 84**, `cli-table3` **29 / 29**, every row **100.0% ▲ 0** |
| R7 | **Built** | No `layout*` or `measure*` module, and no width or wrap pass declared here: `width` and `wrap` are imported from `linegauge`, which is where they have lived since F1. `box()` and `table()` are string functions. `columns` restated below | `plugin.test.ts` → *"R7 · no layout engine"* → *"src/ has no layout module"* and *"no module here declares a width or measure pass of its own — every one comes from linegauge"*, which locks the declaration rather than the filename |
| R8 | **Built** | Every `PluginError` reaching `check` leaves through the one rejection handler in `src/cli.ts`, which prints it with its code and its `fix` and exits 1 — `main()`'s `try` around `register()` alone was deleted, because it covered one call and a plugin file that registers itself on import throws before it. R8's code inventory is restated above: five codes `check` emits, in a union of eight | `cli.test.ts`: *"a refusal raised outside register()'s own try still carries its code and its fix (R8)"* — red on the build before the handler, where stdout was empty and the message went to stderr bare. `scripts/plugin-error-vocabulary-lock.test.ts` holds the vocabulary |
| R9 | **Built** | `src/loop.ts` — `manualClock()` moves only when told, with a `TICK_CAP` so a callback that reschedules itself at 0 ms throws rather than hanging; `src/projection.ts` takes the clock as an argument and reaches no timer of its own | `loop.test.ts` → *"R9 · deterministic"* → *"the tty transcript is the same bytes twenty runs over"*, plus the three `manualClock` ordering cases |
| R10 | **Built** | Both halves closed 2026-09-23. **The ceilings:** four measured gates in the B4 axis, tree-inclusive and bundled by the same command on both sides — `flagstaff/spinner ÷ ora` **0.145**, `flagstaff/box ÷ boxen` **0.338**, `flagstaff/table ÷ cli-table3` **0.433**, `flagstaff/cli-table3 ÷ cli-table3` **0.707**, beside the existing `flagstaff/log-update ÷ log-update` — each gated ≤ 1 and each a published claim (#449). Tree-inclusive because own-code-only `./box` is 15,825 B against boxen's single 10,923 B file, and boxen brings eight dependencies flagstaff's walk would not count. **The dependency sentence:** *"depends on `roundel` only"*, false since 2026-09-09, is restated to the four same-repo dependencies under D-130 (#463), which is exactly what `shape.test.ts` asserts | `benchmarks/claims.ts` (the four `lighter-than-*` rows), `benchmarks/fixtures/entry-points.ts`, `shape.test.ts`, `weight.test.ts`, `subpath-isolation.test.ts` |
| R11 | **Built** | `src/import.ts` — `fromCliSpinners(json, opts)` and `fromCliBoxes(json)`, 838 B against a 2,000 budget, reaching nothing (its only imports are types). Neither corpus is bundled. Two sentences of R11 are wrong as written and are restated below | `import.test.ts` grades both against the real `cli-spinners` and `cli-boxes` packages, held as devDependencies so the day either corpus changes the test fails; its last case asserts neither became a dependency. `weight.test.ts` `'./import'` pins 838 B |
| R12 | **Built** | `src/link.ts` — `painter()`, `laid()`, `painted()`, `cellText`/`cellHref`; the OSC 8 bytes are `paratext/link`'s and no published file here spells the sequence. the narrow `paratext/link` entry was chosen over the root — which runs `registerBuiltins()` at import, in a package declaring `sideEffects: false` — and the difference was measured in paratext’s own `dist/` rather than assumed, because flagstaff’s `walk()` stops at a bare specifier and would have called the two identical. The live figures are `weight.test.ts`’s asserted `measured` fields, not this document’s prose | `link.test.ts` writes every expectation as *what `paratext/link` returns for the same input*, so a hand-rolled copy could not pass; the `TERM=dumb`-on-a-tty case proves the runtime is passed through rather than re-derived; the last case is the standing rule as a lock, read off `dist/` — no `]8;;` in this package's published output — and is proven to fail against the previous `cli-table3.ts`. `cli-table3` still grades **29 / 29 ▲ 0** |

### Requirements restated (2026-09-16), with the old wording kept

A bar that is restated and then vanishes is indistinguishable from one that was quietly met.
Each of these keeps the sentence it replaces. None of them changes what the package does;
they change what this document claims it does.

- **R1's signature.** *Was:* "`hoist(component, rt)` returns `{ update(state), lower() }`".
  *Is:* `hoist(component, rt, initial, opts?)` returns `{ mode, update(state), lower(final?) }`
  — the initial state is required, `{ json }` is the fourth argument, `lower()` takes an
  optional final state, and the returned object carries a readonly `mode` so a caller can see
  which projection it got.
- **R1's cursor mechanism.** *Was:* "it repaints in place through `node:readline` cursor ops".
  *Is:* `src/projection.ts` writes the three CSI sequences it needs by hand and imports nothing
  from `node:readline`, whose helpers want a `Writable` where the loop has only a `Writer`.
  `HIDE_CURSOR` and `SHOW_CURSOR` come from `closeout/cursor`, and the restore is registered
  through `closeout`'s `onExit` so a signal mid-frame still puts the cursor back.
- **R1's pipe writer.** *Was:* "on `pipe` and `ci` it writes `component.static(state)` once per
  *state change*". *Is:* it writes **the lines past the common prefix** of the new projection
  and the last one. A component whose text replaces itself is printed whole, which is the
  ordinary case; one that grows a line at a time — `tasks`, whose static is every task that has
  settled — is appended to rather than reprinted, and an empty projection writes nothing at
  all. Printing the whole static every time would repeat every line already in the log, which
  is what a pipe is not for.
- **R3's plugin shape.** *Was:* "`{ name, spinners?, glyphs?, tokens?, components? }`". *Is:*
  `{ name, contract?, tokens?, glyphs?, spinners?, borders?, components? }` — `borders` is a
  contribution kind with its own lookup and its own error code, added when `fromCliBoxes()`
  made a corpus a first-class plugin, and `contract` is what `E_PLUGIN_CONTRACT` compares.
- **R5's scope.** *Was:* stated as an invariant of the package. *Is:* an invariant of **the
  loop and every built-in**, with `flagstaff/log-update` exempt: its incumbent's own suite
  requires cursor escapes off a terminal, so `log-update.test.ts` narrows the assertion to the
  carriage return and to "never a bare cursor-home — every move is a row move". The exemption
  is real, correct, and was never recorded here. R5's "a conformance case greps a piped run"
  is also restated: no file under `examples/` mentions flagstaff, and the equivalent coverage
  is in-package, in `loop.test.ts`, `builtins.test.ts` and `cli.test.ts`.
- **R6's fourth façade.** *Was:* "`flagstaff/table` (cli-table3)". *Is:* **`flagstaff/cli-table3`**.
  `./table` is the built-in grid component of R4 and `./cli-table3` is the graded drop-in; they
  are two different products, and a reader following R6 imports the wrong one.
- **R7's `columns`.** *Was:* "`box` and `columns` are string functions over `width`/`wrap`".
  *Is:* `box()` and `table()`. No `columns` export exists anywhere in `packages/`. R7's
  parenthetical "(`src/width.ts` was where they lived when this line was written.)" is also
  spent: `width` and `wrap` are `linegauge`'s and arrive here as bare imports.
- **R11's two wrong sentences.** *Was:* the importers "turn the two existing data corpora …
  into registered plugins" with a derived `static` of "the first frame, or the label". *Is:*
  they **return** a `Plugin` object and register nothing — the caller calls `register()`, which
  is the right design and was the wrong sentence — and the derived `static` defaults to `'…'`,
  with `staticFor` there because it is the author's call. A frozen `⠋` is an animation stopped
  mid-stride, not a projection.

### What this reconciliation found that the design does not record

Everything under "Where this document and the code disagree (2026-09-15)" still stands and is
not repeated here. These are additions.

- **`flagstaff/cli-table3` has no B4 pair.** `benchmarks/fixtures/entry-points.ts` pairs
  `flagstaff/ora`, `flagstaff/boxen` and `flagstaff/log-update` against their incumbents and
  stops there, so the fourth façade — the one R6 misnames and the one R12 just changed — has no
  tree-inclusive weight ratio and no ratio gate. This is the same hole `linegauge`'s R9 and
  `paratext`'s R11 were red on, in the same file, and neither this lane nor those could write
  it: `benchmarks/**` is the integrator's. Reported, not edited.
- **The ora entry's `process` paragraph is stale.** It says "`process` is read here, and the
  process-reference lock lists the file with the reason". The lock lists exactly one flagstaff
  file — `flagstaff/src/runtime.ts` — and `ora.ts`, `boxen.ts` and `log-update.ts` each reach
  the process only through `processRuntime()` from that seam. The behaviour the paragraph
  describes is unchanged and correct; the file it attributes it to is not.
- **Every façade budget is a ratchet on this package's own history, not on its incumbent,
  except `./spinner` and `./log-update`.** Named in R10's row above. The published claim is
  B4's ratio, and `weight.test.ts` says as much in its own header — but R10's text promises a
  ceiling named after the incumbent for four entries and two of them do not have one.

## Rejected alternatives

- **A React reconciler (Ink's model).** React plus yoga is the dependency bill this layer
  exists to remove, and a React tree has no static projection.
- **A layout engine.** U8. Box and columns are string functions; the day someone needs
  flexbox is a recorded decision.
- **Plugin discovery through `package.json`.** Configuration by another name (Z1);
  explicit `register()` only.
- **Character plugins as a separate concept.** A spinner with named states is the same
  shape; a new key would be a second contract to document.
- **Emitting `--json` events on stdout.** stdout is the envelope's; events go to stderr
  as NDJSON so a JSON consumer never sees them interleaved.

## Out of scope

- Full-screen applications, alternate screen buffer, mouse, key input (that is `caique`
  for prompts; anything more is a TUI framework and a different product).
- Ink and listr2 façades (umbrella).
- Windows legacy console quirks beyond what `node:readline` already handles.
