---
"flagstaff": patch
---

The JSON Schema walker the plugin host validates with reads four more keywords: `anyOf`, `enum`, a list of types, and a `$ref` into draft-07 `definitions`. flagstaff's own plugin schema uses none of them, so no plugin is accepted or refused differently. burgee's tests use them to validate every message its `--mcp` server writes against the MCP 2025-06-18 schema.
