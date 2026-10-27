---
"burgee": patch
---

A `burgee/yargs` program that ends in `.parseSync()` now answers `completion <shell>` and `--mcp` instead of crashing with `YError: .parseSync() must not be used with asynchronous builders…`. Under `parseSync()` the completion module is required synchronously and still stays off the start-up path. The MCP server runs on after `parseSync()` returns. `completion` with an unknown shell now runs the program under `.parse()` and `.parseAsync()` as well, as it would on yargs, where before it did nothing. `burgee migrate` now pins the packages it adds in the project's own style. It pins exactly, with the installer's exact flag, when every runtime dependency is exact or when the incumbent is. It uses `~` when the incumbent does, and `^` otherwise.
