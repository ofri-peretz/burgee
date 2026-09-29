---
"burgee": patch
---

`burgee dev` serves a commander program as commander again. A `Command` has a `burgee()` method too, so it was recognised as a yargs instance: a tool call ran without the injected streams, writing onto the MCP channel, and read its argv `from: 'node'`, dropping the first two words. Four code paths no input could reach are removed from the engine, the MCP server and `burgee`'s own commands, which takes 27 bytes off the core bundle; behaviour is otherwise unchanged.
