# Wave 3, ranked from measured evidence — 2026-10-12

The owner's instruction of 2026-10-12: create `intent.md` and `spec.md` files, many of them, and
execute; the goal is the best CLI framework and package family, state of the art, giving real
value rather than replacing what exists. Wave 2 ([`next-wave-2026-10.md`](./next-wave-2026-10.md))
holds the nine intents now being built, and none of them is re-proposed here. This file is the
wave-3 candidate table: every candidate the evidence names, whether it was taken, and why.

Read "real value" as: something a user of the family gets that they do not get today. A graded
drop-in counts only where it removes an install from a user's tree. Re-doing an existing intent
does not count.

## How the candidates were found

1. **The incumbents' trackers**, from the dumps in [`issues/`](./issues/) (2026-09-05, and
   2026-09-08 for `issues/output-stack/`). Reactions and comments were computed from the JSON,
   and [`tracker-gap-analysis.md`](./tracker-gap-analysis.md),
   [`competitor-open-issues.md`](./competitor-open-issues.md) and
   [`output-stack-open-issues.md`](./output-stack-open-issues.md) were read in full.
2. **The measured gaps.**
   - `benchmarks/results/cli-benchmarks/2026-10-12-1492ed8-ci.json`, the newest CI reading on
     `main`: every claim, band and compat rate.
   - `benchmarks/results/external-floor/2026-10-11.json`: cli-agent-lint **91.5% (A)**, clispec
     **14 / 24**. Both remainders are owned by wave 2.
   - `npm run ledger -- gaps --open` on `d8569f5`: two A rows, one B row, C3.
   - `.sdlc/bands/foundation-ceilings.json`.
3. **Every intent's Out of scope, Open questions and unmet criteria**, plus the draft
   [`upstream-watch`](../intents/upstream-watch/intent.md) and the unbuilt rows
   `u5-weight-claim` R2/R3 and `compat-oracle` C1.
4. **Built is checked against the tree.** Each "already built" verdict below names its file.

**Re-measurement, 2026-10-12.**
- *Done.* Comment counts on the issues that decide a rank were re-read from their public
  github.com pages: yargs #793 (27), #1318 (9), #1076 (4), #1649 (7); ink #222 (23 comments,
  22 reactions across them); cli-table3 #57 (0 comments). Each matches the dump. Reaction counts
  do not render on those pages ("Reactions are currently unavailable"), so reactions carry the
  dump's date.
- *Refused.* Weekly downloads (`api.npmjs.org`) and the live OpenSSF Scorecard
  (`api.securityscorecards.dev`). This environment's network policy answers 403 to both at the
  proxy (`$HTTPS_PROXY/__agentproxy/status`, `connect_rejected`). Every download figure is
  therefore the repository's own, from [`replacement-map.md`](./replacement-map.md) (2026-09-09)
  or [`dependents.md`](./dependents.md) (2026-09-23), and says so.

## How they were ranked

Score = demand × fit ÷ cost, each scored 1–5, with the scale written down so two candidates
cannot be scored by two rules:

- **Demand.**
  - 5: more than 100 M weekly downloads at stake.
  - 4: 20 or more comments on one issue, or 30–100 M weekly.
  - 3: 9 or more reactions or comments on one issue, the same defect in three or more trackers,
    or a published claim within 2% of its gate.
  - 2: less than that.
  - 1: no number.
- **Fit**, with `PRINCIPLES.md`: packages never services, zero external dependencies, every
  caller first-class, static projection, plugins as data, measured not asserted. A
  parity-only feature, which the drop-ins already serve, scores 3.
- **Cost.** 1 for one or two PRs in one file group, 3 for a compat-oracle grade of a new host
  or major, and 5 for a decision reversal plus more than four PRs.

