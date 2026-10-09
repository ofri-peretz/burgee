---
id: D-20261008-b1-tool-name
subject: 'B1 installed the demo CLI as `mytool` while both demos call themselves `demo`; should the harness use the name the CLIs print'
taken: Taken
date: '2026-10-08'
superseded_by: —
---

**Yes. B1 now installs the shim as `demo`, the name both demo CLIs declare.** The tasks and
the `Bash(demo:*)` allowlist name it the same way.

**The confound.** `examples/demo-cli-burgee` declares `name: 'demo'` and
`examples/demo-cli-commander` declares `new Command('demo')`. Both print `demo` in their help,
usage and error lines. The harness put them on PATH as `mytool`, so every printed command named
a program the agent could not run. In the four B1 runs on main before this change (6d3eda2,
4427596, cb1da65, 702f1f4), 10 of 100 burgee task-runs ran `demo …` literally, 17 calls in all,
one of them five in a row. Each refused call costs a turn, and a turn costs about 21K tokens.
A real CLI is installed under the name it prints, so the old setup measured a mismatch no user
has.

**Why this is not tuning toward a result.**
- The change is identical for both builds.
- It does not touch the tasks' wording beyond the tool's name, their checks, the 0.8
  success-rate floor, the turn caps, the model or the claim.
- The burgee-side saving is real, and it is disclosed here and in the next README restatement.
- commander's agents never ran `demo …` in those runs, so its side is not expected to move.
  If it moves, that is information too.

**History.** The agent bands have no landed CI series yet: B1's results never reached the tree
until #871. So nothing is restated, and the series starts on this harness.

## What it did (2026-10-09)

**The prediction above was wrong: commander moved more than burgee.** The first landed reading
on the `demo` harness, `ba8a89c`
(`benchmarks/results/agent-cli-bench/2026-10-08-ba8a89c-ci.json`), compares with the last
complete pre-change run, `0931c79`, as follows:

| | 0931c79 (`mytool`) | ba8a89c (`demo`) |
| :-- | :-- | :-- |
| burgee | 3 turns, 63,513 tokens, success 0.96 | 4 turns, 84,969 tokens, success 1.0 |
| commander | 6 turns, 129,386 tokens, success 0.76 | 4 turns, 85,426 tokens, success 0.84 |
| tokens ratio | 0.491 | **0.995** |
| turns ratio | 0.5 | **1.0** |

Commander's agents now often run `demo config get user.name` first and finish in two turns.
burgee's agents read `--help` and `config --help` first. On this harness burgee's lead is in
`recover-failure` (3 turns against 9–11, where commander's agents pass 1 of 5) and
`diagnose-provenance` (about 7 against 10–12). The pooled median does not show that lead.

So the mismatch had been costing commander more than burgee, and the old claim figures leaned
on it. The claim stands or falls on this harness from here, and the README restatement must
use the post-change series. The burgee changes that recover the lost turns are product work in
burgee's own help and errors, in a separate PR, measured the same way.
