# Wave 4, ranked from measured evidence — 2026-10-12

The owner's direction of 2026-10-12: *"the best framework ever existed, with a package family
that is state of the art"*. That means winning against every incumbent on the trade-off of value,
performance, scale and robustness, with real value rather than only replacing what exists. The
owner delegated the judgement on budgets and trade-offs, and every call made here is a file in
`.sdlc/decisions/` dated 2026-10-12.

This run covers Stages 1 and 2 only: ten `intent.md` and `spec.md` pairs, each at `review`, and
this file. Waves 2 and 3 ([`next-wave-2026-10.md`](./next-wave-2026-10.md),
[`next-wave-3-2026-10.md`](./next-wave-3-2026-10.md)) hold the intents still being built, and none
of them is re-proposed here. Read "real value" as wave 3 did: something a user of the family gets
that they do not get today.

## How the candidates were found

1. **Wave 3's rejected list**, every row re-read against the tree on `main` at `6ce6699`.
2. **The gaps opened on 2026-10-12.** `npm run ledger -- gaps --open` lists seven B rows dated
   that day, plus the two A rows (cold start, the chat ink Windows line).
   `B-20261012-commander-argument-choices` is on #1074's branch and not yet on `main`; it is read
   from there.
3. **The decisions dated 2026-10-12**, all fourteen, for the trims and follow-ups they named and
   did not take: the `.d.ts` trim (D-20261012-burgee-tarball-rebaseline), the locale eval median
   (D-20261012-agent-eval-turn-budget), the commander residual
   (D-20261012-commander-front-end-floor).
4. **CI, read through the Actions API on 2026-10-12.** The last 30 completed Compatibility runs
   (20:03Z to 23:29Z): 6 succeeded, 24 cancelled. The six successes, all pull requests, took 43 to
   79 minutes from start to last update. Each PR runs 13 compat jobs (ratchet, six `matrix`, six
   `floor`). The Windows timeouts come from `compat.yml`'s own comments, #1077's two failures
   named in #1085, and `scripts/changeset-check-lock.test.ts`'s 120 s describe timeout.
