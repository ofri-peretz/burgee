---
"burgee": patch
---

The plugin host refuses a hook `filter` that is not `{ command: RegExp }` when the plugin is registered. Until now a string `command` was accepted, reported by `burgee check` as "commands matching deploy", and threw a `TypeError` on the first run of any command. A bare RegExp used as the whole filter has no `command`, so its hook fired for every command. A contributed command's refusal now carries the edit to make as its `fix`, taken from the refusal itself (`declare read_only, idempotent, non_idempotent — or withheld, …`), where it used to give one sentence for every command. A plugin with no `contract` is told to `add \`contract: 1\``. The README now shows a whole plugin as a default export, the `check --json` document with `data.name`, `data.commands` and `data.hooks[].stage`, the shape of a refusal, and how to build and run `check` from a clone.
