# Design — roundel

Intent: [`intent.md`](./intent.md). **Status:** approved.

**R2/R3 revision accepted by the owner (Ofri) on 2026-09-08**, at the Design→Build gate.
The revision: the output mode decides redraws, while the colour *level* obeys the user's
explicit instruction — `NO_COLOR`, `FORCE_COLOR`, the `--color` flags, and supports-color's
CI vendor table — in any mode; a pipe with no instruction stays 0, and accessible mode
defaults to 0 with an explicit `FORCE_COLOR` still able to override it.

It was raised because the original rule, in which the mode alone settled the level, scored
47 of 58 on chalk's own suite with all eleven failures being force-colour cases — and would
have surprised every CI user who sets `FORCE_COLOR` to get colour in their logs. The
accepted cost is that `CLI_ACCESSIBLE=1` together with an explicit `FORCE_COLOR=3` does
emit colour; the alternative considered and not taken was to make accessible absolute,
on the same footing as `NO_COLOR`.

Recorded here rather than in a chat log because the revision was drafted in-session by the
same agent line that wrote the code, which rule 3 does not let stand as its own approval.

---

## Requirements

- **R1** `outputMode(rt): 'tty' | 'pipe' | 'json' | 'accessible' | 'ci'` is pure over
  `{ isTTY: { stdout }, env, json?: boolean }`. Precedence, first match wins: `json` if
  `rt.json`; `accessible` if `env.CLI_ACCESSIBLE`; `ci` if `env.CI` and not a TTY; `pipe`
  if not a TTY; else `tty`.
- **R2** `colorLevel(rt, { json }): 0 | 1 | 2 | 3` mirrors chalk's levels, and **obeys the
  user's explicit colour instruction in any output mode**. Precedence: `NO_COLOR` (non-empty)
  is `0` outright; then `FORCE_COLOR=0`/`false`, which supports-color settles *before* it
  reads any flag, so `FORCE_COLOR=0 --color=256` is `0` and not 2 — **an explicit "colour
  off" is never overridden into colour on**; then the `--color` flags read from an optional
  `rt.argv` (`--color=256` → 2; `--color=16m|full|truecolor` → 3;
  `--no-color`/`--no-colors`/`--color=false|never` → 0; `--color`/`--colors`/`=true|always`
  enables and lets detection pick, never below 1 — both spellings, as has-flag has them),
  which outrank a numeric `FORCE_COLOR`; then `FORCE_COLOR` itself (a bare decimal an
  *exact* level clamped to 3, never a floor; `true`/empty enables and detects; anything else
  unset). With no instruction the order is supports-color's own: **accessible mode is `0`**
  and a pipe is `0` (Azure Pipelines — `TF_BUILD` *and* `AGENT_NAME` — the one exception,
  because that check sits above the non-TTY one); once detecting, `TERM=dumb` is the floor,
  a `CI` run is its vendor's level (gated on `'CI' in env`, as supports-color gates it, so an
  empty `CI=` still selects the table), and otherwise `TERM`/`COLORTERM` decide — where
  `truecolor` is the only `COLORTERM` value that means 3, `24bit` falling through to the
  level-1 catch-all exactly as supports-color has it. `--json` alone is always `0`:
  structured output carries no escapes. **The output mode decides redraws (U2), never the
  level.**
  - **Accessible mode defaults to `0`** (revised 2026-09-08), with the same shape as the
    pipe default: an explicit ask (`FORCE_COLOR`, `--color=…`) still wins, `NO_COLOR` still
    beats everything. `CLI_ACCESSIBLE` is itself an explicit instruction from a human, and
    ANSI colour is noise to a screen reader — which puts accessible mode on the same footing
    as a pipe, not a terminal. chalk's suite never sets `CLI_ACCESSIBLE`, so this costs
    nothing against the 58 / 58; `src/policy.test.ts` and `src/tokens.test.ts` lock it.
  - **The one deliberate divergence from chalk.** When a user gives *both* an explicit flag
    and an explicit `FORCE_COLOR`, supports-color lets the ambient variable overwrite the
    flag; roundel takes the flag, because it was typed for this run. A 3,000-case
    differential sweep against chalk 6.0.0's own vendored supports-color (2026-09-08) finds
    **0 divergences** when only one channel is used — flags alone, or `FORCE_COLOR` alone —
    and every divergence in the both-set partition is this question. The reason to take the
    flag is the direction of the failure: under chalk, `--no-color` on a machine exporting
    `FORCE_COLOR=1` still emits colour. `FORCE_COLOR=0` remains the exception, because an
    "off" from either channel is an off. Locked row by row in `src/policy.test.ts`. (The
    sweep excludes supports-color's emulator allow-list, TEAMCITY_VERSION, TERM_PROGRAM and
    the platform check — detection R2 refuses outright, per §1 and §17.)
