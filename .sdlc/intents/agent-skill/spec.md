# Design — The Agent Skill, projected from the declaration

Intent: [`intent.md`](./intent.md). **Status:** approved.

**Accepted by the owner, 2026-10-12, by instruction: create and execute.** The instruction and the
evidence are recorded in [`next-wave-2026-10.md`](../../research/next-wave-2026-10.md).

> Requirement ids are `R1`… so they cannot collide with the floor ids `scripts/run-evals.ts`
> reads from `burgee/spec.md`.

---

## Requirements

- **R1 — Help renders as Markdown.** `renderHelp(manifest, node, { format: 'markdown' })`
  returns the help sections as Markdown: a heading per command, a usage code block, options as
  a table, examples as code blocks, and the exit-code section. It is a second target of the same
  section list, so the two cannot list different things. It closes `cli-help-renderer` R6, whose
  status row is updated in the same PR.
- **R2 — `--skill` prints an Agent Skill.**
  - **Front matter**: `name` (the program name, normalised to the specification's character
    rules) and `description` (the program's description, then one sentence naming when to use
    it, derived from the command summaries).
  - **Body**:
    - one paragraph on what the program does;
    - **The contract**: `--json` and its envelope, `--explain`, the exit-code table and the error
      kinds, from `clispec-conformance` R2;
    - **Commands**: one line and the first example per runnable command;
    - one line naming `--schema <command>` for any command's full contract.
  - The front-matter limits are read from the published Agent Skills specification when this
    is built, cited in the PR, and encoded in the lock. No limit is written from memory.
- **R3 — `burgee skill` writes the files an author ships.** `burgee skill <entry> [--out <dir>]`
  writes `SKILL.md` and `AGENTS.md`. `AGENTS.md` is the same body without front matter, under an
  `AGENTS.md`-style heading. `--out` defaults to the directory of the entry's `bin`, read from
  its owning `package.json`, so the files land beside the binary and ship in the tarball when
  the author's `files` includes them. `burgee skill <entry> --check` exits non-zero when the
  committed files differ from the projection, for an author's own CI.
- **R4 — Root help points at the files when they exist.** When `AGENTS.md` sits beside the
  running binary, the root help's "For agents" line names it. Without the file, the line does not
  change. The reference demo runs `burgee skill` in its build and commits the output.
- **R5 — A drift lock.** `scripts/skill-lock.test.ts` regenerates the demo's skill in memory and
  compares it with the committed files, the pattern `vercel-apps-lock` and the completions locks
  use.
- **R6 — A byte budget, measured.** `benchmarks/axes/reliability.ts` gains `skill-bytes` beside
  `schema-bytes`, published and banded. The demo's committed budget is its first measurement,
  and a growth past it fails the ratchet.

## Design

**Order:** R1, then R2, R3, R4 and R5 together for the demo, then R6.

**One section list, two targets.** `help.ts` builds an ordered list of sections, and today one
function lays them out for a terminal. R1 adds a Markdown layout over the same list. R2 is a
third consumer: it takes the sections it needs (commands, examples, exit codes) and adds the
contract paragraph from `--schema`'s data. The text a person sees in `--help` and the text an
agent sees in the skill are the same strings, which is rule 5: an agent reads the same bytes a
screen reader hears.

**Loaded only on request.** `--skill` is dispatched by `surfaces.ts` the way `--schema` and
`--mcp` are, so a normal run never loads the Markdown renderer. `burgee skill` lives in
`program.ts` beside `burgee brand` and `burgee migrate`.

**The skill is short because the schema is near.** The research's point is not that agents need
less information. It is that they should pay for it when they use it. So the skill carries the
always-needed contract and a pointer, and `--schema <command>` carries the rest.

## Verification

| R | Check | Proven red by |
| :-- | :-- | :-- |
| R1 | `packages/burgee/src/help.test.ts`: the Markdown and terminal targets list the same commands, options and examples for the demo; a mutation dropping a section from one fails | today: no `format` option |
| R2 | `packages/burgee/src/skill.test.ts` (new): front matter within the cited limits; every runnable command named; the exit-code table equals `ExitCode`; no option tables inlined | today: `--skill` exits 2 with `unknown option` |
| R3 | `packages/burgee/src/skill.test.ts`: `burgee skill` writes both files to the bin's directory; `--check` exits 1 on a stale committed skill | today: no `skill` command |
| R4 | `help-snapshot.test.ts`: with and without `AGENTS.md` beside the bin | today: the line never names it |
| R5 | `scripts/skill-lock.test.ts` | editing one character of the committed `SKILL.md` fails it |
| R6 | `benchmarks/reliability.test.ts` and the band's gate | a skill grown past its budget fails the ratchet |

## Rejected alternatives

- **Inline every command's options in the skill.** That is `--schema` in Markdown, loaded
  eagerly, which is the MCP mistake `migration-drivers.md` §6 names. The pointer to
  `--schema <command>` is the design.
- **`llms.txt` instead of `SKILL.md`.** `llms.txt` describes a website for a crawler, and the
  docs sites already serve one. A skill describes a tool for an agent about to use it.
  `AGENTS.md` is written too, because coding agents read it from a working tree.
- **Hand-written skills, with a template.** Every hand-written copy drifts from the program, and
  the family's rule is that surfaces are projections.
- **Man pages from the same renderer.** `cli-help-renderer` rejected roff, and Markdown covers
  the same reader.

## Out of scope

- Publishing skills to a marketplace or registry. That is outward-facing and owner-gated.
- Skills for the commander and yargs façades' default output, whose help is graded byte for
  byte. A program on a façade gets `--skill` through the opt-in agent surface it already carries.
- `CLAUDE.md`, `.claude/` and `.mcp.json` files. `mcp-current` R6 prints the client
  configuration.

## Status

| R | Status | Where | Check |
| :-- | :-- | :-- | :-- |
| R1 | Not built | `help.ts` | `help.test.ts` |
| R2 | Not built | a new `skill.ts`, `surfaces.ts` | `skill.test.ts` |
| R3 | Not built | `program.ts` (`burgee skill`) | `skill.test.ts` |
| R4 | Not built | `help.ts`, `examples/demo-cli-burgee` | `help-snapshot.test.ts` |
| R5 | Not built | `scripts/skill-lock.test.ts` | itself |
| R6 | Not built | `benchmarks/axes/reliability.ts` | `benchmarks/reliability.test.ts` |
