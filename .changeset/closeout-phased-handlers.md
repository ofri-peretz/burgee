---
'closeout': minor
---

Shutdown order is now data rather than registration order, and `closeout/plugin` hosts
`handlers`.

A handler declares a **phase** — `flush`, `release` (the default) or `restore` — and
`PHASES` declares the sequence. Phases run *in sequence*, so an async handler in `flush`
settles before `release` begins; handlers inside one phase run together, in registration
order. Terminal restore moves into `restore` and is therefore last, always.

This closes a failure that registration order could not: the cursor's restore was registered
by whichever renderer hid the cursor, usually the moment it first drew, so anything
registered afterwards ran *after* the terminal had already been handed back — cleaning up
nothing it was registered to clean up. An order that depends on import order is not an
order.

`closeout/plugin` is the new subpath (`plugin-contract` R5a): `register()` keeps a plugin's
`handlers` and ignores every other layer's keys, `attach(registry)` wires each into its
phase, and `contributions()` projects the whole shutdown sequence without running any of it.
A plugin may use `flush` or `release` and not `restore` — R5a says a plugin's cleanup runs
"never after" terminal restore, and that is enforced at the door rather than asserted in
prose. `closeout/schema.json` is exported too, because it is the specifier this package's own
`E_PLUGIN_SCHEMA` fix names.

Past the deadline, later phases are still **run** — they are only no longer waited for. A
handler that hangs in `flush` does not get to decide that the cursor stays hidden.

Existing callers are unaffected: `onExit(handler)` still works and lands in `release`, which
is before `restore`.
