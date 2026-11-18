# Intent — the plugin kit and the migrations: anyone's agent can add a target, anyone's team can switch in one command

> Opened from the 2026-11-18 program ([`../apicontract/program.md`](../apicontract/program.md)),
> vision § "How we become the best", points 2 and 5. Spec R-EX8 (`plugin new`, a conformance suite in
> `apicontract/testing`) has had no lane; the migrations from stalled tools had no row at all.

**Status:** approved · **Opened:** `2026-11-18` · **Owner:** `@ofri-peretz` · **Lane:** `ac-kit` ·
**Accepted by:** [`D-20261118-contracts-program-go-ahead`](../../decisions/D-20261118-contracts-program-go-ahead.md)

---

## What is wanted

1. **`apicontract/testing`** — the conformance suite as a function a plugin's own test file calls:
   `conformance(plugin, { corpus? })` runs the shared definition of done from
   [`program.md`](../apicontract/program.md): `host.validate`, the sample reproduces exactly,
   determinism (two runs, same bytes), regeneration safety (user files untouched after a spec change),
   round trip where an extractor is paired, and refusal messages carrying `fix:`. Every lane's plugin
   test calls it once the kit lands.
2. **`apicontract plugin new <name> [--kind generator|extractor|adapter]`** — scaffolds a plugin
   folder: `index.ts` with a working one-operation `sample`, a test that calls `conformance`, and a
   README; the scaffold passes the suite as generated.
3. **`apicontract migrate <from>`** — reads the incumbent's config and imports and writes ours,
   reporting every option it could not carry as a finding:
   - `openapi-typescript`: CLI flags and `redocly.yaml` → `apicontract.config.json` with the `types`
     target in `--compat` mode; no import rewrite needed (same output).
   - `openapi-fetch`: `createClient` imports rewritten to the generated `fetch` client.
   - `hey-api`: `openapi-ts.config.*` plugins mapped to our targets one by one.
   - `orval`: `orval.config.*` `output.client` mapped to our targets.
4. **Agent distribution** — `AGENTS.md` for the package, a skill (`--skill` output from burgee,
   extended with the plugin authoring guide), and the X3 eval case: an agent given the kit's README
   and one example writes a plugin that passes `conformance` in one turn.

## Why now

X3 is Phase 3's exit gate and the long-tail argument depends on it. Hey API (7.7M weekly) stalled,
openapi-fetch (18.2M) and openapi-typescript (17.3M) are unowned, ts-rest is archived: the migration
path is the cheapest adoption lever in the program (research, 2026-11-18).

## Affected users and systems

`packages/apicontract/src/testing/**`, `src/migrate/**`, `src/plugins/_scaffold/**`,
`packages/apicontract/AGENTS.md`, `evals/cases/apicontract-plugin-*.json` (through the integrator).

## Constraints

- `conformance` uses only the public host API, so third-party plugins run the same suite.
- A migration never deletes the incumbent's config; it writes ours beside it and prints the
  uninstall command.
- Each migration is graded on the incumbent's documented config examples (one fixture per example).

## Success criteria

- `conformance` fails each of seven deliberately broken fixture plugins (one per rule) and passes the
  scaffold; mutation testing kills every mutant in `src/testing/**`.
- `plugin new` output passes `conformance` and `npm run typecheck` with no edits.
- Each `migrate` source: 100% of the incumbent's documented config examples convert, or produce a
  finding per unsupported option.
- X3 read weekly and published.

## Defaults taken

- The suite is exported as `apicontract/testing`, runner-agnostic: it throws on failure, so it works
  under vitest, jest and `node:test`.
