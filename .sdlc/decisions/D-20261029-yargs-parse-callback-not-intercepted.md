---
id: D-20261029-yargs-parse-callback-not-intercepted
subject: 'Under yargs'' callback form, `.parse(argv, context, callback)`, should burgee serve `--json`, `--schema`, `--mcp` and `completion <shell>` and report them through the callback, or not intercept them at all? And what should `--json` do on a command that has no handler?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-29'
date: '2026-10-29'
superseded_by: —
---

**Not intercepted.** When a parse is given a callback, burgee takes none of its reserved names.
`--json`, `--schema`, `--mcp` and `completion <shell>` are the program's arguments, and yargs
parses them as it parses any other: refused under `.strictOptions()`, `.strict()` or
`.strictCommands()`, and otherwise passed through to the argv. Under `.parse()`, `.parseSync()`
and `.parseAsync()` without a callback nothing changes: the surfaces are served as before.

**Why.** The callback form is yargs' contract for a program that owns its output and its exit.
yargs turns `exitProcess` off for it, hands the output to the callback, and returns the argv; the
program decides what happens next. igir (A-20261028-yargs-parse-callback-surfaces, found by
[`igir.md`](../research/adoption/igir.md)) prints the output and then runs the command it reads
from the argv. A surface served there cannot end the program before the program's own code runs,
so whatever burgee printed is followed by a run the user did not ask for: on `burgee@1.9.2`,
`igir --schema` printed nothing and then scanned for ROMs with no command, `--mcp` and
`completion zsh` handed igir a `Promise` where it expected an argv, and `--json` turned igir's
throwing `.fail()` into an envelope and returned `undefined`. The two other shapes were rejected:

- *Serve the surface, put its text in the callback's `output`, and return the argv.* This is
  what yargs does for `--help` under the callback form, but the program knows `--help`: igir
  checks `options.getHelp()` and exits. It does not know `--schema`, and nothing in the argv can
  tell it. It would print the schema and then run.
- *Serve the surface and exit the process from inside `parse()`.* The callback form is how a
  program asks yargs not to exit. Exiting anyway breaks that contract for every caller that
  relies on it, tests included.

**What it costs.** A program that ends in the callback form gets no `--schema`, `--mcp`,
`completion <shell>` or `--json` envelope until it moves to `.parse()`, `.parseSync()` or
`.parseAsync()` without one. Before this, `--json` on such a program with a handler did put an
envelope in the callback's output. That is given up for one rule that holds for all four names
and that a reader can predict: with a callback, burgee/yargs parses exactly as yargs does.

**`--json` on a command with no handler**, under every shape. `.command(name, description,
builder)` with no handler does its work after `parse()` returns, so the envelope written at the
end of the parse claimed `"ok": true` for a run that had not happened. burgee now knows such a
command (`noHandler` in `yargs/command.ts`) and, when one is reached under `--json`, gives the
flag back to the program: refused with yargs' own `Unknown argument: json` under `.strict()` or
`.strictOptions()`, and set as `argv.json = true` otherwise, as yargs-parser sets it. No envelope
is printed. A command with a handler is unchanged. The gap allowed either refusing or printing
no envelope; refusing is what yargs does, so igir's `copy … --json` reads the same as before the
swap.

**`Argv` is callable**, as `@types/yargs` declares it:
`(args?: readonly string[] | string, cwd?: string): Argv<T>` (A-20261028-yargs-argv-type-call-signature).
This reverses one of the four departures `types.ts` recorded when it was ported, "`Argv` is not
callable"; its header now lists three. A yargs 18 instance is not callable at run time, and
neither is burgee's. The signature is there
because the drop-in claim is the types `@types/yargs` gives a program, and a TypeScript project
is checked against that shape: without it an `Argv`'s `toString` is Object's, and
`@typescript-eslint/no-base-to-string` fails igir's lint on `_yargs.help().toString()`.

**Bytes.** Measured on clean builds, `main` at `f801cf48e7` against this change. The static walk
of `./yargs` goes from 222,248 to 222,685 B (+437): the `intercept` flag, the shared `noHandler`
and the refusal. The ceilings in `weight.test.ts` become 222,750 for `./yargs`, 225,800 for
`./yargs/v17` (225,290 → 225,727) and 226,000 for `./yargs/v17/yargs` (225,514 → 225,951), each
the measurement plus the ~32 B CI reads heavier, rounded up to the next 50. Bundled,
`burgee/yargs` goes from 109,149 to 109,335 B (+186); its ceiling in `benchmarks/axes/weight.ts`
becomes 109,400, and `lighter-than-yargs` reads 0.979 against yargs' 111,686 (it read 0.977).
`/docs/weight` moves `burgee/yargs` from 109,502 to 109,688, `burgee/yargs/v17` from 110,662 to
110,848 (its `OVER_INCUMBENT` row moves with it) and `burgee/yargs/v17/yargs` from 110,469 to
110,655. The type change adds no bytes to any `.js` file. The yargs compat oracle stays at
816 / 816.
