# Vendored MCP schemas

Each `<revision>/schema.json` here is copied unmodified from the Model Context Protocol
specification repository, <https://github.com/modelcontextprotocol/modelcontextprotocol>,
at commit `1f520964b295d58494d944f2aea8a5ab51c79f77` (2026-10-10), path
`schema/<revision>/schema.json`. `LICENSE` beside this file is that repository's licence,
copied unmodified.

They are test fixtures: nothing in `dist/` reads them and no package depends on them.
`scripts/mcp-messages.test.ts` validates every message the `--mcp` server writes against the
schema of the revision it negotiated (mcp-current R7).
