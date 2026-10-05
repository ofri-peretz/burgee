# Design — caique

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-09-23, under the owner's delegation, D-129).

---

## Requirements

- **R1** `PromptSpec = { kind: 'text' | 'confirm' | 'select' | 'multiselect' |
  'password' | 'path'; message: string; initial?; validate? }` attached to an option
  (schema `prompt:` or `promptFor(cmd, 'option', spec)`).
- **R2** Resolution in `preAction` after `commander-env`: if the option has a value
  from any source → no prompt; else if `runtime.isTTY.stdin && !runtime.env.CI` →
  prompt; else → `CliError` `USAGE` with `fix.flag`.
- **R3** `--yes` answers every `confirm` true; `--interactive[=all]` prompts for every
  missing required (or every promptable) option in declaration order.
- **R4** Cancel (`isCancel`) → `CliError` `CANCELLED`; SIGINT during a prompt runs the
  layer's E5 handler, which restores the terminal (raw mode off, cursor shown) first.
- **R5** Accessible mode: `kind: 'select'` renders as a numbered list with line input;
  no spinners.
- **R6** Under `--json`, prompting is impossible by definition: `--json` implies non-
  interactive, and a missing value is a `USAGE` error.

- **R7 (PRINCIPLES 14, PLAN D5)** `PromptKind` is an **open** union —
  `'text' | 'confirm' | 'select' | 'multiselect' | 'password' | 'path' | (string & {})`.
  R1's closed union makes the `widgets` host of wave 1.2 a breaking change written as an
  additive one: a plugin's seventh kind does not type-check. The `(string & {})` member
  keeps autocomplete on the six built-ins and accepts any other string. Verified against
  the real file on 2026-09-13 — 0 type errors, 152 tests pass, no call site changes; the
  diff is kept at `.sdlc/probes/open-union-widening.patch`. A kind with no registered
  widget is a **runtime** error, `E_UNKNOWN_KIND`, naming the kinds that are registered.
  Ships at 0.2.0 with the host, not as a release of its own.

- **R9 (controlroom R2)** `caique/keys`. Key presses decoded through `node:readline`'s
  keypress events — the arrows, tab and shift-tab, enter, escape, backspace, delete,
  home/end, page up/down, letters, and ctrl and meta combinations — into one `KeyPress`
  shape (`name`, `ctrl`, `meta`, `shift`, `sequence`). A keymap is **data**: an object from a
  key spec to an action name, read by `match()` and listed by `bindings()`, so a hint line
  generated from it cannot name an unbound key. Raw mode is taken once for a reader's whole
  life through `closeout/cursor`'s `rawMode()`; reading keys off a terminal throws at once
  with a `fix` (controlroom R7). `raw.ts`'s `keyOf` is rebuilt on this decoder, and
  `raw.test.ts` passes unchanged. **Built 2026-10-05** — see "What shipped (R9)" below.