- **R3** Tokens `error warn ok hint muted command flag value heading` are functions
  `(s: string) => string`, implemented over `util.styleText`. They are the **identity at
  level 0**, and paint identically at any level above it whatever the mode — because the
  level already obeys `NO_COLOR`, `FORCE_COLOR` and the `--color` flags in any mode, and is
  `0` on a pipe with no instruction. No third behaviour. Nothing else in the package touches
  ANSI.
- **R4** `fly(theme)` sets the process theme once; `theme` maps each token to a
  `styleText` format list or a `#rrggbb` (truecolor only, level 3). Defaults are the
  burgee brand: rock and juniper, lifted variants on dark.
- **R5** `contrast(fg, bg)` and `AA` — the WCAG maths — live here (`roundel/contrast`), and
  `fly()` throws when a truecolor token fails 4.5:1 against the declared ground. Levels 1
  and 2 are never checked or claimed.
- **R6** `roundel/chalk`: chalk 6's public API — chainable styles, `level`, `chalkStderr`,
  `supportsColor`, `Chalk` class — over R3, graded by chalk's own suite vendored into
  `compat-oracle`. Chalk's mutable `level` is honoured inside the façade only.
- **R7** Subpath isolation: `./policy`, `./tokens`, `./theme`, `./contrast`, `./chalk`; each
  `dist/` file imports only itself and `./policy.js`; `sideEffects: false`; root entry is
  re-exports only. Locked by `src/subpath-isolation.test.ts` and `src/weight.test.ts`.
- **R8** Ceilings, as weight rules: `./tokens` ≤ picocolors (3.3 KB, +10 ms); `./chalk` ≤
  chalk 6.0.0 bytes and ≤ picocolors spawn delta; re-measured when vendored.
- **R9** Nothing reads `process.*`; `process-reference-lock` extends here.
- **R10** ESM with `default` condition; `require('roundel/chalk')` works via `require(esm)`.
- **R11** `roundel/import`: `fromBase16(scheme)` and `fromITerm(plist)` produce a theme (a
  token map) from the two largest existing corpora of terminal palettes, contrast-checked on
  import (R5). The docs gallery is generated from them; hundreds of themes on day one, none
  hand-written. Data in, data out; no network, no bundled corpus — the user supplies the file.
- **R12** `roundel/terminal` (added 2026-09-28, D-181): `interactive(rt)` over
  `{ env, isTTY: { stdin } }` — `FORCE_TTY=1` is yes outright; otherwise a terminal on stdin, no
  non-empty `CI`, and none of the agent variables burgee's `detectAgent` probes (`AI_AGENT`,
  `CLAUDECODE`, `CURSOR_AGENT`, `CODEX_THREAD_ID`, `GEMINI_CLI`, exported as `AGENTS`) — and
  `unicode(rt)` over `{ env, platform? }`, is-unicode-supported 2.1.0 condition for condition.
  Its own subpath, reaching nothing and not re-exported from the root: `./chalk` stands on
  `policy.js` with 7 B left under R8, so neither function can live there. The unicode table
  reads `TERM_PROGRAM` and the platform, which R2 refuses for *colour*; a glyph table is not a
  colour level, and the refusal below is restated to say so. Locked by `src/terminal.test.ts`,
  `src/weight.test.ts` and `src/subpath-isolation.test.ts`.

### Evidence

Issue ids from [what 230 issues say about the output stack](../../research/output-stack-open-issues.md),
one row per requirement; the section number is the cluster the reading comes from. A row
with no issue behind it is a hypothesis and is measured before it locks.

