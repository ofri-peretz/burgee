---
"flagstaff": minor
---

`flagstaff/progress` reports to an MCP client instead of drawing. Inside a burgee `--mcp` tool call whose client sent `_meta.progressToken`, the bar sends each count as `notifications/progress`, with its static line (`12/30 files · 40%`) as the message, and draws nothing into the tool result. Anywhere else it draws as before. The bridge is on the `flagstaff/progress` subpath only: `progress` from the root `flagstaff` entry always draws, so a program that never serves MCP does not pay for it.
