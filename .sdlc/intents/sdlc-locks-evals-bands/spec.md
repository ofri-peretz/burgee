# Design — Every SDLC stage loaded in this repo

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-10-25); it was corrected from `shipped` to `review` on 2026-09-09, when the locks had shipped and the bands had not.

**Restated:** 2026-10-18 — see [§ Restated 2026-10-18](#restated-2026-10-18)

---

## Design gate 2026-10-25

**Accepted for Build**
([D-20261025-sdlc-locks-evals-bands-design-accepted](../../decisions/D-20261025-sdlc-locks-evals-bands-design-accepted.md)).
S1, S4, R1 and R4–R6 hold. R2 and R3 are restated below.

**In scope.**

1. R2: `.sdlc/intents` joins the link layer. `CONFIG_DIRS` in `scripts/run-evals.ts` gains
   `.sdlc/intents`. `PLANNED_DOCS` moves from `^docs\/intents\/` to `^\.sdlc\/intents\/`, so a
   design naming a script it plans to write is not reported as missing, while its links still
   are. Any link this surfaces is fixed in the same PR.
2. R3, restated: the free layer runs on every PR, and the paid layer does not move.
   `quality.yml` gains a step running `npm run evals:config` (layer 1, no credential, no quota).
   `evals.yml`'s `paths:` is unchanged, so an intent edit never spends the Claude quota on task
   evals.
3. S3: a dropped observation says why. `collectCommandDuration` in `scripts/control-bands.ts`
   writes the reason it returned nothing (the exit code, or the timeout and its value) to
   stderr, and the run summary carries it.

**Acceptance checks.**

- R2: a case in `scripts/run-evals.test.ts` is proven red first. It plants a broken relative
  link in a fixture `.sdlc/intents/README.md` and expects it reported.
- R3: the new `quality.yml` step is visible in the PR's own checks.
- S3: two cases in `scripts/control-bands.test.ts`, one with a failing command and one with a
  command past its timeout, each asserting the logged reason.

**What to measure.** The number of broken links and planned-script mentions the widened scan
finds on the build's base commit, recorded in the PR. After two weekly runs, whether
`test-duration-ms` gains points or names its cause.

## Status 2026-10-25

Built in batch 29 under
[D-20261025-batch29-locks-tests-rulings](../../decisions/D-20261025-batch29-locks-tests-rulings.md).
The intent stays `approved`, because S3's band has not gained a point.

| item | state | check | proven red by |
| :-- | :-- | :-- | :-- |
| R2 — `.sdlc/intents` in the link layer | built | `scripts/run-evals.test.ts` › "reports a broken relative link in .sdlc/intents/README.md" | the case, run against `main`: `agentDocs` did not list the file |
| R2 — `PLANNED_DOCS` moved to `^\.sdlc\/intents\/` | built | `scripts/run-evals.test.ts` › "reads a script an intent names as a plan, and the same mention elsewhere as a dangling one" | the case, run with `CONFIG_DIRS` widened and `PLANNED_DOCS` still on `docs/intents` |
| R3 — the free layer on every PR, the paid layer unmoved | built | `.github/workflows/quality.yml`, Fast checks › "Evals layer 1 (links, scripts, floor ids)", reported in the `Quality Gate` table; `evals.yml`'s `paths:` unchanged | the step runs in this PR's own checks |
| S3 — a dropped observation says why | built | `scripts/control-bands.test.ts` › "names the exit code of a command that failed, and quotes the last lines it printed", › "names the timeout, and its value, for a command that ran past it", › "names the signal that killed a command", › "names a command that could not start", › "records a passing command and logs nothing" | the first three, run against `main`: the collector logged nothing |
| S3 — every band gains a point per run | open | the series in `.sdlc/bands/control-bands.history.json` | — |

**Measured on the base commit `c92e4173f4`:** the widened scan reads 202 Markdown files under
`.sdlc/intents/` and finds **0** broken links. It exempts **8** planned-script mentions in intent
designs. The design gate's own documents, merged from #1245, add none.

**What the duration band needs next.** The weekly run of 2026-10-19 recorded nothing for
`test-duration-ms`, and `npm test` ended about 69 s after the record step began. That is a red
suite, not the 900,000 ms ceiling. The collector now logs the exit code and the last fifteen lines
`npm test` printed, and `control-bands.yml` tees that into the run summary. So the next weekly run
names the failing test, and fixing it is what gives the band its eighth point.

## Restated 2026-10-18

**R1, R4 and R5 hold as shipped; R2, R3 and R6 are restated, each with a remaining piece — REMAINING: R2/R3, R6.** *2026-10-19: R6 held; R2/R3 remain.*

The full table, with the check for each row, is in the intent's
[§ Restated 2026-10-18](./intent.md#restated-2026-10-18). In short:

- **R1** shipped as `scripts/intent-artifacts-lock.test.ts`. A `spec.md` needs one rejection
  or non-goal heading (`Rejected…`, `Explicit non-goals`, `Non-goals`, `Out of scope`,
  `Risks and rejected`), not one of each.
- **R2** shipped as layer 1 of `scripts/run-evals.ts`, tested by `scripts/run-evals.test.ts`.
  Its set excludes `.sdlc/intents/` (**remaining**), and its stale
  `PLANNED_DOCS = /^docs\/intents\//` must move with it. Floor ids are `[FOEVSPDTHMK]`.
- **R3** `evals.yml` fires on a narrower list than written: no `**/*.md` and no
  `.sdlc/intents/**` (**remaining**). It is still not a required check.
- **R4** held. The reserved `benchmark-json` collector is live, and
  `benchmarks/bands.test.ts` › "agrees with .sdlc/bands/control-bands.json, band for band"
  holds the pairing.
- **R5** held. The watcher has written five `control-band-*` intents on `main`.
- **R6** rules 1 and 4 and the generated intent are tested. Rules 2 and 3 are not
  (**remaining**). **Held 2026-10-19:** `scripts/control-bands.test.ts` › "rule 2 — two of the last three beyond 2σ on one side, with no point beyond 3σ", › "rule 3 — four of the last five beyond 1σ on one side, with a point between that breaks the run".

## Requirements

- **R1** `scripts/__tests__/intent-artifacts.lock.test.ts` asserts, for every
  `.sdlc/intents/*/`: `intent.md` has `# Intent —`, a `**Status:**` line with a value in
  `draft|review|approved|shipped|dropped`, and the sections `## What is wanted`,
  `## Why now`, `## Constraints`, `## Success criteria`; `spec.md`, when present, has
  `## Rejected alternatives` (or `## Explicit non-goals`) and `## Out of scope` (or
  `## Non-goals`); `approved`/`shipped` require `spec.md`; no `intent.md` exists
  outside `.sdlc/intents/`. **Restated 2026-10-18:** at `scripts/intent-artifacts-lock.test.ts`,
  with one rejection-or-non-goal heading required rather than both — held.
- **R2** `evals/layer1/links.test.ts`: every `[text](relative)` in the agent-facing set
  resolves to a file (anchors ignored); every `scripts/<name>` or `npm run <script>`
  mentioned exists in `scripts/` or root `package.json`; every `\b[FOEVSPDT]\d{1,2}\b`
  cited in `.sdlc/intents/*/` (excluding the umbrella) appears in the umbrella design.
  **Restated 2026-10-18:** layer 1 of `scripts/run-evals.ts`, tested in
  `scripts/run-evals.test.ts`; `.sdlc/intents/` is outside its link and script set — remaining.
- **R3** `.github/workflows/evals.yml` runs R2 on PRs touching `**/*.md`, `docs/**`,
  `.github/**`, `eslint.config.mjs`, `CLAUDE.md`; it is not a required check yet.
  **Restated 2026-10-18:** the `paths:` list has no `**/*.md` and no `.sdlc/intents/**` —
  remaining.
- **R4** `.sdlc/bands/control-bands.json` with collectors: `command-duration` (`npm test`),
  `eslint-config-stats` (`{ rulesOn, documentedFalsePositives }` from importing
  `eslint.config.mjs`), and a reserved `benchmark-json` for intent 5. `window: 20`,
  `minPoints: 8`, `worse` set per band.
- **R5** `scripts/control-bands.ts --record` appends an observation per band to
  `.sdlc/bands/control-bands.history.json`; `--evaluate` applies the four Western Electric
  rules; on a 2σ+ breach it writes `.sdlc/intents/control-band-<id>/intent.md` from the
  template and opens a PR via `gh`.
- **R6** Unit tests for the watcher: the WE rules on synthetic series; the generated
  intent passes R1. **Restated 2026-10-18:** rules 1 and 4 and the generated intent are
  tested in `scripts/control-bands.test.ts`; rules 2 and 3 have no test — remaining.

## Design

Copy, do not invent: `eslint/scripts/control-bands.ts`, its tests and
`intent-artifacts.lock.test.ts` are the source, adapted only for collectors and paths.
Root gains `vitest.workspace.ts` listing `packages/*` and a root project for
`scripts/__tests__` and `evals/`, so `npm test` (turbo) plus `npx vitest run` at the
root cover everything.

The `eslint-config-stats` collector imports the config as ESM and counts entries whose
value is not `'off'` (rulesOn) and blocks whose comment mentions `Finding` (that grep is
the only non-exact piece; the design accepts it because the OFF map's shape is ours).

Write-back path, verbatim from `eslint/`: intent title `Control band <id> breached`,
sections filled from the observation window, status `draft`, PR body links the run.

## Verification

- `npm test` red on: a renamed section, an `approved` intent without design, an intent
  placed under `packages/`.
- `evals.yml` red on a broken link introduced in the same PR.
- Watcher unit tests green; `control-bands.yml` first run records four observations
  and prints "insufficient points" for each band.

## Rejected alternatives

- **A shared `@interlace/control-bands` package now.** Two consumers; extract at the
  third (the interlace repo has no bands yet).
- **Making `evals.yml` a required check immediately.** It would block the docs-only PR
  stream on link rot in files that move; promote after a month of green.
- **Layer 2 evals with a task corpus.** No incidents exist yet to draw cases from; the
  playbook's floor is 20 real cases.

## Out of scope

- Any band that needs production traffic; the docs site has no analytics yet.
- Cross-repo bands (e.g. eslint's plugin FP count) — each repo watches itself.
