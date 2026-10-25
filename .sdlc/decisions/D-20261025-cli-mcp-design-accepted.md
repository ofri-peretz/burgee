---
id: D-20261025-cli-mcp-design-accepted
subject: 'cli-mcp: approved as built, with its one open criterion (B1 over MCP) owned by b1-mcp-arm and its lint rule moved to the eslint repo?'
taken: 'Accepted — by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-25'
date: '2026-10-25'
superseded_by: —
---

**Accepted, and the intent moves `review → approved`. Nothing is left to build under this
intent. It flips to `shipped` when `b1-mcp-arm` marks criterion 4 met.**

**What re-grounding found.** `--mcp` is built and held. Handshake and typed tools are N1, held
by `packages/burgee/src/mcp.test.ts`. Opt-in exposure is N2/N6, spelled `effects:`, with the same
meaning as the `mcp: true` the intent named. The envelope is N4 and non-TTY is N5. The copy-paste
configuration (criterion 5) has been met since 2026-10-12 by `mcp-current` R6
(`scripts/mcp-config-block.test.ts` starts the server from the pasted block). Two items were
carried:

- **Criterion 4, B1 over MCP against Bash.** Owned by
  [`b1-mcp-arm`](../intents/b1-mcp-arm/intent.md) (`approved`), whose criterion 3 marks this one
  met after four weekly readings carry the arm. Building it twice would be two arms and two
  numbers.
- **The lint rule** (a destructive verb exposed without `confirm`). It moves to
  `eslint-plugin-cli-floor` in ofri-peretz/eslint, per
  [D-20261018-drop-eslint-plugin-cli-floor](./D-20261018-drop-eslint-plugin-cli-floor.md). The
  runtime half it backs up holds here: a command without `effects` is not a tool.

**Restated, not reopened.** Constraint 1 and criterion 2 say "zero runtime dependencies (K1)".
What ships is D-111's rule: nothing from outside this repository, held by
`scripts/package-shape-lock.test.ts`. The MCP server itself still imports only Node.

**Build scope:** none here. The coordinator queues `b1-mcp-arm`, which closes this intent.
