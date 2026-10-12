---
"burgee": minor
---

Every program prints an Agent Skill. `--skill` writes a `SKILL.md` to stdout, projected from the declaration: front matter with a `name` and `description` within the Agent Skills specification's limits, what the program is for, the contract an agent relies on (`--json` and its envelope, `--explain`, every exit code with its error kind and whether to retry), and one line and the first example per command. A command's options stay behind `--schema <command>`, which the skill names and never inlines. A root that declares its own `skill` option keeps it.

`burgee skill <entry>` writes `SKILL.md` and `AGENTS.md` (the same body under an `AGENTS.md` heading, no front matter) into the directory of the `bin` the entry's package.json names, or `--out <dir>`. `--check` writes nothing and exits 1 when the files there differ from the projection, naming them and the line that regenerates them, for an author's CI.

Root help's line for agents names `AGENTS.md` when one sits beside the binary or in the directory above it. Without the file the line is unchanged.
