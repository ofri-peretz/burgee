---
"burgee": patch
---

A `burgee/yargs` program that parses with a callback, `.parse(argv, context, callback)` or
`.parse(argv, callback)`, now parses `--json`, `--schema`, `--mcp` and `completion <shell>` exactly
as yargs does. In 1.9.2 burgee intercepted them there. `--schema` skipped `.demandCommand()`, and
`--mcp` and `completion` handed the program a `Promise` where it expected an argv. `--json` turned
a throwing `.fail()` into `undefined`. The callback form is how a program keeps the output and the
exit for itself, so burgee now leaves these names to it. With no callback, the surfaces work as
before.

Under every shape, `--json` on a command declared with no handler no longer prints
`{"ok":true,…}` ahead of work the program does after `parse()` returns. It is refused with
`Unknown argument: json` under `.strict()` or `.strictOptions()`, as yargs refuses it, and set on
the argv otherwise.

`Argv` now carries the call signature `@types/yargs` declares,
`(args?: readonly string[] | string, cwd?: string): Argv<T>`, so a typed program's lint sees the
same `Argv` it saw on yargs.
