---
id: B-20261026-control-bands-demo-build-and-budget
section: B
status: open
source: sdlc-locks-evals-bands S3 (every band gains a point per scheduled run; test-duration-ms stalled at 7 points)
recommendation: 'In one `control-bands.yml` pull request whose task-eval run the owner accepts: build the demo the root suite starts beside the packages (`npx turbo run build --filter=''./packages/*'' --filter=''./examples/demo-cli-burgee''`, as compat.yml has since #1159), and raise `timeout-minutes` from 20 to 40 or stop `--backfill-git` re-reading the 121 compat observations each run, whichever the next run''s timing supports'
---

The weekly control-bands run named the cause the duration band was waiting for, and showed a
second fault that costs every band its point.

**1. `npm test` is red in that job, and it is the job, not the suite.** Run 40311991676
(scheduled, 2026-10-26 11:02 UTC), through the logging #1252 added:

```
⚠️ test-duration-ms: no observation — `npm test` exited 1
FAIL scripts/mcp-config-block.test.ts > the client configuration on /docs/agent-surfaces (R6)
  > starts the server it names, as pasted, and completes initialize, tools/list and a tools/call
Error: ENOENT: no such file or directory, chmod '…/examples/demo-cli-burgee/dist/bin.js'
```

The job builds `--filter='./packages/*'` only. `scripts/mcp-config-block.test.ts` starts
`examples/demo-cli-burgee/dist/bin.js`, which nothing built. compat.yml met the same failure and
builds the demo since #1159 ("compat cells build the demo the root suite starts"). The 2026-10-19
run lost its point to a red suite too (69 s after the step began); its cause was not logged then.

**2. The job ran out of time, so no band landed a point.** The same run was cancelled at its
20-minute limit (11:22:22 UTC) inside "Record observations and evaluate bands", after
`--backfill-git` had collected 121 new observations for each compat band (`cold-start-ratio`,
`agent-exit-code-accuracy`, `compat-exit-hook-pass-rate`, …). On 2026-10-19 the same step found
46 per band and finished. Cancelled before the PR step, the run landed nothing for any band,
`lint-rules-on` included.

**3. A breach PR that is closed loses the week's points.** The 2026-10-19 run did finish; its
observations went out in #1154, a breach draft that was closed under
D-20261019-front-end-byte-steps-rebase-bands. So `lint-rules-on` and
`lint-documented-false-positives` still end at 2026-10-12, two runs ago.

Both fixes are in `.github/workflows/control-bands.yml`, and a change under `.github/` runs the
paid task evals on its pull request, which is why this is a decision and not built in the batch
that found it.
