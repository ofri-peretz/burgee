---
'burgee': patch
---

Six designs now say what their package offers, how a consumer extends it, and what it
deliberately does not do — derived from `package.json`'s `exports` map and `src/plugin.ts`,
not from the README.

`burgee`, `roundel`, `flagstaff`, `caique`, `closeout` and `bellpull` each gain two sections:
a table with one row per published subpath and the exported names behind it, an extension
section stating what a plugin may contribute, what is validated, what is refused and what
happens on a bad one — and a record of every claim the design was making that the code does
not support. Each table carries the two commands that re-derive it, so the next reader checks
rather than trusts.

The findings are the point. `roundel/import` (`fromBase16`, `fromITerm`) is described in
`roundel`'s R11 and in its shipped README and exists in neither the `exports` map nor `src/`.
`bellpull`'s R7 promises a root default export matching `execa`'s and a `./run-path` subpath;
neither exists, so the `npm-run-path` override recipe cannot be written, and R3's `which` is
spelled `whichSync` in the code while R5's `toJSON` is `toJson`. `closeout`'s R6 promises a
root default matching `signal-exit`'s, and the root has no default export.
`flagstaff`'s R6 names `flagstaff/table` as the `cli-table3` façade — `./table` is the
built-in grid component and `./cli-table3` is the façade, so a reader following R6 imports the
wrong module — and its R10 "depends on `roundel` only" is contradicted by the package's own
shape test, which asserts three dependencies.

Two structural findings cross package lines. **burgee's `definePlugin` is not the shape the
layers register against.** `manifest.ts` declares `{ name, commands?, hooks?, enforce? }` —
no `contract`, no layer key — validates nothing (its body is `return plugin;`), refuses
nothing, and has no `src/plugin.ts`, so it is outside the vocabulary lock that polices every
other host. Plugin-contributed commands bypass `defineCommand`, so the reserved-name guard
and `checkDefinition` never run on them, and a plugin option named `json` silently overwrites
the envelope flag. **And the shared `schema.json` describes none of the three newest keys:**
`widgets`, `handlers` and `resolvers` validate only because the root sets
`additionalProperties: true`, so `caique`, `closeout` and `bellpull` each publish a schema
that says nothing about the one key they host — and announces itself as flagstaff's file.

Documentation only: no `packages/**` file is touched, and `npx tsx scripts/plan-progress.ts`
prints the same 22/36 before and after, byte for byte.
