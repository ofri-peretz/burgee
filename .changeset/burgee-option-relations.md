---
'burgee': minor
---

Options can declare `dependsOn` and `exclusive`, and the declaration is enforced rather
than documented.

They are an **alias**, not a second engine: `exclusive` desugars to `conflicts` and
`dependsOn` to `implies`, into the `Relation` union that already existed. Command-level
`relations` are evaluated first and the derived entries after, so no existing command
changes which error it reports first.

The second spelling exists because it is the one the two incumbents use on the *option*
rather than on the command — commander's `.conflicts()` / `.implies()` and yargs'
`conflicts` / `implies` both hang off an option, and a drop-in that only accepts the
command-level form is not drop-in.

Enforced at parse time through the existing usage path: `UsageError`, exit 2, text
`error: --out requires --force` with `hint: pass --force`, and `--json` gives exactly
`{ok:false,error:{code:2,message,hint}}`. No new error shape.

Refused at *definition* time when a name is not an option of that command, or is the
option itself. Both are silent at run time, in opposite directions: the first can never
fire, the second always does.

Projected three ways, because a relationship a caller cannot see is a relationship they
will violate: `--schema` carries both spellings, help renders `(requires --force)` and
`(conflicts with --table)` — it rendered no constraint of any kind before this — and the
Fig spec emits `dependsOn` / `exclusiveOn`, Fig's own two keys.
