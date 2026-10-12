# Vendored MCP schemas

Each `<revision>/schema.json` here is copied unmodified from the Model Context Protocol
specification repository, <https://github.com/modelcontextprotocol/modelcontextprotocol>,
at commit `1f520964b295d58494d944f2aea8a5ab51c79f77` (2026-10-10), path
`schema/<revision>/schema.json`. `LICENSE` beside this file is that repository's licence,
copied unmodified.

| Revision | Schema dialect | Vendored for |
| :-- | :-- | :-- |
| `2025-06-18` | draft-07, `definitions` | mcp-current R7 |
| `2025-11-25` | 2020-12, `$defs` | mcp-current R3 |

Both are the revisions `initialize` negotiates (`SUPPORTED_REVISIONS` in `mcp.ts`). `2026-07-28`,
in the same repository at the same commit, has no `initialize` and is not vendored.

They are test fixtures: nothing in `dist/` reads them and no package depends on them.
`scripts/mcp-messages.test.ts` validates every message the `--mcp` server writes against the
schema of the revision it negotiated (mcp-current R3, R7).
