---
'bellpull': patch
'burgee': patch
'caique': patch
'closeout': patch
'flagstaff': patch
'linegauge': patch
'paratext': patch
'roundel': patch
'seniority': patch
---

`schema.json` constrains token names, because it was promising something no host honours.

`tokens` was described as any name to a `#rrggbb` colour. `roundel`'s `validate()` accepts
ten semantic names — `error`, `warn`, `ok`, `hint`, `muted`, `command`, `flag`, `value`,
`heading`, `ground` — and throws on everything else. So a plugin author doing exactly what
their own `E_PLUGIN_SCHEMA` error tells them, comparing their object against
`roundel/schema.json`, got a green from the schema and `"accent" is not a token` from
`register()`. Measured 2026-09-16 with `{ accent: '#336699' }`.

The schema now carries `propertyNames.enum`, and `scripts/plugin-contract-lock.test.ts`
pins the enum and the runtime set to each other from both sides, so neither can grow a
name the other does not know.

Every host ships a byte-identical copy of this file (`plugin-schema-lock.test.ts` asserts
it), which is why nine packages are listed. Only the key `roundel` owns is constrained:
describing `widgets`, `handlers`, `sources`, `resolvers` or `commands` in a file all eight
hosts share is what made *flagstaff* start validating caique's key last time
(`PluginError: plugin.widgets.later: expected object, got boolean`), and those stay in
`plugin-schema-lock`'s `UNDESCRIBED` list with that reason.

`linegauge` is in the list for a different change: `ceilings.json`'s R9 block now records
the bar as D1's tree-inclusive ceiling — 83,538 against 170,342, a ratio of 0.4904 — and
keeps the superseded `get-east-asian-width` bar beside it with the count of entries that
cleared it.