- **R10 (controlroom R20, caique's half)** `caique/editor`. caique's line editor as a component
  a host drives: plain-data state, an `onKey(state, keyPress)` reducer and a render to rows,
  with no I/O. Multi-line entry, history, bracketed paste treated as text, and a completion menu
  the program feeds through `complete(word)`. Its commands are a keymap. Its editing is the
  code `caique/clack`'s prompts use, not a second editor. Off a terminal, entries come from
  stdin lines and end when the input does, never a wait (controlroom R7). **Built 2026-10-05**
  — see "What shipped (R10)" below.

## Design

```
packages/caique/src/
  spec.ts        PromptSpec, binding to an option
  decide.ts      decide(value, runtime, flags) → 'skip' | 'prompt' | 'error'   (pure)
  widgets/       text, confirm, select, multiselect, password, path — over node:readline,
                 tokens from roundel, spinner from flagstaff, static projection per widget (U3)
  ask.ts         the six widgets in line mode — which *is* the accessible rendering,
                 so there is no separate accessible.ts (see "What shipped")
  binding.ts     resolvePrompts() — one host-agnostic pass, not one binding per host
  keys.ts        caique/keys — the one key decoder, keymaps as data, raw mode once (R9)
  editor.ts      caique/editor — the line editor as a component a screen hosts (R10)
  line-edit.ts   the line editing caique/clack and caique/editor share; not an entry point
  terminal.ts    createIo() over node:readline — the only file that touches a terminal,
                 and the only one that knows what echo is
  runtime.ts     Runtime + processRuntime() — the only file that names `process` (Y9);
                 a function, so the world is read when asked for, not frozen at import
  clack.ts       caique/clack  — @clack/prompts' API over the widgets, graded by its suite
  inquirer.ts    caique/inquirer — @inquirer/prompts' API, same (never inquirer@8's)
  burgee.ts      caique/burgee — the preAction binding for burgee, burgee/commander, burgee/yargs
```

`decide` is pure and shared, so the only host-specific code is where the hook sits and
how the value is written back.

## Verification

- `decide` unit suite for the full truth table (value source × TTY × CI × `--json` ×
  `--yes` × `--interactive`).
- PTY tests with `node-pty` in CI for prompt, cancel and SIGINT on all three OS runners.
- Conformance cases on both demos.

## What shipped (R1, R2, R3, R6 — the decision — 2026-09-08)

`spec.ts` and `decide.ts`, the two files that have to be right before anything draws.

`decide()` is pure — a value, a runtime slice and the run's flags in, a verdict out — so
the whole truth table is a unit test rather than a PTY, which is what the verification
section asked for. **All 256 combinations** of value × kind × TTY × CI × `--json` ×
`--yes` × `--interactive` × required are generated as a cartesian product and checked
against the rule *written a second time, independently*, so a table that agrees with the
implementation because the same hand wrote both would not pass.

Four cases are then named separately, because a generated table proves consistency and a
named case proves intent. The one that would be a bug report is called out in the suite by
that name: **no terminal and no value is never a prompt.** Proven red — making
`--interactive` able to reach past "nobody is there" turns twelve rows into hangs, and the
table says which twelve.

Two decisions the design did not settle, settled here:

- **`--interactive` with no terminal is an error that says so**, rather than a silent
  fall-through to the ordinary refusal. A flag that appears to do nothing is worse than one
  that refuses, and the message names the reason: `--interactive needs a terminal on stdin`.
- **`--yes` answers a `confirm` and nothing else.** It is not a licence to invent a path, a
  token or a selection, and the suite asserts that for all five other kinds.

`problemWith()` catches a spec that cannot be drawn — a `select` with no choices, a
`confirm` carrying choices, an empty message — when it is written rather than when someone
reaches that option. An empty `select` renders an empty list and waits, which is the same
hang one layer down.

Neither file imports roundel, flagstaff, burgee, a stream or `process`. `decide` returns an
E1 *code* and lets the caller build its own error type, so the binding is the only
host-specific part, exactly as the design says.

Not yet: the widgets, `accessible.ts`, the two façades (their runner now exists — the
oracle gained `vitest` on 2026-09-08), and the `burgee.ts` binding. The PTY tests come with
the widgets, since there is nothing to drive until then.

## What shipped (R5, U3 — the widgets in line mode — 2026-09-08)

`ask.ts`: all six kinds, each written as a question and a line read back. No raw mode, no
cursor movement, no escape sequence, no redraw.

**Line mode is not the fallback here, it is the floor**, and that inverts what the design
sketched. `accessible.ts` was to be a second implementation beside the widgets; instead the
widgets *are* the accessible rendering, and the raw-mode renderer that arrows and
highlights will sit on top of it and answer the same questions. Two consequences, both
worth having: a screen reader gets the same bytes a terminal does *by construction* rather
than by two implementations kept in step by hand, and the whole suite is strings in and
strings out — no PTY, and no separate accessible file to drift.

`select` is a numbered list because a numbered list is what a person can answer without
seeing a highlight move (R5). It also takes the value or the label typed out, because a
person who types `ora` has answered the question.

Three decisions the design did not reach:

- **A stream that ends is a cancellation, not an empty answer.** `Ctrl-D` and a closed pipe
  both mean nobody is going to type, and reading that as `''` is how a program writes to a
  path the user never chose. Every kind is asserted for it.
- **Invalid input is re-asked five times, then gives up.** A loop against a stream that
  keeps answering wrongly is the hang this package exists to prevent, wearing a hat.
- **`password` is not special here.** It reads a line like `text`; whether the input is
  echoed is the reader's business, and this module never sees a terminal — so hiding a
  password cannot be got wrong in this file.

`projection(spec)` is the static projection every other package in the family has (U3): the
question without the conversation, for a gallery, a `--help` and a transcript in an issue.
It reads nothing, and a case asserts that.

Not yet: the raw-mode renderer, the `caique/clack` and `caique/inquirer` façades, and the
`burgee.ts` binding. The PTY tests belong to the raw-mode renderer — there is nothing that
needs one until then, which is itself the argument for building this half first.

## What shipped (R2, R3, R4 — the binding — 2026-09-08)

`binding.ts`: `resolvePrompts()`, the pass a framework calls from its `preAction` hook once
every other source has had its turn. It walks the command's options in declaration order,
asks only what has to be asked, and returns the values with the answers written in.

**The design sketched this as `caique/burgee`, one binding per host. It is one binding for
all of them instead.** What a host actually supplies is a record of options, the values so
far, and a runtime — none of which needs burgee's types. So nothing here imports them,
which keeps the family's rule that no package requires another, and means `burgee`,
`burgee/commander` and `burgee/yargs` share one implementation rather than three that
drift out of step. `PromptableOption` is structural: `{ required?, prompt? }`, which
burgee's `OptionSpec` already satisfies.

Three decisions the design left open:

- **Declaration order**, because `--interactive` asks several things at once and a person
  answering them needs the sequence to match the help they just read.
- **Stop at the first refusal**, rather than collecting them. The caller is about to exit,
  and someone told about six missing flags — one of which they would have answered
  interactively — has a worse message than someone told about the first.
- **A malformed spec is a `USAGE` failure naming the option**, caught before the terminal
  is consulted at all. A `select` with no choices would otherwise draw an empty list and
  wait: the same hang, one layer down.

A cancellation returns what was answered before it rather than discarding it, and names
the option and the flag that would have skipped the question.

Not yet: the raw-mode renderer, and the two façades — which are blocked on the decision in
`output-stack-compat`, not on this package.

## What shipped (the terminal, and the password — 2026-09-08)

`terminal.ts`: `createIo({ input, output })`, a `Reader` and `Writer` over real streams
through `node:readline`. It is the one file in the package that touches a terminal, and
until it existed `ask()` could be driven by a test but not by a program.

**Hiding a password happens here, and only here.** `ask()` says which prompts are hidden;
nothing above has to remember to mute anything, and no widget can leak a secret by writing
it back, because no widget writes what it read. The echo is suppressed by intercepting
readline's own output for the duration of the question rather than by turning the
terminal's echo off — which would leave it off if the process died mid-prompt.

The test for it was wrong first, and the correction is the point. `readline` only echoes
when `terminal: true`; on a plain `PassThrough` it echoes nothing, so "the secret was not
echoed" passed whatever the code did. The streams now claim to be a TTY, a control case
asserts that a *plain* read on them **does** echo — so the hidden cases can fail — and
removing the muting turns three of them red, including the one through `ask()`, with
`Token? t0ken` in the transcript. A test that cannot fail is not evidence.

## What shipped (the raw-mode renderer — 2026-09-08)

`raw.ts`: `askList()` drives `select` and `multiselect` with the arrow keys and a moving
highlight, repainting in place. `keyOf()` reads a keypress; `canRender()` says whether a
runtime can take raw mode at all; `renderList()` is one frame, exported so the drawing is
asserted rather than screenshotted.

**It answers the same questions `ask()` does, and returns the same `Asked`.** That is the
arrangement, and the suite asserts it rather than describing it: the last block runs the
same spec through both — typing `2` in line mode and pressing Down-Enter in raw mode — and
compares the values, including the cancellation. Line mode stays the floor (R5); this is
decoration on top. Anything raw mode can do that line mode cannot is decoration; anything
line mode can do that this cannot would be a bug.

**The design said "spinner from flagstaff"; this does not import flagstaff.** A prompt has
no spinner — it is waiting for a person, not for work — and the repaint it needs is three
escape sequences, written in the file. Importing flagstaff for them would make the one
package that talks to a human the only one in the family that requires a sibling, which is
the rule caique's own README states. A prompt that ever needs to show progress *while* it
waits is a caller composing `hoist()` around `ask()`, not this file reaching for it.

**Ctrl-C is a byte here, not a signal.** In raw mode the terminal delivers `\u0003` as data,
so a widget that did not read it would leave a person unable to leave. It cancels, and the
terminal is put back the way it was found — raw mode off, cursor shown — in a `finally`,
because a prompt that exits still in raw mode leaves the shell unusable and the person who
pressed Ctrl-C is exactly the one who will not think to run `reset`.

Seven mutations were run against the file to prove the suite bites: leaving raw mode on
(2 red), never showing the cursor again (2), returning press order instead of list order
(1), repainting for a key with no meaning (1), not reading Ctrl-C as cancel (4), clamping
instead of wrapping at the ends (1), and dropping a choice's hint (1). No PTY: the suite
drives a fake key stream, which is what made all seven cheap to check.

Not yet: the `caique/clack` and `caique/inquirer` façades, still blocked on the
render-grading decision in `output-stack-compat`.

## What shipped (R7, `plugin-contract` R5 — caique hosts `widgets` — 2026-09-13)

`caique/plugin`: `register()`, `widgets()`, `widgetFor()`, `kinds()`, `projectionOf()`,
`registered()`, `reset()`, and the family's error vocabulary with the same `fix` shape
roundel and flagstaff use (R8). It is step 3 of `plugin-contract`'s order of execution.

**`PromptKind` was widened first, and that ordering is the decision — this is R7.** The
heading did not name R7 until 2026-09-16, which is why `plan-progress`'s `designGap()` read
this design as incomplete while the requirement had been met for three days: the section
describes the widening at length and the checker looks at headings. Recorded, not rewritten
— the work below is unchanged and was already true. The union was closed,
so a plugin's seventh kind did not type-check — which means hosting `widgets` on top of a
closed union would have been a breaking change written as an additive one: every caller
would have needed this repo to edit `spec.ts` before it could name its own kind. It is now
`… | (string & {})`, which keeps the six literals in an editor's completion list where a
bare `string` would have discarded them. Measured against the unwidened file: a seventh kind
is `TS2322: Type '"acme-rating"' is not assignable to type 'PromptKind'` before, and 0 type
errors with 152 tests passing after, with no call site changed.

**The refusal is the other half of the widening, and it is not optional.** An open union
means `{ kind: 'acme-rating' }` type-checks whether or not anything can draw it, and
`attemptFor()` in `ask.ts` falls through to a line prompt for any kind it does not know. So
widening alone would have bought a plugin author a *silent* wrong answer: a text prompt
where their rating widget should have been. `projectionOf()` refuses an unregistered kind
with `E_UNKNOWN_KIND`, and the message names the kinds that are registered, so the reader
sees the typo instead of the fallback.

**A plugin may not replace one of the six.** The family's rule elsewhere is "later wins", and
it is deliberately not the rule here. The built-ins are the accessible floor and the drop-in
surface, and `password` in particular guarantees that nothing writes back what it read — a
third party able to override it could defeat that from a config file. Extension is the space
*outside* the six, which is exactly what widening the type opened up. A widget whose kind
collides with a built-in is refused, naming the six.

**`projectionOf()` is one surface over all kinds**, which is why this entry carries `ask.js`
where roundel's plugin host is a leaf. Splitting the built-in path from the plugin path
would make every caller re-implement the six-kind test, and the built-in list is precisely
what `E_UNKNOWN_KIND` has to be right about. 17,817 B, budgeted at 20,000 in
`weight.test.ts`; it reaches no package, like everything else here. The list itself is
`BUILT_IN_KINDS` in `spec.ts` — one home, rather than two lists that agree by inspection.

Seven mutations were run against `plugin.ts` to prove the suite bites: an unknown kind drawn
as a text prompt (3 red), a plugin shadowing a built-in kind (1), a widget without `static`
accepted (1), the earlier plugin winning instead of the later (1), `register()` keeping a
plugin that failed validation (1), a newer contract accepted (2), and the refusal message
dropping the registered kinds (2).

**Open, and not caique's to close: `E_UNKNOWN_KIND` is not in flagstaff's `PluginErrorCode`.**
`scripts/plugin-error-vocabulary-lock.test.ts` asserts every host's union is a subset of the
vocabulary home's, and it is red on exactly that one assertion — which is the lock working
as designed; its own comment predicts this case. The fix is one line in
`packages/flagstaff/src/plugin.ts`, outside this change's scope.

Also not done here: the schema's `widgets` entry. R2 requires every host's `schema.json` to
be byte-identical, so caique ships flagstaff's file verbatim; `widgets` validates today only
because the schema sets `additionalProperties: true`. Describing the key properly means
editing the source copy in flagstaff and propagating it, which is the same cross-package
edit as the vocabulary line. **Resolved 2026-09-23:** the family schema now describes `resolvers`, `widgets`, `handlers`, `sources`, `commands`, `hooks` and `enforce`. flagstaff, the one host that validated against the whole file, validates against its own slice (`plugin.schema.json`), so no host enforces another's keys; `plugin-schema-lock.test.ts` has no allow-list left, and `plugin-schema-agreement.test.ts` holds each definition to its host's verdict.

## The surface a consumer gets, derived from the tree (2026-09-15)

The plugin host is already fully described above, in the entry that shipped it. What is
missing is the other half of the same question: the whole list of what this package offers,
so that a consumer can scan it rather than assemble it from seven shipped entries.

**Derived, not transcribed.** One row per entry in `packages/caique/package.json`'s `exports`
map; the names are the exported declarations of the source file each subpath's `dist/` path
is built from. Re-derive with `node -p "Object.keys(require('./packages/caique/package.json').exports)"`
and `grep '^export' packages/caique/src/<file>.ts`.

| Subpath | What a consumer gets | What it is for |
| :-- | :-- | :-- |
| `caique` | `export *` of `ask`, `binding`, `decide`, `keys`, `raw`, `spec`, `terminal`, plus `processRuntime` — **not** `plugin` | everything but the host, in one import |
| `caique/spec` | `BUILT_IN_KINDS`, `flagOf`, `problemWith`; `PromptKind`, `PromptSpec`, `Choice`, `BoundPrompt` | the prompt vocabulary, and the one home of the six built-in kinds |
| `caique/decide` | `decide`; `Runtime`, `Flags`, `Decision`, `DecideInput` | the pure verdict — skip, prompt, or error — over value × TTY × CI × `--json` × `--yes` × `--interactive` |
| `caique/binding` | `resolvePrompts`; `PromptableOption`, `ResolveInput`, `ResolveFailure`, `Resolved` | one host-agnostic resolution pass, rather than one binding per host |
| `caique/ask` | `ask`, `projection`; `Io`, `Reader`, `Writer`, `ReadOptions`, `Answer`, `Asked` | the six built-ins in line mode, and the static text every non-terminal mode prints |
| `caique/raw` | `keyOf`, `canRender`, `renderList`, `askList`; `Key`, `KeyStream`, `RawIo` | the raw-mode renderer, for the terminal that can take one |
| `caique/editor` | `editor`, `submissions`, `EDITOR_KEYS`; `EditorState`, `EditorOptions`, `EditorAction`, `EditorEvent`, `Editor`, `Step`, `Frame`, `Menu` | the line editor as a component a screen hosts, and its line path off a terminal (R10, added 2026-10-05; not reachable from the root) |
| `caique/keys` | `decode`, `canonical`, `specOf`, `bindings`, `match`, `canReadKeys`, `readKeys`, `KeysError`; `KeyPress`, `Keymap`, `Binding`, `KeyInput`, `KeysErrorCode` | key presses and keymaps, for a screen as much as a prompt (R9, added 2026-10-05) |
| `caique/terminal` | `createIo`, `streamsOf`; `Streams` | the only file that touches a terminal, and the only one that knows what echo is |
| `caique/plugin` | `register`, `validate`, `reset`, `registered`, `widgets`, `widgetFor`, `kinds`, `projectionOf`, `CONTRACT`, `PluginError`; `Plugin`, `Widget`, `WidgetSample`, `Contribution`, `PluginErrorCode` | the extension point, described in full in the 2026-09-13 entry above |
| `caique/schema.json` | the family plugin schema, as a file | what a plugin author or an agent validates against |

`caique/plugin` is deliberately not reachable from the root: `src/index.ts` star-exports the
other six and not it, so a program that only asks questions does not carry the registry.

**The extension summary, in one paragraph, for a reader who does not want the whole entry.**
One key, `widgets`. A widget is `{ static, frame?, sample? }` — the same shape a flagstaff
component is, deliberately, so that "the same shape" stays a fact a lock can hold. `static`
is required and is what a pipe, an agent and a screen reader get; `frame` is optional and
drives `caique/raw`; `sample` is two named states of plain data a grader renders with, and
carries no behaviour, so reading it never means running the author's code. `register()`
validates and throws a `PluginError` before touching the registry. A kind that collides with
one of the six is refused — extension is the space *outside* the built-ins, which is exactly
what widening `PromptKind` opened up — and `password` is the reason that rule is not
negotiable. A kind nobody registered is refused at render time with `E_UNKNOWN_KIND`, naming
what is registered. Later wins, `widgets()` reports the shadowing, `reset()` forgets it all.

### What caique does not do, and why

Beyond "Out of scope" below:

- **It never prompts under `--json`.** An agent asked to type is an agent that hangs, so
  `--json` means "no human here" by definition and a missing value is a `USAGE` error.
- **It never hangs on a non-TTY.** The failure mode this package exists to remove is the
  silent wait; a non-TTY caller gets an error naming the flag.
- **It does not detect an agent by user agent or parent process.** TTY-ness plus `CI` is the
  honest signal and `--interactive` is the explicit override.
- **A plugin cannot replace a built-in kind**, and `caique/plugin` is not re-exported from
  the root, so a program that never registers anything never pays for the registry.

## Where this document and the code disagree (2026-09-15)

Recorded rather than tidied away. Caique's design is one of the two most honest in the repo
and most of what follows is small; one item is a note that has been overtaken by a fix.

- **The `## Design` file map lists four things that do not exist.** `widgets/` is a directory
  in the map and the six live in `ask.ts` (the map says so two lines later, which is the
  contradiction). `clack.ts`, `inquirer.ts` and `burgee.ts` are listed as files; the first two
  are correctly recorded as not yet built further down, and `burgee.ts` was superseded by
  `binding.ts`, which the map also lists. `raw.ts` and `plugin.ts` exist and are not in the
  map.
- **The "Open, and not caique's to close" note is stale.** It says `E_UNKNOWN_KIND` is not in
  flagstaff's `PluginErrorCode` and that
  `scripts/plugin-error-vocabulary-lock.test.ts` is red on that assertion. It is in the union
  now, with a comment explaining why caique's code lives there. The note reads as an open
  defect and is a closed one.
- **"Also not done here: the schema's `widgets` entry" is still true**, and is worth
  restating because it is the same gap in three packages rather than one. The shared
  `schema.json` describes `name`, `contract`, `tokens`, `glyphs`, `spinners`, `borders`,
  `components` and `capabilities`. It does not describe `widgets`, `handlers` or `resolvers`,
  so `caique`, `closeout` and `bellpull` each host a key their own published schema says
  nothing about, validating today only because the root sets `additionalProperties: true`.
  One edit to flagstaff's source copy closes all three.
- **The shared schema is titled `"flagstaff plugin"` and its `$id` points at flagstaff's
  path**, in every package that ships it. Byte-identical is the requirement (PLAN 1.1) and
  byte-identical is what shipped; the consequence is that a `caique/schema.json` a consumer
  fetches announces itself as another package's file.
- **R1's closed union is still the requirement text.** R7 widens it and says so, and the code
  follows R7 — but a reader who stops at R1 sees six kinds and no extension point.
- **The design describes tokens from roundel and a spinner from flagstaff.** `package.json`
  declares `closeout`, `linegauge` and — since 2026-09-28 (D-181) — `roundel`, for
  `roundel/terminal` only: `decide()` asks its `interactive()` whether anybody is there, and
  `caique/inquirer` its unicode probe. Nothing imports roundel's tokens or `flagstaff`; the
  widgets still draw their own text.

## Rejected alternatives

- ~~**Re-implementing prompts.** clack is good and maintained; the gap is the layer
  above it.~~ **Reversed 2026-09-08.** The family owns every layer (U6: zero external
  dependencies) and grades every incumbent by its own suite (U11). Wrapping clack would have
  made the one package that talks to a person the only one with a dependency it does not
  control, and clack has no static projection to give (U3). clack survives as `caique/clack`.
- **Wrapping clack** — same decision, recorded from the other side.
- **Prompting under `--json` and printing the answer.** An agent asked to type is an
  agent that hangs; `--json` means "no human here".
- **Auto-detecting agents by user agent or parent process.** Unreliable; TTY-ness plus
  `CI` is the honest signal, and `--interactive` is the explicit override.

## The compatibility target, named and graded (2026-09-14)

Until today this design said "inquirer" and "clack" and named no package, and caique's row
in `.sdlc/PLAN.md` read **0 / 2** — a replacement claimed twice and graded never. Both
suites are now vendored and both numbers are measured.

**The target is `@inquirer/prompts` and `@clack/prompts`. `inquirer@8`'s legacy
`inquirer.prompt([...])` API is out of scope.**

The reasoning, and it is a download-count argument that goes the other way:

- `inquirer` does 34.3 M/wk against `@inquirer/prompts`' 28.8 M/wk, and the larger number
  is the *legacy* façade — an API its own maintainer has moved off, and one a CLI written
  today does not reach for. `@inquirer/prompts` is the API caique's widgets already mirror
  (a function per prompt kind, an options object, an awaited answer), so it is both the
  right target and the cheap one.
- `inquirer@14.2.2`'s npm tarball ships **no tests**, and its repository is a monorepo, so
  "grade it by its own suite" has no referent at that name. The repository's testable unit
  for the prompt loop is **`@inquirer/core`** — `packages/core/core.test.ts`, 41 cases,
  the keypress state machine both façades sit on. That is what the oracle grades, and a
  façade that passes it has the loop right whatever spelling sits on top.

Measured 2026-09-14, `npm run compat`, one host key per vendored suite:

| Suite | Control (its own package) | `caique` |
| :-- | --: | --: |
| `@inquirer/core` 12.0.3 | **41 / 41, 100.0%** | 0 / 41, 0.0% |
| `@clack/prompts` 1.8.1 | **576 / 606, 95.0%** | 0 / 606, 0.0% |

Both target columns are zero and the zero is real: `caique` exports `ask`, `decide` and
`spec`, and neither suite can reach a `createPrompt` or a `text` under those names. Naming
`caique/clack` or `caique/inquirer` as the target instead would have published "target not
built yet" — a phrase, not a number — so each row names `caique`, the entry point that
exists. The rule is the one cli-table3's row already records: never name the target after a
façade that does not exist.

Three things this run had to establish, and none of them were about caique:

1. **A monorepo host needs its sub-package, not the repo root.** `packageDir` in
   `hosts.ts` is what the generated internal shims and vitest's root are anchored at;
   without it a test in `packages/prompts/test/` writing `../src/common.js` gets a shim at
   the vendored root, which it never imports.
2. **A scoped package cannot be a directory name.** `@clack/prompts` names a directory two
   deep and a baseline file with a slash in it, so the host key is flat (`clack`,
   `inquirer-core`) and `npmName` carries the real one — which is what the release lookup
   asks about and what the control re-exports.
3. **A monorepo suite's dependencies belong beside the suite.** `@clack/core`,
   `@inquirer/testing` and the incumbents themselves are declared in `suiteDeps` and
   installed into `vendor/<host>/node_modules`, never into this workspace's manifest or
   lockfile — PRINCIPLES.md's zero-dependency rule, and one fewer lockfile edit per lane.

The 30 cases `@clack/prompts` fails against itself are all of `path.test.ts`, which mocks
`node:fs` through upstream's `__mocks__/fs.cjs`; vitest 5.0.0 never loads that file where
upstream's vitest 3.2.4 does (measured by putting a `console.error` in it and watching it
not print). It is a runner-version divergence in the harness, declared as a
`controlFailures` allowance with its reason rather than rounded away. **Superseded
2026-09-20:** the allowance is gone, because `path.test.ts` is now subtracted as one of the
seventeen drawing files below. An allowance that excuses cases nobody counts is a dial.

