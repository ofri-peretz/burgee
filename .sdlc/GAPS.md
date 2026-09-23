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
| A15 | `-` means stdin for a file positional | burgee S4, D-113 | `ArgumentSpec.type: 'file'`; `-` hands the handler `process.stdin`; a test pipes a file through `-` |
| A16 | `--json=<a,b>` selects fields | burgee N14, D-114 | bare `--json` unchanged; `--json a` stays a positional; fields filter the envelope's data |
| A17 | `--schema <path> --field <name>` | burgee N13, D-116 | one field of one command, the same shape `--schema` prints for it |
| A18 | a generated `config explain` | burgee V8, D-117 | synthesised when the program reads config; every value with the source that won |
| ~~A19~~ | ~~`defineError({ name, code })`~~ — **closed**: the class leaves with its code, rendered like `UsageError`; a reused or reserved code throws at definition | burgee E7, D-118 | done |
| A20 | `dynamic: true` completion marker | burgee D3, D-119 | opt-in per option; completion scripts call back only for those |
| A21 | non-TTY prompt exits 2, cancelled prompt exits 4 | burgee P2, P3, D-120 | an `ask()` bridge maps caique's verdict to `UsageError` / `CANCELLED`, no new dependency edge |
| A22 | `.burgee({ floor: true })` on façades | burgee J3, J4, D-121 | one call turns the behavioural floor on; `--schema` names the flags the program shadows |
| A23 | plugin hooks `parse` and `shutdown` | plugin surface, D-122 | in the schema, the plugins page's "cannot do yet" list shrinks by the two |
| A24 | `burgee/program-schema.json` | burgee F1, schema-is-validated, D-123 | published; `--schema` output validated against it in a test, no runtime validator |
| A25 | `.effects()` on commander façade commands | agent-surface-declared R6, D-127 | a façade command can declare its effects and reach MCP |

## B — decide, then build

All taken 2026-09-23 under the owner's delegation ("you should be able to close the open
decisions yourself"). The ruling is the D-row in `.sdlc/DECISIONS.md`; for B12 and B13
it differs from the recommendation this table carried. What each one asks to be
built moved to A15–A25.

| # | Decision | Source | Recommendation |
| :-- | :-- | :-- | :-- |
| ~~B1~~ | ~~Every command must carry a group~~ | burgee M1 | **decided — D-112** |
| ~~B2~~ | ~~`-` means stdin for a file-typed positional~~ | burgee S4 | **decided — D-113** |
| ~~B3~~ | ~~`--json <fields>` selects fields; bare `--json` unchanged~~ | burgee N14 | **decided — D-114** |
| ~~B4~~ | ~~a compact non-JSON `agent` format~~ | burgee N15 | **decided — D-115** |
| ~~B5~~ | ~~`--schema` drill below command path~~ | burgee N13 | **decided — D-116** |
| ~~B6~~ | ~~a generated `config explain` command~~ | burgee V8 | **decided — D-117** |
| ~~B7~~ | ~~author-declared error classes; a reused code fails at startup~~ | burgee E7 | **decided — D-118** |
| ~~B8~~ | ~~a `dynamic` marker for runtime-completed options~~ | burgee D3 | **decided — D-119** |
| ~~B9~~ | ~~a prompt in a non-TTY exits 2; a cancelled prompt exits 4~~ | burgee P2, P3 | **decided — D-120** |
| ~~B10~~ | ~~one call that turns on the behavioural floor for façade programs~~ | burgee J3, J4 | **decided — D-121** |
| ~~B11~~ | ~~burgee plugin hooks beyond preRun/postRun/onError~~ | plugin surface | **decided — D-122** |
| ~~B12~~ | ~~the validator for `--schema` output~~ | schema-is-validated, burgee F1 | **decided — D-123** |
| ~~B13~~ | ~~the lint half of F3, O3, P1: `eslint-plugin-cli-floor`~~ | burgee F3, O3, P1 | **decided — D-124** |
| ~~B14~~ | ~~built-in components as plugin contributions~~ | flagstaff R4 | **decided — D-125** |
| ~~B15~~ | ~~`fromBase16` / `fromITerm` theme import~~ | roundel R11 | **decided — D-126** |
| ~~B16~~ | ~~façade commands are withheld from MCP and cannot say otherwise~~ | agent-surface-declared R6 | **decided — D-127** |
| ~~B17~~ | ~~"zero runtime dependencies" vs "none outside this repo"~~ — **accepted by the owner 2026-09-23 (D-111): every production dependency is in-family**, as a dependency, peer or optional dependency; Z3 and K1 Built | burgee Z3, K1 | done |
| ~~B18~~ | ~~`lighter-than-commander` 1.52, `lighter-than-cac` 2.65, cold start 1.44 × cac~~ | claims, u5-weight-claim | **decided — D-128** |
| ~~B20~~ | ~~Accept the requirement restatements already written in the specs — compat-oracle R1, R3, C4 and the rest of its "Requirements restated" table; burgee U1, U10, Z3/K1; flagstaff R10's dependency sentence~~ | each spec's restatement table | **decided — D-130** |
| ~~B19~~ | ~~design acceptance for linegauge, closeout, bellpull, seniority (draft) and caique, paratext (review)~~ | each intent | **decided — D-129** |

