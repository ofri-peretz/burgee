# Intent — `replz compare`: the same inputs through the base and the head

> The differential station of the verification toolkit: compat-oracle diffs burgee against the
> incumbents it replaces, and nothing else in any repo diffs a change against the code it changes.
> A new command, so a minor of replz 1.x.

**Status:** review · **Opened:** `2026-11-26` · **Owner:** `@ofri-peretz`

---

## What is wanted

- **`replz compare`** runs one command over a folder of inputs, once at a base ref and once at
  the head (the working tree by default), and fails on every output that changed.
- Noise a run always varies (timings, temporary paths, dates) is replaced by `normalize`
  patterns before the outputs are compared, so a difference left is one the change made.
- A difference a person accepts is listed under `approved` with the two outputs' digests and a
  reason. An approval holds for those exact outputs only: when either side moves, it no longer
  matches and the difference fails again. An approval nothing matched is reported as stale.

## Why now

A pass/fail suite tolerates any drift no test pinned. Old-versus-new on the same inputs catches
the drift, and the approved list is the record of each output change somebody meant.

## Constraints

- No dependency outside the burgee family; the trees are git worktrees, as `run` makes them.
- The config is the repository's own file: its patterns are trusted as the repository's code.

## Success criteria

- `replz compare` on burgee passes when only noise differs, and fails naming the first changed
  line and the entry that approves it when an output changes.

## Status

Built on 2026-11-26 (`packages/replz/src/compare.ts`). [`.sdlc/replz/compare.yaml`](../../replz/compare.yaml)
runs three replz command lines through origin/main and the working tree. Its first run failed on
`--help`, which gained `mine` and `compare`; that change is approved there with its reason, and the
second run passed with 2 the same and 1 approved. Since 2026-11-26 it runs on every pull request
that touches packages (`.github/workflows/replz-compare.yml`): the base is a worktree with its own
`npm ci` and build, both trees share the ~/.npm cache and one Turbo cache directory saved per base
commit. That approval went stale once #1873 merged and was dropped.
