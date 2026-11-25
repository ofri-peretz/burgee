# Intent — `replz scorecard`: an actionable score for how well our checks catch bugs

> Opened 2026-11-25 from the owner's question "How are we going to measure the effectiveness of our
> own code verification steps?" and "We need to make an actionable score, if Anthropic has
> anything like that we should be followers". A new command, so a minor of replz 1.x.

**Status:** review · **Opened:** `2026-11-25` · **Owner:** `@ofri-peretz`

---

## What is wanted

- **One score per repository, from history alone**, with Anthropic's names where they have one:
  escapes (reverts and fixes, as the Claude Code verification post builds its bug set), recall and
  false alarms per stage (replz's run, on size-matched clean controls), and provedone receipts.
- **Every measure ends in a `next:` action** that names pull requests or a command, so a number
  points at a fix, not at a meeting.
- **A ratchet**: bands in `.sdlc/bands/verification-scorecard.json` that only tighten, checked by
  a weekly workflow.

## What Anthropic publishes, and what we follow

There is no single "verification score". What exists, and what this adopts:

- *How the Claude Code team thinks about verification* (claude.dev, November 2026): reverts and
  fixes as the bug set, size-matched clean PRs as controls, recall per stage (raw, after
  verification, final), gate modes off/observe/enforce, a rule needs a pattern in two PRs.
- *Demystifying evals for AI agents* (anthropic.com, January 2026): pass@k and pass^k, regression
  suites that should pass near 100%, capability evals that graduate into regression, read the
  transcripts before trusting a score.

Our own addition where theirs has a gap: SZZ tracing (Śliwerski, Zimmermann and Zeller, 2005) for
fixes that name no pull request, since most of ours do not.

## Why now

Before this, no Interlace repo counted escapes or receipts; replz's recall needs hand-written
cases. The first baseline (2026-11-25, `replz scorecard` on each repo's `origin/main`, 30 days):

| Repo | Merged PRs | Escape rate | Receipts |
| :-- | --: | --: | --: |
| burgee | 409 | 18.3% | 12.5% |
| eslint | 322 | 12.4% | 15.2% |
| interlace | 117 | 12.8% | 18.8% |
| agents | 33 | 9.1% | 42.4% |
| blog | 34 | 0.0% | 38.2% |
| serverless | 26 | 0.0% | 46.2% |
| subagent-gateway | 16 | 6.3% | 62.5% |
| ofri-peretz | 2 | 0.0% | 0.0% |

Recall and false alarms are _unmeasured_ in every repo: no `replz run --record` has landed.

**Triage, burgee, 2026-11-25.** With comment, import and upstream-follow lines no longer blamed,
the 30 days held 65 traced escapes. Read from the diffs, 17 are real: each is now a bug case with
an answer key, beside a size-matched control. The other 48 are dismissed in
`.sdlc/replz/triage.json` with a reason (omnibus fixes, renames, lint-only fixes, corpus gaps,
benchmarks, and suspects that only sat next to the bug). burgee's confirmed escape rate is 4.1%
(17 of 410).

## Constraints

- No model call: the scorecard runs free on a schedule; recall comes from replz's recorded runs.
- No dependency outside the burgee family (provedone's `verdict` reads receipts).
- A traced escape is a suspect, not a verdict; the case's answer key is where a person confirms it.

## Success criteria

- `replz scorecard` prints the four measures with `next:` lines in every repo. **Met** (table above).
- Every traced escape in burgee's window is confirmed as a case or dismissed with a reason. **Met**.
- The weekly workflow fails when a band is left. Burgee first, then each repo through hookset.
- **Next (step 2):** pass^k per check from CI reruns, and per-station firing counts (hookset hook
  blocks, CI gate failures), so each station gets its own catch rate.
- Receipts above 90% and the escape rate falling for four weeks in burgee.

## Defaults taken

- The window is 30 days (`--days`). A repository with few merges (ofri-peretz: 2 in 30 days) passes
  a longer one rather than getting a different measure.
