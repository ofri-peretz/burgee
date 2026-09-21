---
'flagstaff': patch
'caique': patch
---

A `__proto__` key in a caller's corpus stays a style.

`fromCliSpinners` and `fromCliBoxes` built their maps by assigning `map[key] = value` over
the caller's JSON. JSON can carry the key `__proto__`, and that assignment hands it to the
prototype setter rather than defining a property: the entry vanished from the plugin *and*
whatever it held became the fallback that every other `lookupSpinner` and `lookupBorder`
inherited. Both now build with `Object.fromEntries`, which defines an own property for
every key, and the returned map keeps `Object.prototype`.

The registry's `deepFrozen` copy and caique's prompt binding write the same shape from a
loop they cannot turn into an expression, and use `Object.defineProperty` instead.

`flagstaff/import` is 80 bytes lighter for it — 838 B to 758 B — because two loops became
two expressions.
