---
id: A-20261009-agent-cost-claims
section: A
status: open
source: 'burgee B1, first reading on the demo-named harness (ba8a89c, D-20261008-b1-tool-name)'
done_when: 'the median of the landed post-#881 B1 CI readings meets agent-tokens-40pct (≤ 0.6) and agent-turns-30pct (≤ 0.7), with the success-rate floor held; or a decision restates the claims to what is measured and the README says so'
---

Once B1 installs the demo under the name both CLIs print (#881), the claims are not met. The
first landed reading reads tokens 0.995 and turns 1.0, where the run before read 0.491 and 0.5.
Commander moved from 6 turns to 4; burgee moved from 3 to 4.

burgee's lead now shows only in two tasks, and the pooled median does not show it:
- `recover-failure`: 3 turns against 9–11;
- `diagnose-provenance`: about 7 against 10–12.

PR #891 (the root help lists runnable leaves, and fix lines are whole commands) estimates 0.75 for
turns and 0.747 for tokens from the transcripts. That is better, still short of both claims, and
it has to be measured on main.

C1 (the CI series exists) closes separately; this gap is the claim itself.

**Still open (2026-10-09, after five post-#881 runs).** The runs read 0.995, 0.495, 0.491, 0.493
and 0.747 (median 0.495). burgee holds at 3 turns, while commander's median lands at 4 or 6, so
the claim is met only when commander has a bad run, and the newest reading (0.747) misses. Two
ways to close it:
- burgee finishes the common tasks in 2 turns, so even commander's good runs leave burgee at 3 or
  fewer of 6 (≤ 0.5) or 4 (≤ 0.5);
- a decision restates the claims to the measured series (for example "fewer turns in 4 of 5
  runs", or median-based).

Either way, the README states what the newest run says.
