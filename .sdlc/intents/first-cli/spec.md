# Design — A first CLI in one command

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted at Design→Build on 2026-10-12**, when #954 merged with its three questions answered
([D-20261012-first-cli-defaults](../../decisions/D-20261012-first-cli-defaults.md)). Built
2026-10-13; see [Status](#status).

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

**As built, one departure (2026-10-13):** there is no build step and no `dist/init-template.mjs`.
`init.ts` reads the quick start from the `README.md` the package already ships, at the run: npm
packs the README into every tarball, one level above `src/` and `dist/` alike, so the file it
writes is the page's text with no second copy anywhere, and the tarball carries no added template.
The command is declared in `program.ts` beside `skill` and `migrate`, and `init.ts` is behind the
same `await import()`.

## Verification

- `packages/burgee/src/init.test.ts`:
  - `init` into a temp dir produces exactly two files;
  - `cli.mjs` equals the README quick start byte for byte;
  - `node cli.mjs --help` matches the README transcript;
  - a second `init` exits 2 with a `fix:` line;
  - *(added 2026-10-26, the intent's restated criterion 2)* on the generated program, installed
    from the packed tarballs, `node cli.mjs --schema` prints the command as data and
    `node cli.mjs --mcp` answers `initialize`, `tools/list` and a `tools/call` of `greet`.
- `shape.test.ts` keeps holding the quick start itself. The new test holds that `init` writes
  that same file.
- Each test is proven red against an `init` that writes a one-character variant.

## Rejected alternatives

- **A `create-burgee` package**, for now (the intent's question 1, decided in D-20261012-first-cli-defaults). It is an 11th
  package to version, grade and keep inside the dependency rules for a one-file template.
- **A template repository** (`degit`). It needs the network and a second source of the quick
  start that can drift.

## Out of scope

Project layouts, TypeScript build setups, test scaffolds, CI files, and plugin templates.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | **Built** 2026-10-13 | `program.ts` (`initCommand`, `non_idempotent`, `[dir]`, `--force`, `--install`), `init.ts` (`init`: refuses before writing anything when `cli.mjs` or `package.json` is there; a `UsageError` with `fix: npx burgee init <dir> --force`, exit 2). The words are in the catalog: `usage.exists`, `hint.overwrite` (`messages.ts`; `init.ts` is in `messages.test.ts`'s writers) | `init.test.ts` › `R1 — …` (three), and the end-to-end `writes exactly cli.mjs and package.json, where the user stands`. Red: exit 2, `unknown command "init"` |
| R2 | **Built** 2026-10-13 | `init.ts` (`quickstart`: the README's `## Quick start` `js` block, read at the run). The quick start gained `#!/usr/bin/env node` so the `bin` R3 names runs as a command; the repository README's "Start here" shows the same file | `init.test.ts` › `R2 — cli.mjs is the README quick start, byte for byte`, `R2 — the repository README …`, `R2 — a README without a quick start is refused`. Red: `expected '// cli.mjs — the whole CLI\nimport { …' to match /^#!\/usr\/bin\/env node\n/`; `expected [Function] to throw an error` |
| R3 | **Built** 2026-10-13 | `init.ts`: `name` from the directory (npm-safe, else `my-cli`), `private`, `type: module`, `bin` → `./cli.mjs`, `scripts.start` only, `burgee` at `^` the running version only | `init.test.ts` › `R3 — …` (two); end to end, the packed tarballs installed and the program run as `node cli.mjs`, as `npm start`, and through the bin npm links (a symlink, or `.cmd` on Windows). Red: `ENOENT … package.json` |
| R4 | **Built** 2026-10-13 | `init.ts`: the manager is the first word of `npm_config_user_agent` (`npm`, `pnpm`, `yarn`, `bun`; anything else is `npm`), run through bellpull's `run` in the new directory, stdout kept off `--json`'s envelope; a failed install exits 1 with `fix: cd <dir> && <pm> install` (`init.installFailed`). Without `--install` it reports the command and spawns nothing | `init.test.ts` › `R4 — …` (eight, a recording fake manager on `PATH`). Red: exit 2, `unknown command "init"` |
| R5 | **Built** 2026-10-13 | Declared like every `burgee` command, so `--json`, `--schema`, `--help` and the API reference project it; the result is `{ dir, files, install, installed }`. Static: no spinner, no prompt. **Weight:** `.` unchanged at 35,447 B; `./cli` 55,965 → 57,122 B (+1,157) of its 81,400; `init.js` 3,199 B, lazy and counted on no entry. No budget moved | `init.test.ts` › `R5 — init answers --schema, --help and --json like every burgee command`. Red: `expected undefined to match object { effects: 'non_idempotent' }` |

**Built: 5. Not built: 0.**

**Criteria, 2026-10-26.** The intent's criteria 1 and 2 were restated (the install step; a check in
place of a `--schema`/`--mcp` transcript that never existed), and both hold on burgee 1.7.1 as
published. The new check is two cases in `init.test.ts`'s stranger's-path suite: "the program it
wrote answers --schema with its command as data" and "the program it wrote serves --mcp:
initialize, tools/list naming greet, and a tools/call of it". Both were red against a quick start
whose `effects` was edited to `non_idempotent`: `expected { name: '', arguments: [], …(5) } to
match object { …(3) }` for the schema, and the `readOnlyHint` mismatch for `tools/list`. No
requirement changed, and no state was added, so there is no Quint model.
