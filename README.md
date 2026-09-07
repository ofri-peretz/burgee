# Interlace CLI

The agent-native layer **above** argv parsing, on top of [commander](https://github.com/tj/commander.js)
and [yargs](https://github.com/yargs/yargs) — never replacing them. One schema, a JSON
envelope on every command, an exit-code contract, prompts-as-flags, static completions,
an in-process test harness, and a manifest an AI agent reads in one call. The same floor
is enforced statically by `eslint-plugin-cli-floor`.

A turborepo, like every Interlace repo.

| Path | Purpose |
| :-- | :-- |
| [`packages/burgee/`](./packages/burgee/) | `burgee` — the framework. `burgee` is the engine; `burgee/testing` runs a burgee CLI in-process (T1). The only published package. |
| [`packages/compat-oracle/`](./packages/compat-oracle/) | Internal. Grades compatibility with commander and yargs using their own suites, plus reference drivers that run the real incumbents for byte-for-byte comparison. |
| `packages/commander-*`, `packages/yargs-*` | Public extensions, one per layer per host, in the host's own idiom. Next: `commander-agent`, `yargs-agent`. |
| [`examples/`](./examples/) | The reference demo CLI built twice (commander, yargs) and the conformance suite that runs every floor case on both. |
| [`apps/docs/`](./apps/docs/) | Documentation site (Next.js + fumadocs). |
| [`docs/intents/`](./docs/intents/) | Stage 1 + 2 artifacts of the AI-native SDLC (`AI_NATIVE_SDLC.md`, one level above this repo on a maintainer's machine): `intent.md` + `design.md` per change. |
| [`docs/research/`](./docs/research/) | 329 open issues across yargs, commander, oclif, citty, clack — clustered and cited, with raw snapshots. |

**Status:** wave 0 shipped — the SDLC loop (locks, evals, control bands) and the
test harness (T1). See [`docs/intents/`](./docs/intents/) for the wave plan. E1, the
exit-code contract, and the `Runtime` seam are in `burgee`.

```bash
npm install
npm test          # every lock and unit test, exits non-zero on failure
npm run dev       # docs on http://localhost:3100
```

This repo dogfoods 11 Interlace ESLint plugins with **every rule on at `error`** and zero
warnings allowed: `secure-coding`, `node-security`, `conventions`, `import-next`,
`maintainability`, `modernization`, `modularity`, `operability`, `reliability`,
`react-a11y`, `react-features`. The rule list is computed from each plugin's own table, so
a rule shipped in a plugin release is on here the day it lands. Every exception is named in
`eslint.config.mjs` with its reason: a conflicting pair, a rule that cannot apply here, or a
false positive tracked in the eslint monorepo.
