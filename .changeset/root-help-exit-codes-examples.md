---
"burgee": minor
---

Root help now carries what a caller branches on and what to type. It lists the `completion <shell>` command the engine serves, an `Exit codes:` section generated from `ExitCode`, and an `Examples:` section: the root's own (`defineProgram({ examples })`, new) or each top-level command's first example. `--schema` publishes `completion` beside the program's commands, and `completion --help` prints its help. `burgee dev` warns about a runnable command that declares no examples.
