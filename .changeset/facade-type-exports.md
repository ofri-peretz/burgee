---
"burgee": patch
---

`burgee/yargs` exports yargs' types — `Argv`, `Arguments`, `ArgumentsCamelCase`, `CommandModule`, `CommandBuilder`, `Options`, `PositionalOptions`, `InferredOptionTypes`, `MiddlewareFunction` and the rest of `@types/yargs`' ESM surface — and its default export is typed as a factory returning `Argv`, so a typed chain infers `argv` and an instance passes wherever a program says `Argv`. `burgee/commander` adds `OptionValues`, `OptionValueSource`, `HelpConfiguration` and `ParseOptionsResult`, `opts<T>()` / `optsWithGlobals<T>()` are generic as in commander, and its `OutputConfiguration` takes any subset. `burgee migrate` now checks every name an import asks for against what the façade exports: a type-only import of a name it lacks stays on the incumbent and is reported under `kept`, and any other is refused as `unknown-export`.