5. **The trackers.** Every issue in [`issues/`](./issues/) at 9 or more reactions or comments was
   ranked by count and checked against the tree and the earlier waves. None is new ground: each
   is built (yargs #684 groups and #1964 in `help.ts`, #873 in `burgee/spec.md` V1, #1532 S7),
   taken by an earlier wave, or already in a rejected table. The ones a wave-4 intent takes are
   yargs #1331 and #2292 (`default-command`), yargs #1649 and citty #115, #138, #80
   (`typed-positionals`). The rest are below under *Rejected*.

**Measurements refused here.** Weekly downloads are the repository's own, from
[`replacement-map.md`](./replacement-map.md) (2026-09-09), as in wave 3; this run did not
re-read `api.npmjs.org`.

## How they were ranked

The same scale as wave 3, so the two waves compare. Score = demand × fit ÷ cost, each 1–5:

- **Demand.** 5: more than 100 M weekly downloads at stake. 4: 20 or more comments on one issue,
  or 30–100 M weekly. 3: 9 or more reactions or comments on one issue, the same defect in three or
  more trackers, or a published claim within 2% of its gate. 2: less than that. 1: no number.
- **Fit**, with the family's principles: packages never services, zero external dependencies,
  every caller first-class, static projection, plugins as data, measured not asserted. A
  parity-only feature scores 3.
- **Cost.** 1 for one or two PRs in one file group, 3 for a compat-oracle grade of a new host or
  major, 5 for a decision reversal plus more than four PRs.

Two CI candidates have no user-side demand number. They are scored by the nearest row of the same
scale, and say so: the same defect recurring in three places (demand 3). An internal candidate
cannot score above 3 on demand by this rule, so it cannot outrank a user-facing one on demand
alone.

### Jev and Quint

Stage 1 per [`JEV-AND-QUINT.md`](../JEV-AND-QUINT.md). Jev did not run: Jev is deferred
(2026-10-12) and `TYPESAFE_API_KEY` is not set, so the contract is *skipped, never failed*. The
answers are the author's, in Jev's typed questions, and `?` marks each one below 0.7 confidence,
for a human at the Design gate. Composite = 3 × user_impact + 2 × incumbent_gap + 2 ×
risk_reduced. Each intent carries its own row under `## Jev triage`.

| intent | user_impact | incumbent_gap | risk_reduced | composite | ready_for_spec | needs_model |
| :-- | --: | --: | --: | --: | :-- | :-- |
| `closeout-at-incumbent-weight` | 2? | 3 | 0 | 12 | yes | yes? |
| `declaration-summaries` | 3? | 2? | 0 | 13 | yes | no |
| `schema-bytes-gated` | 2 | 1 | 2? | 12 | yes | no |
| `fix-lines-every-shell` | 1 | 2? | 2 | 11 | yes | no |
| `locale-pack-in-five` | 1 | 1? | 1? | 7 | yes | no |
| `colour-facades` | 2 | 3 | 0 | 12 | yes | no |
| `ci-affected-lanes` | 0 | 0 | 2? | 4 | yes | no |
| `windows-lane-holds` | 0 | 0 | 3? | 6 | yes | no |
| `default-command` | 2 | 2 | 1 | 12 | yes | no? |
| `typed-positionals` | 3? | 2 | 2? | 17 | yes | no |

One `needs_model` is routed to Quint: `closeout-at-incumbent-weight`, where a lean drop-in core
and the phased registry share one hook list per process. Its spec names `lean.qnt`, its
`val safety` (`onceEach` and `noLostHook`), and three mutations it must catch. `default-command`
is `no?`: dispatch is a pure function of argv and the manifest with no await between steps, so
its spec uses a table of argv shapes instead.

## The candidate table

Twelve candidates, ranked. Ten are taken.

| rank | candidate | package | demand (the number, and where it is) | D | F | C | score | taken |
| --: | :-- | :-- | :-- | --: | --: | --: | --: | :-- |
| 1 | [`closeout-at-incumbent-weight`](../intents/closeout-at-incumbent-weight/intent.md) | closeout, benchmarks | `signal-exit` 198,913,643 /wk; `closeout/signal-exit` 1.272× and `closeout/exit-hook` 2.929× by B4 (two open gaps) | 5 | 5 | 2 | 12.5 | yes |
| 2 | [`declaration-summaries`](../intents/declaration-summaries/intent.md) | every package (burgee first) | burgee 246,526 B gzipped against commander's 52,736; 240,393 B of `.d.ts`; 176 exported multi-paragraph blocks | 2 | 5 | 1 | 10 | yes |
| 3 | [`schema-bytes-gated`](../intents/schema-bytes-gated/intent.md) | benchmarks | `schema-bytes` 1,678 → 4,752 B seen only by a band breach (open gap) | 2 | 5 | 1 | 10 | yes |
| 4 | [`fix-lines-every-shell`](../intents/fix-lines-every-shell/intent.md) | burgee | every `fix:` line POSIX-quoted; PowerShell fails on `'\''` (open gap) | 2 | 5 | 1 | 10 | yes |
| 5 | [`locale-pack-in-five`](../intents/locale-pack-in-five/intent.md) | burgee | eval median 7 against a target under 6 (D-20261012-agent-eval-turn-budget) | 2 | 5 | 1 | 10 | yes |
| 6 | [`colour-facades`](../intents/colour-facades/intent.md) | roundel, compat-oracle | kleur 70.9 M + colorette 52.9 M + yoctocolors 34.5 M = 158,336,748 /wk, ungraded | 5 | 5 | 3 | 8.3 | yes |
| 7 | [`ci-affected-lanes`](../intents/ci-affected-lanes/intent.md) | workflows, scripts | 24 of 30 compat runs cancelled; 13 jobs per PR; data-only PRs (#1062, #1081) run all of them | 3 | 5 | 2 | 7.5 | yes |
| 8 | [`default-command`](../intents/default-command/intent.md) | burgee | yargs #1331: 4 reactions, 16 comments; #2292: 5 and 6 | 3 | 5 | 2 | 7.5 | yes |
| 9 | [`windows-lane-holds`](../intents/windows-lane-holds/intent.md) | scripts, burgee tests | three recurring Windows timeouts: PowerShell completions (#1077 twice), `changeset-check-lock`, install cases | 3 | 5 | 2 | 7.5 | yes |
| 10 | `caique/prompts` façade, graded | caique, compat-oracle | `prompts` 53,898,410 /wk, last published 2021 | 4 | 5 | 3 | 6.7 | no |
| 11 | [`typed-positionals`](../intents/typed-positionals/intent.md) | burgee | yargs #1649: 10 reactions, 7 comments; citty #115, #138, #80; gap `B-20261012-commander-argument-choices` | 3 | 5 | 3 | 5 | yes |
| 12 | MCP `2026-07-28` stateless revision | burgee | gap `B-20261012-mcp-2026-07-28-stateless`; no client measured that speaks only that revision | 2 | 5 | 2 | 5 | no |

**Ties and the two out-of-order picks.**

- Ranks 2–5 tie at 10 and are ordered by Jev's composite (13, 12, 11, 7).
- Ranks 7–9 tie at 7.5. `default-command`'s composite is 12, above both CI candidates, but
  `ci-affected-lanes` is kept first among the three: every later PR in this wave runs faster
  once it lands, so it is also first in the execution order.
- **`typed-positionals` is taken at 5 and `caique/prompts` is left at 6.7.** The compat-oracle
  lane is serial and holds `colour-facades` (8.3) as wave 4's one host group; `prompts` could not
  start in this wave whatever its score. `typed-positionals` closes an open gap, was named for
  wave 4 by wave 3, and runs in a different lane.
- **The MCP revision ties `typed-positionals` at 5 and is left out.** The gap itself records that a
  dual-era client falls back to `initialize` after `server/discover` returns `method not found`,
  and no `2026-07-28`-only client is measured. D-20261012-wave-4-selection records the revisit
  trigger: a `b1-mcp-arm` reading or a client release that shows one.

What each taken intent gives a user that they do not get today:

- **closeout-at-incumbent-weight.** `overrides` to closeout costs no bytes over signal-exit and
  exit-hook, the 200 M/wk exit-handler path.
- **declaration-summaries.** A smaller install for every package, with the hover text kept.
- **schema-bytes-gated.** The document every agent reads first cannot grow without a decision.
- **fix-lines-every-shell.** A Windows agent's retry runs as printed.
- **locale-pack-in-five.** A translator, person or agent, learns everything they need from one
  `check` run.
- **colour-facades.** Three more colour packages leave a user's tree by a graded line.
- **ci-affected-lanes.** CI time per PR falls; the full matrix still guards `main`.
- **windows-lane-holds.** A Windows-only red is a real failure, never a busy runner.
- **default-command.** A native program runs with no command name, with its own help.
- **typed-positionals.** An argument's type and valid values reach every agent surface.

Requirements per intent: closeout 5, declarations 4, schema-bytes 3, fix-lines 4, locale 3,
colour 5, CI lanes 4, Windows 5, default command 5, typed positionals 6: **44** in all. Each
requirement names a check that fails on `main` today, or is marked `?` where the check reads
something that can only be read the day it is built (`windows-lane-holds` R5).

## Lanes and file-overlap rules

Wave 2's two rules and wave 3's third hold. Wave 4 adds three, each written as the set of files
only one open PR may edit at a time:

| lane | intents | files only one open PR edits at a time |
| :-- | :-- | :-- |
| **workflows** (new) | `ci-affected-lanes` R2–R3, `windows-lane-holds` R1 | `.github/workflows/*.yml`, `scripts/lint-workflows.ts` |
| **weight ratchets** (new) | `closeout-at-incumbent-weight`, `colour-facades` R4, `typed-positionals` R5 | `benchmarks/axes/weight.ts`, `scripts/subpath-weight-lock.test.ts` |
| **published artifacts** (new) | `declaration-summaries` | `scripts/strip-comments.mjs`, `.sdlc/bands/artifact-size-baseline.json` (also edited by open #1087) |
| parse and dispatch (wave 3) | `default-command`, `typed-positionals` R1–R4 | `packages/burgee/src/execute.ts`, `manifest.ts`, `definition.ts` |
| `failure.ts` and `schema.ts` (wave 2) | `fix-lines-every-shell`, `typed-positionals` R3–R4, `default-command` R4 | `packages/burgee/src/failure.ts`, `schema.ts`, `unknown-option.ts` |
| compat-oracle (wave 2) | `colour-facades` | `packages/burgee/src/compat.ts` (`GRADED`, `DROP_INS`, `GRADED_VERSIONS`), `packages/compat-oracle/src/hosts.ts` |
| benchmarks reliability | `schema-bytes-gated` | `benchmarks/axes/reliability.ts` |
| burgee check | `locale-pack-in-five` | `packages/burgee/src/check.ts`, `locale-pack-schema.json` |
| test files | `windows-lane-holds` R2–R5 | the root-suite files each fix touches; no two PRs edit one file |

**One file nobody in wave 4 edits:** `packages/flagstaff/src/projection.ts` and
`packages/caique/src/raw.ts` stay `frames-fit-the-screen`'s while its budget gap is open.

The workspace rule (at most two local agents doing install, test and push work) caps any step at
two parallel lanes on one laptop. "Runs beside" names pairs that touch no common file.

## Execution order

| step | work | depends on | lane | runs beside |
| --: | :-- | :-- | :-- | :-- |
| 0 | This PR: ten intents, ten decisions, this file, the index | — | docs | everything |
| 1 | `ci-affected-lanes` R1–R3 | — | workflows + scripts | 2, 3, 4 |
| 2 | `schema-bytes-gated` R1–R3 | #1074 and #1083 merged, so the budget is measured with their keys | benchmarks reliability | 1, 3, 4 |
| 3 | `closeout-at-incumbent-weight` R1, R4 (model first), then R2, R3, R5 | — | closeout + weight ratchets | 1, 2, 4 |
| 4 | `locale-pack-in-five` R1–R3 | — | burgee check | 1, 2, 3 |
| 5 | `windows-lane-holds` R1–R2, then R3–R5 | step 1 (workflows lane); R3 is #1085 if it merges | workflows, then test files | 6, 7 |
| 6 | `declaration-summaries` R1, then R2–R3, R4 after the next release | #1087 merged (the baseline file) | published artifacts | 5, 7 |
| 7 | `fix-lines-every-shell` R1–R4 | `facade-projection-fidelity` R5–R6 (#1083) merged, which edits `surfaces.ts` | `failure.ts` lane | 5, 6 |
| 8 | `default-command` R1–R5 | wave 3's `completion-context` R1–R4 (dispatch resolution and root completions) and #1083 (aliases) | parse + `failure.ts`/`schema.ts` | 6 |
| 9 | `typed-positionals` R1–R4, then R5–R6 | step 8 (same lane); #1074 merged (its gap); `completion-context` (positional completions); R5 after `previous-majors` yargs 17 only if that PR is still editing `schema.ts` | parse, then weight ratchets | 10 only after step 10's `GRADED` edit |
| 10 | `colour-facades` R1, R2, R3 in turn | compat-oracle lane clear: `inquirer-prompts-drop-in` (#1037 and its remaining R), `supports-color-drop-in`, `previous-majors` yargs 17 | compat-oracle + roundel + weight ratchets | 9 after its R5 |
| — | Close the PR's `ci-affected-lanes` R4 reading | 20 PRs after step 1 | benchmarks results | anything |

**On the unfinished wave-3 work.**

- **`frames-fit-the-screen`.** Built and held on four per-entry budgets
  (`B-20261012-frames-fit-the-screen-budgets`). No wave-4 intent depends on it or edits its files.
  `controlroom-scroll-pane` (wave 3, step 9) still waits on it.
- **`inquirer-prompts-drop-in` (#1037).** Ahead of `colour-facades` in the compat-oracle lane.
- **`completion-context`.** Ahead of `default-command` and `typed-positionals` in the parse lane:
  both change what root and positional completions offer.
- **`controlroom-scroll-pane`.** No overlap with wave 4.
- **`supports-color-drop-in`.** Ahead of `colour-facades`: both add a `roundel/*` subpath and
  `GRADED` rows, and the colour façades reuse its split between an incumbent's policy and
  `roundel/policy`.
- **`previous-majors` yargs 17.** The last wave-3 host in the compat-oracle lane, so
  `colour-facades` follows it.

## Rejected, and why

| candidate | evidence | D·F÷C | why not now |
| :-- | :-- | --: | :-- |
| `caique/prompts` façade, graded | `prompts` 53,898,410 /wk, last published 2021 | 4·5÷3 = 6.7 | the compat-oracle lane holds `colour-facades` (8.3) as wave 4's one host group. First in line for wave 5 |
| MCP `2026-07-28` stateless revision | `B-20261012-mcp-2026-07-28-stateless` | 2·5÷2 = 5 | dual-era clients fall back today, and no `2026-07-28`-only client is measured. Revisit on the trigger in D-20261012-wave-4-selection |
| `burgee/commander` residual, about 1.415× | `commander-front-end-diet` R4; B-20261012-commander-front-end-bundles-heavier | — | owned by an existing intent's downward ratchet, and D-20261012-commander-front-end-floor decided what stays static. A new intent would re-do it |
| `seniority/dotenv-expand` | 36,722,404 /wk | 4·5÷3 = 6.7 | the compat-oracle lane |
| `caique/enquirer` façade | 31,002,435 /wk, last published 2023 | 4·5÷3 = 6.7 | the same lane, and the largest API surface of the open hosts |
| Multi-line options in native `multiselect` | clack #116: 7 reactions | 2·3÷1 = 6 | parity with clack, which `caique/clack` serves graded; and `frames-fit-the-screen` owns list rendering while its gap is open |
| `ora` output while spinning | ora #120: 21 reactions, closed | — | already served: `flagstaff`'s frame loop writes above the live region (`save-restore.qnt`) |
| picocolors ESM | picocolors #70: 35 reactions | — | `roundel/picocolors` ships ESM and is graded (D-20261011-roundel-picocolors) |
| Deno and Bun packaging | oclif #503, #968, #1624 | — | wave 2's rejected list, unchanged: a runtime matrix with no claim behind it |
| A `burgee locale init` scaffolder | — | 1 | the eval prompt never names it; `locale-pack-in-five` R1 reaches every agent instead (its spec) |
| Raise the Windows timeouts | — | — | **rejected on principle**: D-20261012-windows-lane-fix-the-case |
| Strip every `.d.ts` comment | −46,300 B gzipped | — | deletes hover text; D-20261012-declarations-carry-summaries takes the middle |
| Self-hosted or larger runners | GitHub Actions at about 6 concurrent jobs | — | a paid outward change the owner has not taken |
| Cold start to 1.35; the first CLI adopter; the CII badge; the `braces` waiver | wave 3's table | — | owner-gated or outward, unchanged |
| Everything else in wave 3's and wave 2's rejected tables | [`next-wave-3-2026-10.md`](./next-wave-3-2026-10.md), [`next-wave-2026-10.md`](./next-wave-2026-10.md) | — | unchanged: nothing measured since has moved them |

## Already taken from wave 3's rejected list

| wave-3 rejection | wave-4 intent |
| :-- | :-- |
| Default (root) command, yargs #1331, #2292 | `default-command` |
| Typed, named positionals, yargs #1649, citty | `typed-positionals` |
| `kleur`, `colorette`, `yoctocolors` façades | `colour-facades` |
