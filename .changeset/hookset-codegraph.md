---
"hookset": minor
---

The Claude pack runs the CodeGraph MCP server, so Claude answers "where is it, what calls it, how does A reach B" from a prebuilt symbol graph instead of a grep-and-read loop. `hookset init --claude` adds it to `.mcp.json` at a pinned version, lists `.codegraph/` in `.gitignore`, enables it in settings.json, and vendors `codegraph.mjs`, a SessionStart hook that builds the index in the background. `hookset check` fails when any of those is missing or drifted. Measured on burgee (`packages/hookset/scripts/codegraph-bench`): on flow-tracing tasks greps fell from 29 to 18 and file reads from 24 to 3.

`hookset context` now counts what an MCP server in `.mcp.json` loads into every session: a pack server at the size `stations.json` records (codegraph: 8,652 characters, about 2,163 tokens), and names any other server as not measured. A repo that adopts the server raises its ceiling once to include it.
