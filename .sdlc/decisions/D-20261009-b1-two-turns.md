---
id: D-20261009-b1-two-turns
subject: 'Can burgee''s B1 pooled median reach 2 turns, so the agent claims hold even on commander''s good runs; and if not, what closes A-20261009-agent-cost-claims'
taken: Owner — default stands
date: '2026-10-09'
superseded_by: —
---

**No product change can make the pooled median 2 on the current five tasks. Default, until the
owner says otherwise: the claims, the tasks and the floor stay as they are, and README keeps
saying what the newest CI run says.** Two levers below would cut burgee's total turns hard. One
would also let a restated claim hold on every run measured so far. Each conflicts with a
recorded decision or is a published claim, so each is the owner's call.

## Why the median stays at 3

The pooled median is the 13th smallest of 25 task-runs, so 2 needs 13 runs at 2 turns. A turn is
one tool call, plus one for the answer. In the 175 burgee task-runs of the seven B1 runs on main
from ba8a89c to 689c403 (`b1-transcripts`):

| task | burgee turns, 35 runs | floor, and why |
| :-- | :-- | :-- |
| recover-failure | 3 in 34, 4 in 1 | **3**. The task says to run `demo fail` and then make it exit 0, and the second command depends on what the first printed |
| diagnose-provenance | 5 to 14, mean 9.2 | **3**. The task needs `greet grace` plus `--explain` |
| discover-subcommand | 3 in 21, 4 in 10 (all before #891), 5 in 2, 2 in 2 | **3 for 33 of 35**. Their first call is `demo --help`, bare `demo` or `ls -la`, made before any output exists. commander's agents open the same way in 30 of 35 |
| non-tty-required | 2 in 24, 3 to 4 in 11 | **2**. Every 3 is the harness refusing `demo greet; echo $?`, then the retry. It happens on both builds |
| structured-output | 2 in 5 (14 after D-20261009-json-asked-is-json) | **2** |

Recover-failure and diagnose-provenance hold 10 runs at 3 or more. Discover-subcommand holds
about 4.7 more, since 33 of 35 agents read help first. That leaves at most 25 − 10 − 4.7 ≈ 10.3
runs that can be 2, short of 13, **even if every structured-output and non-tty run took 2**. So
burgee's median is 3, and the ratio is 3/4 = 0.75 when commander has a good run and 3/6 = 0.5
when it has a bad one. Five runs a task do not change this. The task set does.

## Proposals (not done here)

**P1. Run a fix that is unambiguous and read-only.** Every command declares `effects` (N6), so
the engine knows `config get` is `read_only`. Running `demo config get user.name` when
`demo config user.name` was typed would save a turn on 25 of 70 structured-output openings
(`config user.name`, `get user.name`, `--get user.name`, `--format json config user.name`).

- *Conflicts with:* E1, which says exit 2 means "rewrite the command". A mistyped line would exit
  0 instead, and a script would come to depend on the tree's shape: it breaks the day a second
  command takes one argument. Also D-20260930-failures-teach-recovery rule 2 and spec E3: "an
  executed guess burns the turn `fix` exists to save".
- *Effect:* the median stays 3, by the arithmetic above.
- *Recommendation:* do not do it.

**P2. Make the `--schema` path lead to `--explain`.** 30 of 35 burgee diagnose-provenance runs
read `--schema` before any `greet --help`, and those runs averaged 9.9 turns (6 to 14). The 5
runs that read `greet --help` first, where `--explain <option>` is listed, took 5 turns every
time. `--schema` shows the default and the env name but not how to ask which one applied, so
agents spend turns probing `DEMO_GREETING` with shell calls the allowlist refuses. The
allowlist refused 99 tool calls across those 35 runs. The fix is either a framework field in the schema
naming `--explain`, `--json` and `--help`, or the unknown-command hint naming `--explain`
beside `--schema`.

- *Conflicts with:* D-20260930-failures-teach-recovery, "What `--schema` says about it: Nothing
  new, on purpose". That says framework surfaces stay out of the program document, and
  `./yargs` had 48 bytes of headroom. Rule 4 of the same decision sets the hint's words.
- *Effect:* about 4.9 turns saved on each of 30 runs, roughly 21 turns per 25-run B1 reading.
  The median does not move. Totals and p95 move a lot.

**P3. Restate the claims as totals.** Compare the sum of turns, or of tokens, over the 25
task-runs, instead of the medians (gap A-20261009-agent-cost-claims, second path). The median
of 25 is set by the task mix, so it says burgee and commander both take 3 to 4 turns on the
easy tasks. It cannot see that burgee wins recover-failure by 3 turns to 8–16 and
diagnose-provenance by about 9 to 11.

| run | turns burgee / commander | total ratio now | with D-20261009-json-asked-is-json | and P2 (estimate) |
| :-- | :-- | --: | --: | --: |
| ba8a89c | 106 / 151 | 0.702 | 0.669 | ~0.53 |
| 98c355c | 107 / 179 | 0.598 | 0.581 | ~0.46 |
| 6b8e3d9 | 97 / 162 | 0.599 | 0.580 | ~0.45 |
| e641aa3 | 106 / 168 | 0.631 | 0.625 | ~0.50 |
| 367cefb | 111 / 158 | 0.703 | 0.677 | ~0.54 |
| f29f159 | 101 / 173 | 0.584 | 0.572 | ~0.45 |
| 689c403 | 115 / 164 | 0.701 | 0.665 | ~0.54 |

The token totals on the same runs are 0.549 to 0.692 today. They follow the turns, at about
21K tokens a turn.

- *Owner's call:* this is a published claim (DECISIONS.md, "Who decides").
- *Recommendation:* P3 together with P2. On the estimate above they meet ≤ 0.7 turns and
  ≤ 0.6 tokens on all seven runs, without touching the tasks, the checks or the floor.

All figures come from replaying the transcripts. B1 runs on main after a merge are the
measurement.
