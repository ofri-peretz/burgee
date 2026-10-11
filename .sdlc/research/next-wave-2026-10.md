# The next wave, ranked from evidence — 2026-10-12

The owner's instruction of 2026-10-12: *"Create intent.md, plan.md -s (many of them) and execute,
keep iterate, we want the best framework ever existed with packages family that is state of the
art."* In this repository the plan is `spec.md`. This file is the candidate table that instruction
was answered from: every candidate the measured research names, what already exists, and why it
was taken or left. Nothing here was invented to fill a slot. A candidate with no number behind it
is in the rejected half with that reason.

## How the candidates were found

1. The research already in `.sdlc/research/`: `tracker-gap-analysis.md`,
   `competitor-open-issues.md`, `output-stack-open-issues.md`, `agent-requirements.md`,
   `cli-market-requirements.md`, `migration-drivers.md`, `candidate-layers.md`,
   `architecture-review.md`, `gtm-audit.md`, `adoption-targets.md`, `docs-traffic-2026-10.md`.
2. The open gaps: `npm run ledger -- gaps --open` on `origin/main` at `3a05dc8aad` (2026-10-11) lists
   `A-20261009-burgee-cold-start`, `A-20261009-chat-ink-windows-lost-line` and `C3` (the first
   outside adopter), and nothing in section B.
3. Every intent's `Out of scope`, open questions and unmet success criteria, read across all 53
   intent directories.
4. Two re-measurements made for this file, both read-only:
   - **Weekly downloads**, `api.npmjs.org/downloads/point/last-week/<name>` for 2026-10-03..09.
   - **The two third-party checklists' own source**, at the versions `benchmarks/floor-tools.ts`
     pins (clispec-cli 0.3.0, cli-agent-lint 0.3.5), read through `gh api` so each failing check
     names what it probes rather than what its title suggests.
5. **Built is checked against the tree, never against a document.** Each "already built" verdict
   below names the file that holds it. `burgee/spec.md` states **Built: 114. Not built: 0**, so no
   candidate can be a floor row; every candidate here is new ground or an existing intent's unmet
   criterion.

Ranking is (demand evidence) × (fit with `PRINCIPLES.md`) ÷ (cost), each scored 1–5. Demand is the
number: engagement, weekly downloads, or a third-party score. Fit is packages never services, zero
external dependencies, every caller first-class, static projection, plugins as data, measured not
asserted. Cost is PRs and CI minutes, with the paid agent runs priced separately.

## The two measurements that decided the top of the table

**A claim on a README that no suite holds.** `packages/seniority/README.md` says, of its paths,
*"Each path is graded by its incumbent's own suite"*, and documents `seniority/find-up` under the
same heading. `packages/compat-oracle/vendor/` holds no `find-up`, and `GRADED` in
`packages/burgee/src/compat.ts` has no `find-up` row. Four more subpaths are written as the
replacement for a named incumbent and carry no grade at all:

| subpath | stands in for | weekly downloads | graded |
| :-- | :-- | --: | :-- |
| `seniority/find-up` | `find-up` | 328,874,020 | no (and the README says yes) |
| `closeout/once` | `onetime` | 154,953,569 | no |
| `closeout/cursor` | `cli-cursor` | 126,679,709 | no |
| `linegauge/truncate` | `cli-truncate` | 54,392,889 | no (checked case by case in `truncate.test.ts`, said plainly) |
| `linegauge/widest` | `widest-line` | 41,152,765 | no |
| *(no subpath)* | `picocolors` | 246,727,715 | no; `roundel/tokens`' ceiling is already picocolors' bytes |

**Two published agent-CLI checklists, and burgee's score on each.** The `external-floor` suite
(D-149) hands the reference demo to clispec 0.3.0 and cli-agent-lint 0.3.5 on CI. Its published
reading (`benchmarks/results/external-floor/2026-09-27-4b8ef1c-local.json`):

| checker | burgee | commander | yargs |
| :-- | --: | --: | --: |
| clispec.dev v0.3, out of 24 | **14** (Fair) | 2 | 2 |
| cli-agent-lint, 34 checks | **81.4%** (B) | 71.2% | 71.9% |

