---
"burgee": patch
---

burgee's own commands move to `program.js`; `cli.js` stays the bin and still re-exports them. Importing the definitions no longer runs the CLI.
