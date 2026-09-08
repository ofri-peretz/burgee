# `evals/` — Stage 4 (Test): continuous evals

Ported from `ofri-peretz/eslint/evals/` (intent `sdlc-locks-evals-bands`). A suite that
runs whenever the agent-facing configuration changes: `README.md`, `docs/**`,
`.github/**`, `.sdlc/bands/**`, `apps/docs/content/**`, `eslint.config.mjs`.

## Two layers

**Layer 1 — deterministic config checks.** No model, no key, no cost. Runs on every PR
that touches the paths above:

- every relative link in an agent-facing document resolves from a standalone clone;
- every `scripts/<name>` and `npm run <script>` a document names exists;
- every floor id a child intent cites (`F1`, `O3`, `K5`, …) is defined in the umbrella
  design.

**Layer 2 — task evals.** Real tasks with accepted outcomes under `evals/cases/*.json`,
run non-interactively with `claude -p`. Reports `skipped` without a credential.

Cases come from real incidents or from a claim somebody made that needs measuring, and
they are written by whoever owns the claim. One so far:

| case | the claim it measures |
| :-- | :-- |
| `flagstaff-plugin-from-schema` | U9 / flagstaff R8 — that `schema.json` plus one worked example is enough for an agent to write a working plugin **in one turn**, and that `flagstaff check` tells it so without a human reading the output |

A case earns its place by discriminating. That one's shell checks were run both ways
before it was committed: green against a correct plugin, and red against the same plugin
with its `static` removed, where `check` exits 1 with
`E_NO_STATIC_PROJECTION … fix: give it a \`static\`` — which is the feedback loop the claim
is about. A case that cannot fail is not measuring anything.

Whatever a case asks the agent to write goes under `evals/results/`, which is gitignored.

Credentials, same rule as `eslint/`: set `CLAUDE_CODE_OAUTH_TOKEN` (subscription, no
per-token charge, from `claude setup-token`) **or** `ANTHROPIC_API_KEY` (billed per
token). Not both — the API key outranks the token.

## Running

```bash
npm run evals:config   # layer 1 only — fast, deterministic, no key
npm run evals          # both layers; layer 2 skips without a key
```

Unit tests for the checkers live in `scripts/run-evals.test.ts` and run under `npm test`.