burgee leads both and holds full marks on neither. D-151 recorded the clispec remainder as a
disagreement to argue with the checker. Reading the checkers' source changes that: every remaining
point names a property burgee's own callers would use, and none needs the parser bent.

- **The schema checks are additive keys, not a rival shape.** clispec v0.3's JSON Schema
  (`schemas/v0.3.json`) sets no `additionalProperties: false` at the top or on a command, and its
  `effects` vocabulary — `read_only | idempotent | non_idempotent` — is word for word what burgee
  already emits. burgee's `--schema` lacks `clispec`, `version`, `errors[]` (kind + exit code),
  `global_args[]`, and per-command `cardinality` and `output_fields`. That is five checks, plus
  validation.
- **The output checks probe from the schema's own examples.** clispec builds its probe from a
  command's `example`. The demo declares none, so the probe runs `greet` without its required
  argument, exits 2, and fails "Valid JSON output" and "Explicit format wins" for a reason that
  has nothing to do with output.
- **Structured errors on stderr.** clispec reads stderr's last non-empty line as
  `{"error":{"kind":…}}` on `tool __nonexistent_command__`. cli-agent-lint's SD-1 reads all of
  stderr as JSON under `--json __nonexistent__`. burgee writes the envelope to stdout (the
  envelope is the payload) and prose to stderr, so both fail it.
- **cli-agent-lint's warnings are flags burgee does not have.** Probed on the built demo,
  2026-10-11: `--no-color`, `--quiet` and `--timeout` each exit 2 with `unknown option`. Root help
  has no `Exit codes` section and does not list `completion`, though `completion` exists.

## Selected — nine intents, each with a `spec.md`

| rank | intent | package | demand (the number) | fit | cost | score |
| --: | :-- | :-- | :-- | --: | --: | --: |
| 1 | [`graded-override-targets`](../intents/graded-override-targets/intent.md) | seniority, closeout, linegauge, roundel | 953 M/wk ungraded across six incumbents; one README claim false today | 5 | 2 | 12.5 |
| 2 | [`agent-lint-conformance`](../intents/agent-lint-conformance/intent.md) | burgee (+ roundel, closeout) | cli-agent-lint 81.4% (B): eight checks failing; three flags exit 2 | 5 | 1 | 25 |
| 3 | [`clispec-conformance`](../intents/clispec-conformance/intent.md) | burgee | clispec 14 / 24: ten checks failing, each read in the checker's source | 5 | 2 | 12.5 |
| 4 | [`mcp-current`](../intents/mcp-current/intent.md) | burgee | `MCP_PROTOCOL_VERSION = '2025-06-18'`; no `structuredContent`, no `outputSchema`, no cancellation; two `cli-mcp` criteria unmet | 4 | 2 | 8 |
| 5 | [`inquirer-prompts-drop-in`](../intents/inquirer-prompts-drop-in/intent.md) | caique | `@inquirer/prompts` 43.2 M/wk, ungraded; `usePagination` named as the one gap; caique's 68 open upstream issues are the largest pool outside the engine | 4 | 3 | 5.3 |
| 6 | [`agent-skill`](../intents/agent-skill/intent.md) | burgee | SD-5 fails for all three variants; cli-help-renderer's Markdown output deferred since 2026-09-07; Cloudflare generates Agent Skills from one schema | 4 | 2 | 8 |
| 7 | [`b1-mcp-arm`](../intents/b1-mcp-arm/intent.md) | benchmarks | "the single highest-value unbuilt thing" (`migration-drivers.md` §7); `cli-mcp` criterion unmet since 2026-09-06 | 4 | 3 | 5.3 |
| 8 | [`localised-human-surfaces`](../intents/localised-human-surfaces/intent.md) | burgee (+ caique) | commander #1801: 14 👍, 31 comments, open 2022 → 2025, closed *not planned*; yargs #2094 | 3 | 3 | 4 |
| 9 | [`extra-typings-drop-in`](../intents/extra-typings-drop-in/intent.md) | burgee | `@commander-js/extra-typings` 5.1 M/wk; `orval` excluded from the adoption ranking because nothing maps it | 3 | 3 | 4 |

