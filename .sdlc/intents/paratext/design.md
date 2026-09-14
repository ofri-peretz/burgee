# Design — `paratext`

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/design.md).

**Accepted at the Design→Build gate 2026-09-13** under the owner's standing instruction to
proceed, recorded here rather than assumed. Most of R1–R7 was built before this design
existed; the design describes the built thing so the remaining requirements have a base to
be measured against. R8–R12 are the unbuilt half.

---

## Requirements

- **R1** A *capability* is data: `{ name, osc, when, encode, fallback }`. `osc` is the
  sequence number, `when` the support predicate over a `Runtime`, `encode` a template that
  turns fields into the OSC payload, `fallback` a template for the static projection.
  Built: `capability.ts`.
- **R2 (Y5)** `emit(runtime, name, fields)` returns the encoded sequence when `when` holds
  and the rendered `fallback` otherwise. **It never returns an empty string and never emits
  OSC on an unknown terminal.** Built and tested ("the projection, which is the point").
- **R3** `register(capability)` adds or replaces by name; `reset()` clears; `capabilities()`
  lists. The seven built-ins register through the same call at import. Built.
- **R4** `check(candidate)` validates a capability against `schema.json` and returns the
  violations by path, so a plugin that misspells a field is told which. Built.
- **R5 (Y9)** One file reads `process`: `runtime.ts`, exporting `processRuntime()`. Every
  other function takes a `Runtime`. Built; `process-reference-lock` should list it.
- **R6** The template language (`{field}` substitution with `fieldsUsed()` for introspection)
  is the whole of the encoding — no per-capability code. Built and tested.
- **R7** Seven built-ins: `bell`, `clipboard` (OSC 52), `cwd` (OSC 7), `image` (OSC 1337),
  `link` (OSC 8), `notify` (OSC 9 / 777), `title` (OSC 0/2). Built.
- **R8 (Y3)** Default export call-compatible with `ansi-escapes` for its OSC members
  (`link`, `image`, `setCwd`, `beep`, `clearTerminal` is CSI and out of scope). Not built.
- **R9 (Y7)** `ansi-escapes`, `terminal-link`, `term-img` vendored into `compat-oracle`,
  graded `--control` first; CSI cases of `ansi-escapes` recorded as out-of-scope in the
  baseline rather than as failures. Not built. **Until it lands, the npm description's
  "drop-in" claim is removed** (decision 3 of the ecosystem plan).
- **R10 (plugin-contract)** `schema.json` becomes the family schema with paratext's shape
  under `capabilities`. **Half built (PLAN 1.1).** The schema half is done: the capability
  shape is `$defs/capability`, reached through a `capabilities` key, and all three
  `packages/*/src/schema.json` hash to one value. `check()` reads
  `$defs/capabilityDocument` and takes either shape, the bare one with a `deprecated:` line
  (PLAN D2 — accepted for one minor release, removed at 1.0). *One object registering into
  all three hosts* is not built: paratext still has no `src/plugin.ts` and no `register()`
  that takes a plugin document, which is PLAN 1.7's work.
  **It cost flagstaff five byte budgets and they are not raised.** `dist/schema.json` goes
  3,451 B -> 6,531 B, and every flagstaff entry that reaches the plugin registry carries it:
  `.` 31,474/29,000, `./plugin` 14,623/12,000, `./spinner` 15,551/12,500, `./tasks`
  15,962/13,000, `./box` 17,282/15,000 — ten red assertions in
  `packages/flagstaff/src/weight.test.ts`, none of them touched here. The budget is per
  *entry point*, the schema is one *file*, and folding a section in makes every host pay for
  every other host's contract. Two ways out, and the second is the one to take: raise the
  five budgets (the product claims survive — `./spinner` at 15,551 B is still under ora's
  17,891 B), or split publication from bundling — keep one byte-identical `src/schema.json`
  as the contract each package exports, and have `schema-to-dist.mjs` project it to the
  sections that host actually validates.
- **R11 (Y8)** Ceilings in `.sdlc/bands/foundation-ceilings.json`; a B4 row. Not built.
- **R12** First same-repo consumer: `flagstaff/table` and `flagstaff/box` link paths via
  `paratext`. Proves Y1's arrow down and gives the consolidation a number. Not built.

## Design

```text
packages/paratext/src/
  capability.ts   R1–R4  the record, the registry, emit(), check()
  template.ts     R6     {field} substitution, fieldsUsed()
  builtins.ts     R7     seven records, registered at import
  runtime.ts      R5     Runtime shape; the one process read
  schema.json     R4/R10 the contract; to become the family's
  index.ts               re-exports; R8's default export lands here
```

**Why a registry and not a function table.** Terminals invent OSC codes faster than a
package ships. Kitty's graphics protocol, WezTerm's user-vars, Ghostty's progress bar — each
arrived between releases of `ansi-escapes`. A capability that is data can be added by a
plugin the week the terminal ships; a function cannot. This is also why R10 matters more
here than in roundel: a theme is nice to plug in, a capability is *necessary* to plug in.

**Why the fallback is not optional.** `terminal-link` on an unsupported terminal prints the
URL after the text in parentheses. `ansi-escapes` prints the raw OSC. `term-img` throws. Three
packages, three answers, and the *caller* cannot know which without reading source. Here
the capability says what it degrades to, and `emit()` never has a third behaviour.

**Order.** R9 first (it grades R7 and tells us where R8 must match) → R8 → R10 (with the
roundel/flagstaff schemas, one PR) → R11 → R12.

## Verification

- `npx vitest run --root packages/paratext` — 23 tests today across seven groups.
- `sha256sum packages/*/src/schema.json | awk '{print $1}' | sort -u | wc -l` — 1 (R10).
- `npm run compat -- ansi-escapes terminal-link term-img` after R9.
- **The check that would have caught the original problem** — the original problem is a
  package on npm with no intent. `scripts/intent-artifacts-lock.test.ts` gains the rule:
  every `packages/<name>` with a published version has `.sdlc/intents/<name>/intent.md` and
  `design.md`. Proven to fail by moving this directory aside.

## Rejected alternatives

- **Extending `ansi-escapes` upstream.** Its maintainer declined runtime detection by
  design ("emit and let the terminal ignore"); the fallback behaviour is the whole
  difference and cannot be a PR.
- **Detecting support by querying the terminal (DA1/XTVERSION).** Round-trips on stdin,
  hangs under a pipe, and still cannot answer per-capability. A table plus a fallback is
  honest about what is knowable.
- **A fixed list of built-ins with no `register`.** Rejected for the reason in "Why a
  registry".

## Out of scope

- CSI: cursor, erase, scroll regions (`ansi-escapes`' larger half). That is `closeout` (to
  undo) and `flagstaff` (to draw).
- Reading files for `image`. The caller owns I/O; this package owns bytes-to-escape.
- Any styling. `link` returns the text unstyled; wrap it in a `roundel` token.
