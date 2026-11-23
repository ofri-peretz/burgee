# Intent — `rulehome` joins the family: rule placement as a burgee program

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
Hooks, the reviewer's rulebook, proof of what was checked and replay are not rulehome's: they are
[`hookset`](../hookset/), [`triggerlist`](../triggerlist/), [`proofline`](../proofline/) and
[`replay`](../replay/) (#1701). `audit` points each rule at the one that holds it.

## Why now

- The owner set the family's purpose on 2026-11-22: the code half of every verification station.
  Rule placement is the one station with a working tool outside the family; it should be a burgee
  program like the rest.
- Two implementations of decision markers (rulehome and contractdiff) would drift. One must own it.

## Constraints

- Code decides facts: every command is deterministic on its input.
- Less to hold: each command's output is the move list, the findings, or one line; never the input.
- Warn first for any rule `audit` proposes to turn on.

## Success criteria

- `audit` on the snappy-client-dashboard case study reproduces the published result (51 rule lines,
  18 movable) as a test fixture.
- `rulehome intent` and `contractdiff diff --decisions` give the same findings on rulehome's own
  fixtures, then `intent` is removed.

## Rejected

- **Keeping rulehome in its own repo.** One repo per family; it is a burgee program and shares the
  release gate.
- **Growing rulehome into hooks, rulebook, proof and replay.** Each has its own intent; one tool per
  station keeps each small.
