---
id: D-20261101-b1-tool-isolation
subject: 'B1''s agent reaches the build through the tool and nothing else: `--tools` leaves Bash the only built-in tool (none on the MCP arm), and a PreToolUse hook refuses every Bash call that is not the tool, because `--allowedTools` only pre-approves. It starts a new B1 band history'
taken: 'Taken — the owner''s directive of 2026-11-01'
date: '2026-11-01'
superseded_by: —
---

B1's premise is that the agent "sees Bash on `demo` and nothing else (intent constraint 2): no
file reads, so the CLI's own output is the only channel" (`runOne`). The spawn did not make that
true. `--allowedTools 'Bash(demo:*)'` pre-approves one pattern; it denies nothing.

## What showed it

The oxmutate arm's reading 1 (D-20261101-b1-oxmutate-arm, kept in
`benchmarks/results/agent-cli-bench-oxmutate/superseded/2026-11-01-b8057bc-215402-local.json` on
that branch): in 11 of its 20 runs the agent ran `ls -la`, `cat oxmutate.config.json` or the Read
tool, on `claude` 2.1.286.

## What was measured (claude 2.1.286, B1's own isolation flags, a scratch dir with a `demo` shim)

- **`--allowedTools 'Bash(demo:*)'` alone**, as B1 spawned it: the session had 28 tools (Read,
  Write, Edit, WebFetch, WebSearch, Task, Skill, ...). `ls -la`, `cat secret.txt` and Read all
  returned the file.
- **`--tools Bash`** leaves Bash the only built-in tool: Read and Glob answer "No such tool".
  Bash's read-only commands still run.
- **`--permission-mode dontAsk`** refuses a command nobody approved (`while read ... < file`), but
  not a read-only one. Of a battery of 46 commands, **36 ran without approval**: `ls`, `cat`,
  `head`, `tail`, `grep`, `rg`, `find`, `wc`, `stat`, `file`, `tree`, `pwd`, `echo`, `du`,
  `which`, `type`, `sort`, `diff`, `cmp`, `cut`, `sed -n`, `strings`, `od`, `tr`, `nl`, `column`,
  `realpath`, `readlink`, `jq`, `base64`, `git status`, `cd`, `date`, `id`, `uname`, `ps`.
- **A deny-list** (`--disallowedTools 'Bash(ls:*)' 'Bash(cat:*)' ...`) refuses each command it
  names, and cannot be closed: the auto-approved set is `claude`'s, unlisted, and moves with the
  version. `--disallowedTools Bash` and `'Bash(*)'` remove the Bash tool outright, and an `ask`
  rule on Bash outranks the allow and refuses `demo` too.
- **A PreToolUse hook passed with `--settings`** runs under `--setting-sources project,local` and
  its exit 2 refuses a read-only command as well as any other.

## Decided

- **CLI arms:** `--tools Bash --allowedTools 'Bash(demo:*)' --settings <file>`. The file's only
  content is a PreToolUse hook on Bash, `benchmarks/axes/bash-guard.ts demo`: a call runs when it
  is `demo` with arguments and no shell syntax (`;`, `&`, `|`, `<`, `>`, `$`, backticks,
  parentheses, globs, backslash, newline), `2>&1` aside, which only merges two streams the agent
  already sees. Anything it cannot read is refused, since a hook that crashes lets the call
  through. Live against 2.1.286 with the harness's own `toolArgs('cli')`: `demo hi` and
  `demo hi 2>&1` ran; `ls -la`, `cat secret.txt`, `demo hi && cat secret.txt` and Read were
  refused, and the file's content reached no tool result.
- **MCP arm:** `--tools ''`, so no built-in tool at all. Live: the session's tools were the
  server's alone and the server reported `connected`.
- Held by `benchmarks/agent.test.ts` › "the agent reaches the build through the tool and nothing
  else": the argv as spawned on each arm, the hook it names, and that hook against the commands
  from the 2026-11-01 transcripts. On the spawn before this change both argv cases fail, and
  without `bash-guard.ts` the file does not load.

## What it changes

**A new B1 band history starts at this commit**, for the demo arms and the MCP arm. Before it the
agent could read the working directory and use 27 other tools; after it, it cannot, and calls it
used to make are now refused turns. A run that ended at `demo fail || true` or
`demo fail; echo $?` (D-20260930-b1-ci-environment saw both) is now refused and has to use the
CLI's own answer. Both builds run under the same spawn, so a ratio is still like for like, but a
ratio or a per-build median from before this commit is a reading of a different harness and is
not compared with one after it.

`priorReadings` (the MCP arm's grade over landed CI readings) does not yet tell the two harnesses
apart; until it does, the landed readings dated 2026-10-27 and earlier belong to the old one.

**The oxmutate arm** (D-20261101-b1-oxmutate-arm, #1426) allows `Bash(npx oxmutate:*)` beside
the shim, so `toolArgs` hands the guard every command `--allowedTools` allows: `oxmutate` and
`npx oxmutate` there, `demo` on the demo arms. Its three graded readings (`d71dcb0`, success 0.95,
1.00, 1.00) were taken on the old spawn, where the agent could also read the fixture. They stay in
`benchmarks/results/agent-cli-bench-oxmutate/` for now, because moving them would reopen
first-adopter's A5 and gap B-20261101-b1-real-cli-arm-oxmutate, and a reading can only be taken on
the owner's machine (60 sessions, about $6 at list price, on the subscription login). They are
replaced, by the same rule as reading 1, when three readings on this spawn exist. The arm still
never runs in GitHub Actions; nothing here adds a run anywhere.
