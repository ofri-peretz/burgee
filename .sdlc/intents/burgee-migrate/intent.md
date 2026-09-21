# Intent — `burgee migrate`

**Status:** draft

## What is wanted

One command that takes a CLI project already written against **commander** or **yargs**,
finds every import of it, rewrites them to burgee's drop-in front-end, and prints what
changed — including the numbers that say why it was safe.

```
$ npx burgee migrate
burgee migrate · 7 files, 11 imports

  commander            → burgee/commander     9 imports, 6 files
  yargs                → burgee/yargs         1 import,  1 file
  yargs/helpers        → burgee/yargs/helpers 1 import,  1 file

  dependencies    3 → 1        commander, yargs, yargs-parser removed
  installed     1.4 MB → …     measured after install
  graded        1360 / 1360 of commander's own tests · 804 / 804 of yargs'

  run your tests.
```

## Why now

`.sdlc/research/migration-drivers.md` looked at the migrations that actually happened —
Vitest, esbuild, pnpm, Vite, Biome, Bun — and two findings decide this:

1. **The migration cost has to be near zero**, and every winner shipped the mechanical path
   *before* the wave, not after: `jest-codemods`, `pnpm import`, `biome migrate eslint`.
2. **Speed is not the wedge; what it replaces is** (D-008). The moment a person is most
   willing to hear that number is the moment they run the migration.

burgee already has the strongest possible version of the claim — change one import and
commander's own 1,360 tests still pass. What it does not have is the four-minute path from
*could* to *did*, and an argument is not a path.

The second audience is explicit: **an agent should be able to migrate a repository
unattended.** That means non-interactive by default, a machine-readable report, refusals
that name a file and a line rather than describing a difficulty, and an exit code that says
whether anything was left undone.

## Affected users and systems

- A maintainer with a commander or yargs CLI and no appetite for a rewrite.
- An agent asked to "move this project to burgee", which needs the refusal list as data.
- `examples/demo-cli-commander`, which already holds the same program written twice — once
  against `commander`, once against `burgee/commander`. That pair is the gate.

## Constraints

- **Zero runtime dependencies** (rule 2). No jscodeshift, no ts-morph, no recast. The
  rewrite is over module specifiers, which is the narrowest possible surface and does not
  need a full parser.
- **It is itself a burgee command** (D-045's principle, applied here): `--json`, `--schema`
  and the exit-code contract come from the framework, not from this feature.
- **Never silently.** It refuses on a dirty git tree unless `--force`, so the diff is always
  reviewable, and it writes nothing at all in `--dry-run`.
- **No partial rewrites.** A file that cannot be fully migrated is left untouched and listed.

## Success criteria

1. Running it over `examples/demo-cli-commander/src` produces byte-identical imports to the
   committed `demo-cli-commander/burgee` variant, and that variant's tests still pass.
2. The same for `examples/demo-cli-yargs`.
3. A deep import (`commander/lib/command.js`) is refused by name and line, not rewritten.
4. `--json` emits the report as data, and the exit code is non-zero when anything was
   refused, so an agent can branch on it.
5. The dependency and compat numbers in the report are read from the tree and the oracle
   baseline, never typed into a template.

## Open questions

- None. Decided 2026-09-20: the shape is settled in `spec.md`, and every scope choice is
  closed as D-050 … D-054 in `.sdlc/DECISIONS.md`.
