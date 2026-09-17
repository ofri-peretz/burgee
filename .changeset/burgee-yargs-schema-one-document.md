---
'burgee': patch
---

`--schema` on a yargs-shaped CLI now emits the same document as the other two front ends.

`yargs/factory.ts` hand-rolled `JSON.stringify(schemaOf(manifest), null, 2)` where `execute.ts` and `commander/command.ts` both call `machineJson(value, head)`. The façade therefore could not see `--format=json-pretty` — the escape hatch R1 added for the person debugging a schema — and emitted the indented document unconditionally. On the fixture this change is tested against, a plain `--schema` wrote **365 bytes through yargs against 240 through the engine and through commander**: the same value, 52% more bytes, and no way to ask for either form.

**What changes for a caller.** A yargs-shaped program's `--schema` is now compact by default, and indented only when `--format=json-pretty` is passed. Both documents parse to the same value, so a reader that parses is unaffected; a reader that diffed the raw bytes, or eyeballed the stream, will see the compact form where it used to see the pretty one.

The cost is **+71 bytes** on `burgee/yargs` bundled (114,738 → 114,809): `machineJson` and its flag constant could previously be tree-shaken out of that entry, and now cannot. `burgee` core and `burgee/commander` are unchanged to the byte. That entry is already over `lighter-than-yargs` (1.032 → 1.033), and this makes it marginally worse on purpose — three front ends that disagree about what `--schema` means is not a weight saving, it is a defect the weight measurement was hiding.

The property is now locked end to end rather than per writer: `machine-json.test.ts` drives one CLI definition through all three front ends and asserts the bytes are identical, in both the compact and the pretty form. The two suites that existed before were each true of a single writer in isolation, which is how three writers came to disagree.
