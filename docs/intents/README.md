# `docs/intents/` — Stage 1 (Plan) and Stage 2 (Design)

Every substantive change starts here. See [`AI_NATIVE_SDLC.md`](../../../AI_NATIVE_SDLC.md),
one level above this repo, for why. Layout and status values are the same as in `eslint/`:
one directory per intent, `intent.md` then `design.md`, statuses `draft → review →
approved → shipped` (or `dropped`), and `approved` requires a `design.md` beside it.

## The umbrella

[`agent-native-cli-layer/`](./agent-native-cli-layer/) is the parent of everything below.
Its `design.md` carries the 53-requirement floor (F/O/E/V/S/P/D/T/H/M/K ids) that every
child cites, and the wave plan that fixes the sequence.

## Children

Fourteen, in two tracks. The **agent track** is the umbrella's order of work; the
**gap track** turns the remaining research clusters — the things users have asked
commander and yargs for and neither ships — into packages. Every intent cites its
issues in `docs/research/competitor-open-issues.md`.

### Agent track (order of work)

| # | Intent | Delivers | Floor ids | Status |
| :-- | :-- | :-- | :-- | :-- |
| 1 | [`cli-testing-harness/`](./cli-testing-harness/) | `Runtime` seam; `commander-harness`, `yargs-testing`; the conformance suite | T1 | review |
| 2 | [`commander-agent/`](./commander-agent/) | first public extension on commander's hooks | F1 F2 F4 O1–O5 E1–E5 | review |
| 3 | [`sdlc-locks-evals-bands/`](./sdlc-locks-evals-bands/) | intent lock, evals layer 1, control bands | — | review |
| 4 | [`eslint-plugin-cli-floor/`](./eslint-plugin-cli-floor/) | the L rules on `@interlace/eslint-devkit` | F3 O1–O4 E1 E2 V2 V5 P1 D1 | review |
| 5 | [`agent-cli-bench/`](./agent-cli-bench/) | tokens and turns per task; the first real band | — | review |
| 6 | [`yargs-agent/`](./yargs-agent/) | the same floor as yargs middleware; the shared suite as contract | same as 2 | review |
| 7 | [`docs-deploy/`](./docs-deploy/) | `apps/docs` on an interlace.tools host, `llms.txt` | — | review |

### Gap track (research clusters)

| # | Intent | Research | Delivers | Proposed floor additions |
| :-- | :-- | :-- | :-- | :-- |
| 8 | [`commander-schema/`](./commander-schema/) | §4 validation, §5 TypeScript | declare once: types, relations, derived TS types | S5–S8 |
| 9 | [`commander-env/`](./commander-env/) | §3 config and env | fixed precedence, `--explain`, provenance, owning package.json | V6–V7 |
| 10 | [`cli-help-renderer/`](./cli-help-renderer/) | §2 help (largest) | one renderer from the manifest; twenty issues by construction | H1–H6 |
| 11 | [`commander-completions/`](./commander-completions/) | §6 completions | static scripts for four shells, Fig spec | D3–D5 |
| 12 | [`cli-prompts/`](./cli-prompts/) | §9 prompts | flags first, errors in non-TTY, `--yes`, `--interactive` | P3 |
| 13 | [`cli-modularity/`](./cli-modularity/) | §8 large CLIs | groups, lazy commands, plugins, shared options, deprecation | M1–M6 |
| 14 | [`cli-packaging/`](./cli-packaging/) | §11 runtime | zero deps, ESM, natives, artifact gate, size ratchet | K1–K5 |

Not planned, on purpose: §10 parsing edge cases (commander owns them; the research
says why), §12 maintainer signals (an article, not a package), and an update checker
(citty #10 — a network call at startup is the opposite of what an agent wants).

## Execution plan

Finalised 2026-09-06: every open question in every intent has a recorded decision, the
27 floor additions are folded into the umbrella design (53 requirements), and all
fifteen intents are `review`. Moving them to `approved` is the human gate; nothing is
built before that.

Waves, from the umbrella design. A wave starts when the previous one is `shipped`;
intents inside a wave run in parallel sessions, one worktree each.

| Wave | Intents |
| :-- | :-- |
| 0 | `sdlc-locks-evals-bands`, `cli-testing-harness` |
| 1 | `commander-agent`, `cli-packaging` |
| 2 | `yargs-agent`, `eslint-plugin-cli-floor`, `docs-deploy`, `cli-help-renderer` |
| 3 | `agent-cli-bench`, `commander-schema`, `commander-env` |
| 4 | `commander-completions`, `cli-prompts`, `cli-modularity` |

Prerequisites only the owner can supply (none are set on the repo as of 2026-09-06):

| Item | Needed by |
| :-- | :-- |
| `NPM_TOKEN`, or npm Trusted Publishing per package | wave 1, first publish |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude review now; `agent-cli-bench` in wave 3 |
| `VERCEL_TOKEN`, Vercel project, DNS for `cli.interlace.tools` | wave 2, `docs-deploy` |
| macOS and Windows runners in the conformance matrix | wave 1, E5 on three platforms |

## Where intents come from

A person, or a control-band breach (intent 3 wires the watcher). Every intent here was
opened from the umbrella design and the 329-issue research in `docs/research/`.
