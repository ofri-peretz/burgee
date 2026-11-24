# Intent — `triggerlist`: a review checklist the diff selects, and a REVIEW.md no PR can edit

> Opened 2026-11-23 from the verification gap analysis
> ([doc](https://claude.ai/artifact/BCjCqoaRfDvtQeha24HrNi)). The post describes a 39-item
> reliability checklist where each item has a trigger readable from a diff, and a reviewer that
> reads `REVIEW.md` from the base branch so a change cannot edit its own checks. Working name.
> Where it lives: [`D-20261123-verification-tools-live-in-burgee`](../../decisions/D-20261123-verification-tools-live-in-burgee.md).

**Status:** review · **Opened:** `2026-11-23` · **Owner:** `@ofri-peretz`

---

## What is wanted

- **A checklist file** where each item has an id, a trigger (path globs, and optionally an AST
  or text pattern on changed lines), the question to answer, the check that answers it, and
  links to the incidents or PRs behind it.
- **`triggerlist match <base>`** reads the diff and prints only the items whose triggers fire,
  usually a handful, as text for a reviewer prompt or as `--json`.
- **`triggerlist compile`** writes `REVIEW.md` from the checklist, the decision files and the
  lock-test headers, one line per rule with a link to the full text, under a byte budget.
- **A reusable review workflow** that reads `REVIEW.md` and the checklist from the base branch,
  pins its result to the head SHA, discards a result whose SHA is no longer the head, and
  carries earlier rounds' findings into the next round.
- **A protected-checks job** that flags a PR changing both gate files (lock tests, `lefthook.yml`,
  `.sdlc/bands/`, `REVIEW.md`, the checklist) and the code those gates judge.

## Why now

- No `REVIEW.md` exists in burgee, eslint or interlace (`ls REVIEW.md` in each, 2026-11-23).
  Reviewer rules live inline in each `claude-code-review.yml` prompt.
- The eslint and interlace copies of `claude-code-review.yml` differ by 177 diff lines
  (`diff` of the two files, 2026-11-23); interlace's lacks eslint's `merge_group` fix.
- burgee's `.github/CODEOWNERS` lists paths that no longer exist (`/packages/commander-*/`,
  `/docs/intents/`) and none of `.sdlc/`, `scripts/*lock*` or `lefthook.yml`.
- The 127 lock tests in `scripts/` each record the incident that caused them in their header.
  That is the seed of the checklist, but a reviewer never sees it.

## Affected users and systems

A new private package `packages/triggerlist`; `.github/workflows/claude-code-review.yml` here,
then the eslint and interlace copies through a reusable workflow; a new `REVIEW.md`;
`.github/CODEOWNERS`.

## Constraints

- One primary reviewer. The post found stacking reviewers often worse; this tunes the one.
- `REVIEW.md` and the checklist are always read from the base branch in CI.
- The protected-checks job starts in observe mode and blocks only by decision.
- The compiled `REVIEW.md` stays under the size limit of the review tool it feeds.

## Success criteria

- `triggerlist match` on the last 20 merged burgee PRs selects at most 10 items per PR, and a
  person agrees each selected item was relevant (recorded in the shipped table).
- A PR that edits `REVIEW.md` is reviewed with the base version, shown by a fixture PR.
- A review whose SHA is not the head is reported stale, never green.
- `claude-code-review.yml` in burgee, eslint and interlace is one reusable workflow; the drift
  between copies is zero lines.
- **End state (the owner, 2026-11-23: every concept to its strongest form):** every Interlace
  repo reviews through the one workflow; `protect` is in `enforce`, so zero PRs change a gate
  and the code it judges together; every checklist item carries a firing count from `replz`,
  and an item with zero firings in 90 days is proposed for removal.

## Defaults taken

Each is a default, not a decision; overturning one in review is a new decision file.

- The checklist is YAML, validated by `validator`.
- The budget is the limit of the reviewer the workflow calls, read from its docs when R3 lands.
- burgee's review job keeps passing without a token on forks, but prints that it did not run.
