# Intent — Full marks on cli-agent-lint, for every program built on burgee

> Stage 1 artifact. Opened from the next-wave ranking
> ([`next-wave-2026-10.md`](../../research/next-wave-2026-10.md)). It has the highest
> demand-over-cost score in the table: a third-party score, eight named failing checks, and
> mostly flags the framework should already own.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

A program built on burgee, with no extra work from its author, passes every check in
cli-agent-lint 0.3.5 that a framework can pass on an author's behalf. It accepts `--no-color`,
`--quiet` and `--timeout`. Its root help lists `completion`, an `Exit codes:` section and an
`Examples:` section. Under `--json`, a failure writes its error as JSON on stderr. The published
score for the reference demo moves from 81.4% (B) to the top grade. The `external-floor` ratchet
moves with it, so the score cannot slide back.

It matters beyond the checker because each check names something an agent, a script or a CI
job relies on:

- A colour switch that works by flag as well as by environment.
- A quiet mode that keeps data and errors.
- A deadline the caller sets rather than a hang.
- The exit-code contract printed where a person reads it.

## Why now

The `external-floor` suite (D-149, D-151) runs cli-agent-lint 0.3.5 against the reference demo on
every PR. Its published reading, `benchmarks/results/external-floor/2026-09-27.json`, scores
**burgee 81.4% (B)**, commander 71.2% and yargs 71.9%. burgee fails eight checks:

| check | severity | what it probes (read in `checks/*.go` at v0.3.5) | burgee today |
| :-- | :-- | :-- | :-- |
| TE-3 `--no-color` flag | warn | a `no-color`/`color` flag, or `--no-color`/`NO_COLOR` in help | `demo greet ada --no-color` → `unknown option --no-color`, exit 2 |
| TE-4 `--quiet` / `--silent` | info | a `quiet`, `silent` or `q` flag on the root | `unknown option --quiet`, exit 2 |
| SD-1 error format is structured | warn | `--json __nonexistent__`: all of stderr parses as JSON with `error` or `message` | the envelope goes to stdout; stderr is prose |
| SD-3 shell completions available | info | a `completion`/`completions` command in the help-discovered tree | `completion` exists and is not listed in root help |
| SD-5 skill / context files | info | `AGENTS.md`, `llms.txt`, `.mcp.json`… beside the binary, or named in root help | none |
| SD-6 help with usage examples | warn | an `Examples:` heading in any command's help | the renderer has the section (`help.ts`); the demo declares no examples |
| PV-1 timeout flag | info | a `timeout`/`request-timeout` flag, or `--timeout` in help | `unknown option --timeout`, exit 2 |
| PV-4 exit codes documented | info | an `Exit codes` section, or exit-code terms, in help | the seven-code contract is in `--schema` only |

Probed on the demo built from `3a05dc8aad`, 2026-10-11. The check sources were read with
`gh api repos/Camil-H/cli-agent-lint/contents/checks/<file>.go?ref=v0.3.5`.

Six of the eight are framework work, a flag or a help section every program gets at once. SD-5
is a new surface, owned by [`agent-skill`](../agent-skill/intent.md). SD-1 shares its mechanism
with clispec's structured-error check, so it is built once, in
[`clispec-conformance`](../clispec-conformance/intent.md), and re-measured here.

## Affected users and systems

- **Every program on burgee**, whose root help and global flags change.
- `packages/burgee`: `help.ts`, `surfaces.ts`, `exit-code.ts`, `execute.ts`, `completions.ts`.
- `packages/roundel` (`--no-color` feeds `roundel/policy`) and `packages/closeout` (`--timeout`
  arms a deadline).
- The commander and yargs front-ends do **not** change by default: their help is the
  incumbent's, byte for byte, because the graded suites say so.
- `examples/demo-cli-burgee`, `benchmarks/axes/floor.ts` (`BURGEE_FLOOR.agentLint`), and the
  benchmarks page.

## Constraints

- **The checker is not gamed.** No help text names a flag the program does not honour. No
  check is passed by a string a person would not want to read. Each fix must be right for a
  caller who has never heard of cli-agent-lint.
- **No graded façade moves.** `burgee/commander` and `burgee/yargs` keep 1,360 / 1,360 and
  816 / 816. The new globals live on the engine and on the opt-in agent surface only.
- **The exit-code contract only grows.** `ExitCode` is published. A new code is additive, and
  no existing code changes meaning (`scripts/exit-code-lock.test.ts`).
- **The core byte budget holds** (`scripts/runtime-ratchets-lock.test.ts`). Anything that
  costs bytes loads lazily, the way `surfaces.ts` already does.
- **`--quiet` never hides data or an error.** It silences what `flagstaff` and `caique` draw,
  never stdout's payload, never a failure.

## Success criteria

1. On the demo, `--no-color`, `--quiet`/`-q` and `--timeout 5s` are accepted on every command,
   and each changes behaviour as `spec.md` states, held by tests in `packages/burgee/src/`.
2. Root help lists `completion <shell>`, an `Exit codes:` section generated from `ExitCode`, and
   an `Examples:` section, each held by `help-snapshot.test.ts`.
3. The next `external-floor` reading on `main` scores burgee at cli-agent-lint's top grade, with
   every check this intent owns passing. `BURGEE_FLOOR.agentLint` rises to the reading.
4. `burgee/commander` and `burgee/yargs` grades are unchanged in the same run.

## Open questions

- Which exit code a timeout takes. **Answered 2026-10-12 in `spec.md`**: 124, the code GNU
  `timeout` uses, added as `ExitCode.TIMEOUT`.
- Whether the commander and yargs front-ends gain the flags. **Answered 2026-10-12 in
  `spec.md`**: not by default. They are opt-in through the agent surface the façades already
  carry, because their help is graded byte for byte.