| R | Issues that support it | Standing |
| :-- | :-- | :-- |
| R1 | clack #286 (`isCI` where `isTTY` was meant); ora #218, #235 (declined); listr2 #716 (piped stdout steps the renderer down; UI to stderr by hand); cli-table3 #180; clack #585 (the `accessible` mode, opt-in by env) — §1, §2 | cited |
| R2 | picocolors #100 (`FORCE_COLOR=0` enables colour), #85 (use `tty.WriteStream.hasColors()`); chalk #624, #686 (numeric `FORCE_COLOR`, ansi256 downsampling); cli-table3 #357 (ANSI under `NO_COLOR=1`); listr2 #687; ink D#577; chalk v5.5/v5.6 emulator allow-list is the detection R2 refuses — §1, §17 | cited |
| R3 | chalk #666 (declined: "building abstractions over Chalk … is what we encourage"), #659, #635; picocolors #99; chalk #604 (styles `util.styleText` lacks are not offered); cli-table3 #357 and listr2 #687 (styling that ignores level 0) — §9, §17, §1 | cited |
| R4 | chalk #666 (declined), #677 (custom presets), #659 (dynamic colour names); clack #36 (themes, variants, icons), #345 (expose the style without the rendering), #379 (global settings) — §9 | cited |
| R5 | no issue in the ten trackers asks for contrast checking | hypothesis — measure before lock |
| R6 | picocolors #100, #92 ("regressions when projects migrate from chalk"); chalk #624, #686, #635 (the `level` model the façade must reproduce to pass chalk 6's suite) — §1, §17, U11 | cited |
| R7 | ink #976 (a DEV-only path installed for everyone); picocolors #70 ("doubling the package size"); chalk #617 (README is 25% of the tarball) — U5 | cited |
| R8 | picocolors #70; chalk #617; ink #976 (what a subpath costs when it is not isolated); chalk #669, #660 (per-call cost is a B4 row, not a ceiling here) — U5, §20 | cited |
| R9 | picocolors #97 (`process` is not defined on Cloudflare); chalk #615 (`navigator`), #655 (Vite); log-update #63 (declined: "this package targets Node.js"); ora #146 (declined: `WT_SESSION` "is not an API") — §15 | cited |
| R10 | picocolors #70 (35 reactions), #50, #59; chalk #632, #633, #641, #628, #627, #620 (declined, every one), #613, #661, #626; ora #239 (declined); listr2 #755, #745; Inquirer D#1270, D#1206 — §13, U10 | cited |
| R11 | no issue asks for a palette importer; clack #36 wants themes, not a corpus | hypothesis, measured at lock on three real files only (2026-09-30): Gruvbox dark hard and Dracula fly, Tomorrow Night is refused at 4.46:1. The rate across the corpora is unmeasured ([D-20260930-roundel-import-gallery](../../decisions/D-20260930-roundel-import-gallery.md)) |

Revised 2026-09-08 while grading chalk's suite: FORCE_COLOR and --color are the user's
explicit colour instruction and apply in any mode; the mode still decides redraws (U2).
Before: level 0 under every mode but tty, which failed chalk's 11 force-colour cases and
would have surprised every CI user who sets FORCE_COLOR to get coloured logs.

## Design

```text
packages/roundel/src/
  policy.ts       outputMode, colorLevel                      (the only env reader)
  tokens.ts       the nine tokens over util.styleText; reads the theme set by fly()
  theme.ts        fly(), defaults (rock/juniper), truecolor → nearest styleText fallback
  contrast.ts     WCAG 2.2 maths, copied from burgee/contrast.ts (60 lines, on purpose)
  chalk.ts        the façade: Proxy-based chain builder, level, chalkStderr, supportsColor
  index.ts        export * from each — no side effects
  *.test.ts       policy truth table · tokens per mode snapshot · contrast vectors
  subpath-isolation.test.ts · weight.test.ts · shape.test.ts
```

**Order.** `policy` → `tokens` → `theme` + `contrast` → `chalk` → vendor chalk's suite in
`compat-oracle` → B4 rows. The first three ship as `0.1.0`; the façade ships when its pass
rate is on the scoreboard.

**How burgee uses it without importing it.** `burgee`'s core help renderer had no
`styleText` calls (colour lived only in the commander façade); #24 added four as the theme
defaults and `renderHelp(node, { theme })`, typed structurally as `Record<token, (s) => s>`. A user who has `roundel` passes `roundel`'s tokens; a user who
does not gets the defaults. Zero bytes of `roundel` in `import 'burgee'`.

## Verification

- `npm test -w roundel` — R1 truth table (mode × env × TTY), R3 snapshot per mode, R5
  vectors from burgee's contrast tests, R7 isolation, R8 weight, shape (Z1).
- `npm run compat -- chalk` — pass rate, `--control` first.
- The check that would have caught the original problem (five libraries disagreeing about
  the terminal): the R1 truth table has one answer per input, and every component in the
  family is forbidden by the env grep from computing its own.

## The surface a consumer gets, derived from the tree (2026-09-15)

