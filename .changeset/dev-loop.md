---
"burgee": minor
---

`burgee dev <entry>`: your agent is connected to your CLI while you write it. The entry (exporting `program` as a burgee manifest, a commander `Command` or a yargs instance) is served as MCP on stdio; on every save it is re-imported as a fresh module graph, the served manifest is swapped, `notifications/tools/list_changed` goes out, and the diff plus the rendered help are printed on stderr. Dev-time only and removable: nothing a shipped CLI imports can reach it. `startMcp()` is the swappable server `serveMcp()` now wraps.
