---
"burgee": patch
---

`burgee/yargs`: turning the version off with `.version(false)` after the manifest was first read now drops it from the manifest, so `--schema` and the MCP handshake stop reporting the old version.
