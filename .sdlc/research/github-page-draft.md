# GitHub repo page: draft, not applied

Outward-facing; applied only on the owner's yes. Measured 2026-10-10 with
`gh repo view ofri-peretz/burgee --json description,homepageUrl,repositoryTopics`.

## Today

- **Description:** "Interlace CLI — agent-native extensions for commander and yargs: one schema, a JSON
  envelope on every command, an exit-code contract, and a manifest an AI agent reads in one call."
  It predates the ten-package family and leads with competitors.
- **Homepage:** `https://github.com/ofri-peretz/burgee/blob/main/docs/intents/agent-native-cli-layer/design.md`,
  which returns **404** (intents moved to `.sdlc/intents/`).
- **Topics:** ai-agents, cli, commander, eslint-plugin, interlace, turborepo, yargs. `eslint-plugin` is
  wrong; `turborepo` describes the build, not the product.

## Proposed

- **Description** (≤ 350 chars):
  "Ten packages for building CLIs that humans and agents both use: one declaration projects help,
  --json, --schema, MCP and completions; no dependency outside the family; every release signed with
  npm provenance. Drop-in paths for commander, yargs, chalk, ora, ink and more, graded by their own
  test suites."
- **Homepage:** `https://burgee.interlace.tools`
- **Topics:** cli, cli-framework, command-line, terminal, tui, agent-native, ai-agents, mcp,
  nodejs, typescript, commander, yargs, chalk, ink

## Apply (owner runs, or says yes)

```bash
gh repo edit ofri-peretz/burgee --description "<above>" --homepage https://burgee.interlace.tools \
  --remove-topic eslint-plugin --remove-topic turborepo \
  --add-topic cli-framework --add-topic command-line --add-topic terminal --add-topic tui \
  --add-topic agent-native --add-topic mcp --add-topic nodejs --add-topic typescript \
  --add-topic chalk --add-topic ink
```

Social preview image (1280×640) has no API; upload under Settings → General → Social preview.