**Excluded outright:** anything needing a hosted service, a new external dependency or an
outward action (posting, other repositories), and the decisions marked as the owner's: cold
start (#934) and the first CLI adopter (#954).

### Jev and Quint

Stage 1 per [`JEV-AND-QUINT.md`](../JEV-AND-QUINT.md). Jev did not run: `TYPESAFE_API_KEY` is not
set in this environment, and the contract for that case is *skipped, never failed*. The answers
below are the author's, in Jev's typed questions, and every one is marked `?` (confidence below
0.7) so a human checks them at the Design gate. The composite is Jev's weighted sum:
3 × user_impact + 2 × incumbent_gap + 2 × risk_reduced.

| intent | user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| :-- | --: | --: | --: | --: | :-- | :-- |
| `parse-refusals` | 3? | 2? | 3? | 19 | yes? | no? |
| `foundation-claims-watched` | 1? | 1? | 2? | 9 | yes? | no? |
| `table-column-widths` | 2? | 3? | 1? | 14 | yes? | no? |
| `supports-color-drop-in` | 2? | 2? | 1? | 12 | yes? | no? |
| `caique-quiet-seam` | 2? | 1? | 1? | 10 | yes? | no? |
| `completion-context` | 2? | 3? | 0? | 12 | yes? | no? |
| `previous-majors` | 2? | 3? | 2? | 16 | yes? | no? |
| `controlroom-scroll-pane` | 1? | 3? | 0? | 9 | yes? | low? (see its spec) |
| `frames-fit-the-screen` | 2? | 2? | 3? | 16 | yes? | no? |
| `facade-projection-fidelity` | 3? | 2? | 2? | 17 | yes? | no? |

No answer to `needs_model` is above 0.7, so no spec carries a `.qnt`. `controlroom-scroll-pane`
has state (follow-tail against user scroll, resize), and its spec says why a property test over
random action sequences stands in for a model: every transition is one synchronous reducer
call.

## Selected: ten intents, each with a `spec.md`

| rank | intent | package | demand (the number, and where it is) | D | F | C | score | R |
| --: | :-- | :-- | :-- | --: | --: | --: | --: | --: |
| 1 | [`parse-refusals`](../intents/parse-refusals/intent.md) | burgee | yargs #1318: 12 reactions, 9 comments; #1076: 9 reactions, 4 comments. `requirePositionals` (`execute.ts` line 500) checks only "too few" | 3 | 5 | 1 | 15 | 4 |
| 2 | [`foundation-claims-watched`](../intents/foundation-claims-watched/intent.md) | six packages, compat-oracle, benchmarks | `lighter-than-tinyexec` 0.986 against 1, unwatched; 6 of 10 packages have no `competitors.json`; 17 incumbent weights measured once on 2026-09-23 | 3 | 5 | 1 | 15 | 6 |
| 3 | [`table-column-widths`](../intents/table-column-widths/intent.md) | flagstaff | cli-table3 #57: 11 reactions, the most in its dump; `TableOptions` has no per-column bound | 3 | 5 | 1 | 15 | 4 |
| 4 | [`supports-color-drop-in`](../intents/supports-color-drop-in/intent.md) | roundel | `supports-color` 441,630,802/wk (`replacement-map.md`, 2026-09-09); no subpath, no `GRADED` row | 5 | 5 | 2 | 12.5 | 5 |
| 5 | [`caique-quiet-seam`](../intents/caique-quiet-seam/intent.md) | caique | the only open B gap, `B-20261011-caique-quiet`, with its recommendation written | 2 | 5 | 1 | 10 | 4 |
| 6 | [`completion-context`](../intents/completion-context/intent.md) | burgee | yargs #793: 27 comments, re-read 2026-10-12; `completeDynamic` passes only `partial` | 4 | 5 | 2 | 10 | 4 |
| 7 | [`previous-majors`](../intents/previous-majors/intent.md) | burgee, compat-oracle | top-50 dependents: yargs 17 has 22 packages and 165.8 M/wk against 18's 16 and 74.0 M; commander 14 has 14 and 58.5 M against 15's 7 and 41.2 M (`dependents.md`); commander 14 grades 1,329 / 1,331 | 5 | 5 | 3 | 8.3 | 6 |
| 8 | [`controlroom-scroll-pane`](../intents/controlroom-scroll-pane/intent.md) | controlroom | ink #222: 23 comments, open since 2019; ink #765: 9 reactions; `fit` in `compose.ts` drops a pane's tail | 4 | 4 | 2 | 8 | 6 |
| 9 | [`frames-fit-the-screen`](../intents/frames-fit-the-screen/intent.md) | flagstaff, caique | one defect in five trackers: log-update #51, ora #121, listr2 #720, ink #973, clack #236; `projection.ts` lines 66–68 leave it to the caller | 3 | 5 | 2 | 7.5 | 5 |
| 10 | [`facade-projection-fidelity`](../intents/facade-projection-fidelity/intent.md) | burgee | `_optionSpecs()` drops `argChoices`, `conflictsWith` and `hidden`; `.alias()` 9 and `.aliases()` 5 call sites in five large CLIs (`commander-api-usage.md`); cobra #2362's `enum` gap | 3 | 5 | 2 | 7.5 | 6 |

Fifty requirements in all. Rank 9 and rank 10 tie at 7.5 with the first candidate left out, the
default root command. The tie was broken on Jev's `risk_reduced`, weight 2: a frame that
outgrows the screen leaves garbage the next paint cannot reach (3), and a façade schema that
omits valid values sends an agent a wrong tool definition (2). A missing default command has an
existing workaround, a named command (1).

What each gives a user that they do not get today:

- **parse-refusals.** A wrong call fails loudly with a runnable correction, instead of
  succeeding with lost input.
- **foundation-claims-watched.** Every number the family publishes is re-read when its
  incumbent releases, not only the numbers of four packages.
- **table-column-widths.** A request cli-table3 never shipped, with the static projection kept
  whole.
- **supports-color-drop-in.** One `overrides` line removes the most-downloaded colour package,
  by a grade.
- **caique-quiet-seam.** `--quiet` means quiet for every package in the family.
- **completion-context.** Completions that depend on the rest of the line: the 27-comment
  question, answered.
- **previous-majors.** `burgee migrate` serves most dependents as they are, with no upgrade
  first.
- **controlroom-scroll-pane.** The longest-open Ink request, with the static projection still
  whole.
- **frames-fit-the-screen.** No more garbage lines from a tall live region, in any package.
- **facade-projection-fidelity.** A migrated program's schema, MCP tools and completions are
  as true as its own declarations.

## Execution order

Lanes, not a queue. Wave 2's two rules still hold:

1. **One compat-oracle lane at a time**, because every graded host edits `GRADED`, `DROP_INS`
   and `GRADED_VERSIONS` in one file.
2. **One lane in `failure.ts` and `schema.ts` at a time.**

Wave 3 adds a third: **one lane in `execute.ts`'s parse and dispatch at a time**, because three
intents here touch it. Wave 2's compat-oracle work (`graded-override-targets`,
`inquirer-prompts-drop-in`, `extra-typings-drop-in`) is ahead of wave 3's in that lane.

