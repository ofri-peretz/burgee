# Intent — a push finishes before the connection carrying it times out

**Status:** approved · **Opened:** 2026-11-26 · **Owner:** @ofri-peretz

---

## What is wanted

`git push` from a warm checkout finishes its pre-push hooks in under three minutes, so the
connection that is carrying the push is still open when the hooks end. A push whose hooks all
pass is never lost to the transport.

## Why now

On 2026-11-26 the AI-SDLC loop pushed a one-line test fix to `ci/rulesets-resolve-threads`
(burgee#1875) three times:

| Attempt | Transport | Pre-push total | `weight-page` | Outcome                                           |
| ------- | --------- | -------------: | ------------: | ------------------------------------------------- |
| 1       | SSH       |              — |      163.43 s | `battery` failed in 6.80 s while another push ran |
| 2       | SSH       |       555.01 s |             — | every hook green, then `Connection reset by peer` |
| 3       | HTTPS     |       383.23 s |             — | pushed                                            |

Attempt 2 is the failure this intent is about: all hooks passed, and the push was still lost,
because SSH holds the connection open across the hooks and the remote hung up after nine
minutes. The fix was correct and green; it reached GitHub 40 minutes after it was written.

`lefthook.yml` describes `weight-page` as "about 40 s of esbuild". It measured 163 s, four times
that, on a diff that touched one test file and no package source.

The user-level guidance already expects this ("`git push` … can take 3-4 minutes. That is not a
hang"). Nine minutes is past that, and past what the transport tolerates.

## Affected users and systems

Every agent and human pushing to burgee: `lefthook.yml` `pre-push`, `scripts/subpath-weight.ts`
(`weight:page --check`), the `battery` turbo run. CI (`compat.yml`, `ratchet`) runs the same
checks after merge and is not changed by this intent.

## Constraints

- No hook is skipped with `--no-verify`, and no check is weakened. A check that moves out of
  pre-push must still run, unchanged, in a required CI job.
- A check may skip only when the diff cannot change its result, and it must fail open: if it
  cannot tell what changed, it runs.
- Measured, not estimated: every change reports `summary: (done in N seconds)` from three pushes
  before and three after, median.

## Success criteria

- The median pre-push time for a diff that touches no package source is under 180 s, over three
  pushes from a warm checkout.
- `weight-page` does not run when the push changes nothing under `packages/*/src`, the bundler
  config or the committed weight page; a lock test proves it still runs when one of them changes.
- No push in a week of `~/.claude/night-loop.log` records a transport failure after green hooks.

## Open questions

None open.

## Measured first, at design

Not unknowns about what is wanted; the design measures them before choosing a cut.

- Whether the 163 s of `weight-page` is esbuild or regenerating all 77 subpaths: time
  `npm run weight:page -- --check` alone on a warm tree.
- Whether `weight-page` rebuilds what `battery` already built; the lefthook comment says it runs
  "after the battery has built every package".