The requirements above say what roundel is *for*. This section says what is *in it*, so that
a reader deciding whether to install it does not have to read eleven requirements and a file
map to find out.

**Derived, not transcribed.** The rows are `packages/roundel/package.json`'s `exports` map,
one row per subpath, and the names are the exported declarations of the source file each
subpath's `dist/` path is built from. Re-derive with `node -p "Object.keys(require('./packages/roundel/package.json').exports)"`
and `grep '^export' packages/roundel/src/<file>.ts`. If a row disagrees with those two
commands, the row is wrong.

| Subpath | What a consumer gets | What it answers |
| :-- | :-- | :-- |
| `roundel` | `export *` of `policy`, `tokens`, `theme`, `contrast` and `plugin` — **not** `chalk` | the whole library for a program that wants all of it |
| `roundel/policy` | `outputMode`, `colorLevel`, `flown`; `OutputMode`, `ColorLevel`, `TokenName`, `Format`, `Paint`, `ModeOptions` | "where is this output going, and may it carry colour" — the only env reader (R1, R2) |
| `roundel/tokens` | `error`, `warn`, `ok`, `hint`, `muted`, `command`, `flag`, `value`, `heading`; `sgr`; `Token`, `SgrPair` | the nine semantic paints, identity at level 0 (R3) |
| `roundel/theme` | `fly`, `audit`, `rgb256`, `toOklab`; `Hex`, `Style`, `Theme` | set the process theme once, and downsample a hex to what the level can show (R4) |
| `roundel/contrast` | `contrast`, `luminance`, `channels`, `reportTheme`, `AA`, `AAA`, `floors`, `round2`; `Conformance`, `ThemeFinding` | the WCAG maths, and the gate `fly()` runs a truecolor theme through (R5) |
| `roundel/chalk` | `Chalk`, `chalkStderr`, `supportsColor`, `supportsColorStderr`, `modifierNames`, `foregroundColorNames`, `backgroundColorNames`, `underlineColorNames`, `colorNames`, and chalk's type names | the drop-in path, graded by chalk's own suite (R6) |
| `roundel/terminal` | `interactive`, `unicode`, `AGENTS`; `Terminal`, `Glyphs` | "is anybody there to type, and can the terminal draw a tick" — the two questions that are not colour (R12) |
| `roundel/import` | `fromBase16`, `fromITerm`, `ImportError`, `BASE16_SLOTS`, `ITERM_SLOTS`; `ImportedToken`, `ImportOptions`, `ImportErrorCode` | "can I use the palette I already have" — a Base16 scheme or an iTerm2 preset read into a theme, checked on the way in (R11) |
| `roundel/plugin` | `register`, `validate`, `reset`, `theme`, `contributions`, `registered`, `CONTRACT`, `PluginError`; `Plugin`, `Contribution`, `PluginErrorCode` | the extension point — see below |
| `roundel/schema.json` | the family plugin schema, as a file | what a plugin author or an agent validates against before shipping |

Two of those rows are not in R7's subpath list and have never been in this document:
`roundel/plugin` and `roundel/schema.json`. They are recorded under "Where this document and
the code disagree" rather than quietly appended to R7.

`roundel/chalk` is deliberately not reachable from the root entry — `src/index.ts` star-exports
the other four and not it, so a program that imports `roundel` does not pay for the façade.
That is R7 working; it is noted here because it is the one thing in the table a reader is
likely to assume the other way round.

### How a consumer extends it

**One key: `tokens`.** `packages/roundel/src/plugin.ts` is the contract, and it is the
truth — `src/schema.json` is the family's shared file and is looser than this host in one
way named below.

A plugin is a plain object. roundel reads three fields and **ignores every other key without
complaining**, which is what lets one object serve any subset of the family that happens to
be installed; a plugin written for flagstaff registers here and contributes its theme, and
its `spinners` are not an error.

| Field | Required | What it must be |
| :-- | :-- | :-- |
| `name` | yes | a non-empty string. It is how a shadowed token is attributed in `contributions()` |
| `contract` | no | an integer no greater than `CONTRACT`, which is `1` |
| `tokens` | no | an object mapping a token name to `#rrggbb` |

**What is validated, at `register()` and nowhere later.** `validate()` refuses: a plugin that
is not a plain object; a missing or empty `name`; a `contract` that is not an integer or is
newer than this roundel knows; a `tokens` that is not an object; a token name outside the ten
`TOKEN_NAMES` admits — the nine of R3 plus `ground`, which is the colour a theme is checked
*against*; and any value that is not `#rrggbb`.

