# codegraph: does a code graph cut Claude's grep calls?

The `codegraph` MCP server and `claude/codegraph.mjs` are in the pack because of this measurement.
Each task in `tasks.txt` ran as a headless Claude Code session on the same burgee checkout, in two
arms: **A** with no MCP server, **B** with the server `stations.json` pins. `run.sh` runs one
session, `tally.mjs` counts its tool calls, and `results.json` holds the numbers below.

| Tasks         | Arm | Runs | Greps | Reads | Tool calls | Cost (USD) |
| :------------ | :-- | ---: | ----: | ----: | ---------: | ---------: |
| explore (5–7) | A   |    6 |    29 |    24 |         57 |       1.18 |
| explore (5–7) | B   |    6 |    18 |     3 |         34 |       1.23 |
| lookup (1–4)  | A   |   12 |    23 |     9 |         35 |       1.22 |
| lookup (1–4)  | B   |   12 |    17 |     6 |         35 |       1.71 |
| lookup (1–4)  | C   |   12 |    21 |     9 |         44 |       1.78 |

On tasks that trace a flow through the code, the graph replaces most of the grep-and-read loop at
about the same cost. On one-symbol lookups it cuts greps but not tool calls, and costs more: the
server's instructions and its answers are longer than a grep's. The sample is small (one model,
one repo), so read the direction, not the percentages.

Arm **C** added a PreToolUse hook that denied the first grep of a symbol-shaped pattern in each
session. It added tool calls without cutting greps further, so the pack's hook only builds the
index.

To run it again, make two clean checkouts at `$WORK/A` and `$WORK/B`, run `codegraph init` in
`$WORK/B`, then:

```bash
for t in 1 2 3 4 5 6 7; do
  for r in 1 2; do WORK=$WORK ./run.sh A $t $r & WORK=$WORK ./run.sh B $t $r & done
  wait
done
node tally.mjs "$WORK/out"
```
