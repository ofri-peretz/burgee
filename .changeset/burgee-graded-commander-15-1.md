---
"burgee": minor
---

`burgee/commander` follows commander 15.1.0, graded 1418 / 1418 by commander's own 15.1.0 suite (control 1418 / 1418):

- A negative number may write its exponent with a capital `E` (`-1E3`).
- A help option keeps its help group when one of its flags is taken by another option.
- `getOptionValueSourceWithGlobals()` takes a source only from a command that set the value. A value set with no source answers `undefined`.
- A variadic option's name may end in any identifier character, not only an ASCII one (`[café...]`).
- An executable subcommand bumps the inspector port of `--inspect-wait` and of a bracketed IPv6 host.

`burgee migrate` also reads the new graded releases:

- commander 15.1.0 and `@commander-js/extra-typings` 15.1.0;
- slice-ansi 10.0.1;
- lilconfig 3.1.5 and dotenv 18.0.10;
- `@clack/prompts` 1.9.0;
- `@inquirer/prompts` 8.8.0 and `@inquirer/core` 12.1.0.
