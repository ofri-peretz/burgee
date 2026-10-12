---
"burgee": minor
---

`--mcp` lists `outputSchema` for a command that declares `output.schema`. The schema is listed as declared when it is an object type, and wrapped as `{ "type": "object", "properties": { "result": … }, "required": ["result"] }` otherwise, the same way `structuredContent` wraps a result that is not an object. A declared command's `structuredContent` is wrapped by its schema rather than by the value, so it always has the shape the tool advertised. A command without `output.schema` lists no `outputSchema`. JSON a handler printed without a boolean `ok` is not read as an envelope, so it carries no `structuredContent`. The `Tool` type gains the optional `outputSchema`.
