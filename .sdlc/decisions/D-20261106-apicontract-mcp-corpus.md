---
id: D-20261106-apicontract-mcp-corpus
subject: 'apicontract SC10: which MCP servers form the version-history corpus `diff` is judged on?'
taken: Taken
date: '2026-11-06'
superseded_by: —
---

**The 10 npm packages with the most weekly downloads whose name matches `@modelcontextprotocol/server-*`
or that declare `@modelcontextprotocol/sdk` as a dependency, read on the day the MCP phase starts (Phase 6 since 2026-11-12), each over
every published version.**

Chosen by a rule rather than by hand so the corpus cannot be picked to flatter `diff`. Downloads
weight it toward servers agents actually run, where an unannounced break costs the most. Every
version is snapshotted with `apicontract snapshot` and the list, versions and snapshot hashes are
committed beside the reading, so a second run reproduces it.

**Revisit:** if fewer than 10 such packages have three or more published versions, widen the rule to
the top 20 and keep the 10 with the longest history.
