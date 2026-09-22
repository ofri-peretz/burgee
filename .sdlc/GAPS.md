# Gaps — every open one, and what closes it

Opened 2026-09-23 on the owner's instruction *"close all small and big gaps"*. The living tracker:
a row is struck when its PR merges, and a row that needs a decision says so rather than being
built on a guess. Sources: every `Not built` row in `.sdlc/intents/*/spec.md`, the compat
baselines in `packages/compat-oracle/baseline/`, and the claims in `benchmarks/claims.ts`.

Three kinds, because they close three different ways:

- **A — build it.** The design is accepted; what is missing is code, a suite, or a sentence
  that states a measured fact. One PR each, every one with a check proven to fail first.
- **B — decide, then build.** The requirement asks for public API or restates what the
  package promises. AI_NATIVE_SDLC rule 3: a human accepts at Design→Build. Each row carries
  the recommended answer, so accepting is one word.
- **C — needs something from outside the repo.** A credential, a spend, or an adopter.

## A — build it

| # | Gap | Source | Done when |
| :-- | :-- | :-- | :-- |
| ~~A1~~ | ~~vendor scripts resolve the oracle through bare specifiers~~ — **closed**: four scripts, seven specifiers, `oracle-import-lock.test.ts` | compat-oracle R6 | done |
| A3 | only one of four declared subtractions reaches the published compatibility page | compat-oracle C4 | `compatibility.mdx` renders `excludes`, `controlFailures`, `conditionalCases`, `ungradedDirs`, each with its reason; a lock fails when a kind is not rendered |
| A4 | three rows are load-sensitive and nothing in the gate knows | compat-oracle R7 | load-sensitive cases repeat-and-agree before a row is red; a flake is named, not silent |
| A5 | the dependency arrows in the layer table are wrong in three rows of four | burgee U1 | table restated from the manifests; the layer lock is its check |
| A6 | `sideEffects` declared by three of nine packages; no tree-shake fixture | burgee U10 | every package declares it truthfully; a fixture proves a root named import bundles to its subpath's bytes |
| A7 | CI grades Node 24 only while `engines` says `>=24` | burgee C3, compat-oracle C3 | the compat matrix runs every supported even major (24, 26) |
| A8 | "depends on roundel only" is false, and two ceilings are ratchets on history rather than the incumbent | flagstaff R10 | requirement restated to the four same-repo deps; `./box` and `./table` ceilings set from boxen's and cli-table3's measured bytes |
| A9 | `signal-exit` — the biggest incumbent closeout replaces, ~199 M/wk — is not graded at all | closeout, PLAN 3.3 | its suite vendored and in the baseline |
| A10 | `execa` and `which` suites not vendored; `tinyexec` not installed so no ceiling | bellpull R8, R9 | both suites vendored and graded; `tinyexec` a devDependency with its B4 row |
| A11 | paratext: ansi-escapes 1/4, terminal-link 0/10, term-img 12/18 | compat baselines | each suite at 100%, or each failing case named with its reason |
| A12 | seniority: cosmiconfig 186/243, dotenv 80/141, lilconfig 67/77, rc 0/1 | compat baselines | same |
| A13 | caique: clack 14/17 | compat baselines | same |
| A14 | the foundation layers are static imports of the engine, which the claim says they are not | burgee U13 | measured, and either made lazy or the claim restated with the number |

## B — decide, then build (recommended answer in bold)

| # | Decision | Source | Recommendation |
| :-- | :-- | :-- | :-- |
| B1 | Every command must carry a group | burgee M1 | **No — restate M1 as "a group is available and rendered"**; forcing a group on a three-command CLI is ceremony Z1 forbids |
| B2 | `-` means stdin for a file-typed positional | burgee S4 | **Yes: `ArgumentSpec.type: 'file'`, and `-` hands the handler `process.stdin`** |
| B3 | `--json <fields>` selects fields; bare `--json` unchanged | burgee N14 | **Yes, as `--json=<a,b>` only**, so `cmd --json positional` can never be misread |
| B4 | a compact non-JSON `agent` format | burgee N15 | **Defer past 1.0** — B1 is unmeasured, and N15's justification is token cost |
| B5 | `--schema` drill below command path | burgee N13 | **Yes: `--schema <path> --field options`** |
| B6 | a generated `config explain` command | burgee V8 | **Yes, synthesised when the program has config** |
| B7 | author-declared error classes; a reused code fails at startup | burgee E7 | **Yes: `defineError({ name, code })` rows in `CLASSIFIED`** |
| B8 | a `dynamic` marker for runtime-completed options | burgee D3 | **Yes, opt-in per option** |
| B9 | a prompt in a non-TTY exits 2; a cancelled prompt exits 4 | burgee P2, P3 | **Yes, through an `ask()` bridge in burgee that maps caique's verdict to `UsageError` / `CANCELLED`** |
| B10 | one call that turns on the behavioural floor for façade programs | burgee J3, J4 | **Yes: `.burgee({ floor: true })`**, and `--schema` reports which flags the program shadows |
| B11 | burgee plugin hooks beyond preRun/postRun/onError | plugin surface | **Add `parse` (argv in, argv out) and `shutdown`**; help and config stay out until an adopter asks |
| B12 | the validator for `--schema` output | schema-is-validated, burgee F1 | **Publish flagstaff's `conforms` walker from a foundation layer** — one walker for the family |
| B13 | the lint half of F3, O3, P1: `eslint-plugin-cli-floor` | burgee F3, O3, P1 | **Ship it as a tenth package** |
| B14 | built-in components as plugin contributions | flagstaff R4 | **Restate R4 to the three kinds that are contributions**; components stay factories |
| B15 | `fromBase16` / `fromITerm` theme import | roundel R11 | **Defer past 1.0** — its own evidence row says "hypothesis — measure before lock" |
| B16 | façade commands are withheld from MCP and cannot say otherwise | agent-surface-declared R6 | **`.effects()` on façade commands** (yargs has it); commander gains the same |
| ~~B17~~ | ~~"zero runtime dependencies" vs "none outside this repo"~~ — **accepted by the owner 2026-09-23 (D-110): every production dependency is in-family**, as a dependency, peer or optional dependency; Z3 and K1 Built | burgee Z3, K1 | done |
| B18 | `lighter-than-commander` 1.52, `lighter-than-cac` 2.65, cold start 1.44 × cac | claims, u5-weight-claim | **Keep the claims and measure the gap** — restating them is a positioning call |
| B20 | Accept the requirement restatements already written in the specs — compat-oracle R1, R3, C4 and the rest of its "Requirements restated" table; burgee U1, U10, Z3/K1; flagstaff R10's dependency sentence | each spec's restatement table | **Accept** — each replaces a sentence the tree has measurably outgrown, and keeps the original verbatim beside it |
| B19 | design acceptance for linegauge, closeout, bellpull, seniority (draft) and caique, paratext (review) | each intent | **Accept linegauge now** — 0 rows open, every suite at 100% |

## C — outside the repo

| # | Gap | Source | What it needs |
| :-- | :-- | :-- | :-- |
| C1 | agent-tokens-40pct unmeasured | burgee B1 | `CLAUDE_CODE_OAUTH_TOKEN`, or an API key and ~$5–15 |
| C2 | the one-turn plugin-authoring eval has never run | burgee U9 | the same credential |
| C3 | the first outside adopter | burgee U12 | a CLI we did not write, installing one layer alone |
| C4 | clispec.dev and cli-agent-lint have no axis | burgee N10 | both tools to exist and be runnable offline — unverified |
