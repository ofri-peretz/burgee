---
"burgee": patch
---

`--schema` and the unknown-command hint now name `--explain`, for where a value came from.

A native program's `--schema` document carries one new field just before `commands`:
`"explain":"--explain <option> on a command says where its value came from: default, env, config or flag"`.
An unknown command that matches nothing now hints `run --schema for every command and option as
JSON, in one call; --explain <option> says where a value came from`. In B1's transcripts, 56 of
60 agents asked where a value came from read `--schema` and then spent three to eight turns
probing the env var it named. `burgee/program-schema.json` describes the new field. One
command's schema is unchanged. So is `--schema` on `burgee/commander` and `burgee/yargs`, which do
not parse `--explain` (D-20261009-b1-totals-and-explain).
