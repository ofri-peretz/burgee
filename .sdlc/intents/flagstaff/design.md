# Design — flagstaff

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1** `hoist(component, rt)` returns `{ update(state), lower() }`. On `tty` it repaints
  in place through `node:readline` cursor ops on a clock injected via `rt.clock`
  (`now()`, `schedule(fn, ms)`); on `pipe` and `ci` it writes `component.static(state)`
  once per *state change*; on `json` it writes one NDJSON event
  `{ "event": "<name>", "state": … }` per change to `rt.stderr`; on `accessible` it writes
  the static text with no cursor ops. Mode comes from `roundel/policy`, never computed here.
- **R2** A component is `{ name, static(state): string, frame?(t, state): string }`;
  `register()` throws `E_NO_STATIC_PROJECTION` with `fix` when `static` is missing.
- **R3** A plugin is `{ name, spinners?, glyphs?, tokens?, components? }`, validated at
  `register()` against `schema.json` shipped in the tarball. A spinner is
  `{ frames: string[], interval: number, static: string }`.
- **R4** Built-ins `spinner`, `progress`, `tasks`, `box`, `table` are registered through
  the public `register()` from `src/builtins.ts`; a test asserts no private path exists.
- **R5** Under any mode but `tty`, the output contains no `\r` and no ESC sequence; a
  conformance case greps a piped run.
- **R6** Façades, each its own subpath and graded by the incumbent's suite in
  `compat-oracle`: `flagstaff/ora`, `flagstaff/log-update`, `flagstaff/boxen`,
  `flagstaff/table` (cli-table3).
- **R7** No layout engine: `src/` has no `layout*` file and no measure pass; `box` and
  `columns` are string functions over `string-width`-equivalent logic in `src/width.ts`.
- **R8** `flagstaff check <file>` (the package `bin`) loads a plugin file, validates it, and
  prints its rendering in all five modes side by side; exit 1 on a schema error.
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
  vendored. Depends on `roundel` only.

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
| R8 | clack #533 (9 comments, agents driving CLIs), #525; Inquirer D#1699 (a binary per prompt for scripts); ink D#776 (an author records asciinema so an agent can see the app) — U9 | hypothesis — the one-turn eval that `check` serves is unmeasured; measure before lock |
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
port — see `output-stack-compat`); the U9 eval; the docs gallery. `tokens` are kept in the registry for whoever flies
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

The weight: 45,549 B for the subpath, 63,627 B with `roundel/chalk` counted, against ora's
own 112,688 B across seventeen packages — 56%, in two packages instead of seventeen. R10's
ceiling is met and recorded in `weight.test.ts` with the measurement beside it.

`process` is read here, and the process-reference lock lists the file with the reason:
`process.stderr` is ora's default stream, stdout and stderr are what it hooks so a
`console.log` lands above the frame, stdin is what the discarder puts in raw mode, and its
suite swaps all four per test. Every other file in the package takes its world as an
argument.

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
strip-ansi is `node:util`, and ansi-escapes and cli-cursor are twenty lines.

**It carries no port of `slice-ansi`, and that is a design decision rather than a gap.**
log-update clips a frame to the terminal's height by asking `sliceAnsi` to drop a computed
number of visible columns and then correcting the estimate in a loop, because a slice in
the middle of a styled run has to reopen the styles that were active at the cut. But
`wrap()` has already closed every style at a row break and reopened it after — that is what
makes each row stand on its own — so after wrapping, clipping is `lines.slice(n)`, and
needs no ANSI state tracking at all. 1,070 lines of tokenizer are not written, and the
host's own suite cannot tell the two implementations apart.

The weight: 28,660 B for the subpath, against log-update's own 113,368 B across sixteen
packages — and it reaches **no package at all**, not even roundel. `wrap.ts` carries the
SGR close codes itself, because bold opening with 1 and closing with 22 is ECMA-48 rather
than any library's table; that took `roundel/chalk` off the wrapper and off `./box` and
`./table` with it. Sixteen packages become none, at a quarter of the bytes. `width.js` is
shared with `./ora`; neither façade reaches the other, and neither reaches the core.

`wrap.ts` is the third piece of shared machinery, after the width function and the spinner
corpus, and it is the one `box` and `table` need next — which is why it is its own module
rather than folded into the façade that first wanted it.

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