## Both façades built, and both numbers moved (2026-09-20)

`caique/inquirer` and `caique/clack` exist. The two rows moved off the package root the same
day, which is D-006 and D-007 in one edit — a root presents caique's own API and can never
match an incumbent's, and a façade may not be named in a host row before it exists.

| Suite | Control | Target, before | Target, after |
| :-- | --: | --: | --: |
| `@inquirer/core` 12.0.3 | **41 / 41** | `caique` 0 / 41 | **`caique/inquirer` 41 / 41, 100.0%** |
| `@clack/prompts` 1.8.1 | **16 / 16** (17 / 17 until D-20260930; 576 / 606 before D-001) | `caique` 0 / 606 | **`caique/clack` 16 / 16, 100.0%** (16 / 17 until D-20260930-caique-clack-core-exclusion; 14 / 17 until D-152) |

### R8 — `caique/inquirer`

`@inquirer/core`'s whole surface except `usePagination`: `createPrompt`, the six hooks, the
eight key predicates, `makeTheme`, `Separator` and the five error classes, over
`node:readline`, `node:async_hooks`, `closeout/exit-hook` and `linegauge/wrap`. Six new
modules in `packages/caique/src/`, plus the existing `runtime.ts`, which is the only file in
the package allowed to name `process`.

**It was reachable because those 41 cases grade a loop and not a drawing.** `@inquirer/testing`
renders through a headless xterm and asserts the screen. Three things had to be right that
reading the API would not have told us, and each is a case:

