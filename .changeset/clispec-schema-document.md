---
"burgee": minor
---

`--schema` is a clispec v0.3 document (https://clispec.dev). Beside burgee's own keys, which keep their meaning (`schemaVersion` stays 1), a native program's document now carries `clispec: "0.3"`, a `version` always (the declared one, else the owning `package.json`'s), `global_args` (the rows root help lists under `Global options:`), and `output` (`{ tty: "text", piped: "text", formats }`). Each command carries `example` (its first example as `{ args }`), and from a new `output` declaration `cardinality`, `output_kind`, `media_type` and `stdout_schema`. The commander and yargs front-ends are unchanged.

`defineCommand` takes `output: { kind?, cardinality?, schema?, mediaType? }`. With a `schema`, TypeScript holds `run`'s return to what it describes; without one, nothing changes. `burgee dev` warns about a runnable command that declares no `output.cardinality`, and refuses nothing.

`--format text` (also `--format=text`, `--output text`) prints the human rendering, under a pipe or an agent alike: it was `unknown option --format`, exit 2. A command that declares its own `--format` keeps it.
