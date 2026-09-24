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
| ~~A3~~ | ~~only one of four declared subtractions reaches the published compatibility page~~ — **closed**: `compatibility.mdx` renders all four subtraction kinds; `scripts/compat-page-subtractions.test.ts` | compat-oracle C4 | done |
| ~~A4~~ | ~~three rows are load-sensitive and nothing in the gate knows~~ — **closed**: `repeatAndAgree` re-grades a fallen row up to twice; red only if every attempt agrees, a recovery is named with its counts | compat-oracle R7 | done |
| ~~A5~~ | ~~the dependency arrows in the layer table are wrong in three rows of four~~ — **closed**: layer table restated from the manifests (burgee U1 Built) | burgee U1 | done |
| ~~A6~~ | ~~`sideEffects` declared by three of nine packages; no tree-shake fixture~~ — **closed**: all nine declare `sideEffects` truthfully; `side-effects-lock.test.ts`, `tree-shake-fixture.test.ts` (burgee U10 Built) | burgee U10 | done |
| ~~A7~~ | ~~CI grades Node 24 only while `engines` says `>=24`~~ — **closed**: `compat.yml` matrix runs Node 24 and 26 on three OSes (compat-oracle C3 Built) | burgee C3, compat-oracle C3 | done |
| ~~A8~~ | ~~"depends on roundel only" is false, and two ceilings are ratchets on history rather than the incumbent~~ — **closed**: ceilings gated in B4 (#449), dependency sentence restated under D-130 (#463); flagstaff R10 Built | flagstaff R10 | done |
| ~~A9~~ | ~~`signal-exit` is not graded at all~~ — **closed**: `closeout/signal-exit` graded 134 / 135 by signal-exit's own suite, level with its control; the root-export half of R6 stays open (A26) | closeout, PLAN 3.3 | done |
| A10 | `execa`'s suite not vendored; `tinyexec` not installed so no ceiling — **`which` closed 2026-09-23**: vendored and graded 5 / 5 against `bellpull/node-which` | bellpull R8, R9 | `execa` vendored and graded; `tinyexec` a devDependency with its B4 row |
| A11 | paratext: ansi-escapes **4/4** (D-138), terminal-link 8/8 (A27), term-img 12/18 — **each at a recorded ceiling**: CSI is out of scope (3 of ansi-escapes' 4), terminal-link's 2 read another package's mutated module object, term-img's 6 pass a PATH where D-030 takes bytes. terminal-link's baseline was stale at 0 and is now 8 | compat baselines | each ceiling restated as a decision, or lifted |
| A12 | seniority: cosmiconfig 186/243, dotenv **106**/141 (was 80), lilconfig 67/77, rc **1/1** (was 0) — D-135 lifted the two; dotenv's remaining 35 are the declined vault/decrypt (27), dotenvx tips (2), and 6 internal-module cases the harness cannot map yet | compat baselines | each suite at 100%, or each failing case named with its reason |
| A13 | caique: clack 14/17 — the 3 are `guide.test.ts`, which renders all twelve clack prompts; `caique/clack` exports only `limitOptions`, so closing it is a clack prompt façade, not a fix | compat baselines | the twelve prompts, or the row restated to `limitOptions` |
| ~~A14~~ | ~~the foundation layers are static imports of the engine~~ — **closed by restatement (D-136)**: two in-family specifiers are static and declared, the output stack is dynamic; the `.` weight rule asserts exactly that | burgee U13 | done |
| A15 | `-` means stdin for a file positional | burgee S4, D-113 | `ArgumentSpec.type: 'file'`; `-` hands the handler `process.stdin`; a test pipes a file through `-` |
| ~~A16~~ | ~~`--json=<a,b>` selects fields~~ — **closed**: `--json=a,b` selects, `--json=` lists declared `fields`, an unknown field refuses naming the valid set | burgee N14, D-114 | done |
| ~~A17~~ | ~~`--schema <path> --field <name>`~~ — **closed**: dotted field paths below a command; an unknown step names the valid ones | burgee N13, D-116 | done |
| A18 | a generated `config explain` | burgee V8, D-117 | synthesised when the program reads config; every value with the source that won |
| ~~A19~~ | ~~`defineError({ name, code })`~~ — **closed**: the class leaves with its code, rendered like `UsageError`; a reused or reserved code throws at definition | burgee E7, D-118 | done |
| A20 | `dynamic: true` completion marker | burgee D3, D-119 | opt-in per option; completion scripts call back only for those |
| A21 | non-TTY prompt exits 2, cancelled prompt exits 4 | burgee P2, P3, D-120 | an `ask()` bridge maps caique's verdict to `UsageError` / `CANCELLED`, no new dependency edge |
| A22 | `.burgee({ floor: true })` on façades | burgee J3, J4, D-121 | one call turns the behavioural floor on; `--schema` names the flags the program shadows |
| ~~A23~~ | ~~plugin hooks `parse` and `shutdown`~~ — **closed**: `parse` rewrites argv before resolution, chained in `enforce` order; `shutdown` fires once through the run's teardown; both in the schema, and the plugins page's limit now reads help and config only | plugin surface, D-122 | done |
| ~~A24~~ | ~~`burgee/program-schema.json`~~ — **closed**: published; real `--schema` output validated against it in a test; `--schema` gains `exitCodes` | burgee F1, schema-is-validated, D-123 | done |
| ~~A25~~ | ~~`.effects()` on commander façade commands~~ — **already built**, found 2026-09-23: both façades have `.effects()`, `facade-surface.test.ts` covers declared, undeclared and withheld; the spec row was stale | agent-surface-declared R6, D-127 | done |
| ~~A26~~ | ~~`signal-exit`'s API at closeout's root, so the `overrides` recipe resolves~~ — **closed by restatement** (D-133): R6 restated to the three subpaths; the README's two-incumbent `overrides` recipe never linked and is withdrawn; `scripts/override-recipe-lock.test.ts` | closeout R6 | done |
| ~~A27~~ | ~~terminal-link sits at 8 / 10 because two cases (`main`, `stderr`) set `supportsHyperlinks.stdout` on another package's module object~~ — **closed**: the façade carries `supports-hyperlinks` 4.5.0's own detection, graded against the real package in 55 environments (`paratext/src/hyperlinks.test.ts`; `LINK.when` failed 30); `main` and `stderr` excluded by exact title (`Exclusion.exact`); **8 / 8**, level, and `burgee migrate` rewrites it | compat-oracle `excludes`, burgee-migrate A12 | done |
| ~~A28~~ | ~~ansi-escapes is capped at 1 / 4 because paratext states CSI out of scope~~ — **closed (D-138)**: `csi.ts`, byte-exact with 7.3.0; 4 / 4, and `burgee migrate` rewrites it | paratext scope, burgee-migrate A12 | done |
| ~~A29~~ | ~~`require-of-default` refuses a `require()` of an ESM-only incumbent (chalk 6, ora 9, …) whose own `require()` already returns a namespace~~ — **closed**: migrate refuses only where the two `require()` results differ in kind; `REQUIRE_NAMESPACE` (twelve incumbents, with ansi-escapes and terminal-link) is held to Node's own `require()` by `migrate-require.test.ts`, which failed 11 ways on the old rule. It also found `burgee/yargs/parser` handing `require()` a namespace where yargs-parser hands the function; it now exports `'module.exports'` and joins the require-shape lock | burgee-migrate A12 | done |
| ~~A30~~ | ~~`dev.test.ts` "reloads thirty commands within the budget" measured 1,035 ms against 500 on a Windows CI runner and 4,098 ms in a loaded local pre-push battery~~ — **closed**: the budget is 500 ms or five imports of the same entry on the same machine, whichever is larger; the first call's lazy `seniority/config` import is paid before the clock; a reload slowed by 600 ms fails it | burgee W6 | done |

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
| ~~B21~~ | ~~Does paratext take ansi-escapes' CSI surface?~~ | paratext scope | **decided — D-138** |

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