1. `AsyncResource.bind` on every `useState` setter and every keypress handler. Without it a
   `setState` called from an `EventEmitter` listener registered inside a `useEffect` runs in
   a different async context and finds no hook store.
2. The first render deferred by one `setImmediate` **only** when the input has
   `readableFlowing`. That is how a keystroke typed before the prompt existed is discarded
   rather than answered — upstream issue #1303, and a graded case.
3. `createPrompt`'s caller file captured at construction through `Error.prepareStackTrace`,
   because the error a render function gets for returning nothing names that file, and the
   case snapshots the message including the path.

**`usePagination` is not implemented, and that is a stated gap rather than an oversight.**
It is 121 lines of list-window arithmetic that this suite does not touch anywhere. Shipping
an ungraded re-derivation of it would be exactly the unmeasured claim the oracle exists to
prevent, so it is named here instead. It is the one thing standing between this subpath and
a full drop-in for `@inquirer/prompts`' `select` and `checkbox`, and the way to close it is
to grade it — `@inquirer/core`'s repository has a pagination suite that is not vendored yet.

### R8 — `caique/clack`, and the ceiling

D-001 is executed: the seventeen files of `@clack/prompts`' suite that carry
`toMatchSnapshot()` are subtracted from the row as a declared subset, one `excludes` entry
per file, each with its case count and its snapshot count, and all of it published on the
compatibility page. 289 of the suite's 444 assertions are snapshots, in 17 of its 19 files;
the other two files carry none, and they are the row.

