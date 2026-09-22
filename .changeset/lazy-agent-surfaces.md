---
'burgee': patch
---

The MCP server and the help renderer load on the branch that uses them.

`--mcp` serves a protocol until stdin closes and `--help` lays out prose with measured
columns; a program that does neither should carry neither. Both are now reached through
`await import()`, so a bundler with code splitting leaves them off the startup path.

Measured as an entry chunk: `burgee` **58,056 → 19,540 bytes**, and `burgee/commander`
**69,431 → 51,306**. No API changed — `renderHelp` and `serveMcp` are still exported from the
root and still do the same thing.

`commander`'s `--schema` deliberately stayed synchronous: `parse()` is synchronous by
contract and a lazy import there returned a Promise nobody awaited, so the document never
printed. The suite caught it.
