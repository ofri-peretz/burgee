# Intent — `--quiet` reaches caique's decoration

> Stage 1 artifact. Opened from the wave-3 ranking
> ([`next-wave-3-2026-10.md`](../../research/next-wave-3-2026-10.md)). It closes the one open
> gap in section B of the ledger, [`B-20261011-caique-quiet`](../../gaps/B-20261011-caique-quiet.md),
> by taking that gap's own recommendation as the decision.

**Status:** approved · **Opened:** 2026-10-12 · **Owner:** @ofri-peretz

---

## What is wanted

Under burgee's global `--quiet`, caique's clack port draws nothing for `spinner`, `progress`,
`tasks` and `log`, exactly as flagstaff already does. A prompt is not decoration: it still asks
at a terminal, and a non-TTY prompt is still the usage error naming the flag. A program that
does not use burgee is unaffected unless it passes a runtime.

## Why now

- **The gap is open and has a written recommendation.** `npm run ledger -- gaps --open` on
  `origin/main` at `d8569f5` lists exactly one B row, `B-20261011-caique-quiet`. Its
  recommendation: *"caique's clack port takes an optional `Runtime` with `quiet` on `spinner`,
  `progress`, `tasks` and `log`, and draws nothing then"*.
- **The defect.** `agent-lint-conformance` R2 made `--quiet` global (#1006) and recorded
  *"caique is not changed: its clack port takes no runtime from the caller, so there is no seam
  to read `quiet` through"*. The port reads `processRuntime()` itself:
  `packages/caique/src/clack-output.ts` lines 47, 114 and 232; `clack-limit.ts` line 181;
  `clack-core.ts` line 415.
- **The measured consequence.** cli-agent-lint's TE-4 passes on the flag's existence (the
  91.5% reading, `benchmarks/results/external-floor/2026-10-11.json`). A program whose spinner is
  caique's still writes frames to stderr under `--quiet`, the output an agent reading captured
  stderr has to discard (clack #510: `\r` progress captured as hundreds of lines, in
  `.sdlc/research/competitor-open-issues.md` §1).

## Affected users and systems

- `packages/caique`: `clack-output.ts`, `clack-limit.ts`, `clack-core.ts`, and the native
  `caique/tasks` path if it draws.
- `packages/burgee`: nothing new. `ctx.runtime` already carries `quiet`.
- The clack grade, `caique/clack` 1 against `@clack/prompts`, must not move.

## Constraints

- **The clack surface is unchanged for clack callers.** The runtime is a new optional field on
  the options object each function already takes. A call written for `@clack/prompts` behaves
  identically.
- **Prompts never go silent.** Only decoration is suppressed.
- **No import of burgee from caique.** The seam is roundel's `Runtime` type, which both already
  share.

## Success criteria

1. `spinner({ runtime: ctx.runtime })` under `--quiet` writes zero bytes to stdout and stderr,
   and `stop()` still resolves.
2. `log.info('x', { runtime })` under quiet writes nothing. `log.error` still writes, because
   `--quiet` never hides a failure (`agent-lint-conformance` constraint).
3. `npm run compat -- clack` is unchanged.
4. The gap file is closed (`status: closed`) in the PR that lands R2.

## Open questions

- Whether `log.error` and `log.warn` are silenced too. **Answered 2026-10-12 in `spec.md`**:
  `error` is never silenced. `warn` is silenced, matching flagstaff's hoist, which treats a
  warning as decoration and leaves failures to the envelope.
- Whether quiet is read from the environment when no runtime is passed. **Answered 2026-10-12
  in `spec.md`**: no. Ambient state is the defect class `U2` removed. A caller passes the runtime.