**A named subtraction was possible here, and that had to be checked first.** `summarize()`
in `run.ts` refuses an exclusion it cannot name, and some runners' TAP prints counts with no
per-case names — which is why `ansi-escapes`' ceiling is written in prose instead. vitest's
`tap-flat` prints one named line per case; verified in the raw TAP of both runs before the
entries were written. `requireMatch` on the control means a file renamed upstream turns the
control red rather than quietly shrinking the denominator.

**The ceiling is 16 of 17 (D-152, 2026-09-27), and the missing one is in `guide.test.ts`:**

- `every prompt renders the same guide` and `no prompt renders a guide when withGuide is
  false` **pass.** This section used to call them "the drawing this row subtracts by
  decision" and stop at 14 / 17, which was wrong: they are not snapshots. They assert that
  all twelve of clack's prompts exist, take clack's options and streams, cancel on escape,
  and open on the grey guide — or, with `withGuide: false`, on none. That is the drop-in,
  not clack's renderer, and `caique/clack` now carries the twelve prompts, the writers
  (`intro`, `outro`, `cancel`, `note`, `log`, `stream`, `spinner`, `tasks`, `group`), the
  glyphs and `settings`/`updateSettings` on caique's own keypress loop — `node:readline`'s
  decoder, `closeout`'s cursor restore, `linegauge/wrap` — with no external dependency. The
  frames are clack's shape and not its bytes, so the seventeen snapshot files stay
  subtracted exactly as D-001 decided.
