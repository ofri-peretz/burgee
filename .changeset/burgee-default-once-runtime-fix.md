---
"burgee": patch
---

Help and a failure's `options:` rows print an option's or argument's default once: a description that already names it in a parenthesis (`(default: the current directory)`, `(default origin/main)`, `(defaults to …)`, `(the default)`) is no longer followed by `(default: <value>)`. A thrown value that falls through to `RUNTIME` keeps the `hint` and `fix` it carries, so `Object.assign(new Error(message), { fix })` prints that `fix:` and no usage block, exit 1 (D-20261124-help-default-once).
