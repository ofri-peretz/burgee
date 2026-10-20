# Intent — A seventh surface: the Agent Skill, projected from the same declaration

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)): a check that all three
> variants fail, a deferred requirement, and a production precedent.

**Status:** shipped · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz · **Shipped:** 2026-10-19 on [`28843a53`](https://github.com/ofri-peretz/burgee/commit/28843a53) (#1139), verified on the PR head `a04bdfb9`'s CI — criteria 1–3 and 5 as built on 2026-10-12; criterion 4 by the N10 job under `BURGEE_HELD_CHECKS`: `cli-agent-lint-held-checks-failing 0 checks gate <= 0`, burgee 100% (job 117966706883)

---

## What is wanted

A program on burgee can emit an Agent Skill for itself, `SKILL.md` and an `AGENTS.md` beside its
binary, projected from the declaration that already serves help, `--json`, `--schema`, `--mcp`,
completions and types. The skill is small on purpose. It names what the program is for, the
contract an agent relies on (exit codes, error kinds, `--json`, `--explain`), and one line and
one example per command. For detail it points at `--schema <command>`, so the agent loads one
command's contract when it needs it and not before.

The same renderer gives help as Markdown, which `cli-help-renderer` deferred on 2026-09-07 until
a consumer needed it. This is the consumer.

## Why now

- **A third-party check every variant fails.** cli-agent-lint 0.3.5's SD-5 ("Skill / context
  files") looks for `AGENTS.md`, `CONTEXT.md`, `CLAUDE.md`, `llms.txt`, `.claude` or `.mcp.json`
  beside the binary or in its parent directory, or named in root help
  (`checks/self_describing.go` at v0.3.5). burgee, commander and yargs all fail it
  (`benchmarks/results/external-floor/2026-09-27-4b8ef1c-local.json`).
- **Progressive disclosure is the requirement the research names as missing.**
  `migration-drivers.md` §6: *"An agent should pay for one command's contract, not the whole
  tree. `--schema` dumping every command is the MCP mistake in CLI clothing."* A skill is
  the always-loaded summary, and `--schema <command>` (with `--field` for one path, `schema-field.test.ts`) is the on-demand detail.
  `agent-requirements.md` §7: the axis everyone converged on is *when* tool definitions enter
  context.
- **The production precedent generates exactly this.** Cloudflare drives 100+ products from one
  TypeScript schema that generates CLI commands, MCP servers, **Agent Skills**, configuration and
  OpenAPI (`agent-requirements.md` §7). burgee already generates four of those from one
  declaration. The skill is the one it does not.
- **Markdown help has waited since 2026-09-07.** `cli-help-renderer/spec.md` R6: *"Markdown
  output — deferred to `docs-deploy` … it lands as its own entry when the site needs it."* A
  skill is Markdown, and so is a command reference an author commits to a README.

## Affected users and systems

- **Every program on burgee**: a new `--skill` surface, loaded lazily through `surfaces.ts`.
- `packages/burgee`: `help.ts` (a Markdown target), `surfaces.ts`, `program.ts` (the `burgee skill`
  command), `cli.ts`.
- `examples/demo-cli-burgee`: commits its generated `SKILL.md` and `AGENTS.md`.
- The docs: `/docs/agent-surfaces` gains the seventh surface.
- **Depends on** [`clispec-conformance`](../clispec-conformance/intent.md) R2, R3 and R5 (error
  kinds, global arguments and outputs are what the skill states) and on
  [`agent-lint-conformance`](../agent-lint-conformance/intent.md) R4 (the exit-code section it
  reuses).

## Constraints

- **Projected, never authored.** Every line of the generated skill comes from the manifest. A
  committed copy that drifts from the projection fails a lock, as `--schema` and completions
  already do.
- **Small by construction.** The skill has a byte budget, measured and banded alongside
  `schema-bytes` (`agent-headroom` R7). Detail lives behind `--schema <command>`, never inlined.
- **No claim about a format the PR has not read.** The front-matter rules (`name`, `description`
  and their limits) are taken from the published Agent Skills specification on the day R2 is
  built, cited in the PR, and checked by the lock.
- **Help mentions a file only if the file is there.** Root help names `AGENTS.md` only when one
  sits beside the binary. A check is never passed by naming something that does not exist.
- **The core byte budget holds.** Nothing here loads without `--skill` or `burgee skill`.

## Success criteria

1. `demo --skill` prints a `SKILL.md` whose front matter validates against the specification's
   rules, and whose body names every runnable command. Held by
   `packages/burgee/src/skill.test.ts`, proven red on `3a05dc8aad`, where `--skill` is an unknown
   option.
2. `burgee skill <entry> --out <dir>` writes `SKILL.md` and `AGENTS.md`. The demo's committed
   copies equal the projection (`scripts/skill-lock.test.ts`).
3. `renderHelp(..., { format: 'markdown' })` exists, and `cli-help-renderer` R6 is marked built.
4. The next `external-floor` reading passes cli-agent-lint SD-5 for burgee.
5. The demo's skill is at or under its committed byte budget, banded in the reliability axis.

## Open questions

- Whether the skill inlines each command's options. **Answered 2026-10-12 in `spec.md`**: no.
  One line and one example per command, and `--schema <command>` for the rest, because
  inlining is the eager-schema mistake the skill exists to avoid.