- `no prompt renders a guide when withGuide is globally false` calls
  `updateSettings({ withGuide: false })` **imported from `@clack/core`** — the test imports
  it, not our code — and asserts our prompts obey it. That is module-level state inside a
  package caique does not depend on and cannot read. No implementation of ours passes it
  without taking the dependency U6 forbids, so it is structurally out of reach rather than
  unfinished. `caique/clack`'s own `updateSettings` does the same job, and
  `packages/caique/src/clack.test.ts` holds all twelve prompts to it.

16 / 17 with that paragraph beside it was the honest number until 2026-09-30. **Restated by
D-20260930-caique-clack-core-exclusion:** the case grades `@clack/core`'s module state and not
`@clack/prompts`' contract. So it is excluded by its exact title (`Exclusion.exact`, the
mechanism A27 built for terminal-link), with the reason on the compatibility page. The row
reads **16 / 16, level with a control of 16 / 16**, and `burgee migrate` rewrites
`@clack/prompts` to `caique/clack` (D-137). It refuses a file that imports a name caique has
not built. A program that imports `updateSettings` from `@clack/core` keeps changing clack's
settings after migration, and caique's prompts never read them. The decision names that as
the one residual gap.
Not built, because no graded case reaches them: `box`, `progress`, `taskLog`.

