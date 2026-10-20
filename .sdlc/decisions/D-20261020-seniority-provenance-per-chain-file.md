---
id: D-20261020-seniority-provenance-per-chain-file
subject: 'seniority R7 says "the chain appears in `explain`", and R3 says every value carries the file and line that set it. On main a config that `extends` another loads as one layer with one `path`: seniority cites a parent''s value at the child, and burgee joins the whole chain into one `location` and drops the line. What does provenance cite for a value set in an `extends` chain?'
taken: Taken
date: '2026-10-20'
superseded_by: —
---

**Each key is cited at the file in the chain that set it, with that file's line. The whole chain is not printed beside every value.** R7's chain clause is restated to mean this.

**What changed.** `Layer` gains an optional `origins`: key → `{ path, line? }`. `loadWithExtends` records it when the file extends something. For each top-level key it records the nearest file in the chain that set the key, and that file's own line. `resolve`'s `fromLayer` reads it. A key absent from `origins` is cited at `path` and `lines`, as before. A file that extends nothing gets no `origins`, so its shape is unchanged, and every `discover` result a caller already handles reads the same. burgee's `config-layers.ts` passes the loaded layer through whole, in place of `{ path: chain.join(' ← '), data }`. That fixes two defects:

- **A value only the parent set named the child.** Example: `retries` set in `base.json` and read through `app.config.json`. Provenance said `app.config.json`, a file that does not contain it. Now it says `base.json:3`.
- **burgee had no line at all.** The join dropped `lines`, so `--explain` and `meta.provenance` never cited a line for a config file. That is why intent criterion 3 ("`explain(key)` naming the file **and line**") held in seniority's unit tests and failed in the only engine that ships it. `packages/burgee/src/precedence-vectors.test.ts` failed on main on exactly this and passes now.

**Why not print the chain.** The old burgee output named every file of the chain for every key, e.g. `base.json ← team.json ← app.config.json`. That names two files that did not set the value. Provenance exists so a person or an agent opens one file and finds the value. A list where the right file is one of three does not do that. The chain is still recorded on `loaded.chain`, where `discover`'s caller can print it.

**Two edges, stated.** A key that two files in the chain set as objects is deep-merged. It is cited at the nearer file, which set the half that is on top; the parent's nested keys are not cited one by one. The line is the nearer file's own line for that key. A line from another file is never borrowed. The `package.json` field still has no line. burgee builds that layer from the parsed manifest, and `lineOf` reads top-level keys only, so a nested field needs a depth-aware scan. It stays open in the intent's Status table, not done half-way.

**Compatibility.** Only the `location` of a value inherited through `extends` changes, from the leaf file (seniority) or the joined chain (burgee) to the file that set it. A `line` is added where none was. No incumbent façade reads `origins`. cosmiconfig's `$import` and lilconfig keep their own merge, and their grades are re-measured in the PR.
