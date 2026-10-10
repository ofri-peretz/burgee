# Intent — A first CLI in one command

> Stage 1 artifact. Opened 2026-10-10 from the owner's ask, "how can we make our packages,
> marketing and docs websites better", and the plan of that day: there is no command that
> starts a burgee CLI, and `create-burgee` is free on npm.

**Status:** draft · **Opened:** 2026-10-10 · **Owner:** @ofri-peretz

---

## What is wanted

A developer who has never seen burgee types one command and gets a running CLI that already
answers `--help`, `--json`, `--schema` and `--mcp`. The result is exactly the one file Z1
describes. Deleting the command afterwards changes nothing about the program.

## Why now

- No command creates a burgee CLI: `npm view create-burgee` returns 404, and `burgee` has no
  `init`. The only path is reading the README's quick start and pasting it.
- Readers arrive from npm (28 views in 30 days) and GitHub (18), and most land on a home page
  and leave (`.sdlc/research/docs-traffic-2026-10.md`). A command copied from a home page is
  the shortest path from a visit to a running program.
- The quick start the command would write is already executed byte for byte by
  `packages/burgee/src/shape.test.ts`, so its output can be held to the same test.

## Affected users and systems

`packages/burgee` (a new subcommand), or a new published package `create-burgee`; the root
README's "Start here", the docs landing, and `burgee`'s README quick start; `shape.test.ts`.

## Constraints

- **Z1 holds.** What it writes is one file plus `package.json`: no build step, no config file,
  no directory convention, no codegen beyond that file.
- **Z2 holds.** It is additive and removable. Nothing it writes refers back to it.
- **The doctrine in `.sdlc/intents/README.md`**: "each package stays a library you import in one
  file, not a framework you scaffold into." The command writes the file a person would have
  pasted; it does not create a framework layout. controlroom's intent ruled out a `create-*`
  package for its boilerplates, so a new package needs that weighed, not assumed.
- No dependency outside the family; no network beyond the `npm install` the user asked for.
- The file it writes is the README quick start, read from it, so the two cannot drift.

## Success criteria

- `<command> demo && cd demo && node cli.mjs --help` exits 0 and prints the quick start's help.
- `node cli.mjs --schema`, `--json` and `--mcp` answer as the README transcript says.
- A test reads the written file and compares it to the README quick start, byte for byte, and
  fails on a one-character change to either.
- The generated directory holds exactly `cli.mjs` and `package.json`.

## Open questions

1. **Which command?** (a) `npx burgee init`: a subcommand of the package people already install,
   with no new package to publish, version and grade. (b) `npm create burgee`: the convention
   newcomers type, which needs an 11th published package, `create-burgee`. **Default: (a).** It
   is the smaller change and keeps the family at ten. (b) can be a thin alias later if the
   numbers show people typing it.
2. **Language.** `.mjs` only, or `--ts` for a `.ts` file run with Node's type stripping?
   Default: `.mjs`, plus `--ts` once Node 24's stripping is the floor.
3. **Should it also write a test?** Default: no, because Z1 is one file. The README links
   `burgee/testing`.
