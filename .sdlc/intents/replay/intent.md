# Intent — `replay`: grade the reviewer and the checks against bugs that actually happened

> Opened 2026-11-23 from the verification gap analysis
> ([doc](https://claude.ai/artifact/BCjCqoaRfDvtQeha24HrNi)). The post describes recreating the
> repo at review time, a one-sentence answer key per bug, clean merged PRs as controls, recall
> measured per stage, and pruning checks that stop earning their cost. Working name.
> Where it lives: [`D-20261123-verification-tools-live-in-burgee`](../../decisions/D-20261123-verification-tools-live-in-burgee.md).

**Status:** review · **Opened:** `2026-11-23` · **Owner:** `@ofri-peretz`

---

## What is wanted

- **A case file** per known bug: the PR that introduced it, its base SHA, and a one-sentence
  answer key. Clean merged PRs, size-matched, are controls.
- **`replay run`** checks out each case at its base, applies the PR, runs the reviewer (through
  triggerlist's workflow inputs) and the repo's checks, and scores each finding against the
  answer key. Only a finding that describes that bug counts.
- **A report** with recall per stage (raw findings, after verification, final review), severity
  (must-fix, should-fix, nit, pre-existing), false alarms on controls, and for every check and
  checklist item how often it fired and how often it was right.
- **`replay mine`** proposes rule candidates from review comments and reverts: a pattern seen in
  two or more PRs and detectable from a diff. A person accepts each one in a PR.

## Why now

- burgee's evals, eslint's case ledgers and the agents incident ledger each record past bugs,
  but none is replayed through the reviewer. Whether `claude-code-review.yml` catches any of them
  is not known.
- No check in any Interlace repo reports how often it fires. `control-bands` flags bands nobody
  feeds, and the `verify-the-instrument` skill finds dead checks by hand; neither counts firings.
- The post's research note: about 20 real cases were enough to tell whether a change helped.

## Affected users and systems

A new private package `packages/replay`; a `.sdlc/replay/` case directory; a monthly workflow or
launchd job like `mutation:weekly`.

## Constraints

- The tuning set and the fixed test set are separate files; a run never tunes on the test set.
- Recall is raised only until the next gain would come from fitting the cases.
- Runs locally or in a scheduled job, never per PR: one run calls the reviewer once per case.
- Cases cite their source PR; no private data in case files.

## Success criteria

- 10 bug cases and 10 controls from burgee's own history, each with an answer key.
- A first report on burgee's current reviewer, committed with the command that produced it.
- At least one checklist item or lock test with zero firings over the case set, named in the
  report with a keep or drop decision.
- A second run after one REVIEW.md change shows the recall difference on the same cases.
- **End state (the owner, 2026-11-23: every concept to its strongest form):** a monthly run on at
  least 20 bug cases and 20 controls per repo with a reviewer, final-stage recall above 80% on the
  test set and false alarms on controls under 10%, and every check in every Interlace repo with a
  firing count.

## Defaults taken

Each is a default, not a decision; overturning one in review is a new decision file.

- First bug cases come from reverts on `main` and `fix` PRs that name the PR they fix.
- The reviewer runs with the same model as CI, so the score is the score of what ships.
