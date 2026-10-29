---
id: A-20261028-yargs-parse-callback-surfaces
section: A
status: open
source: first-adopter second-target proof on emmercm/igir (`.sdlc/research/adoption/igir.md`)
done_when: 'A `burgee/yargs` program that calls `.parse(args, context, callback)` and uses its return value synchronously, with `.demandCommand()` and `.strictOptions(true)`, behaves on `--json`, `--schema`, `--mcp` and `completion <shell>` as the same program does under `.parseSync()` (surfaces served, or the flag refused as yargs would), and `--json` on a program whose commands have no handler (igir declares each with a builder only, and does its work after `.parse()` returns) is either refused as an unknown argument under `.strictOptions()`, as yargs refuses it, or prints no envelope at all; it never prints `"ok": true` ahead of work it has not run; a case in `packages/burgee/src/yargs` proven red on `burgee@1.9.2` first; then the igir argument vectors are re-run on the published fix'
---

Pull requests #1311 and #1325 made burgee's reserved surfaces work under `.parseSync()`, the shape concurrently
uses. igir uses the other synchronous shape, `.parse(argv, {}, (err, argv, output) => …)`, and
reads its return value straight away. Under that shape, on `burgee@1.9.2`, none of the four
surfaces works, `--schema` skips `.demandCommand()`, and `--json` prints success ahead of a run
that then fails.

A minimal program, `.command('copy').demandCommand(1).strictCommands(true).strictOptions(true)`
with a throwing `.fail()`, run on yargs 18.2.0 and on `burgee@1.9.2`:

| argv | yargs 18.2.0 | burgee 1.9.2, `.parse(args, {}, cb)` | burgee 1.9.2, `.parseSync()` |
| :-- | :-- | :-- | :-- |
| `--json` | throws "You must specify at least one command", exit 1 | prints nothing, returns `undefined`, exit 1 | `{"ok":false,…"You must specify at least one command"}`, exit 1 |
| `copy --input x --json` | throws "Unknown argument: json" | `strictOptions` bypassed; the callback receives `{"ok":true,"data":null,…}` as output; returns the argv | prints `{"ok":true,"data":null,…}`; returns the argv |
| `--schema` | throws "You must specify at least one command" | prints nothing; returns `{ _: [] }`, `demandCommand` bypassed, exit 0 | prints the schema |
| `--mcp` | throws the same | returns a `Promise`, prints nothing, exit 0 | serves |
| `completion zsh` | throws "Unknown commands: completion, zsh" | returns a `Promise`, prints nothing, exit 0 | prints `#compdef prog` |

On igir itself, through the built binary, against a 44 / 44 yargs-against-yargs control:

- `igir copy --input <dir> --output <dir> --json` prints `{"ok":true,"data":null,…}` on stdout,
  then runs the copy, which fails, exit 1. Before, it refused `--json` as an unknown argument.
  An envelope that says `ok: true` ahead of a failed run is the worst of the four. It is not
  only this shape: under `.parseSync()` the same program prints the same envelope, because a
  program with no handler has its work run after the envelope is written. igir is such a
  program: `.command(name, description, builder)` with no handler, the run after `.parse()`. For such a program,
  `--json` should be refused as yargs refuses it, or the envelope should not claim success.
- `igir --schema` runs igir with no command (it scans for ROMs and fails), where it used to
  print help and "You must specify at least one command".
- `igir --mcp` and `igir completion zsh` fail with `options.getLogLevel is not a function`,
  because igir passes the returned `Promise` to its own option parser.
- `igir --json` fails with `Cannot read properties of undefined (reading 'getLogLevel')`.

All four exit 1 either way, so igir's suite does not notice. The parity harness does.
