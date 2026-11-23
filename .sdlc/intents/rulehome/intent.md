# Intent — `rulehome` joins the family: every station of the agent's verification loop that is about rules

> Opened from [`D-20261122-verification-toolkit`](../../decisions/D-20261122-verification-toolkit.md).
> `rulehome` exists today in its own private repository (`~/repos/rulehome`, 7 commits, 336 lines, plain
> Node, 9 tests): `audit` sorts a repository's AI setup into seven homes, `skills` and `agents` lint skill
> and subagent files, and `intent` checks decision markers on an OpenAPI diff.

**Status:** draft · **Opened:** `2026-11-22` · **Owner:** `@ofri-peretz` · **Lane:** `rulehome` (new)

---

## What is wanted

`rulehome` becomes a package in this repository, a burgee program, and the owner of the stations that
are about rules rather than about contracts or tests:

- **R1. Moves in, on burgee.** `packages/rulehome`, every command a burgee declaration (`--json`,
  `--schema`, MCP, exit codes), zero dependencies beyond the family. History is kept (subtree import).
- **R2. `audit`** (exists): each rule line in `CLAUDE.md`, `AGENTS.md`, skills and settings is assigned
  its cheapest home (Tripwire, Gatekeeper, Contract, Compass, Playbook, House Rule, Notebook), with the
  check that would hold it when the home is 1–3. Output is the move list, not the file.
- **R3. `skills`, `agents`** (exist): naming, "Use when…" descriptions, duplicates, tool allowlists,
  model and `maxTurns` for reading agents.
- **R4. `intent` folds into contractdiff.** One implementation of decision markers, in
  `contractdiff diff --decisions`; `rulehome intent` becomes a thin call to it, then is removed after one
  release. `rulehome audit` points contract rules at contractdiff.
- **R5. `hooks`: the Gatekeeper home, written.** From what `audit` found (lint, typecheck, related
  tests, `contractdiff lint --since`, `gen --check`), write the pre-push preset for the hook runner the
  repo already uses (lefthook or Husky). Never a hook runner of our own.
- **R6. `rulebook`: a reviewer's rules that fit.** Compile one rulebook for a reviewer agent from the
  repo's rules (Compass lines, lint rule ids and messages, decisions), sized to a budget (`--max-tokens`),
  ordered by how often each rule was broken. Report what did not fit, never drop it silently.
- **R7. `proof`: say how it was checked.** Read the JSON/SARIF of the runs on a change (tests, lint,
  contractdiff, oxmutate, typecheck) and write the PR's "Checked:" line, including what was not checked.
  A check mode warns when a PR body lacks the line; it becomes an error only after a warn window.
- **R8. `replay`: learn from every miss.** Given a list of past PRs labelled caused-a-bug / did-not,
  run the configured reviewer on each and report caught / missed / false-alarm, month over month. The
  reviewer is a command the user names; rulehome never calls a model itself.

## Why now

- The owner set the family's purpose on 2026-11-22: the code half of every verification station. Four
  of the stations (rule placement, checks before push, reviewer rulebook, proof of what was checked)
  have no tool in the family, and rulehome already holds the first and the vocabulary for all of them.
- Two implementations of decision markers (rulehome and contractdiff) would drift. One must own it.

## Constraints

- Code decides facts: every command is deterministic on its input. `replay` runs a reviewer the user
  provides and only counts.
- Less to hold: each command's output is the move list, the findings, or one line; never the input.
- Warn first for every new gate (R7's check, any rule `audit` proposes to turn on).

## Success criteria

- `audit` on the snappy-client-dashboard case study reproduces the published result (51 rule lines,
  18 movable) as a test fixture.
- `hooks` output runs green on this repository's own `lefthook.yml` shape.
- `rulebook --max-tokens 8000` on this repository fits and lists what it left out.
- `proof` on a PR with tests + lint + oxmutate JSON writes a line naming all three and one "not checked".

## Rejected

- **A hook runner of our own.** lefthook and Husky do it; the station needs the preset, not a runner.
- **Keeping rulehome in its own repo.** One repo per family; it is a burgee program and shares the
  release gate.
- **A model call inside `rulebook` or `replay`** to judge rules. Counting is code; judgment is the
  reviewer's, run by the user.
