---
'flagstaff': patch
'roundel': patch
---

One door into the registry, and a `check` that grades what it actually found.

`registered()` handed out the live registry behind a `Readonly<Registry>` type that freezes
property bindings, not the `Map`s behind them — so `registered().spinners.set(…)` put a
spinner with no static projection where `spinner()` would find it, and `.clear()` removed
the built-ins. It now returns a copy over the frozen objects `register()` stores, which
makes U3's "a contribution without a static projection is refused at the door" a property of
the code rather than advice. Registering also copies: edit your plugin object afterwards and
the registry does not change.

`flagstaff check` opens with a census of the contributions it found and closes with the
verdict, so `ok` is never printed before the rendering that would justify it. A plugin whose
keys are misspelled — the schema allows unknown keys on purpose, for the rest of the family —
is now `E_NO_CONTRIBUTION` and exit 1 with the unknown keys named, rather than `ok` and exit
0. Each component block states the state it was rendered with: a component may declare
`sample: { running, done }`, and without one the assumed `{ phase }` shape is said out loud
instead of silently invented. A `static` that throws is `E_COMPONENT_THREW` with a fix and
the modes it broke in, rather than an uncaught crash after an `ok`.

roundel is bumped with it because the plugin schema is hosted in both packages and both
publish it: `packages/roundel/src/schema.json` gained the same `sample` key, and
`plugin-schema-lock.test.ts` requires the two to be byte-identical. Without a roundel
release the copies would agree in git and disagree in the registry — the contract's own
"byte-identical in every tarball" rule holding in the repository and breaking where anyone
would actually read it. This is the first contract change since roundel became a plugin
host, so the pairing is worth establishing now rather than after the second one.

Both of those codes are now members of the exported `PluginErrorCode`, which is the union
every refusal in the family comes from. They were bare string literals inside `cli.ts`, so a
second host could have spelled either one its own way and nothing would have noticed — the
plugin contract's "one error vocabulary" held only as long as nobody tested it. `refuse()`
takes `PluginErrorCode` rather than `string`, and a repo lock reads each host's declaration
out of its source and refuses any `E_…` literal that is not in it. The union is a type, so
this costs no bytes on any subpath.