## C — outside the repo

| # | Gap | Source | What it needs |
| :-- | :-- | :-- | :-- |
| C1 | agent-tokens-40pct unmeasured | burgee B1 | `CLAUDE_CODE_OAUTH_TOKEN`, or an API key and ~$5–15 |
| C2 | the one-turn plugin-authoring eval has never run | burgee U9 | the same credential |
| C3 | the first outside adopter | burgee U12 | a CLI we did not write, installing one layer alone |
| C5 | the lint half of F3, O3, P1 | burgee F3, O3, P1, D-124 | a rule set in the Interlace ESLint monorepo, not here |
| C4 | clispec.dev and cli-agent-lint have no axis | burgee N10 | both tools to exist and be runnable offline — unverified |

## Release queue — owner actions

Settings only the repository owner can change. The release loop runs without them — the Version
PR falls back to `GITHUB_TOKEN` and unblocks itself (D-110) — but each one removes a workaround.
Numbered on from C, because each needs something from outside the repo.

| # | Gap | Exact setting | Done when |
| :-- | :-- | :-- | :-- |
| C5 | The Version PR is opened with `GITHUB_TOKEN`, so its checks are dispatched and mirrored as statuses, and it merges itself | **Preferred — a GitHub App.** github.com → Settings → Developer settings → GitHub Apps → *New GitHub App*: no webhook; Repository permissions **Contents: Read and write**, **Pull requests: Read and write**; install it on `ofri-peretz/burgee` only. Then repo → Settings → Secrets and variables → Actions → **Variables** → `RELEASE_APP_ID` (the App ID or Client ID), and **Secrets** → `RELEASE_APP_PRIVATE_KEY` (the whole generated `.pem`). **Alternative:** Settings → Developer settings → Personal access tokens → Fine-grained → repo `ofri-peretz/burgee`, Contents + Pull requests read/write, saved as the repo secret `RELEASE_BOT_PAT` | the next push to main's `Changesets` run has no *Version PR opened with GITHUB_TOKEN* warning and no `Version PR · … (dispatched)` jobs, and the Version PR shows its checks as `pull_request` runs |
| C6 | No merge queue: strict protection makes every PR behind `main` update and re-run by hand (PLAN 0.3) | repo → Settings → Rules → Rulesets → *New branch ruleset*: target `main`, enforcement **Active**, **Require merge queue** (merge method squash), **Require status checks to pass**: `Quality Gate`, `Quality (Full) Gate`, `review`, and `Ratchet · each host's suite against burgee` — `scripts/lint-workflows.ts` already treats that one as required, but live branch protection lists only the first three. Every workflow reporting them already triggers on `merge_group:` (lint-enforced) | `gh api repos/ofri-peretz/burgee/rulesets` lists the ruleset, and a PR lands through the queue |
| C7 | Publishing authenticates with the long-lived `NPM_TOKEN` | npmjs.com → each of the nine published packages (bellpull, burgee, caique, closeout, flagstaff, linegauge, paratext, roundel, seniority) → Settings → **Trusted Publisher** → GitHub Actions: organization/user `ofri-peretz`, repository `burgee`, workflow filename `release.yml`, environment `production`. After all nine: remove `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` from `release.yml`'s publish step (a PR), then delete the repo secret `NPM_TOKEN` (Settings → Secrets and variables → Actions) | a release publishes with `NPM_TOKEN` absent, and each package's npm page shows provenance from `release.yml` |
