---
"burgee": minor
---

`--mcp --print-config` prints the `mcpServers` block that starts this program as an MCP server, ready to paste into a client's configuration. A program started as one of its package's bins, through the symlink npm installs or by its own path, is started by that bin's name, through `cmd /c` on Windows, where npm installs it as a `.cmd` shim a client cannot start directly; anything else is started as `node` with the script's full path. The server is keyed by the program's name. It is read on burgee's own API; the commander and yargs front ends do not read it yet.
