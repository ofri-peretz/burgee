# What actually makes a community migrate

Written 2026-09-20, to close product questions with evidence rather than to raise more.

burgee is a replacement for packages people already use and are not unhappy with. That is
the hardest category in open source, and it has been won repeatedly — so the question is not
whether it can be done but what the winners actually did. The pattern across Vitest, esbuild,
pnpm, Vite, Biome, Bun, Zod and Prettier is consistent, and it is **not** "was better".

## 1. The incumbent blocked something the user had already adopted

This is the cause in almost every case, and it is the one most often mistaken for speed.

- **Vitest over Jest.** Jest's ESM support was experimental for years while the ecosystem
  moved to ESM, TypeScript and Vite. Vitest's pitch was not "faster" — it was *your Vite
  config already works*. The user had already adopted Vite; Jest was the thing in the way.
- **Vite over webpack.** Dev-server startup was the block, and it was felt every morning.
- **esbuild / swc over Babel.** Build minutes were the block.
- **pnpm over npm.** Disk and phantom dependencies were the block for monorepos.

**For burgee the block is: an agent cannot reliably drive my CLI.** Help text is prose, every
failure exits 1, there is no machine contract, and errors say what is wrong rather than what
to run. That block is early, real and getting worse weekly — and no incumbent can remove it
without a breaking redesign, which is the second half of why Jest lost.

## 2. The migration cost has to be near zero

Every winner had a mechanical path, not an argument.

- Vitest kept `describe` / `it` / `expect` identical; `jest.fn()` → `vi.fn()` was a codemod.
- `jest-codemods` existed before the migration wave, not after it.
- pnpm shipped `pnpm import` to convert a lockfile.
- Biome shipped `biome migrate eslint`.

**burgee already has the strongest version of this in the family: change one import, and
commander's own 1,360 tests still pass.** What it does not have is the codemod. Every project
above shipped one, and shipping one is how "you could migrate" becomes "I migrated in four
minutes".

## 3. Speed wins only at an order of magnitude, on a wait that is felt

10–100x on a build people watch. Not 20%, and not a number in a README.

**burgee should never lead with speed.** It starts at 2.57x cac's cold start and bundles
5.5x cac. Leading with speed invites a benchmark that loses. Leading with what it replaces
does not.

## 4. One tool replacing several

Biome = ESLint + Prettier. Bun = node + npm + jest + esbuild. This is a consolidation pitch
and it is measurable on the day it is made.

**This is burgee's most underused claim.** `npm i burgee` stands in for commander, chalk,
ora, boxen, cli-table3, cosmiconfig, dotenv, cross-spawn, exit-hook, string-width, wrap-ansi
and terminal-link — twelve packages and their transitive trees, against one with no runtime
dependencies. That number is checkable today and nothing in the documentation leads with it.

## 5. The wedge is a category the incumbent cannot add

Jest could not become Vite-native. webpack could not become unbundled. commander cannot grow
a machine contract, an effects declaration and a plugin host without becoming a different
library — which is exactly why its plugin RFC has stayed open for years.

## 6. CLIs against MCP servers, and why this matters more than `--mcp`

The argument gaining ground in the agent community is that **a well-described CLI is a better
agent interface than an MCP server for most tools**, and the mechanism is context, not taste:

- An MCP server's tool definitions are loaded **before** any work happens. Dozens of tools
  cost thousands of tokens on every turn whether or not they are used, and agent accuracy
  falls as the tool count rises.
- A CLI costs **nothing** until it is called. `--help` is progressive disclosure that already
  exists, and models are already extremely good at shell.
- Composition is free: pipes, redirection, exit codes, `&&`. An MCP client has to invent an
  orchestration layer for what a shell gives away.
- The direction of travel in the ecosystem is toward code execution and on-demand tool
  loading rather than eager schemas — the same conclusion from the other end.

MCP keeps the cases that genuinely need it: remote, stateful, authenticated, or where there
is no binary to run.

**Three consequences for what gets built.**

1. **`--mcp` is table stakes, not the moat.** It should exist because asking is cheap. It
   should not be the headline, and it should never be the thing byte budgets are cut to fit.
2. **The moat is a CLI legible to an agent without a server**: `--schema` as the contract,
   `--json` as the output, an exit-code contract, and `fix:` naming the command to run rather
   than prose describing the problem. burgee already has four of those five.
3. **Progressive disclosure is the missing requirement.** An agent should pay for one
   command's contract, not the whole tree. `--schema` dumping every command is the MCP
   mistake in CLI clothing.

## 7. The measurement nobody has published

If §6 is right, it is provable, and the proof is a number this repository is already shaped
to produce: **agent tokens per completed task, for the same capability offered as a burgee
CLI and as an MCP server.** The `agent-tokens-per-task` and `agent-turns-per-task` bands
already exist in `benchmarks/` and have never run — they report `unmeasured — not selected
by --axis`, and B1 skips without a credential.

That is the single highest-value unbuilt thing in the repository. It is a first-party number
on a live industry argument, it is exactly the kind of claim the compat-oracle discipline
makes credible, and it belongs to burgee rather than to the framework category.
