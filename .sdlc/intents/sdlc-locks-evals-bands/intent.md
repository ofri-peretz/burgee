# Intent — Every SDLC stage loaded in this repo, not just described

> Stage 1 artifact. Child of [`burgee`](../burgee/intent.md),
> constraint 5: "AI-native SDLC from day one — `.sdlc/intents/` with the lock, `evals/`
> layer 1, control bands with at least one band computing before v1."

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz · **Corrected from
`shipped` 2026-09-09** — the locks shipped, the bands did not; see [Verified against `main`](#verified-against-main--2026-09-09)

**Restated:** 2026-10-18 — see [§ Restated 2026-10-18](#restated-2026-10-18)

> Approved 2026-09-06 by @ofri-peretz in session ("You have everything on eslint repo,
> why can't you copy it") — the copy-from-eslint intent, built the same day.

---

## Restated 2026-10-18

**The locks and the watcher hold; three things do not, so this intent stays open — REMAINING: S2/R2/R3, S3, R6.** *2026-10-19: R6 is held (rules 2 and 3 tested); S2/R2/R3 and S3 remain, so the status stays `review`.*

Audited read-only against `main` at `1013b65db5` (2026-10-18). No test was run; "held" means
the named check exists on `main` and asserts the criterion. IDs: S1–S4 are the four
[Success criteria](#success-criteria) bullets in order; R1–R6 are [`spec.md`](./spec.md)'s
requirements. Nothing below is deleted; the original text stands and carries a marker.

| ID | promised | on main | check | disposition |
| :-- | :-- | :-- | :-- | :-- |
| S1 | renaming `## Why now`, or `approved` with no `spec.md`, turns `npm test` red | yes | `scripts/intent-artifacts-lock.test.ts` › ".sdlc/intents/%s is well-formed" | held |
| S2 | a broken relative link in `.sdlc/intents/README.md` fails the evals job | no: `.sdlc/intents/` is not scanned | none | remaining |
| S3 | the weekly job records four observations per run; after eight runs the 2σ evaluation is real | partly: two of the four bands compute, one is fed by another workflow, one has stalled | the series in `.sdlc/bands/control-bands.history.json` (no test) | restated; `test-duration-ms` remaining |
| S4 | a simulated breach writes an `intent.md` that passes the intent lock | yes | `scripts/control-bands.test.ts` › "satisfies the schema the intent lock enforces" | held |
| R1 | `scripts/__tests__/intent-artifacts.lock.test.ts` with the sections, statuses, spec rule and stray rule | yes, at another path, with one rule relaxed | `scripts/intent-artifacts-lock.test.ts` › ".sdlc/intents/%s is well-formed", › "every intent lives under .sdlc/intents — one convention, not two" | restated |
| R2 | `evals/layer1/links.test.ts`: links, scripts and floor ids across the agent-facing set | yes, as `scripts/run-evals.ts` layer 1, minus `.sdlc/intents/` | `scripts/run-evals.test.ts` › "reports a relative link to nothing, and one that escapes the repo", › "reports script files and npm scripts that do not exist", › "reports an id a child cites that the umbrella does not define" | restated; `.sdlc/intents/` remaining |
| R3 | `evals.yml` runs on `**/*.md`, `docs/**`, `.github/**`, `eslint.config.mjs`, `CLAUDE.md` | yes, on a narrower `paths:` list | `.github/workflows/evals.yml` `on.pull_request.paths` | restated; `.sdlc/intents/**` remaining |
| R4 | `control-bands.json` with `command-duration`, `eslint-config-stats` and a reserved `benchmark-json` | yes, and the reserved collector is live | `benchmarks/bands.test.ts` › "agrees with .sdlc/bands/control-bands.json, band for band" | held |
| R5 | `--record`, `--evaluate` with the Western Electric rules, a breach writes `control-band-<id>/intent.md` and opens a PR | yes | `scripts/control-bands.test.ts` › "reports the breach with the numbers a reader needs to argue with it"; `scripts/band-series.test.ts` › "is still idempotent against what is already recorded"; the PR step in `.github/workflows/control-bands.yml` | held |
| R6 | watcher unit tests: the WE rules on synthetic series; the generated intent passes R1 | all four rules and the generated intent (rules 2 and 3 since 2026-10-19) | `scripts/control-bands.test.ts` › "rule 1 — a single point beyond 3σ", › "rule 4 — eight consecutive on one side is drift, even with no unusual point", › "satisfies the schema the intent lock enforces"; `scripts/control-bands.test.ts` › "rule 2 — two of the last three beyond 2σ on one side, with no point beyond 3σ", › "rule 3 — four of the last five beyond 1σ on one side, with a point between that breaks the run" | held (2026-10-19) |

What changed, one row at a time:

- **S1, R1.** The lock shipped as `scripts/intent-artifacts-lock.test.ts`, not under
  `scripts/__tests__/`. It asserts `# Intent —`, a status in
  `draft|review|approved|shipped|dropped`, the three sections plus either success heading, and
  `spec.md` for `approved`/`shipped`. One rule is weaker than R1 wrote: a `spec.md` needs
  **one** heading matching `Rejected…`, `Explicit non-goals`, `Non-goals`, `Out of scope` or
  `Risks and rejected`, not both a rejection heading and an out-of-scope heading. The lock's
  own comment gives the reason: a rejected option and a declared non-goal are the same
  artifact. R1 is restated to that rule.
- **S2, R2, R3: the one real gap.** The link checker is layer 1 of `scripts/run-evals.ts`, not
  `evals/layer1/links.test.ts`. It scans `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/`,
  `.github/`, `.sdlc/bands/` and every docs app's `content/` taken from
  `.github/vercel-apps.json` (`CONFIG_DIRS`). It does not scan `.sdlc/intents/`. Only the
  floor-id check reads that directory, and its id class is now `[FOEVSPDTHMK]`, wider than
  R2's `[FOEVSPDT]`. `evals.yml` fires on `README.md`, `CLAUDE.md`, `docs/**`, `.github/**`,
  `.sdlc/bands/**`, `apps/*/content/**`, `eslint.config.mjs`, `evals/**` (not
  `evals/history/**`) and `scripts/run-evals.ts`. That list has no `**/*.md` and no
  `.sdlc/intents/**`. Measured for this restatement: the same link rule run over the 191
  Markdown files under `.sdlc/intents/` at `1013b65db5` finds **0** broken links. Adding the
  directory is therefore cheap for links, but not for scripts. `missingScripts` exempts
  planned work with `PLANNED_DOCS = /^docs\/intents\//`, a path from before intents moved, so
  it would report **12** planned-script mentions (for example
  `.sdlc/intents/windows-lane-holds/spec.md → scripts/slow-cases.test.ts`). The remaining work
  is to add `.sdlc/intents` to `CONFIG_DIRS` and `.sdlc/intents/**` to `evals.yml`'s `paths:`,
  move `PLANNED_DOCS` to `^\.sdlc\/intents\/`, and add a case to `scripts/run-evals.test.ts`
  proving a broken link in `.sdlc/intents/README.md` is reported. The evals job is still not a
  required check, which is what R3 wanted. **Re-measured 2026-10-19 at `51fec1ba`:** the same
  rule over the 198 Markdown files under `.sdlc/intents/` finds **2** broken links, both in
  `types-under-node10/spec.md` → `../migrate-preflight/spec.md`, a spec that arrives with the
  open #1168. Adding `.sdlc/intents/**` to `evals.yml`'s `paths:` also makes every intent edit
  run the task evals, which spend the Claude quota; that cost is part of the remaining work, not
  a reason to skip it.
- **S3: the 2026-09-09 finding "has never run" no longer holds.** `control-bands.yml` has
  recorded weekly, and its observations land through pull requests (the latest is #1066). The
  series dates run weekly from 2026-09-14 to 2026-10-12. Here is where each of the four
  observations S3 counted stands:
  - `lint-rules-on` and `lint-documented-false-positives` have 10 points each, above
    `minPoints: 8`, so their 2σ evaluation is real.
  - `agent-tokens-per-task` has 56 points. The weekly job does not produce them: `npm run
    bench` does, through the `benchmark-json` collector, and `benchmarks/bands.test.ts` holds
    that pairing.
  - `test-duration-ms` has **7** points, the last on 2026-09-28. That is below `minPoints`, so
    it still reports "band not computed yet". The weekly runs of 2026-10-05 and 2026-10-12
    recorded the lint bands but not the duration. `collectCommandDuration` in
    `scripts/control-bands.ts` returns no observation when `npm test` exits non-zero or
    exceeds 900,000 ms, and it does not log why. The duration band is starved silently, and
    the cause is not recorded anywhere.

  S3 is restated to: *every band in `control-bands.json` gains a point per scheduled run, and
  each band at `minPoints` or more evaluates.* The duration band is the remaining part. It
  needs points again, plus a log line or test for a dropped observation.
- **S4, R5.** Held, and exercised on `main`. The watcher has written five
  `.sdlc/intents/control-band-*/intent.md` drafts, every one passing the intent lock.
- **R4.** Held. The reserved `benchmark-json` collector feeds the B1 and B2/B4 bands
  (`agent-tokens-per-task`, `agent-turns-per-task`, `cold-start-ratio`, the bundled-bytes
  bands). Compat bands are derived per `packages/compat-oracle/baseline/` file and are not
  listed in the JSON. The `command-duration` and `eslint-config-stats` collectors have no unit
  test of their own. Their evidence is the recorded series.
- **R6.** Restated to what is tested. Rules 1 and 4, direction, quiet variation and the
  three-point floor have tests. **Rule 2 (two of three beyond 2σ) and rule 3 (four of five
  beyond 1σ) have none.** Rule 2 matters most: it is the 2σ tier that `--check` fails on and
  that writes an intent. A test per rule is remaining. **Held 2026-10-19:** `scripts/control-bands.test.ts` › "rule 2 — two of the last three beyond 2σ on one side, with no point beyond 3σ", › "rule 3 — four of the last five beyond 1σ on one side, with a point between that breaks the run".
  Each pairs a firing series with one a point short of it. Proven red by mutating the
  thresholds in `scripts/control-bands.ts` (`RULE2_HITS` 2 → 3, `RULE3_HITS` 4 → 3): both
  cases fail, and the other twenty stay green.

## What is wanted

The three mechanisms `eslint/` has and this repo only promises:

1. **The intent lock.** A vitest test that fails when an `intent.md` lacks its required
   sections, when an `approved` or `shipped` intent has no `spec.md`, when a
   `spec.md` lacks a rejected-alternatives and an out-of-scope section, or when an
   `intent.md` appears anywhere outside `.sdlc/intents/`.
2. **Evals layer 1.** Every relative link in every agent-facing document (`README.md`,
   `docs/**`, `.github/**/*.md`, `apps/docs/content/**`) resolves; every script named in
   a document exists; every floor id cited in a child intent exists in the umbrella
   design. Runs on every PR that touches those paths.
3. **Control bands.** `.sdlc/bands/control-bands.json` plus a deterministic watcher
   (`scripts/control-bands.ts`, ported from `eslint/`), seeded with the bands this repo
   can measure today: `npm test` duration, the count of rules at `error` in
   `eslint.config.mjs`, the number of documented lint false positives, and — once intent
   5 lands — agent tokens-per-task. On a 2σ breach it writes a Stage 1 `intent.md` and
   opens a PR.

## Why now

- **The umbrella intent's constraint 5 is currently false.** Seven child intents were
  just written by hand with no check on their shape; `eslint/` learned the cost of
  that when it ran two intent conventions in parallel and every check stayed green.
- **Six lint false positives were switched off in one week.** That count is a metric
  with a direction: it should shrink as fixes ship upstream. Nothing watches it.
- **The evals README in `eslint/` records that layer 1 found six broken links on its
  first run.** This repo already has 20+ cross-document links written in a day.

## Affected users and systems

- Root `npm test` (new `scripts/__tests__/*.lock.test.ts`, root vitest workspace).
- New `evals/` with `README.md` and layer-1 checks; `.github/workflows/evals.yml`
  firing on `CLAUDE.md`, `docs/**`, `.github/**`, `eslint.config.mjs`.
- New `.sdlc/bands/control-bands.json`, `scripts/control-bands.ts`,
  `.github/workflows/control-bands.yml` (weekly), and the write-back path into
  `.sdlc/intents/control-band-<id>/intent.md`.

## Constraints

1. The lock is byte-for-byte the shape `eslint/` enforces (section names, status
   values), so an intent can move between repos without edits.
2. Detection is deterministic; no model in the breach path. The band watcher is unit
   tested like any script.
3. Layer 2 evals (task cases with `claude -p`) are **not** wired here; without a
   credential they report `skipped`, and this repo has no task corpus yet.
4. A band with fewer than `minPoints` observations computes nothing and says so.

## Success criteria

- Renaming `## Why now` in any intent turns `npm test` red; setting an intent to
  `approved` with no `spec.md` turns it red. **2026-10-18: held** by
  `scripts/intent-artifacts-lock.test.ts` › ".sdlc/intents/%s is well-formed".
- A deliberately broken relative link in `.sdlc/intents/README.md` fails the evals job.
  **2026-10-18: remaining** — `scripts/run-evals.ts` does not scan `.sdlc/intents/`, and
  `evals.yml`'s `paths:` does not name it; see [§ Restated 2026-10-18](#restated-2026-10-18).
- ~~`control-bands.yml` runs weekly and records four observations per run; after eight
  runs the first 2σ evaluation is real, not "insufficient points".~~ **Restated 2026-10-18:**
  every band in `control-bands.json` gains a point per scheduled run, and each band at
  `minPoints` or more evaluates. The two lint bands (10 points) and the B1 bands (56) evaluate;
  `test-duration-ms` has stalled at 7 points since 2026-09-28 and is **remaining**.
- A simulated breach in a unit test produces an `intent.md` that itself passes the
  intent lock. **2026-10-18: held** by `scripts/control-bands.test.ts` › "satisfies the schema
  the intent lock enforces".

## Verified against `main` — 2026-09-09

**Status corrected from `shipped` to `review`.** Two of four criteria met. The locks are real and
were mutation-tested for this pass; the *bands* half of this intent has produced nothing.

- **Renaming `## Why now` turns `npm test` red; `approved` with no `spec.md` turns it red** —
  **met**, and proven rather than assumed. On a scratch copy of `.sdlc/` plus the lock test,
  renaming `## Why now` to `## Rationale` in one intent produced `1 failed | 36 passed` with
  `AssertionError: … lacks ## Why now`; setting the one design-less intent to `approved` produced
  `is "approved" but has no spec.md`. A stray `intent.md` outside `.sdlc/intents/` fails too.
- **A broken relative link in `.sdlc/intents/README.md` fails the evals job** — **not met.**
  `scripts/run-evals.ts` scans `README.md`, `CLAUDE.md`, `AGENTS.md` and the directories `docs`,
  `.github`, `.sdlc/bands`, `apps/docs/content` — 14 files, **none of them under
  `.sdlc/intents/`**. `evals.yml`'s `paths:` filter says the same. The roadmap this repo hands
  work off through is the one document the link checker does not read.
- **`control-bands.yml` runs weekly recording four observations, and after eight runs the first
  2σ evaluation is real** — **not met, three ways.** The workflow is scheduled (`10 5 * * 1`) and
  **has never run** — `gh run list --workflow=control-bands.yml` is empty. The history file holds
  two hand-recorded dates. Each run collects **three** observations, not four, because the two
  `benchmark-json` bands (`agent-tokens-per-task`, `agent-turns-per-task`) read a
  `benchmarks/results/` directory that does not exist and stand at **0 of 8** points. Every band
  reports "band not computed yet".
- **A simulated breach produces an `intent.md` that itself passes the intent lock** — **met.**
  `scripts/control-bands.test.ts`, `describe('the intent a breach writes')`, renders through
  `renderIntent` and asserts every section the lock enforces. Green inside the 150 root tests.

The honest summary: **the locks shipped, the bands did not.** Stage 6 cannot close a loop on a
metric that has never been recorded, and three of the five declared bands have never had a
collector that could run.

## Open questions

Decided — none open. The items below were settled when this intent was written and are
kept as the record they always were (confirmed 2026-09-20, D-072).

None open. Decided at finalisation (2026-09-06):

- Decided: **Copy `scripts/control-bands.ts` verbatim from `eslint/`** (with its tests); extract a
  shared package only when a third repo needs it.
- Decided: **The false-positive band imports `eslint.config.mjs`** and counts `'off'` entries
  inside blocks whose leading comment contains `Finding`; exact, and it fails loudly if
  the config's shape changes.
