# Design — A first CLI in one command

Intent: [`intent.md`](./intent.md). **Status:** draft. It waits for the owner at the
Design→Build gate. Nothing below is built.

---

## Requirements

- **R1** `npx burgee init [dir]` writes `dir/cli.mjs` and `dir/package.json` and nothing else.
  It refuses to overwrite an existing file and exits 2 with a `fix:` line naming the flag
  (`--force`).
- **R2** `cli.mjs` is the README quick start's source, read from `packages/burgee/README.md` at
  build time into `dist/`, not copied by hand.
- **R3** `package.json` holds `"type": "module"`, a `bin` entry and `burgee` at the running
  version's caret range. It has no other dependency and no scripts beyond `start`.
- **R4** With `--install`, it runs the user's package manager (`npm_config_user_agent`) through
  `bellpull`. Otherwise it prints that one install command and makes no network call.
- **R5** `init` has `--json`, `--schema` and a static projection like every other burgee
  command. Its result names the files written.

## Design

One subcommand in `packages/burgee/src/cli.ts`, about 40 lines, plus a build step that writes
the quick start into `dist/init-template.mjs`. It adds no new package and no new dependency.
`bellpull` is already in the family.

## Verification

- `packages/burgee/src/init.test.ts`:
  - `init` into a temp dir produces exactly two files;
  - `cli.mjs` equals the README quick start byte for byte;
  - `node cli.mjs --help` matches the README transcript;
  - a second `init` exits 2 with a `fix:` line.
- `shape.test.ts` keeps holding the quick start itself. The new test holds that `init` writes
  that same file.
- Each test is proven red against an `init` that writes a one-character variant.

## Rejected alternatives

- **A `create-burgee` package**, for now (see the intent's open question 1). It is an 11th
  package to version, grade and keep inside the dependency rules for a one-file template.
- **A template repository** (`degit`). It needs the network and a second source of the quick
  start that can drift.

## Out of scope

Project layouts, TypeScript build setups, test scaffolds, CI files, and plugin templates.
