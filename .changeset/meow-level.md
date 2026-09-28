---
"burgee": patch
---

`burgee/meow` now behaves as meow 14 does in the places it did not, and meow's own suite grades it 146 / 148, level with real meow (was 132 / 148). With `allowUnknownFlags: false`, unknown flags are reported from the tokens as typed, so a declared `noAutoHelp` no longer makes `--no-auto-help` "unknown", and a subcommand's own flags are left to the subcommand. `--help` and `--version` answer only when they are the whole command line, including when the program declares them (`-h`, `-v`). The help block keeps meow's trailing blank line. Choices of the wrong type, `flags: null` and `booleanDefault: null` are refused as meow refuses them. `-F` keeps its case, `--flag ''` satisfies a required flag, `input.isRequired` receives the input alone, and `cli.pkg` is normalized lazily in the object you passed. `burgee migrate` now rewrites `meow` to `burgee/meow`.

Its types come along too: `burgee/meow` exports meow's `Flag`, `AnyFlags`, `TypedFlags`, `FlagType`, `InputOption`, `InputOptionType` and `IsRequiredPredicate`, with the generic `Options<Flags>` and `Result<Flags>`, so `cli.flags` keeps its types after the rewrite.
