---
id: D-20261012-first-cli-defaults
subject: 'first-cli: which command, which language, and does it write a test?'
taken: 'Accepted — the intent''s own defaults, under the owner''s delegation of 2026-10-12, "we need to WIN everybody else in the trade-off of value, performance, scale, robustness"'
date: '2026-10-12'
superseded_by: —
---

**All three of [first-cli](../intents/first-cli/intent.md)'s questions close on the defaults the
intent proposed: the command is `npx burgee init`, with no 11th package; it writes `.mjs` first,
and `--ts` comes later; and it writes no test file, because Z1 is one file.** The ceiling in
`.sdlc/bands/open-questions.json` returns to 0. Nothing is built here; a later change builds
`init` to the spec.

**Value gained.** A first CLI in one command from the package people already install, and the
README quick start as the one file it writes, so the two cannot drift. A newcomer runs it and
has a program that answers `--help`, `--json`, `--schema` and `--mcp` with nothing else to set
up.

**What it costs.** No new package, so nothing new to version, grade or release. `init` is a
lazily loaded subcommand of the `burgee` bin, held by the same per-entry budgets as every
other surface in `packages/burgee/src/weight.test.ts`; the template is the quick start that
already ships in the README. `.mjs` needs no build step and no TypeScript; `--ts` waits until
Node 24's type stripping is the floor, so it never writes a file a supported Node cannot run.
No test file means one file to read, which is what Z1 measures; the README links
`burgee/testing` for the next step.

**What the incumbents pay for the same.** commander and yargs ship no scaffolder at all.
`oclif generate` writes a multi-file TypeScript project with a test directory and a build;
`create-*` packages are a separate install each time. burgee's is one subcommand that writes
one runnable file.

**Reversal.** (b), `npm create burgee`, is a thin `create-burgee` alias that calls `init`, added
by a new decision if the numbers show people typing it. `--ts` and a `--test` flag are each an
additive flag, and none of them changes what `npx burgee init` writes by default.
