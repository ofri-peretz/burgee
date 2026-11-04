---
"burgee": patch
---

Six fixes.

- **`--mcp` turns off a boolean a lower layer turned on.** An agent's `false` went as `--no-<name>` only for an option with a `true` default or an `env` of its own. A program's `envPrefix` binds every option (`TIDY_COLOR=1`), and config discovery sets options by name, so under either the command read `true`. For a program with neither, a `false` is still left unsaid, so it never trips `dependsOn` or `exclusive`.
- **`burgee migrate` reads a `/` after `return`, `typeof`, `case`, `in`, `of` and the other expression keywords as a regular expression.** ``return /`/.test(c)`` read as a division; its backtick opened a template that ran to the end of the file, and every import below it was missed.
- **`burgee migrate` counts the braces inside a template's `${…}`, and steps over the strings and templates nested in it.** ``${xs.map(({ n }) => `…`)}`` ended the interpolation at the `}` of `({ n })`, and the imports after it were missed.
- **`burgee migrate` reads a `minimumReleaseAgeExclude` block list written at its key's own indentation** (`key:\n- roundel`), as YAML allows, and a block list in a CRLF file. Before, either read as no exemptions.
- **`fieldId` tells apart brands that differ only in which optional field holds a value.** `{ sheen: 0.5 }` and `{ bevel: 0.5 }`, or a shape and markings of the same text, hashed alike and shared their SVG defs on one page. Every id that was already unambiguous is unchanged, including those in the committed brand assets.
