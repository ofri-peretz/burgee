---
'burgee': minor
---

A handler can throw an error, or a plain `{ code, message, fix }` object, whose `code` names an exit code: `'USAGE'` exits 2, `'CONFIG'` 3, `'CANCELLED'` 4, `'AUTH'` 5. The message and fix print as usual. This lets caique's prompt refusals set the right exit status: a question that can't be asked without a terminal exits 2 and names the flag to pass instead, and a cancelled question exits 4, never 1. burgee still does not import caique. Any other string code, such as `ENOENT`, still exits 1.
