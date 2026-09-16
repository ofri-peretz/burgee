---
'burgee': patch
---

Two checks that grade what was previously asserted by snapshot or by fake: the Fig spec is
checked against Fig's own vocabulary, and Ctrl+C is pressed at a real terminal.

**`fig-schema.test.ts` — Fig publishes no schema, and that is the finding.** PLAN 2.5.3 asks
for the emitted spec to be validated "against Fig's own schema". There is none:
`@withfig/autocomplete-types@1.31.0` ships four files — `LICENSE`, `README.md`,
`package.json` and `index.d.ts` — so the contract is a TypeScript namespace declaration, not
anything a validator reads at runtime. It was last published 2024-05-08.

So the check is structural, and the objection `fig-spec.test.ts` recorded against doing one —
*"writing the allowed-key table from memory would be worse than not checking"* — is answered
by giving the table a provenance rather than by giving up. The allowed keys were extracted
mechanically from Fig's own `index.d.ts`, recorded with the version and the file's SHA-256, the
way `compat-oracle` vendors an incumbent's suite. **No dependency is added**: the table is
forty strings, and the package is not installed, not in `devDependencies` and not in the
lockfile. It reproduces Fig's own asymmetry — `Subcommand` and `Option` extend
`BaseSuggestion`, `Arg` extends nothing and so has no `priority` and no `displayName` — which
is the part a table written from memory gets wrong.

Covered: every emitted key is one Fig declares, on the node type it is emitted on; `name` is
present and is `SingleOrArray<string>` where Fig requires one; `subcommands`, `options`, `args`
and `suggestions` have the shapes Fig declares; the whole tree is walked. Not covered, and said
rather than implied: Fig's semantics past its key names — a `priority` outside 0–100, a
malformed `generators` entry, a `loadSpec` naming a spec that does not exist. Nothing here
means "this works in Fig", only "this is not obviously not a Fig spec".

Proven red on the unfixed state: with `renderFigSpec` emitting `subCommands` — the typo the
snapshot blessed — the case fails with `<root>: 'subCommands' is not a key Fig declares on a
subcommand`. Nine more cases prove it refuses a missing name, a name of the wrong type, a
container that is not a list, an arg given a subcommand-only key, and a fault three levels
down; one more proves it is not simply refusing everything.

**`pty-signal.test.ts` — the signal path, graded through a real tty.** `shutdown.test.ts`
raises signals on a `ProcessLike` that records, so the "signal" never leaves the test process.
Between a keypress and a handler sits the tty line discipline, which neither that test nor a
pipe has: in canonical mode `ISIG` turns `0x03` into a `SIGINT`, and in **raw** mode the
identical keystroke arrives as a byte and raises nothing. A test that writes `\x03` to a pipe
grades the raw path whatever it believes it is grading — which is how `caique` shipped a prompt
that restored the cursor on a cancel and never on a signal, with a green suite.

This runs burgee's built `dist/shutdown.js` on a real pty, presses Ctrl+C, and asserts the tty
echoed `^C`, that the handler the program registered ran, and that the process **died of**
`SIGINT` rather than calling `exit(130)` — which is the POSIX-correct outcome and not what
`shutdown.test.ts`'s fake records: 130 is a shell's arithmetic for `128 + 2`, not an exit call.
A program that exited 130 here would tell its parent it chose to stop.

The pty comes from `python3`'s standard-library `pty.fork()`, so nothing enters the lockfile —
the same borrowing as calling `git` in `compat-oracle/src/vendor.ts`. `script(1)` was measured
and rejected: BSD `script` calls `tcgetattr` on its own stdin, so it dies with
`Operation not supported on socket` under any test runner. **Windows is skipped with its
reason**, not quietly dropped: Python's `pty` is POSIX-only and a Windows pseudo-console means
ConPTY through a native addon, so the third OS PLAN 2.5.4 asks for costs `node-pty` — a native
build on every runner, and `compat.yml` installs with `--ignore-scripts`. That is a decision for
a person.

Proven red on the unfixed state: with the fixture using the engine's pre-`shutdown.ts` exit — a
bare `process.exit(130)` on SIGINT — both cases fail, on `cleanup ran: expected '' to be
'cleaned up'` and `killed by SIGINT (2): expected +0 to be 2`.

commander 1360 / 1360, yargs 804 / 804 and cross-spawn 68 / 68 before and after, unchanged.
