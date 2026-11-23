# Intent — `hookset`: one command gives a repo the verification stations as git and Claude hooks

> Opened 2026-11-23 from the verification gap analysis
> ([doc](https://claude.ai/artifact/BCjCqoaRfDvtQeha24HrNi)) and the guardrails audit
> ([doc](https://claude.ai/artifact/7NWAJKCPBNoyiELySAXfEh)). The owner's direction the same day:
> lefthook and our own lint are the preferred levers, Interlace OSS is the toolkit for every
> verification station, and every product CLI is a burgee program. Working name.

**Status:** review · **Opened:** `2026-11-23` · **Owner:** `@ofri-peretz`

---

## What is wanted

A burgee CLI and a set of presets that put the cheap stations before a change leaves the machine,
the same way in every repository:

- **Git hook presets** for lefthook (through its `remotes`) and for Husky, by station:
  `commit-msg` (commitlint, proofline trailer in observe), `pre-commit` (staged-file lint and
  format only, under a time budget), `pre-push` (typecheck, affected tests, changed-lines
  mutation, test-integrity diff checks, proofline gate, triggerlist protect).
- **A Claude hook pack** (`.claude/settings.json` fragments): block `--no-verify` and hook-skipping
  environment variables, ask before publish or deploy, block edits to frozen paths a repo lists,
  and count failed test runs per session so the third forces a stop-and-ask.
- **`hookset init`** detects the package manager and monorepo tool and writes the smallest config
  that pulls the presets; **`hookset check`** fails when a repo's hooks drift from the preset
  version it pins, or when a station is missing.

## Why now

- The guardrails audit (2026-11-23) found blog with no git hooks at all, serverless running only
  `build` on pre-push, agents running full-repo ESLint and `tsc` on every commit, and Claude hooks
  in only two of eight repos, each bespoke (eslint's release gate, blog's frozen identifiers).
- Each repo's `lefthook.yml` is written by hand; the same step differs between repos, which is
  the drift reusable presets remove.
- Nothing in any repo enforces "stop after 3 failed tries"; it can only be a hook, because a
  sentence in CLAUDE.md is a suggestion.

## Affected users and systems

A new private package `packages/hookset`; each Interlace repo's `lefthook.yml` and
`.claude/settings.json` once adopted.

## Constraints

- A preset never adds a step that cannot pass on a clean `main`; new stations ship in observe.
- `pre-commit` stays under 10 s on staged files; anything slower belongs on `pre-push`.
- The Claude hook pack never silently allows: a blocked action names the fix and the decision to
  cite.
- Works with Node 24 and npm, pnpm or bun; no dependency beyond lefthook or Husky themselves.

## Success criteria

- `hookset init` on blog and serverless produces configs that pass on their `main`, in one PR each.
- `hookset check` in each adopting repo's CI fails on a planted drift and passes after.
- The Claude pack blocks a planted `git push --no-verify` and a planted `LEFTHOOK=0 git push` in a
  fixture session.
- **End state (the owner, 2026-11-23: every concept to its strongest form):** all eight Interlace
  repos pull the presets, zero hand-written duplicates of a preset step, pre-commit under 10 s
  everywhere, and the stop-after-3 hook active in every repo with a `.claude/` directory.

## Defaults taken

Each is a default, not a decision; overturning one in review is a new decision file.

- lefthook first; the Husky presets follow once one repo outside Interlace asks.
- Presets are versioned with the package and pinned by tag in each repo's `remotes`.