**What happens on a bad plugin.** `register()` throws a `PluginError` synchronously and
registers nothing: `validate()` runs before the push, so a refused plugin leaves the registry
exactly as it was. The error carries a `code` — `E_PLUGIN_SCHEMA` or `E_PLUGIN_CONTRACT` —
a message naming the plugin and the offending key, and a `fix` sentence. A misspelt token
name is **refused rather than dropped**, on purpose: a plugin whose `errror` key is silently
ignored looks like it worked, and its author debugs the wrong thing.

**What a plugin is deliberately not allowed to decide.**

- **When colour is decided.** `register()` does not call `fly()`. A plugin that could would
  mean the last plugin imported quietly re-flew the theme. The program calls `fly()` once.
- **Whether the output carries colour at all.** `outputMode` and `colorLevel` read the
  runtime and the user's instruction; no plugin key reaches them.
- **An unreadable colour.** Contrast is *not* checked at `register()` — deliberately, so that
  there is one contrast gate and not two. `fly()` checks a contributed theme exactly as it
  checks a hand-written one and throws below 4.5:1 against the ground.
- **A tenth token.** The vocabulary is closed. A name outside the ten is a typo, not an
  extension point; extension here means re-colouring the nine, not inventing meanings.

Order is registration order and **later wins**, like ESLint flat config. `contributions()` is
the static projection of that: one row per token, naming the plugin that won it and, in
order, the plugins it shadowed. `theme()` collapses the same data into the object `fly()`
takes, rebuilt through a `Map` and filtered against the allowlist a second time so that a
third party's JSON cannot carry a `__proto__` onto it. `reset()` forgets everything, for
tests and for a program that re-themes at runtime.

### What roundel does not do, and why

Beyond the four items under "Out of scope" below, three refusals are worth a consumer
knowing before they go looking:

- **It has no CLI and no `bin`.** `burgee brand` owns the brand tooling; this is a library.
- **It claims nothing about contrast at levels 1 and 2.** The 16- and 256-colour palettes are
  the user's terminal theme, so a ratio computed against them would be invented (R5).
- **It does not detect a terminal emulator by name for colour.** supports-color's emulator
  allow-list, `TEAMCITY_VERSION`, `TERM_PROGRAM` and the platform check are refused outright
  for the colour level, which is why the chalk differential sweep excludes them. The one
  place a name is read is `roundel/terminal`'s `unicode()` (R12), which is a glyph table and
  not a level.

## Where this document and the code disagree (2026-09-15)

Recorded rather than tidied away, because a design edited to match the code teaches the next
reader nothing.

- **R11 described a subpath that did not exist** (closed 2026-09-30: `src/import.ts` is built — see R11's row below — and the README states it under *What is here*). `roundel/import`, `fromBase16(scheme)` and
  `fromITerm(plist)` are in no `exports` map and no source file; there is no
  `packages/roundel/src/import.ts`. R11's own Evidence row already grades it *"hypothesis —
  measure before lock"*, so nothing was promised on evidence — but the claim is also in the
  shipped `packages/roundel/README.md`, where a consumer will read it as a feature. That
  README is another lane's file; it is reported, not edited here. (flagstaff *does* ship an
  `./import`, with `fromCliSpinners` and `fromCliBoxes` — a different thing with the same
  name, which is how this one reads as plausible.)
- **R7's subpath list is short by two.** It names `./policy`, `./tokens`, `./theme`,
  `./contrast` and `./chalk`. The package also publishes `./plugin` and `./schema.json`, and
  has since the plugin host landed. A subpath-isolation requirement that does not list every
  published subpath cannot be read as covering them.
- **The `## Design` file map omits four files that exist.** `plugin.ts`, `runtime.ts`,
  `schema.json` and `contrast-vectors.json` are in `packages/roundel/src/` and not in the
  map. `runtime.ts` in particular is the file R9 is about.
- **R9 says "nothing reads `process.*`" and one file does.** `src/runtime.ts` reads
  `globalThis.process` through a guarded cast, because `./chalk`'s contract is "detect the
  terminal at import" and there is nowhere else for that to live. The rule the package
  actually keeps is the family's one-seam rule — a single named file, exempted by path in
  burgee's `process-reference-lock.test.ts` — which is a different and weaker claim than the
  one R9 makes.
- **The plugin host is absent from this design.** Until this section, nothing above the
  "What shipped" line mentioned `tokens`, `register()` or `PluginError`, although roundel is
  the family's `tokens` host and `packages/roundel/src/plugin.ts` has shipped. The
  requirements list still stops at R11.
