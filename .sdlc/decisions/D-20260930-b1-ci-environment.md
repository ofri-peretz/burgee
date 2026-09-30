---
id: D-20260930-b1-ci-environment
subject: B1's first CI run read burgee at 6 turns against D-147's local 3 (ratio 1.2 against 0.600); is that the runner's environment, a burgee regression, or the harness, and what may the public row say
taken: Taken
date: '2026-09-30'
superseded_by: —
---

**It is the agent, not the environment and not burgee. D-147 ran `claude` 2.1.145, the copy on the laptop's PATH. CI runs the 2.1.283 that `.github/tools/claude-code` has pinned since #642. Neither 0.601× nor 1.199× is a reading of what burgee changed, and the public row does not move until a valid CI run exists.** Each candidate was tested:

- **The runner's environment.** The harness spawned `claude` with `{ ...process.env }`, so on CI the CLI under test saw `CI=true` and `GITHUB_ACTIONS=true`, and burgee's output policy reads `CI`. It made no difference. The demo's output (`--help`, `greet`, `greet grace`, `config get user.name [--json]`, `fail [--json]`, `--schema` and 16 invocations in all) is byte-identical under no variable, `CI=true`, `CI=true GITHUB_ACTIONS=true`, `CLAUDECODE=1` and both together. On the same `claude` 2.1.283 with and without `CI=true GITHUB_ACTIONS=true RUNNER_OS=Linux`, burgee took 6/6 turns on discover-subcommand, 2/2 on non-tty-required, 16/16 on recover-failure and 6/5 on structured-output. The one task that differed, diagnose-provenance (20 turns against 9), differed by how many refused commands the agent tried (13 against 3).
- **A burgee regression.** Between `2a51440` and `e1b4b1b` no commit touched `examples/demo-cli-burgee`. The built demo's output differs in one place: top-level `--help` now lists `--schema`. The unknown-command, missing-argument, unknown-option and runtime-failure paths are identical, and so is commander's demo.
- **The harness.** The model (`claude-sonnet-4-5`), the tasks, the checks, `--max-turns` and `--allowedTools` are unchanged. The agent is not. **Reproduced locally without any CI variable:** on 2.1.283 burgee's per-task turns were diagnose 20 / discover 6 / non-tty 2 / recover 16 (`error_max_turns`) / structured 6, a median of **6**, which is CI's figure. On 2.1.145 they were 13 / 6 / 2 / 3 / 4, a median of **4**. On both versions recover-failure is a coin toss: 2.1.145 ran 3, 3 and 9 turns, and 2.1.283 ran 16, 16, 3 and 4. Each run either stops at `mytool fail || true` or spirals through refused `which`, `cat`, `Read`, `Write` and `echo $?` calls until the turn limit.

Evidence came from 19 task-runs in all, burgee only, captured with `--output-format stream-json --verbose`.

**Two harness defects surfaced and are fixed:**

1. A run that ended at `--max-turns` exits 1, and `runOne` recorded any non-zero exit as 0 tokens and 0 turns. Those zeros entered the medians, so a variant's median *fell* for each run it lost by exhausting its turns. Such a run now keeps the turns and tokens it spent. A run with no usage at all is left out of the medians and still counts as a failure.
2. A local run used whatever `claude` was on PATH, and no record said which version ran. The harness now prefers the pinned install when `npm ci --prefix .github/tools/claude-code` has run. Every record carries `detail.claude`, `detail.claudePinned` and `detail.env`.

The tool also now runs in the caller's environment minus `CI`, `GITHUB_*`, `RUNNER_*` and `ACTIONS_*`, the same on a laptop as on a runner, although that was not the cause here. For debugging, the `success-rate` record lists every task's turns, tokens, passes, refusals and failure kinds, and the job summary prints them as a table. CI uploads every run's redacted event stream as the `b1-transcripts` artifact.

**Also found, not changed here, because each needs the owner's call:**

- burgee fails recover-failure on every run (0 of 7 across both versions). The demo's `fail` prints `error: boom` and never names `--code`, so burgee's success rate is capped at exactly the 0.8 floor, and one more failed run anywhere invalidates a run.
- In 19 runs the agent read `--schema` once, as its last step. It walks `--help` on both builds, and the unknown-command error sends it to `--help` rather than listing the commands.
- `--explain` exists but no `--help` lists it. On diagnose-provenance the agent spent its extra turns trying to read `DEMO_GREETING` from the environment, which the allowlist refuses.

**The README rows stay as D-150 wrote them** until a CI run clears both success floors. That run then replaces both figures, with the agent named: "`<ratio>`× (CI, claude-code 2.1.283, sonnet-4-5, `<date>`, run `<id>`)", ✅ or ❌ as measured. The 0.601× and 0.600× figures are then retired as readings of a different agent, not kept beside the CI number.