Scores are demand × fit ÷ cost with demand scored 5, 5, 5, 4, 4, 4, 4, 3, 3 in row order. Rank 2
scores highest and is placed second only because rank 1 corrects a statement that is false on a
published README today; a false claim outranks a missing point.

Each one gives a user something beyond parity:

- **graded-override-targets**: one `overrides` block that removes six more incumbents, each by
  a number rather than a sentence.
- **agent-lint-conformance** and **clispec-conformance**: the only framework with full marks on
  both published agent-CLI checklists, by construction for every program built on it, not for one
  demo.
- **mcp-current**: typed tool results and cancellation for every CLI that adds `--mcp`.
- **inquirer-prompts-drop-in**: the largest prompt API on npm, graded, with no dependency.
- **agent-skill**: a seventh surface from the same declaration.
- **b1-mcp-arm**: a first-party number on a live industry argument, published whichever way it
  falls.
- **localised-human-surfaces**: a feature commander declined after 31 comments, with the machine
  surfaces held invariant by a lock.
- **extra-typings-drop-in**: commander's typed variant, unblocking a measured excluded adopter.

## Execution order

Lanes, not a queue. Two rules decide the order. **One compat-oracle lane at a time**, because
every new graded host edits `GRADED`, `DROP_INS` and `GRADED_VERSIONS` in one file and two
parallel PRs conflict there every time. **One lane in `packages/burgee/src/failure.ts` and
`schema.ts` at a time**, for the same reason.

| step | intent | depends on | lane | runs beside |
| --: | :-- | :-- | :-- | :-- |
| 1 | `graded-override-targets` R1 (the lock) | — | scripts | 2 |
| 2 | `agent-lint-conformance` R1–R6 | — | burgee CLI surface | 1, 3 |
| 3 | `graded-override-targets` R2–R7, one incumbent per PR | step 1 | compat-oracle | 2 |
| 4 | `clispec-conformance` R1–R8 | step 2 (both edit help and the failure path) | burgee schema + failure | 5 |
| 5 | `inquirer-prompts-drop-in` R1–R5 | step 3 finished (compat-oracle lane) | compat-oracle + caique | 4 |
| 6 | `agent-lint-conformance` R7 (re-measure) and `clispec-conformance` R9 (re-measure) | steps 2 and 4 | benchmarks | 7 |
| 7 | `mcp-current` R1–R7 | `clispec-conformance` R5 (output declaration) for R2 only | burgee MCP | 6, 8 |
| 8 | `agent-skill` R1–R6 | `clispec-conformance` R3–R5 (errors, global args, outputs feed the skill) and `agent-lint-conformance` R4 (exit-code section) | burgee surfaces | 7 |
| 9 | `b1-mcp-arm` R1–R5 | `mcp-current` (the arm measures the current server, not the old one) | benchmarks | 10 |
| 10 | `extra-typings-drop-in` R1–R5 | step 5 finished (compat-oracle lane) | compat-oracle + burgee/commander | 9 |
| 11 | `localised-human-surfaces` R1–R7 | steps 2, 4 and 8, which all add human strings the catalog must carry | burgee + caique | — |

The machine rule in the workspace (at most two local agents doing install/test/push work) caps any
step at two parallel lanes on one laptop. Steps marked "runs beside" are the pairs that do not
touch the same files.

## Rejected, and why

