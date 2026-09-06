# Interlace CLI

The agent-native layer **above** argv parsing, on top of [commander](https://github.com/tj/commander.js)
and [yargs](https://github.com/yargs/yargs) — never replacing them. One schema, a JSON
envelope on every command, an exit-code contract, prompts-as-flags, static completions,
an in-process test harness, and a manifest an AI agent reads in one call. The same floor
is enforced statically by `eslint-plugin-cli`.

A turborepo, like every Interlace repo.

| Path | Purpose |
| :-- | :-- |
| [`packages/cli-core/`](./packages/cli-core/) | `@interlace/cli-core` — internal shared contract: exit codes, envelope, error type, manifest schema. |
| `packages/commander-*`, `packages/yargs-*` | Public extensions, one per layer per host, in the host's own idiom. First: `commander-agent`, `yargs-agent`. |
| [`apps/docs/`](./apps/docs/) | Documentation site (Next.js + fumadocs). |
| [`docs/intents/`](./docs/intents/) | Stage 1 + 2 artifacts of the [AI-native SDLC](../AI_NATIVE_SDLC.md): `intent.md` + `design.md` per change. |
| [`docs/research/`](./docs/research/) | 329 open issues across yargs, commander, oclif, citty, clack — clustered and cited, with raw snapshots. |

**Status:** Stage 2 → 3. Design under review; the first requirement (E1, the exit-code
contract) is in `@interlace/cli-core`.

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
