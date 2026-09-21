---
"burgee": minor
---

`burgee migrate` — the mechanical path from commander or yargs to burgee.

Every migration that actually happened shipped the codemod before the wave, not after it:
`jest-codemods`, `pnpm import`, `biome migrate eslint`. burgee already had the strongest
possible version of the claim — change one import and commander's own 1,360 tests still pass
— and no path from *could* to *did*.

```
$ burgee migrate --dry-run
files: 3
imports: 3
mapped: [{"from":"commander","to":"burgee/commander","imports":3,"files":3}]
refused: []
detected: {"declared":["commander"],"imported":["commander"]}
dependencies: {"before":["commander"],"removable":["commander"],"after":0}
graded: [{"host":"commander","reference":1360,"passed":1360,"rate":1}]
```

It detects hosts from two independent sources that are allowed to disagree — `package.json`
and the specifiers source actually imports — rewrites `commander`, `yargs`, `yargs/yargs`
and `yargs/helpers` across all five specifier positions, and **refuses by file and line** on
a deep import or a non-literal dynamic specifier, leaving that whole file untouched (D-051).
It refuses a dirty git tree unless `--force`, writes nothing under `--dry-run`, never edits
`package.json` (D-054), and never touches an API call site (D-053). The compat figures are
read from `compat-oracle`'s baseline through a lock, never typed into the report.

**Specifiers, not syntax trees** (D-050): a scan over five known positions needs no parser
and therefore no dependency, and it is the fast choice as well as the rule-2 one. Measured
over a generated 1,000-file tree: **the whole scan phase is 17 ms** and **the slowest single
file 0.074 ms** against a 1 ms budget; the rest of the command is filesystem.

The gate is `examples/demo-cli-commander`, which holds the same program written twice — once
against `commander`, once against `burgee/commander` — and predates this feature. Migrating
the commander variant produces the hand-written drop-in's import byte for byte.

The engine gains one thing on its behalf, in `execute.ts`: a command's result may name an
`exitCode`, and `emit` honours it. Before this there was exactly one success path and it left
with `OK`, so a command could emit a document *or* fail, never both — and an agent migrating
a repository unattended needs the refusal list **and** the code. **162 bytes** measured
(60,661 → 60,823 on the root entry), opt-in by naming the field. `migrate` itself is 10,878
bytes loaded through a dynamic import and is denied to the root entry by name, so
`import 'burgee'` never reaches it.
