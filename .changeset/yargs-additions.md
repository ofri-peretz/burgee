---
"burgee": minor
---

burgee's additions on yargs syntax, guarded so a program that asks for none of them runs exactly as on yargs (804 / 804 still): `yargs.manifest` projected from what the program registered (builders run on a scratch instance, as yargs' completion does), `use(plugin)` with `preRun`/`postRun` around every handler, `.effects()` inside a builder, `--json` as the `{ ok, data, meta }` envelope when the program did not declare it anywhere in its tree, `--schema`, `--mcp` and `completion <shell>` from the manifest, and `.burgee({ stdout, stderr, exit })` injecting the streams and reporting E1 exit codes.
