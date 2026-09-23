---
"burgee": patch
---

`--mcp` tool calls reach the program with multi-word options. `tools/call` rebuilt argv as `--<property>`, so `skipBlank` went out as `--skipBlank` and both the engine and `burgee/commander` refused it; it now sends the flag the schema advertises (`--skip-blank`), and a `false` for a boolean that defaults on goes as `--no-<name>`. Under `burgee/commander`, a lone `--no-color` is advertised as `noColor` (flag `--no-color`) instead of a `--color` commander never accepts. `run(defineCommand(…))` now keeps the command's `effects`, `examples`, `arguments` and `relations`, so a single-command program's tool carries the hints it declared and is named after the program rather than `""`. An unknown-option `fix` is spelled as the flag is typed (`--dry-run`, never `--dryRun`). `OptionSpec` gains `negatable?: boolean` — `false` refuses `--no-<name>`.
