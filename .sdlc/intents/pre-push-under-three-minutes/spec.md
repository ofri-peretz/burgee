**Accepted:** night loop, under the owner's delegation of 2026-11-26

# Design — a push finishes before the connection carrying it times out

Intent: [`intent.md`](./intent.md).

## Requirements

- R1. `weight-page` runs in pre-push only when the push changes one of its inputs.
- R2. Median pre-push under 180 s for a push that touches no package source.
- R3. No green push lost to the transport over a week of the loop log.

## Design

**R1 (this PR).** `weight-page` in `lefthook.yml` runs behind a gate,
`git diff --quiet origin/main...HEAD -- packages apps/docs/content/docs/weight.mdx scripts/subpath-weight.ts package-lock.json`.
Those are its inputs, read from `scripts/subpath-weight.ts`: every package's build, the page it
writes, the script, and the dependency versions the bundles resolve. Exit 0 (nothing changed)
skips the step. Exit 1 (a change) and 128 (no `origin/main`, cannot tell) run it. CI's ratchet runs
it on every PR unchanged.

A lefthook `glob` was the first cut and was rejected after measuring it. On a branch's first push
there is no upstream, so lefthook inspects every tracked file and the step ran anyway (110 s on a
push that touched none of its inputs, 2026-11-26). Most agent pushes are first pushes.

Measured first: `npm run weight:page -- --check` alone on a warm tree took 154.6 s real, 54.3 s
user and 34.8 s sys. Wall time is mostly I/O, not esbuild, so making the step faster would mean
writing fewer temporary bundle files, a larger change than not running it when nothing it reads
has changed.

**R2 (next).** With R1 in, re-measure three docs-only pushes. If the median is still over 180 s,
the next cut is `root-suite` (217 s on 2026-11-26), measured before choosing.

**R3.** Read from `~/.claude/night-loop.log` a week after R1 merges. Until then, the loop pushes
over HTTPS, which holds no connection open across the hooks.

## Verification

| Requirement | Check                                                                                                                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1          | `scripts/weight-page-hook-lock.test.ts` runs the gate in a throwaway repo: a change to each input runs the check, a docs-only change skips it, no `origin/main` runs it. It fails when `packages` is dropped from the gate (shown before commit). |
| R2          | `summary: (done in N seconds)` from three docs-only pushes, median.                                                                                                                                              |
| R3          | No `Connection reset` after green hooks in a week of the loop log.                                                                                                                                               |

## Rejected alternatives

- **A lefthook `glob`.** It never skips on a branch's first push (above).

- **Moving `weight-page` to CI only.** It was put in pre-push because a stale page cost six CI
  cycles in one week (2026-11-23). Keeping it for pushes that can change the page keeps that fix.
- **A longer SSH keepalive.** It hides the cost instead of removing it, and it is per-machine
  config that no check can hold.

## Out of scope

- `root-suite` and `battery` timing, until R2's re-measurement says they are next.
