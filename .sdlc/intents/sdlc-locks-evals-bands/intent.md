# Intent — Every SDLC stage loaded in this repo, not just described

> Stage 1 artifact. Child of [`agent-native-cli-layer`](../agent-native-cli-layer/intent.md),
> constraint 5: "AI-native SDLC from day one — `.sdlc/intents/` with the lock, `evals/`
> layer 1, control bands with at least one band computing before v1."

**Status:** review · **Opened:** 2026-09-06 · **Owner:** @ofri-peretz · **Corrected from
`shipped` 2026-09-09** — the locks shipped, the bands did not; see [Verified against `main`](#verified-against-main--2026-09-09)

> Approved 2026-09-06 by @ofri-peretz in session ("You have everything on eslint repo,
> why can't you copy it") — the copy-from-eslint intent, built the same day.

---

## What is wanted

The three mechanisms `eslint/` has and this repo only promises:

1. **The intent lock.** A vitest test that fails when an `intent.md` lacks its required
   sections, when an `approved` or `shipped` intent has no `design.md`, when a
   `design.md` lacks a rejected-alternatives and an out-of-scope section, or when an
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
  `approved` with no `design.md` turns it red.
- A deliberately broken relative link in `.sdlc/intents/README.md` fails the evals job.
- `control-bands.yml` runs weekly and records four observations per run; after eight
  runs the first 2σ evaluation is real, not "insufficient points".
- A simulated breach in a unit test produces an `intent.md` that itself passes the
  intent lock.

## Verified against `main` — 2026-09-09

**Status corrected from `shipped` to `review`.** Two of four criteria met. The locks are real and
were mutation-tested for this pass; the *bands* half of this intent has produced nothing.

- **Renaming `## Why now` turns `npm test` red; `approved` with no `design.md` turns it red** —
  **met**, and proven rather than assumed. On a scratch copy of `.sdlc/` plus the lock test,
  renaming `## Why now` to `## Rationale` in one intent produced `1 failed | 36 passed` with
  `AssertionError: … lacks ## Why now`; setting the one design-less intent to `approved` produced
  `is "approved" but has no design.md`. A stray `intent.md` outside `.sdlc/intents/` fails too.
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

None open. Decided at finalisation (2026-09-06):

- **Copy `scripts/control-bands.ts` verbatim from `eslint/`** (with its tests); extract a
  shared package only when a third repo needs it.
- **The false-positive band imports `eslint.config.mjs`** and counts `'off'` entries
  inside blocks whose leading comment contains `Finding`; exact, and it fails loudly if
  the config's shape changes.
