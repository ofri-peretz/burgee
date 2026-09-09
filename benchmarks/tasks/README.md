# B1 task set

Five tasks, each chosen because one floor requirement is the only thing that changes the
agent's path between the two builds (design, "B1 — agent cost").

Each is `{ id, requirement, prompt, setup, check, maxTurns }`:

- `prompt` is given to `claude -p` verbatim. The agent may run `mytool` and nothing else,
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
