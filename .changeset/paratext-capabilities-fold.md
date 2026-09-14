---
'paratext': minor
'flagstaff': patch
'roundel': patch
---

paratext validates against the family plugin schema, with its shape under `capabilities`.

paratext shipped its own `schema.json` whose root *was* one capability, so the family had
three plugin schemas where the contract says one (PRINCIPLES 14, `plugin-contract` R2).
The capability shape is now `$defs/capability` of the shared file, reached through a
`capabilities` key beside `spinners`, `tokens` and `components`, and
`packages/*/src/schema.json` hashes to one value. flagstaff and roundel ship the same
bytes: their published `./schema.json` gains the capability definitions and nothing about
what they validate changes.

`check()` follows the schema's `$defs/capabilityDocument` and takes either shape:

- a plugin carrying its capabilities under `capabilities`, which is where they live from
  now on, and whose problems are reported at `capabilities.<key>`;
- **deprecated** — one capability written as the whole document, which is what a 0.2
  capability file looks like. It still validates, and `check()` returns a `deprecated:`
  line saying to move it under `capabilities`. paratext 1.0 stops accepting it
  (`.sdlc/PLAN.md` D2).

`refusals()` and `isDeprecation()` are exported to tell the two kinds of line apart; the
lines that are not deprecations are the ones that block, and the ones `register()` throws
on. `register(capability)` is unchanged: it takes one capability, not a document, so it
neither reports nor accepts the document-level deprecation.