Still open, and named so it is a decision rather than a silence:
`packages/caique/competitors.json` still fingerprints `inquirer` at the `./ask` subpath.
Re-pointing it at `@inquirer/prompts` needs a `npm run compat -- --fingerprint` run, which
rewrites that file wholesale; it is its own change.

## What shipped (R9 — `caique/keys`, controlroom R2 — 2026-10-05)

`src/keys.ts`, published as `caique/keys` and re-exported from the root: `decode()`,
`canonical()`, `specOf()`, `bindings()`, `match()`, `canReadKeys()`, `readKeys()` and
`KeysError`. It is controlroom's phase-0 prerequisite R2, and it lives here because keys belong
to caique (controlroom's intent, "The layer rule").

**One decoder, and it is node's.** Every key comes out of `node:readline`'s
`emitKeypressEvents`, the decoder `clack-core.ts` and `@inquirer/core` already read. The file
parses no escape sequences; it normalises four of node's spellings that are not what a person
pressed, each a row in `keys.test.ts`: Enter is `return` in node and `enter` here; LF is `enter`
in node and `ctrl+j` here, because in raw mode only Ctrl+J sends it, so a line editor can bind
a newline without stealing Enter; a lone Escape is `meta` in node and plain `escape` here; and
a sequence node does not recognise is named the *string* `'undefined'` by node and the empty
name here, which no keymap can bind. `decode(chunk)` is the synchronous form for one `data`
chunk: node holds back a chunk that ends in Escape until a timer fires, and a chunk decoded on
its own has no rest coming, so that one report is made at once, as node would make it.

**A keymap is data**, `{ 'left': 'previous', 'ctrl+c': 'quit', 's': 'status' }`. `canonical()`
gives every spec one spelling (`Ctrl+C` is `ctrl+c`; a lone `G` is `shift+g`, which is what the
terminal sends), and a spec that names no key is refused with `E_KEY_SPEC` and a `fix` rather
than silently never matching. `bindings()` lists a keymap in the order written, in that
spelling, and refuses two specs for one key. That list is what controlroom's hint line (R9
there) is generated from, so a hint cannot name a key nothing is bound to.

**Raw mode once, for the reader's life.** `readKeys(input, onKey)` takes it through
`closeout/cursor`'s `rawMode()`, which registers its undo on the exit hook in the same call,
and gives it back when the reader stops. Three keys arrive and `setRawMode` is called once.
Off a terminal (a pipe, a file, a stdin with no `setRawMode`), it throws `E_NOT_A_TERMINAL`
before attaching a listener, with the `fix` "read lines from stdin instead, or pass the answer
as a flag". That is controlroom R7: a key that cannot arrive is a wait that never ends.

**`raw.ts`'s `keyOf` is rebuilt on it, and `raw.test.ts` is unchanged and green**, which is
the acceptance check controlroom's intent names. The six list keys are now a keymap
(`LIST_KEYS`) read by `match()`; `canRender()` asks `canReadKeys()`, so the package has one
answer to "can this read keys". One behaviour moved, and it is a fix: a terminal in
application-cursor mode sends `ESC O A` for Up, which byte comparison read as `other` and the
decoder reads as `up`.

**Weight.** `keys.js` is 4,991 B and reaches `closeout/cursor` and `closeout/exit-hook` only.
`./raw` went from 3,916 to 8,896 B and the root from 14,640 to 19,549 B, still under a fifth of
clack's 101,684 B. Both budgets moved, each with its reason, in `weight.test.ts`.

**Proven to bite.** Fifteen mutations were run against `keys.ts` and `raw.ts`, and every
one turned the suite red: LF read as Enter (1 red), Enter left as `return` (22), a lone Escape
keeping `meta` (3), no Escape at a chunk's end (4), node's `'undefined'` name kept (1), an
unnamed character not lowercased with shift (1), an uppercase letter after a modifier read as
shift (1), a spec that names nothing accepted (6), two spellings of one key accepted (1), raw
mode toggled per key (1), a stop that is not idempotent and pauses the next reader's stream
(1), raw mode not given back on stop (4), reading off a terminal anyway (2), `keyOf` taking the
first of several keys in a chunk (1), and `keyOf` without Ctrl-D (1). Two first-draft mutations
survived, and both were the mutation's fault rather than the suite's: toggling through
`rawMode()` is a no-op once the input is raw, and a second `stop()` was harmless until a
second reader opened on the same stream, which the suite now does.

