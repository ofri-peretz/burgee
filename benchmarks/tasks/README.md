# B1 task set

Five tasks, each chosen because one floor requirement is the only thing that changes the
agent's path between the two builds (design, "B1 — agent cost").

Each is `{ id, requirement, prompt, setup, check, maxTurns, modalities }`:

- `prompt` is given to `claude -p` verbatim. The agent may run `demo` and nothing else,
  so the CLI's own output is its only information channel.
- `setup` runs in the task's scratch directory before the agent starts.
- `check` runs after, in that directory, with `$BENCH_RESULT` pointing at a file holding
  the agent's final text and `$BENCH_EXIT` at its exit status. Exit 0 means the task
  succeeded. **Every check must fail on the un-run state** — `tasks.test.ts` runs each one
  against an empty result and asserts it goes red, because a check that passes on nothing
  measures nothing.

`exemplar` is a plausible correct answer. `tasks.test.ts` asserts each `check` **passes**
on it as well as failing on the empty result: a check that can never pass is as useless as
one that always does, and only running both directions tells them apart.

## Modalities

`modalities` names the surfaces a task can be stated in: `["cli"]`, or `["cli", "mcp"]` for the
B1 MCP arm (`.sdlc/intents/b1-mcp-arm/`, R1). A task gets `"mcp"` only when its prompt, its
check and its exemplar hold word for word for an agent that has the demo's MCP tools and no
shell: the check never runs `demo`, and the exemplar names no shell command. A task that cannot
be stated identically to both arms is excluded from the MCP arm by name, never restated for it,
because a task restated for one arm is a different task. `agent.test.ts` refuses a task file
without the field, and every CLI-only task has its reason here:

| Task | Modalities | Why |
| :-- | :-- | :-- |
| `diagnose-provenance` | `cli`, `mcp` | The `greet` tool reports where the greeting came from, as `--explain` does; nothing in the prompt or check names a shell. |
| `discover-subcommand` | `cli`, `mcp` | `config_get` is one tool among the three `tools/list` returns; the check reads only the answer. |
| `structured-output` | `cli`, `mcp` | A tool result is the same `{ ok, data }` envelope `--json` prints; the check reads only the answer. |
| `recover-failure` | `cli` | It asks for an exit status and "the exact command that worked", and its check requires the flag spelling `--code`; a tool call has neither an exit status nor a command line. |
| `non-tty-required` | `cli` | It tests that a missing argument in a pipe exits 2 instead of prompting: a terminal behaviour, with an exit status, that MCP does not have. |

## The oxmutate arm

`oxmutate/` holds the tasks of B1's oxmutate arm, first-adopter A5
([D-20261101-b1-oxmutate-arm](../../.sdlc/decisions/D-20261101-b1-oxmutate-arm.md)). The demo's
five ask for commands oxmutate does not have, so the arm has its own four. They run only with
`npm run bench -- --axis agent --arm oxmutate`, on the owner's machine, never in GitHub Actions.
The shim is named `oxmutate` and the agent may run nothing else.

Each file also has `wrong`, a plausible answer that names the right command and gets the result
wrong. `tasks.test.ts` asserts each check fails on it, as well as on the empty result, and passes
on the `exemplar`.

`setup` runs with the shim on PATH, `$BENCH_FIXTURES` at `benchmarks/fixtures` and `$BENCH_REPO`
at the repository root. Two tasks copy `fixtures/oxmutate/adult` in and link the repository's
`node_modules`, so Vitest resolves. That project has 6 mutants: its tests kill 4, and the two on
the boundary (`age > 18`, `19`) survive.

| Task | What the agent must find |
| :-- | :-- |
| `oxmutate-discover-flag` | the `run` option that exits 1 below a score, `--break`, from `--help` or `--schema` |
| `oxmutate-score` | the score of a run it starts itself, 66.67%, with 4 killed and 2 survived |
| `oxmutate-survivors` | each survivor of a run already done: `src/age.js`, line 2, `age > 18` and `19` |
| `oxmutate-explain-error` | the `--json` error of `survivors` with no report: kind `runtime`, exit 1, fix `oxmutate run` |
