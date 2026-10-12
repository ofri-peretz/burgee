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
