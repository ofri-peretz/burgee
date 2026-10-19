---
id: D-20261019-output-env-lock-scope
subject: 'cli-output-stack R2''s env-name lock covers the code burgee owns; the drop-ins that read a policy variable because their incumbent does are allow-listed by file'
taken: 'Taken — on the owner''s delegation of 2026-10-12 over budgets, gates and trade-offs'
date: '2026-10-19'
superseded_by: —
---

**`scripts/output-env-lock.test.ts` fails when any published package's source reads `NO_COLOR`,
`FORCE_COLOR`, `CI` or `CLI_ACCESSIBLE` from an environment record outside roundel's two policy
subpaths, `roundel/src/policy.ts` and `roundel/src/terminal.ts`. Six drop-in files are allow-listed
by name, each beside the incumbent whose read it reproduces. `isTTY` is out of scope.**

## What R2 said, and why it could not be built as written

`cli-output-stack/spec.md` R2 asked for "an env-name grep allowing those names in one file", and for
no family module other than `outputMode` to read `isTTY`, `NO_COLOR`, `FORCE_COLOR`, `CI` or
`CLI_ACCESSIBLE`. Read on `main` at `51fec1ba`, that grep matches 49 source files, and almost none of
them is the defect R2 is about:

- **`isTTY` is a fact about a stream, not a policy.** `closeout/cursor` hides a cursor only on a
  terminal, `flagstaff/log-update` erases a frame only on one, `caique/keys` enters raw mode only on
  one. Each reads the stream it was handed. Routing those through `outputMode` would add a call that
  answers a different question.
- **The drop-ins read the variables because their incumbents do, and the incumbents' own suites
  grade that read.** `burgee/commander`'s `useColor`, `caique/clack-core`'s `isCI`,
  `controlroom/ink`'s is-in-ci rule (`CI=0` and `CI=false` are not CI), `flagstaff/ora`'s
  `isEnabled`, `paratext/supports-hyperlinks` (D-181 keeps its supports-color fork) and
  `roundel/picocolors`. A drop-in that asked roundel instead would answer differently from the
  package it replaces, and the compat grade would record the difference as a failure.
- **roundel's policy is two subpaths, not one file.** `roundel/terminal` (`interactive`, which reads
  `CI`) is its own subpath only because R8 caps `./chalk`'s graph, which stands on `policy.js`, at
  chalk 6.0.0's own bytes. It is the same owner, split for weight.

## The scope taken

The lock covers **code burgee owns**: every non-test `.ts`/`.tsx` under `packages/*/src` of a
package that is not `private`. compat-oracle is private tooling and is not a layer. The owners are
`roundel/src/policy.ts` and `roundel/src/terminal.ts`. The allow-list holds exactly the six drop-in
files above, each with its incumbent named in the lock. A second test fails if an allow-listed file
stops reading a policy variable, so an entry cannot outlive its reason.

A read is `env['NAME']`, `env?.["NAME"]`, `env.NAME`, `'NAME' in <x>.env`, or a destructuring
`{ NAME } = <x>.env`. A sentence in help text that names `NO_COLOR`, and a fixture that writes
`{ CI: 'true' }`, are not reads. The pattern has its own caught and ignored rows in the lock.

Proven red on 2026-10-19: one line appended to `packages/burgee/src/help.ts`,
`env['NO_COLOR'] !== undefined`, reads
`expected [ 'burgee/src/help.ts:376' ] to deeply equal []`.

## Rejected

- **The lock as R2 wrote it, `isTTY` included.** 49 files would fail, and the fix would be either an
  allow-list as long as the tree or a refactor that makes stream checks slower and less direct.
- **Moving the drop-ins onto `outputMode`.** Their graded rates (commander, ora, clack, ink,
  supports-hyperlinks, picocolors) would drop on the cases that set these variables.