| step | work | depends on | lane | runs beside |
| --: | :-- | :-- | :-- | :-- |
| 0 | **Status corrections, one docs PR, no intent.** `u5-weight-claim` R2 is met: `lighter-than-yargs` reads **0.969** against 1 in every CI reading since 2026-10-06, including `2026-10-12-1492ed8-ci.json`, so R3 is moot. `upstream-watch` steps 1–4 shipped on 2026-09-08 and 2026-09-09 and the daily pass runs, while its header still says `draft`. `compat-oracle` C1's majors half is built (`SUPPORTED_MAJORS`, generated page, D-145), and its `peerDependencies` half is rejected below. The roadmap README's "Where this stands — 2026-09-09" snapshot is re-dated rather than edited in place: it says yargs 804 / 804 (816 / 816 in the 2026-10-12 CI reading) and "3 `approved`" (36 `approved`, 24 `review`, 11 `draft`, 2 `dropped`, 1 `shipped` after this wave, counted from each `intent.md`) | — | docs | everything |
| 1 | `foundation-claims-watched` R1–R5 | — | scripts | 2, 3, 4 |
| 2 | `parse-refusals` R1–R4 | wave 2's `clispec-conformance` R6 merged (both touch `failure.ts`) | burgee parse | 1, 3, 4 |
| 3 | `table-column-widths` R1–R4 | — | flagstaff table | 1, 2, 4 |
| 4 | `caique-quiet-seam` R1–R4 | — | caique clack port | 1, 2, 3 |
| 5 | `frames-fit-the-screen` R1–R5 | — | flagstaff projection + caique `raw.ts` | 6, 7 |
| 6 | `facade-projection-fidelity` R1–R4 (façades), then R5–R6 (aliases) | R5 after step 2, in the parse lane | burgee façades, then burgee parse | 5, 7 |
| 7 | `foundation-claims-watched` R6 (B4 pairs) | step 1 | benchmarks | 5, 6 |
| 8 | `completion-context` R1–R4 | step 6's R5 (aliases change dispatch resolution) | burgee parse + completions | 9 |
| 9 | `controlroom-scroll-pane` R1–R6 | step 5 (the writer's height, R1 there) | controlroom | 8 |
| 10 | `previous-majors` R1, R2, R6 (commander 14) | wave 2's compat-oracle lane cleared | compat-oracle | 8, 9 |
| 11 | `supports-color-drop-in` R1–R5 | step 10 | compat-oracle + roundel | 12 |
| 12 | `previous-majors` R3–R5 (yargs 17) | step 11 | compat-oracle + burgee/yargs | 11 only if 11 is past its `GRADED` edit |

The workspace rule (at most two local agents doing install, test and push work) still caps any
step at two parallel lanes on one laptop. "Runs beside" names pairs that touch no common file.

## Rejected, and why

| candidate | evidence | D·F÷C | why not now |
| :-- | :-- | --: | :-- |
| Default (root) command for a native multi-command program | yargs #1331: 4 reactions, 16 comments; #2292: 5 and 6 | 7.5 | tied at the cut and lost on `risk_reduced`, since a named command is a working alternative. First in line for wave 4 |
| Typed, named positionals (`ctx.args`, `type`, `choices`, `schema` on `ArgumentSpec`) | yargs #1649: 10 reactions, 7 comments; citty #115, #138, #80; `commander-schema` line 98, unmet | 3·5÷3 = 5 | below the cut on cost (five requirements across parse, types, schema, MCP and completions). Wave 4, after `facade-projection-fidelity`, which it builds on |
| `caique/prompts` façade, graded | `prompts` 53,898,410/wk, last published 2021 | 4·5÷3 = 6.7 | the compat-oracle lane is full through wave 2 and wave 3. Next graded host after step 12 |
| `kleur`, `colorette`, `yoctocolors` façades | 70.9 M, 52.9 M, 34.5 M /wk | 4·5÷3 = 6.7 | the same lane. Three hosts for one job, so it is one intent when the lane opens |
| `seniority/dotenv-expand` | 36,722,404/wk | 4·5÷3 = 6.7 | the same lane |
| `caique/enquirer` façade | 31,002,435/wk, last published 2023 | 4·5÷3 = 6.7 | the same lane, and the largest API surface of the four |
| `cli-spinners` and `cli-boxes` as graded data drop-ins | 40.3 M, 29.0 M /wk; the data is already in `flagstaff/src/spinners.json` | 3·4÷2 = 6 | a data package's suite grades a JSON shape, not behaviour. Low value per grade |
| `bellpull/execa` façade | `execa` 150,608,357/wk, graded 0 / 1,179 (D-160) | 5·4÷5 = 4 | needs D-014 ("run result shape only") superseded, the largest cost in the table. A decision before a design |
| `paratext` at or under `ansi-escapes` in a bundle | `lighter-than-ansi-escapes` 1.63, `met: false` | 3·4÷4 = 3 | the remainder is the capability registry D-105 and D-108 chose. Reversing them is a decision, and the gap is already published as failing with a ratchet at 1.65 |
| `recovery-bytes` under commander's | burgee 164 against commander 31, ungated | 2·4÷2 = 4 | `agent-headroom` R6 forbids removing a hint to save bytes. A band first needs a decision on what the number should be |
| Runtime ratios above 1 | `roundel/chalk` 1.21, `caique/clack` 1.133, `linegauge/strip` 1.012 | 2·5÷2 = 5 | each has a downward-only ratchet in `.sdlc/bands/runtime-ratchets.json` and an owning package intent. Perf work inside existing intents, not new ground |
| Native `ask` taking an `AbortSignal` | clack #83: 9 comments | — | the issue asks for a cancellation *result* in place of a symbol, which native `ask` already returns (`Asked`, `ask.ts` line 52). The signal half is in the clack port (`clack-core.ts` line 46) |
| Separators and disabled choices on native `select` | clack #555: 2 reactions, 5 comments; #164 | 2·3÷1 = 6 | parity with inquirer and clack, which the drop-ins already serve |
| Differential test of `roundel/policy` against `getColorDepth` | picocolors #85: 7 reactions | 2·3÷1 = 6 | a test, which gives a user nothing until it finds a disagreement. Worth doing inside `supports-color-drop-in` if a case surprises |
| Table throughput at 1,000+ rows | cli-table3 #68: 7 comments | 2·5÷2 = 5 | a benchmark row with no claim behind it yet |
| `.env` layer in the engine's precedence | oclif/core #1075: 8 comments | 2·5÷2 = 5 | below the cut. `seniority/dotenv` exists for a program that wants it |
| Differential conformance (each issue case fails on plain commander or yargs) | unmet criteria in `commander-schema`, `commander-env`, `cli-testing-harness` | 1·5÷2 = 2.5 | internal evidence quality, with no user-visible change |
| `--format=ndjson` for `output.kind: 'stream'` | `manifest.ts` line 189 says it is unbuilt | 1 | no demand number |
| `compat-oracle` C1, `peerDependencies` half | every published `peerDependencies` is `{}` | — | **rejected on principle**: npm 7+ installs peer dependencies, so a drop-in naming `commander` as a peer would install the package it replaces. `SUPPORTED_MAJORS` is the declared range (D-145). Restated in step 0 |
| `u5-weight-claim` R2/R3 | — | — | **already met**: 0.969 against 1 since 2026-10-06. Corrected in step 0 |
| Cold start to 1.35 | `A-20261009-burgee-cold-start`: 1.423 on 2026-10-12 | — | owner-gated (#934) |
| The first CLI adopter | gap C3 | — | owner-gated (#954) and outward-facing |
| CII Best Practices badge | Scorecard's `CII-Best-Practices` reads 0 (`cii-answers.md`) | — | registration on bestpractices.dev is an outward action |
| The `braces` OSV waiver | expires 2026-11-30 | — | the owner's (`D-20261011-osv-lockfile-zero`) |
| `add()` during a closeout run | `D-20261011-closeout-late-add` | — | decided by the owner to keep today's behaviour. Pinned as an expected violation in `models.yml` |
| Everything in wave 2's rejected table | [`next-wave-2026-10.md`](./next-wave-2026-10.md) | — | unchanged: IME, back navigation, Kitty/Sixel, listr2, Bun/Deno matrices, SEA, man pages and the rest. Nothing measured since has moved them |

## Already built, so not candidates

Checked in the tree, 2026-10-12:

| item | where it is built |
| :-- | :-- |
| yargs #1069 lifecycle; #2394 help on a runtime failure; #1519 and #2118 flush | `execute.ts` |
| yargs #1312 lone `-` | `stdin-dash.ts` |
| yargs #1079 `NaN` | `validate.ts` |
| yargs #2254 `--no-*` completion; fish (#1904) and PowerShell (#1290) | `completions.ts` |
| Relations (#1093, #439, #1322) | `relations.ts` |
| commander #2549 custom env | `RunOptions.env` |
| commander #2346 nearest `package.json` | `pkg.ts` |
| Electron argv | `commander/command.ts` |
| Vim keys (Inquirer #1900) | `caique/src/inquirer-keys.ts` |
| Synchronized output (ink D#715) | `flagstaff/src/projection.ts` |
| OSC 52, notifications, title | `paratext/src/builtins.ts` |
| `isTTY` over `isCI` (clack #286) | `roundel/src/policy.ts` |
| boxen titles and footers | `flagstaff/src/boxen.ts` |
| Two spinners (ora #116) | `flagstaff/src/tasks.ts` |
| Themes | `roundel/src/theme.ts` |
| Multi-line editing | `caique/src/line-edit.ts` |
| Links in table cells | `flagstaff/src/link.ts` |