- **The shared `schema.json` is looser than this host.** `src/schema.json` types `tokens` as
  any string key matching `^#[0-9a-fA-F]{6}$`; `plugin.ts` additionally closes the key set to
  ten names. An author validating only against the schema will believe a misspelt token is
  legal. The schema file is byte-identical across the family by design (PLAN 1.1), so
  tightening it is a cross-package edit and not roundel's alone.

## What is built (2026-09-16)

**One row per requirement, established from the tree rather than from this document's prose
about itself.** Before today this design recorded no per-requirement status in either shape
`scripts/plan-progress.ts` reads, so `designGap('roundel')` returned *"the design records no
per-requirement status, in either shape"* — eleven requirements, none of them accounted for.
A reader could not tell R11, which has no file at all, from R1, which has a truth table.

**The Status cell holds two words and nothing else**, `Built` or `Not built`, because the
checker matches `**Built**` exactly; `seniority`'s table learned that four spellings of one
word read as four missing rows. The version and the date belong in *Where*. A row saying
`Built` without a check in the last column is a claim, so every row names one — and an honest
`Not built` is a better record than a `Built` nothing would catch.

| R | Status | Where | The check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** | `src/policy.ts` — `outputMode(rt, opts)`, the only reader of `CLI_ACCESSIBLE`, `CI` and `isTTY` in the package | `policy.test.ts` → *"outputMode — R1, first match wins"*, one row per mode |
| R2 | **Built** | `src/policy.ts` — `colorLevel(rt, opts)`, `forced()`, `flagged()`, the CI vendor table and the `TERM`/`COLORTERM` fallback | `policy.test.ts`, eight `colorLevel` blocks incl. *"an explicit 'colour off' is never overridden into colour on"* and *"the one place roundel and chalk disagree, on purpose"*; `npm run compat -- chalk` **59 / 59** at chalk 6.0.1 |
| R3 | **Built** | `src/tokens.ts` — the nine tokens over `util.styleText`, identity while `flown.level` is 0; the only file in the package that emits an escape | `tokens.test.ts`: identity before `fly()`, the same paint under every mode once something asked, `json` never painted |
| R4 | **Built** | `src/theme.ts` — `fly()`, `DEFAULTS` (rock and juniper, the variant chosen by contrast against the ground), `rgb256`/`toOklab`/`degrade` for the levels below truecolor. Signature restated below | `theme.test.ts` → *"fly — defaults"*, *"fly — hex below truecolor"*, *"conformance: AA by default, AAA on request"* |
| R5 | **Built** | `src/contrast.ts` — `contrast`, `luminance`, `channels`, `AA`, `AAA`, `floors`, `reportTheme`; `src/theme.ts`'s `fly()` throws below the floor, and `audit()` is the same judgement as data. The 256-colour substitute is checked too, which R5 does not promise and the package does | `contrast.test.ts` against the WCAG reference values; `theme.test.ts` → *"fly — the contrast gate (R5)"* and *"the 256-colour substitution is checked, and chosen to pass"* |
| R6 | **Built** | `src/chalk.ts` — the Proxy chain, `Chalk`, `chalkStderr`, `supportsColor`, `supportsColorStderr`, the four name arrays; chalk's mutable `level` lives inside the façade and nothing else reads it | `npm run compat -- chalk` — **59 / 59, 100.0%** on chalk 6.0.1's own vendored suite, level with the control's 59 / 59 (re-vendored 2026-09-30, [D-20260930-roundel-chalk-601-regrade](../../decisions/D-20260930-roundel-chalk-601-regrade.md); 58 / 58 at 6.0.0); `chalk.test.ts` for the seams the suite does not reach |
| R7 | **Built** | `src/subpath-isolation.test.ts` derives its subject from `package.json`'s `exports`, so it covers all seven published entries — the five R7 names plus `./plugin` and `./schema.json`, which R7 does not. `sideEffects: false`; `index.ts` is re-exports only. Restated below | `subpath-isolation.test.ts` → *"every isolation rule names a published entry"* and *"every internal rule names a file that exists and is not itself an entry"*, which is what closes `runtime.js` |
| R8 | **Built** | Both halves, since 2026-09-30. **Bytes:** `src/weight.test.ts` against `dist/` — `./tokens` 3,300 (picocolors), `./chalk` 9,370 (chalk 6.0.0's own `index.js` + `utilities.js`; re-measured at 6.0.1 when re-vendored, 9,521, and the budget held at the smaller number) — and B4's tree-inclusive ratios `roundel/tokens ÷ picocolors` and `roundel/chalk ÷ chalk`, each under `max: 1`. **Time:** B2 (`benchmarks/axes/perf.ts`) spawns `picocolors`, `roundel/tokens` and `roundel/chalk` in its interleaved rounds, under `NO_COLOR`, and gates `cold-start-delta-ms` — the median of per-round differences over picocolors — at `DELTA_CEILING_MS = 10`. Measured on an M4 Pro, 60 rounds: `roundel/tokens` +1.26 ms, `roundel/chalk` +2.97 ms. How "≤ picocolors spawn delta" is read, and the literal reading that is not met, is [D-20260930-roundel-r8-spawn-bar](../../decisions/D-20260930-roundel-r8-spawn-bar.md); restated below | `weight.test.ts` for the bytes. For the time, `benchmarks/ratchet.test.ts` → *"B2 cold start — roundel R8, the paired-delta gate over picocolors"* (red at +10.01 ms, green at +10, and the median of differences rather than a difference of medians); `perf.test.ts` → *"print the floor’s line under a CI runner’s environment, because each row sets NO_COLOR"*; `fixtures.test.ts` proves every fixture before anything is timed. Each was seen red on a mutated `perf.ts` |
| R9 | **Built** | Restated below. `src/runtime.ts` is the one file in the package that names the process, through a guarded `(globalThis as { process?: … }).process` bound to a local; `./chalk` is the only entry that reaches it, because chalk's contract is "detect the terminal at import". Every other module takes a `Runtime` | `packages/burgee/src/process-reference-lock.test.ts` — `roundel/src/runtime.ts` is the package's single allow-list entry, and the lock catches the *binding* wherever the process is bound from, not only a `process.env` member read. `subpath-isolation.test.ts`'s `INTERNAL_ALLOWED` pins `runtime.js` to reaching nothing |
| R10 | **Built** | `package.json` — `"type": "module"`, and every code entry carries `types`/`import`/`default` | `shape.test.ts` → *"is consumable from CommonJS too — the same ESM file, through require(esm) (K2)"* and *"`roundel/chalk` is one import away too — chalk's default export, as ESM and through require(esm) (R6, R10)"*, both spawning a real `node` against an installed tarball |
| R11 | **Built** | Since 2026-09-30. `src/import.ts` — `fromBase16(scheme, opts?)` (a Base16 scheme's YAML text in either layout, its JSON text, or the object a reader made of it), `fromITerm(plist, opts?)` (an XML `.itermcolors`), `BASE16_SLOTS` and `ITERM_SLOTS` (the mapping, as data), and `ImportError` with `E_IMPORT_FORMAT`, `E_IMPORT_SLOT` and `E_IMPORT_CONTRAST`, each with a `fix`. Contrast-checked by `audit()`, so an import is refused exactly when `fly()` would refuse it ([D-20260930-roundel-import-mapping](../../decisions/D-20260930-roundel-import-mapping.md)). `./import` is in `exports` with a 16,500 B budget (measured 16,415, the theme graph included) and is not re-exported from the root. The docs gallery is generated from the scheme files by `scripts/roundel-gallery.ts`; "hundreds on day one" is not met, restated below | `import.test.ts` — 50 cases against three real files in `src/__fixtures__/` (a 0.11-layout Base16 scheme, an original-layout one refused at 4.46:1, a Dracula `.itermcolors`), every refusal asserted with its code and fix, and 25 mutations of `import.ts` each turned red; `weight.test.ts` and `subpath-isolation.test.ts` for `./import`; `scripts/roundel-gallery.test.ts` for the page |
| R12 | **Built** | `src/terminal.ts` — `interactive(rt)`, `unicode(rt)`, `AGENTS`; its own subpath, reaching nothing, not re-exported from the root. Recorded here on 2026-09-30: R12 was added on 2026-09-28 (D-181) without a row in this table | `terminal.test.ts`; `weight.test.ts` (`./terminal`, 1,000 B, measured 878); `subpath-isolation.test.ts` |

### Requirements restated (2026-09-16), with the old wording kept

A bar that is restated and then vanishes is indistinguishable from one that was quietly met,
so each of these keeps the sentence it replaces.

- **R4's signature.** *Was:* "`fly(theme)` sets the process theme once". *Is:* `fly(theme, rt, opts?)`
  — the runtime is a required second argument and `{ json }` an optional third, because the level
  is decided from the runtime at the moment the theme is flown and R2 forbids reading it any
  other way. Nothing about what `fly` *does* changed; the one-argument spelling was never
  shipped.
- **R7's subpath list.** *Was:* "`./policy`, `./tokens`, `./theme`, `./contrast`, `./chalk`".
  *Is:* every entry in the `exports` map — those five plus `./plugin` and `./schema.json`. The
  lock already reads the map rather than a list, so it has been covering seven for as long as
  seven have been published; R7's text is what was short, not the check.
- **R9's claim.** *Was:* "Nothing reads `process.*`; `process-reference-lock` extends here."
  *Is:* **one named file reads the process and every other module takes a `Runtime`** — the
  family's one-seam rule, with `roundel/src/runtime.ts` on
  `process-reference-lock.test.ts`'s allow-list. This is a weaker claim than R9 made and it is
  the one the package keeps: `./chalk` has to detect the terminal at import to pass chalk's
  suite, and there is nowhere else for that read to live. Y9 made the seam deliberate; R9 was
  never rewritten to match.
- **R1's inputs.** *Was:* "pure over `{ isTTY: { stdout }, env, json?: boolean }`". *Is:* pure
  over a `Runtime` (`{ env, isTTY: { stdout }, argv? }`) plus a separate `{ json }` options
  argument — `json` is the engine's knowledge of the run, not a field of the runtime, and
  `argv` is where R2's `--color` flags are read from. Same inputs, two parameters.
- **R8's time half** (2026-09-30). *Was:* "`./tokens` ≤ picocolors (3.3 KB, +10 ms); `./chalk`
  ≤ chalk 6.0.0 bytes and ≤ picocolors spawn delta". *Is:* each of `./tokens` and `./chalk`
  starts in no more than picocolors' spawn + 10 ms, the median of per-round differences in
  B2's interleaved spawns. The bytes are unchanged. Read this way because the parenthesis gives
  picocolors' two costs and the `./chalk` clause restates the second; the literal reading —
  `./chalk`'s delta over bare node at or under picocolors' own, 2.97 ms — is not met (5.68 ms)
  and cannot be by a four-module ESM entry that imports `node:util`, which alone costs 1.16 ms
  ([D-20260930-roundel-r8-spawn-bar](../../decisions/D-20260930-roundel-r8-spawn-bar.md)).
- **R11's gallery** (2026-09-30). *Was:* "The docs gallery is generated from them; hundreds of
  themes on day one, none hand-written." *Is:* the gallery is generated from the scheme files
  committed under `packages/roundel/src/__fixtures__/` — three today — and none of it is
  hand-written. Hundreds on day one would mean redistributing the tinted-theming and
  iTerm2-Color-Schemes corpora, several hundred third-party files, which is the owner's call;
  the default until then is a gallery that grows a file at a time
  ([D-20260930-roundel-import-gallery](../../decisions/D-20260930-roundel-import-gallery.md)).

### What this reconciliation found that the design did not record

- **R8's time half had no instrument** (closed 2026-09-30: B2 gates it — see R8's row). Covered in the row above. This is the only place in
  the design where a comment inside the code asserts a measurement exists elsewhere and it does
  not — which is the shape of defect `scripts/plan-progress.ts`'s own header keeps a tally of.
- **`roundel/plugin` and `roundel/schema.json` are shipped surface no requirement governs.**
  "Where this document and the code disagree" already says the plugin host is absent from the
  requirements; stated as a status, it means two of seven published subpaths are covered by
  R7's lock and by no requirement's *intent*. `plugin.ts` is graded by `plugin.test.ts` and by
  the family's `plugin-contract`, so it is not ungraded — it is unowned by this list.

## Rejected alternatives

- **Depending on `burgee` for `contrast`.** Reverses the arrow (U1). Sixty lines duplicated
  beats a dependency; the two copies share a test vector file.
- **Chalk's mutable global level as the family's model.** It is why chalk and ora disagree.
  Kept only inside the façade to pass chalk's tests; everything else reads the policy.
- **Claiming contrast on 16-colour output.** The palette is the user's terminal theme;
  a number there would be invented.
- **Template-literal API (`chalk\`{red x}\``).** Removed in chalk 5; not resurrected.

## Out of scope

- Gradients, animations, hyperlinks (`ansi-escapes`) — `flagstaff` or never.
- Colour conversion beyond hex → nearest 256/16 (no HSL, no named CSS colours).
- A CLI. `roundel` is a library; `burgee brand` already owns the brand tooling.
