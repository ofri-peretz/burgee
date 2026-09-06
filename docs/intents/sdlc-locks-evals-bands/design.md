# Design — Every SDLC stage loaded in this repo

Intent: [`intent.md`](./intent.md). **Status:** review.

---

## Requirements

- **R1** `scripts/__tests__/intent-artifacts.lock.test.ts` asserts, for every
  `docs/intents/*/`: `intent.md` has `# Intent —`, a `**Status:**` line with a value in
  `draft|review|approved|shipped|dropped`, and the sections `## What is wanted`,
  `## Why now`, `## Constraints`, `## Success criteria`; `design.md`, when present, has
  `## Rejected alternatives` (or `## Explicit non-goals`) and `## Out of scope` (or
  `## Non-goals`); `approved`/`shipped` require `design.md`; no `intent.md` exists
  outside `docs/intents/`.
- **R2** `evals/layer1/links.test.ts`: every `[text](relative)` in the agent-facing set
  resolves to a file (anchors ignored); every `scripts/<name>` or `npm run <script>`
  mentioned exists in `scripts/` or root `package.json`; every `\b[FOEVSPDT]\d{1,2}\b`
  cited in `docs/intents/*/` (excluding the umbrella) appears in the umbrella design.
- **R3** `.github/workflows/evals.yml` runs R2 on PRs touching `**/*.md`, `docs/**`,
  `.github/**`, `eslint.config.mjs`, `CLAUDE.md`; it is not a required check yet.
- **R4** `.agent/control-bands.json` with collectors: `command-duration` (`npm test`),
  `eslint-config-stats` (`{ rulesOn, documentedFalsePositives }` from importing
  `eslint.config.mjs`), and a reserved `benchmark-json` for intent 5. `window: 20`,
  `minPoints: 8`, `worse` set per band.
- **R5** `scripts/control-bands.ts --record` appends an observation per band to
  `.agent/control-bands.history.json`; `--evaluate` applies the four Western Electric
  rules; on a 2σ+ breach it writes `docs/intents/control-band-<id>/intent.md` from the
  template and opens a PR via `gh`.
- **R6** Unit tests for the watcher: the WE rules on synthetic series; the generated
  intent passes R1.

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