| candidate | evidence | why not now |
| :-- | :-- | :-- |
| Cold start back to `burgee ÷ cac` ≤ 1.35 | `A-20261009-burgee-cold-start`, 1.559 on 2026-10-08 | owner-gated (#934); excluded by the brief |
| The first CLI adopter, and the ten drafted outreach issues | `adoption-targets.md`, gap C3 | owner-gated (#954) and outward-facing; excluded by the brief |
| Google Search Console, the weekly "does an assistant name burgee" job, Supabase ingest, the blog angles | `docs-traffic-2026-10.md` (Google 0 of 155 views), `gtm-audit.md` | outward-facing, hosted, or another repository |
| Rank and fix the docs' content gaps | 155 views across ten sites in 30 days | `docs-traffic-2026-10.md`: too few views to tell a weak page from an unvisited one |
| SARIF 2.1.0, findings-versus-failure codes, `--severity` versus `--fail-on` | trivy discussion #7915; semgrep's codes | owned by [`security-profile`](../intents/security-profile/intent.md), unscheduled until an adopter needs it |
| A `listr2` façade | 42.9 M/wk; 8 declined upstream (#720, #721, #697) | deferred by `cli-output-stack` "if an adopter asks"; `flagstaff/tasks` covers one level; listr2's API is large and its renderer contract snapshot-shaped, so cost is the highest in this table |
| `bellpull/stream` | D-013's trigger (`execa` graded) met since D-160 | no streaming demand in `bellpull/issues.md`; `execa` grades 0 / 1048 because `bellpull` resolves on non-zero exit by design |
| Bun and Deno graded matrices | oclif/oclif #968, #1624; yargs #2068, #2186; clack #202 | real demand, but grading means running each vendored suite's own runner under two more runtimes, and that cost is unmeasured. Spike first, in its own research note |
| Single-executable (SEA) distribution of a user's CLI | `PRINCIPLES.md` rule 9 names it as the largest latency win | rejected on principle in `cli-packaging` ("a docs page at most"); needs a bundler, which is an external dependency; no tracker demand measured |
| A native front-end serving `--help`/`--schema` without Node | `architecture-review.md` §3 | the same lever as the owner-gated cold start, plus a second toolchain |
| Man pages (roff) | clack #525 | rejected on principle by `cli-help-renderer` ("Markdown is enough"); the Markdown half is in `agent-skill` |
| MCP resources, prompts, HTTP transport | — | `cli-mcp` out of scope: nothing in the manifest maps to the first two, and HTTP is a server lifecycle a CLI does not own |
| Telemetry, an update checker | cli-market survey: 6 / 10 ship telemetry | rule 1 (no service) and an agent wants no network at startup |
| IME composition in prompts and screens | ink #759 (12 reactions, from Gemini CLI); clack #142 | a hypothesis with no reproduction; `output-stack-open-issues.md` §11 says so. A PTY case that drops a composed CJK string comes first |
| Back navigation in prompt wizards | clack #39 (5 reactions) | low engagement; an option-first prompt has no session, and `caique` deferred it to "v2 if asked" |
| Dotted `object` options (`--bq.project`) | yargs #1305, #1627 | low engagement; owned by `commander-schema` |
| More terminal protocols in `paratext` (Kitty graphics, Sixel) | none measured | no demand number |
| Publish the compat grader as `loadline` | `compat-grader-layer` | an eleventh package; the ceiling is ten (D-158) |
| `box`, `progress`, `taskLog` in `caique/clack` | `caique/spec.md` R8 | no graded case reaches them, so building them would be an ungraded claim |
| The Windows lost-line flake | `A-20261009-chat-ink-windows-lost-line` | owned by that gap; the next occurrence names its cause |
| Cross-layer `burgee plugin check` | `plugin-contract` step 4 | an existing intent's unmet criterion, not new ground |
| Help groups, programmatic invocation, value provenance, dynamic completions, agent detection, `next[]`, `changed`, `--format=agent`, `--fields` | yargs #684, #1605, #1334; cli-market §2, §5 | **built**: `group` on a command and `help.ts`; `runCommand` in `execute.ts`; `config-explain.ts`; `complete-dynamic.ts`; `agent.ts`; `failure.ts`; `execute.ts` (`changedOf`); `agent-format.ts`; `fields.ts` |
| Resumable prompts for agents | clack #533 (9 comments) | **built**: a prompt in a non-TTY becomes a usage error naming the flag, and `action_required` carries a runnable `next[]` (`failure.ts`) |