**CodeQL's finding on the PR, fixed.** The first `canonical()` split a spec with the regular
expression `(modifier\+)*(.+)`, which backtracks polynomially on a long run of `alt+`. A keymap
is data and can come from a file, so that is a stall a config file could cause. It is now one
left-to-right walk. The case that proves it, 50,000 `alt+`s in under a second, did not finish
in 120 s against the regular expression.

Not done here, and named: **bracketed paste mode** (`ESC[?2004h`) is a terminal state a program
owes back, like the cursor, and switching it on is the host's job. The decoder already reports
`paste-start` and `paste-end` for the line editor controlroom R20 asks of caique.

## What shipped (R10 — `caique/editor`, controlroom R20's caique half — 2026-10-05)

`src/editor.ts`, published as `caique/editor`: `editor(options)` returns `{ initial, onKey,
render }`, and `submissions(input)` is the line path. `EDITOR_KEYS` is the default keymap.
It is the half of controlroom R20 that caique owns ("the editor stays caique's"). controlroom
places the editor in its live region and routes keys to it, which is controlroom's phase-2 work.

**A component, not a prompt.** The editor does no I/O. `onKey(state, keyPress)` returns the
next state, plus an event when the entry was submitted or cancelled. `render(state)` returns
the rows and the cursor's row and display column. The state is plain data, with no functions
in it. A host reads keys with `caique/keys`' `readKeys()` and paints the frame wherever its
layout puts the input line. The suite drives the editor with real bytes through `decode()` and
never opens a stream, and that is the property the host relies on.

**Not a second editor.** Insert, delete, backspace, the cursor moves and Ctrl-U were `edit()`, a
private function in `clack-core.ts`. Moving between the rows of a multi-line entry was
`moveTextCursor()`, private in `clack-prompts.ts`. Both moved, unchanged, into `line-edit.ts`.
`caique/clack`'s prompts and this component now edit text with the same code, and clack's
suites pass as before. A mutation to the shared Ctrl-U turns both suites red. `./clack` went
from 62,229 to 62,097 B in the move.

**What it adds on top of the line editor:**

- **Multi-line entry.** Enter submits. Alt+Enter and Ctrl+J insert a newline: `caique/keys`
  reports a bare LF as `ctrl+j`, so binding it does not steal Enter. Up and Down walk the rows
  first and the history second.
- **History.** Up recalls older entries, and Down returns to the draft that was being written.
  A submitted entry joins the history unless it is empty or repeats the last one.
- **Bracketed paste.** Between `paste-start` and `paste-end`, every key is text, Enter included.
  A pasted newline does not submit, `\r\n` and `\r` become `\n`, and a paste split across reads
  stays one paste.
- **A completion menu the program feeds.** `complete(word)` is called with the word before the
  cursor (`/com`, `@fi`). The editor only asks; what a word means is the program's business.
  Up and Down move the selection, wrapping at both ends. Tab or Enter puts it in place of the
  word. Escape closes the menu until the word changes. A candidate that equals the word is not
  offered, because offering it would make Enter accept it forever instead of submitting.
- **The commands are a keymap** (`EDITOR_KEYS`), data in R9's sense. A host passes its own, and
  `bindings()` of the same object is its hint line.

**Off a terminal: lines, never a wait** (controlroom R7). `submissions(input)` yields one entry
per line of a stream and ends when the stream does. It is readline's own async iterator. The
first draft took caique's `Reader` and called `line()` in a loop, and the suite caught it
dropping lines. `createIo()`'s reader listens for one `line` event at a time, so lines that
arrive in one chunk before anyone asks are lost. Measured against `dist/terminal.js`:
`input.end('a\nb\n')` before reading gives `[undefined, undefined, undefined]` from three
`line()` calls. That defect is `caique/terminal`'s, not the editor's. It is outside this change
and is recorded here so it is not lost.

**Weight.** `./editor` is 12,389 B: `editor.js`, `line-edit.js` and `keys.js`. It reaches
`linegauge` for the cursor's column, and the two closeout subpaths through `keys.js`. It is not
reachable from the root, so a program that only asks questions does not carry a screen's input
line. Its budget, 13,000 B, is in `weight.test.ts` with its reason.

**Proven to bite.** I ran twenty-one mutations against `editor.ts` and `line-edit.ts`, and every
one turned the suite red:

- **Bracketed paste:** Enter inside a paste submits; CRLF is kept; the start marker is ignored.
- **History:** the draft is not kept; Up skips the rows of a multi-line entry; Down skips them
  too; repeats are recorded; empty entries are recorded.
- **Completion menu:** Enter submits through an open menu; a candidate equal to the word is
  offered; the selection is not kept for the same word; it is not clamped when the list
  shrinks; Escape does not stick; the selection does not wrap at the top.
- **Render:** continuation rows are not indented; the cursor column counts characters instead
  of cells.
- **Keymap:** cancel is not an event; the host's keymap is ignored.
- **Lines:** lines are read one `line` event at a time.
- **`line-edit.ts`:** Ctrl-U kills nothing; the row cursor is not clamped.

One mutation survived the first draft: dropping Escape's dismissal. Tab was the only key the
case pressed after Escape, and Tab re-opened the menu without changing the text the case
asserted. The case now asserts that the menu stays closed.

## Out of scope

- **`inquirer@8`'s legacy `inquirer.prompt([...])` API.** See above: 34.3 M/wk of it, and
  none of that weight is a CLI being written now. A façade for it would be a shape to
  maintain forever in exchange for migrations nobody is asking for.
- Multi-step wizards with back navigation (clack #39) — v2 if asked.
- Theming beyond roundel's tokens (clack #36, #345 are answered by roundel, not here).
