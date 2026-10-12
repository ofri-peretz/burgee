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
| R1 | **Built** 2026-10-12 | `help.ts` (`helpModel`: the section list, in R2's order, empty sections gone; `renderHelp` lays it out for a terminal), `help-markdown.ts` (`markdownHelp`: a `#` heading, a usage code block, a table per section, each example's description over a fenced line, the trailer as paragraphs). **One departure:** with `format: 'markdown'`, `renderHelp` returns a `Promise<string>`. The Markdown layout is loaded behind an `await import()`, because `./help` had 112 B of its 9,130 to spare and a static layout does not fit; the door measures 9,019 B (+1). The terminal output is unchanged: every help snapshot passes as it stood. `cli-help-renderer` R6 is marked built | `help.test.ts` › `help renders as Markdown, from the same sections (agent-skill R1)`: per node of the demo's shape, the Markdown's headings, terms and examples equal the screen's; a dropped section on either side fails. Red: `expected { sections: [], examples: [] } to deeply equal { sections: [ [ …(2) ], …(2) ], …(1) }` (no `format`: the terminal text came back) |
| R2 | **Built** 2026-10-12 | `skill.ts` (`renderSkill`, `skillName`), `surfaces.ts` (`--skill`, read before `--mcp`; a root that declares its own `skill` option keeps it), `argv.ts` (`mayServe`: +13 bundled bytes on the core). Front matter per the Agent Skills specification, read from `agentskills/agentskills` at `69ef37e9` (`docs/specification.mdx`) on 2026-10-12: `name` 1–64 characters of `a-z`, `0-9` and `-`, no leading, trailing or doubled `-`; `description` 1–1024 characters, non-empty. `NAME_MAX` and `DESCRIPTION_MAX` carry them. The error kinds are `--schema`'s `errorsOf` (clispec-conformance R2), the advice `EXIT_ADVICE` | `skill.test.ts` › `--skill prints an Agent Skill (agent-skill R2)`: the front matter within the cited limits, every runnable command named and no hidden one, the exit-code table equal to `ExitCode`, no option table. Red: `demo --skill` exits 2 with `error: unknown command "--skill"`; `Cannot find module './skill.js'` |
| R3 | **Built** 2026-10-12 | `program.ts` (`skillCommand`, `idempotent`, reports `changed`), `skill-files.ts` (`writeSkill`, `binDirOf`; the entry loaded through `dev.ts`'s `load`, so a façade program gets the same files). `--check` returns `stale`, `fix` and exit 1 | `skill.test.ts` › `burgee skill writes the files an author ships (agent-skill R3)`: both files in the bin's directory, a second run `changed: false`, `--check` exit 1 on one edited character. Red: `burgee skill` exits 2, `error: unknown command "skill"` |
| R4 | **Built** 2026-10-12 | `surfaces.ts` (`agentsBeside`: the owning package.json's `bin`, then that directory and the one above it, the two places cli-agent-lint's SD-5 looks), `help.ts` (`forAgents`, the words passed in like `commands`: `./help` 9,019 → 9,051 B of 9,130). The demo's build runs `burgee skill dist/index.js --out .` and commits `SKILL.md` and `AGENTS.md` at its root, beside `dist/` | `help-snapshot.test.ts` › `the root help names AGENTS.md when it sits beside the bin (agent-skill R4)`. Red (the line's words emptied): `expected 'For agents: --schema prints every com…' to contain 'AGENTS.md beside this program says ho…'` |
| R5 | **Built** 2026-10-12 | `scripts/skill-lock.test.ts`: the demo's declaration rendered in memory against the committed files | itself. Red with `Greet someone` → `Greet someonE` in the committed `SKILL.md`: `expected [ 'SKILL.md' ] to deeply equal []` |
| R6 | **Built** 2026-10-12 | `benchmarks/axes/reliability.ts` (`skill-bytes`, beside `schema-bytes`: the UTF-8 bytes of `--skill`, no record for a variant without one; burgee's gated at `SKILL_BYTES_BUDGET`), `benchmarks/bands.ts` and `.sdlc/bands/control-bands.json` (`agent-skill-bytes`, the cheap suite, banded like `agent-schema-bytes`). **The budget is the first measurement: 1,857 B**, the demo's `SKILL.md` (`npm run bench -- --axis reliability --check`: `skill-bytes 1857 bytes gate <= 1857`, 0 gate failures; `schema-bytes` 4,752 B on the same run). The next CI observation publishes it | `benchmarks/reliability.test.ts` › `skill-bytes, measured and gated (agent-skill R6)`: a skill of 1,921 B fails the ratchet, one inside the budget holds. Red: `TypeError: expected value must be number or bigint, received "undefined"` (no `SKILL_BYTES_BUDGET`, no record) |

**Built: 6. Not built: 0.**

**cli-agent-lint, re-run 2026-10-12** the way agent-lint-conformance R7 (#1013) took its reading
(`npx tsx benchmarks/floor-tools.ts`, then `npm run bench -- --axis floor`: cli-agent-lint 0.3.5,
pinned by digest, on the built demo through its shim, PATH and an empty HOME only), on this branch
at `b4ca931`: **burgee 96.6% (A)**, from the published 91.5% (A). SD-5 passes, on the root help
naming `AGENTS.md`: the checker runs a shim in a temporary directory, so the line in help is what
it reads, not the file. The one check still failing is FS-4 (the `auth` exit-code row trips its
"auth-related content" probe in a program with no auth). commander 71.2%, yargs 70.9%; clispec
24 / 24. The reading is recorded here and not published: `BURGEE_FLOOR.agentLint` stays 91 until a
publish moves it.
