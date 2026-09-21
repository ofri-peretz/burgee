# Design — `paratext`

Intent: [`intent.md`](./intent.md). Umbrella:
[`cli-foundation-stack`](../cli-foundation-stack/spec.md).

**Accepted at the Design→Build gate 2026-09-13** under the owner's standing instruction to
proceed, recorded here rather than assumed. Most of R1–R7 was built before this design
existed; the design describes the built thing so the remaining requirements have a base to
be measured against.

---

## Requirements

Status per requirement, and nothing here rounds up. A `Not built` says which file it is
waiting on. The `## What shipped` sections below carry the detail.

- **R1** A *capability* is data: `{ name, osc, when, encode, fallback }`. `osc` is the
  sequence number, `when` the support predicate over a `Runtime`, `encode` a template that
  turns fields into the OSC payload, `fallback` a template for the static projection.
  **Built** — `capability.ts`, `supports.ts`.
- **R2 (Y5)** `emit(runtime, name, fields)` returns the encoded sequence when `when` holds
  and the rendered `fallback` otherwise, and **never emits OSC on a terminal that is not
  believed to understand it**. **Built** — and the requirement's second clause, "it never
  returns an empty string", is **withdrawn as false**: five of the seven built-ins project
  to `''` on purpose. See *What the design claimed and the code does not do*.
- **R3** `register(capability)` adds or replaces by name; `reset()` clears; `capabilities()`
  lists. The seven built-ins register through the same call at import. **Built**.
- **R4** `check(candidate)` validates a plugin document against `schema.json` and returns the
  violations by path. **Built, and the claim is now bounded.** It was presence-checking only
  until 2026-09-16 — it read the capability's `required` array and hand-checked `encode` and
  `fallback` — which is measured below. `shape.ts` is the walk that closes it, and what it
  enforces is exactly: `required` (in `capability.ts`, for the message), `type`, `oneOf`,
  `const`, `minLength`, `minimum`, `items` and `additionalProperties: false`. That is every
  keyword `$defs/capability` and its nested `when` write. **Not** enforced, and listed so the
  next reader does not have to measure it again: `$ref`, `pattern`, `minItems`, `maxLength`,
  `enum`, `allOf`, `anyOf`, `not` — none of which appears under a capability, so the gap is
  potential rather than live, and a keyword added to the file tomorrow is unenforced until
  someone adds it to `shape.ts`. Every refusal names its path and carries a family error code.
- **R5 (Y9)** One file reads `process`: `runtime.ts`, exporting `processRuntime()`. Every
  other function takes a `Runtime`. **Built** — `grep -n "process\." packages/paratext/src/*.ts`
  names `runtime.ts` and one test's prose, and `packages/burgee/src/process-reference-lock.test.ts`
  holds the single allow-list entry.
- **R6** The template language — `{field}`, `{field|base64}`, `[ … ]`, and `fieldsUsed()` for
  introspection — is the whole of the encoding; no per-capability code. **Built** —
  `template.ts`, and the three rules are the whole language.
- **R7** Seven built-ins: `bell` (BEL), `clipboard` (OSC 52), `cwd` (OSC 50 + OSC 9;9),
  `image` (OSC 1337), `link` (OSC 8), `notify` (OSC 9), `title` (OSC 0). **Built.** Three of
  the codes in this requirement's first wording were wrong and are corrected above; see the
  claims section.
- **R8 (Y3)** Default export call-compatible with `ansi-escapes` for its OSC members.
  **Built** — `ansi-escapes.ts`, re-exported from `index.ts`. Graded **1 / 4, 25.0%**, which
  is this row's ceiling.
- **R9 (Y7)** `ansi-escapes`, `terminal-link`, `term-img` vendored into `compat-oracle` and
  graded `--control` first. **One of three built**, and the two that are not name an
  installed package rather than a judgement — both need a root-manifest edit, which is the
  integrator lane's file.
- **R10 (`plugin-contract`)** `schema.json` becomes the family schema with paratext's shape
  under `capabilities`, and one plugin object registers into every host. **Built** —
  `schema.json` and `plugin.ts`.
- **R11 (Y8)** A ceiling in `.sdlc/bands/foundation-ceilings.json`, and a B4 benchmark row.
  **Built, both halves, and neither half was this lane's to build.** The ceilings file
  carries a `paratext` entry — `ceiling: 30912`, the tree-inclusive bytes of `ansi-escapes`
  — and on 2026-09-16 the integrator re-measured every layer in one pass, because five of six
  had drifted and each package could only report its own drift. `ours` now reads **66,305**,
  up from the `57049` recorded on 2026-09-14: `64,059` of that was the schema walk this lane
  reported and could not edit, and the last 225 is `schema.json` growing a `propertyNames`
  enum on `tokens`.

  The B4 row exists as of 2026-09-16: `benchmarks/fixtures/entry-points.ts` carries a
  `paratext` ÷ `ansi-escapes` pair, with the incumbent pinned to **7.3.0, the exact version
  compat-oracle grades**, since the weight we compare against has to be the weight of the
  release whose own suite we pass. It measures **11,059 bundled bytes, a ratio of 2.542**,
  ratcheted at 2.55 in `RATIO_CEILING`.

  **Both numbers say this layer is over what it replaces, and neither is softened here.**
  2.145 tree-inclusive and 2.542 bundled. The ratchets exist to stop it growing while that is
  dealt with; they are not claims of being lighter, and `weight.ts` says so where they are
  written. This is the one foundation layer of six that does not hold against its D1 ceiling.
- **R12** First same-repo consumer: `flagstaff/table` and `flagstaff/box` link paths via
  `paratext`. **Built** — 2026-09-16, in the flagstaff lane, which is where the edit always
  had to be. `packages/flagstaff/src/link.ts` is the only module there that knows OSC 8
  exists and it implements none of it: it asks `supportsLink(runtime)` for *layout* — off a
  terminal the url is content and belongs in the columns, on one it rides a sequence that
  measures zero — and `linkFor(runtime)` for the bytes.

  **It took the narrow entry, and the measurement is why.** `paratext/link` reaches 2,410 B
  across 4 modules with no side effect at import; the root reaches 20,221 B across 10 and
  runs `registerBuiltins()`. That is 17,811 B against a `./table` entry whose whole budget
  was 4,000 B, and flagstaff declares `sideEffects: false`. R13's reason for existing,
  stated as a number by the first consumer to face it.

  The adoption also removed flagstaff's two inline OSC 8 sequences — the array-joined one in
  `cli-table3.ts`'s `hyperlink()` and its `HYPERLINK_TAG` terminator — without moving that
  façade's output by a byte, because upstream's `hyperlink()` is an escape builder graded by
  `utils-test.js` with no terminal in the call. cli-table3 still grades 29 / 29.
- **R13** A narrow published entry for OSC 8 — the sequence where the terminal is believed to
  do it, the static projection otherwise — that carries **no registry side effect at import**
  and is small enough to sit in a statically-imported cold-start graph. **Built
  (2026-09-15)** — `paratext/link`, **2,337 B**.
- **R14** A weight lock: every published entry point declares what it may reach and what it
  may weigh, and a new entry cannot ship without one. **Built (2026-09-15)** —
  `src/weight.test.ts`, the lock `closeout`, `caique` and `roundel` already carry.

## Every feature paratext offers

The list a consumer scans, rather than a tour. Three published entry points and one data
file; nothing else is importable.

### `paratext` — the root (20,221 B reachable, registers seven capabilities at import)

| What | Surface |
| :-- | :-- |
| The `ansi-escapes` drop-in | `default` (frozen, four members: `beep`, `image`, `link`, `setCwd`), and each as a named export |
| The same, bound to a runtime you supply | `ansiEscapesFor(runtime): AnsiEscapes` — nothing reads `process` |
| The CSI half of `ansi-escapes`' surface | 31 names declared and `undefined`, typed `NotImplemented`, plus `iTerm` and `ConEmu`. They exist so a drop-in *loads*; calling one is a compile error, not a 3 a.m. `TypeError` |
| The five capability records with no `ansi-escapes` name to collide with | `bell`, `clipboard`, `cwd`, `notify`, `title`, and `builtins` — the array of all seven |
| Registration | `register(capability)`, `registerBuiltins()`, `reset()` |
| Reading the registry without emitting | `capabilities(): string[]`, `capability(name): Capability \| undefined` |
| Emitting | `emit(runtime, name, fields): string` |
| Validating a plugin document | `check(document): string[]`, `refusals(lines)`, `isDeprecation(line)`, `DEPRECATED`, `CapabilityError` (which carries a family `code`) |
| The template language | `render(template, fields)`, `fieldsUsed(template)` |
| The process seam | `processRuntime(): Runtime`, and the `Runtime` type |
| Types | `Capability`, `Fields`, `Support`, `AnsiEscapes`, `ImageOptions`, `NotImplemented` |

### `paratext/link` — OSC 8 alone (2,337 B, registers nothing)

| What | Surface |
| :-- | :-- |
| A hyperlink against the real process | `link(text, url): string` |
| The same, bound to a runtime you supply | `linkFor(runtime): (text, url) => string` |
| The guess, asked without emitting | `supportsLink(runtime): boolean` |
| The record itself, for a host that wants to read or replace it | `LINK: Capability` — the same object `builtins.link` is |

### `paratext/plugin` — the host (17,710 B)

`CONTRACT` (`1`), `Plugin`, `validate`, `register`, `reset`, `registered`, `contributions`,
`Contribution`, `attach`, `CapabilityHost`, `PluginError`, `PluginErrorCode`. Described
under *Extending it* below.

### `paratext/schema.json` — the family plugin schema

6,531 B, byte-identical across all seven hosts (`bellpull`, `caique`, `closeout`,
`flagstaff`, `paratext`, `roundel`, `seniority` — one sha256 on 2026-09-15). It is the file
`E_PLUGIN_SCHEMA`'s `fix` string names, so it has to be reachable by the specifier the
message prints.

### The seven capabilities, with what each reads and what each prints when it cannot

| name | code | fields | when it is believed to work | projection on a pipe |
| :-- | :-- | :-- | :-- | :-- |
| `link` | OSC 8 | `text`, `url` | tty, and `TERM_PROGRAM` in iTerm.app / WezTerm / ghostty / vscode / Hyper / Apple_Terminal, **or** `VTE_VERSION` / `WT_SESSION` set | `Docs (https://x.dev)` |
| `image` | OSC 1337 | `base64`, `caption`, `width?`, `height?`, `preserveAspectRatio?`, `size` | tty, `TERM_PROGRAM=iTerm.app` | the caption |
| `notify` | OSC 9 | `title`, `body?` | tty, and iTerm.app / WezTerm / ghostty | `Done: 3 files` |
| `title` | OSC 0 | `text` | tty | `''` — a title is chrome; in a log it is noise |
| `clipboard` | OSC 52 | `text` (base64-encoded by the template) | tty | `''` |
| `cwd` | OSC 50 **and** OSC 9;9 | `path` | tty | `''` |
| `bell` | BEL | — | tty | `''` |

`TERM=dumb` refuses every one of them, before any other clause.

## Extending it — the `capabilities` plugin key

paratext hosts one key of the family plugin object. `src/plugin.ts` and `src/schema.json`
are the truth for this section; it was written by reading them.

**What a plugin is.** One plain object. `name` is required and non-empty — it is what a
shadowed capability is reported against. `contract` is optional and must be an integer no
greater than `CONTRACT`, which is `1`. Every key another layer owns — `tokens`, `glyphs`,
`spinners`, `borders`, `components` — is **ignored without complaint**, which is what makes
one object work on whatever subset of the family is installed.

**What a plugin may contribute here:** `capabilities`, an object of capability records keyed
by name.

```json
{
  "name": "acme-kitty",
  "contract": 1,
  "capabilities": {
    "kitty-image": {
      "name": "kitty-image",
      "osc": "BEL",
      "when": { "tty": true, "term": "xterm-kitty" },
      "encode": "_Ga=T,f=100;{base64}\\",
      "fallback": "{caption}"
    }
  }
}
```

**The contract, field by field** (`$defs/capability`, `additionalProperties: false`):

| field | required | what it is |
| :-- | :-- | :-- |
| `name` | yes | how callers reach it. Registering an existing name **replaces** it — deliberate, so a caller whose terminal we mis-detect corrects the guess in three lines rather than forking |
| `osc` | yes | the code as an integer, or `"BEL"` for the bell and for protocols that are not OSC at all, such as Kitty's. Documentation for a reader and a key for `check` |
| `when` | yes | `{ tty?, termProgram?[], envAny?[], term? }`. Every clause must hold; `termProgram` and `envAny` are ORs within themselves |
| `encode` | yes | the bytes as a template, non-empty |
| `fallback` | yes | what prints when the terminal cannot. `""` is a legitimate answer; **absence is not** |

**The template language is the whole encoding.** Three rules, because a capability has to
travel through JSON and a function cannot: `{field}` substitutes, `{field|base64}`
substitutes base64-encoded (OSC 52 needs it), and `[ … ]` is emitted only when every field
named inside it has a non-empty value. That last rule is what lets `notify` write
`{title}[: {body}]` and print `Done: 3 files` or `Done` without a branch.

**Registering, and what `attach` is for.** `register(plugin)` validates and records; it does
**not** reach the capability registry. `contributions()` then projects the whole plugin set —
each name, the plugin that won it, and the plugins it shadowed, in order — without executing
anything. `attach(host?)` is what hands the contributions over, defaulting to paratext's own
`register()`, the same call the built-ins go through. Later registration wins, like ESLint
flat config.

**What is refused, with the code and the fix:**

| refusal | code | when |
| :-- | :-- | :-- |
| not a plain object | `E_PLUGIN_SCHEMA` | a function, an array, `null` |
| no plugin name | `E_PLUGIN_SCHEMA` | `name` missing or `""` |
| contract too new | `E_PLUGIN_CONTRACT` | `contract` not an integer, or `> 1` |
| `capabilities` is not an object of records | `E_PLUGIN_SCHEMA` | an array, a string, an entry that is not an object |
| **a capability with no `fallback`** | `E_NO_STATIC_PROJECTION` | checked *before* the schema, because `fallback` is the field people leave out and "is required" would not tell them what they are giving up. The same code flagstaff raises for a component with no static form and caique for a widget with no `static` |
| key and `name` disagree | `E_PLUGIN_SCHEMA` | `{ "foo": { "name": "bar" } }` — refused rather than reconciled; guessing which the author meant is how a silent wrong answer gets built |
| a missing required field | `E_PLUGIN_SCHEMA` | `name`, `osc`, `when`, `encode`, `fallback`, read from the schema's own `required` list |
| a field of the wrong type | `E_PLUGIN_SCHEMA` | `when: 'x'`, `when.tty: 'yes'`, `when.termProgram: 'iTerm.app'`, `fallback: 1` — `type`, read from the schema |
| an `osc` that is neither | `E_PLUGIN_SCHEMA` | the schema's `oneOf`: `an integer ≥ 0 or "BEL"` |
| an empty `encode` or `name` | `E_PLUGIN_SCHEMA` | the schema's `minLength: 1` |
| a field the schema does not declare | `E_PLUGIN_SCHEMA` | `additionalProperties: false`, at the capability and inside `when` |

**What was *not* refused, measured rather than assumed — and fixed 2026-09-16.** Run
2026-09-15 against `dist/plugin.js`:

```js
register({ name: 'acme', capabilities: { x: {
  name: 'x', osc: { nope: true }, when: 'not an object',
  encode: 'e{text}', fallback: '{text}', extra: 1 } } });
// ACCEPTED
```

`osc` is declared `integer ≥ 0 | "BEL"` and an object passed. `when` is declared an object
and a string passed. `additionalProperties: false` is declared and `extra` passed. None of
the three was checked, because `check()` read the schema's `required` array and nothing else
of it. The `when` case is the one that mattered: destructuring a string yields four
`undefined` clauses, so `supports()` returned **true**, and a plugin with a typo there emitted
OSC into a pipe — precisely the failure this package exists to prevent, reachable through its
own documented extension surface. Measured again on `dist` the same way, the record came back
`"]8;;https://x.devDocs]8;;"` on a runtime with `isTTY.stdout: false`.

`src/shape.ts` closes it: a 40-line walk over the keywords the schema actually uses, wired
into `capabilityProblems()` so that **`register()` and `plugin.validate()` are closed by the
same call**. `register()` is the only way into the registry `emit()` reads — the built-ins,
`attach()` and a third party all go through it — so one refusal is what keeps a bad `when`
away from `supports()` rather than a guard further down. `supports()` also answers `false`
for a `when` it cannot read, which is belt rather than braces and is asserted separately in
`src/shape.test.ts` so that neither half can pass for the other.

**What it cost.** 2,500 B for `shape.js`, 120 B in `capability.ts`, 66 B of fail-safe in
`supports.ts`. Bytes were found before the ceilings moved: the walk came down from 2,661 B to
1,967 B, `capability.ts` stopped rebuilding its record and its message table per call, and
`plugin.ts` gave back 92 B by dropping the copy of `fallback`-is-required it kept beside
`capability.ts`'s. It then went back up to 2,500 B because
`maintainability/cognitive-complexity` scores the walk 18 against a ceiling of 15 as one
function, so it is five named ones — a lint rule this repository enforces bought 533 B, and
that is recorded rather than reversed. The remainder moved the two ratchets: `.` 17,535 →
**20,221 B** (budget 19,000 → 20,500) and `./plugin` 15,116 → **17,710 B** (budget 16,500 →
18,000). Both ceilings are tighter in relative terms than the ones they replace — 279 B and
290 B of headroom where there were 1,465 and 1,384.

Packed, `paratext` goes **57,049 → 64,059 B** unpacked (`npm pack --dry-run --json`, the same
measurement `benchmarks/axes/weight.ts` makes). `.sdlc/bands/foundation-ceilings.json` carries
the old figure as `paratext.ours` and is the integrator's to move, so it is reported here
rather than edited.

**A second contributed name is not a second registration.** `attach()` calls `register()`
once per *name*, so the last plugin to contribute `link` replaces it; `contributions()[].shadowed`
names the ones that lost, which is what a `burgee plugin check` prints.

## Design

```text
packages/paratext/src/
  capability.ts   R1–R4  the record, the registry, emit(), check()
  supports.ts     R1     the support guess, alone, so a subpath can ask without the registry
  shape.ts        R4     the walk over the schema keywords a capability record uses
  template.ts     R6     {field} substitution, fieldsUsed()
  link.ts         R13    the OSC 8 record and the `paratext/link` entry — imports no registry
  builtins.ts     R7     seven records (link re-exported from link.ts), registered on demand
  runtime.ts      R5     Runtime shape; the one process read
  ansi-escapes.ts R8     the incumbent's surface over emit()
  plugin.ts       R10    the `capabilities` host
  schema.json     R4/R10 the family contract
  index.ts               re-exports, and `registerBuiltins()` as an import-time side effect
  weight.test.ts  R14    what each entry may reach and may weigh
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
roundel/flagstaff schemas, one PR) → R13 → R11 → R12.

## Verification

- `npm test -w paratext` — **63 tests** across five files (43 before R13/R14).
- `sha256sum packages/*/src/schema.json | awk '{print $1}' | sort -u | wc -l` — 1 (R10).
  `scripts/plugin-schema-lock.test.ts` and `scripts/schema-sync.mjs` find paratext by its
  `src/plugin.ts`, so they assert this themselves.
- `npx eslint . --max-warnings 0` — a **separate CI job** from `npm run ci:local`. The
  default export needs the inline `import-next/no-default-export` disable that linegauge's
  and closeout's drop-in facades carry, for the same stated reason.
- **Weight, per entry point** — `src/weight.test.ts`, reading `dist/` after
  `scripts/strip-comments.mjs`, so it measures what is published:

  | entry | reaches | bytes | budget |
  | :-- | :-- | --: | --: |
  | `.` | everything, `schema.json` included | 17,574 | 19,000 |
  | `./link` | `link.js`, `template.js`, `supports.js`, `runtime.js` | **2,337** | 3,000 |
  | `./plugin` | `plugin.js`, `capability.js`, `schema.json`, `supports.js`, `template.js` | 15,116 | 16,500 |

- **Weight, as a published artifact.** `npm pack --dry-run` on paratext: **17,254 B /
  51,867 B** before this lane, **19,052 B / 57,032 B** after — **+10.42% gzipped, +9.96%
  unpacked**. `.sdlc/bands/artifact-size-baseline.json` allows 10%, so
  `npm run check:artifacts` reports one problem, on the gzipped figure alone, and the
  baseline is the integrator's file (`.sdlc/LANES.md`). The growth is the two new modules
  and their `.d.ts` — `strip-comments.mjs` takes the comments out of the `.js` and leaves
  them in the types, which is where editors read them.
- `npm run compat -- ansi-escapes --control` — 4 / 4; then `npm run compat -- ansi-escapes`,
  which ratchets against `packages/compat-oracle/baseline/ansi-escapes.json`. **1 / 4,
  25.0%, ▲ 0** on 2026-09-15, before and after this lane's change.

  **Run it from a checkout that resolves `paratext` to itself.** A worktree with no
  `node_modules` of its own resolves the bare specifier up to the parent checkout's, so the
  oracle grades *that* tree and reports the change as having done nothing — measured on
  2026-09-14, an identical `0 / 4` with no arrow for a build that was already green. `node
  --input-type=module -e "console.log(import.meta.resolve('paratext'))"` is the check, and it
  costs a second.
- **The check that would have caught the original problem** — the original problem is a
  package on npm with no intent. `scripts/intent-artifacts-lock.test.ts` holds the rule:
  every `packages/<name>` with a published version has `.sdlc/intents/<name>/intent.md` and
  `spec.md`. Proven to fail by moving this directory aside.

## What shipped (R13, R14 — the entry the engine could take — 2026-09-15)

`paratext/link`: `link(text, url)`, `linkFor(runtime)`, `supportsLink(runtime)`, and the
`LINK` record itself. **2,337 B reachable**, against the root's 17,574 B.

**The requirement came from a refusal, and the refusal was correct.** The engine lane wanted
`--help` to emit real hyperlinks and degrade to `Docs (https://x.dev)` on a pipe — paratext's
exact job, tested and working. It could not take the dependency, for two reasons that
compound:

- `--help` is rendered by `help.ts`, which `execute.ts` imports **statically**. Anything help
  reaches is in the cold-start graph of `burgee foo --json` as much as of `burgee --help`.
- paratext published `.`, `./plugin` and `./schema.json` and nothing narrower, and the root
  barrel runs `registerBuiltins()` as an **import-time side effect**, registering all seven
  capabilities.

So the offer was 16,955 B (17,574 B as of this change) and seven registrations on every
invocation for a help-only feature, or a dynamic `import('paratext')` of a barrel no bundler
can shake — and burgee has a documented 54,986 B failure from exactly that. Neither is a
thing to ask a consumer to accept, which is why the fix belonged here rather than there.

**Three decisions the build made.**

- **The record moved, it was not copied.** `LINK` is declared in `link.ts` and `builtins.ts`
  re-exports it as `link`, so the capability the registry ships and the one the subpath emits
  are one object. A second copy would have passed every test in this package on the day it
  was written and drifted on some later one; the mutation table below shows the shared
  object failing `paratext.test.ts` and `ansi-escapes.test.ts` as well as `link.test.ts`,
  which is the proof that it *is* shared.
- **`supports()` moved to `supports.ts`.** It lived in `capability.ts`, which imports
  `schema.json` — 6,531 B of plugin contract, correct for a host validating a plugin and
  absurd for a caller asking whether this terminal does OSC 8. `capability.ts` re-exports
  both `Support` and `supports` unchanged, so no caller moved with it.
- **The subpath does not consult the registry, and says so.** A caller who corrected our
  guess by re-registering `link` globally does not change what `paratext/link` returns — the
  registry is the thing it deliberately does not load. A host that wants the registry's
  answer imports `paratext` and calls `emit`. Stating it is the point: the alternative was a
  subpath that silently disagreed with the root.

**It cost the root 619 B.** 16,955 → 17,574, two new module boundaries and their re-export
lines. Recorded rather than smoothed: the narrow entry is worth it at a factor of seven, and
the number that pays for it is on the other side of the trade.

### Proven red before green — three mutations, each a plausible wrong implementation

| Mutation | Result |
| :-- | :-- |
| `link.ts` imports `./index.js` — the registry side effect the subpath exists to avoid | `./link` budget **17,595 vs 3,000**; `reaches nothing on its denied list` red on `index.js`; and four of the five test *files* fail to load at all, because `link.js → index.js → builtins.js → link.js` is a cycle: `ReferenceError: Cannot access 'builtins' before initialization` |
| `LINK.fallback` set to `{text}` — the URL silently dropped on a pipe | 5 red across three files: `link.test.ts` ×3, `ansi-escapes.test.ts` (`expected 'Docs' to be 'Docs (https://x.dev)'`), `paratext.test.ts`. The spread is the evidence that `builtins.link` and `LINK` are the same object |
| a `./template` entry added to `exports` with no rule in `RULES` | `every published entry point declares a weight rule` red: `expected [ '.', './link', './plugin', './template' ] to deeply equal [ '.', './link', './plugin' ]` |

The first is the one worth keeping in mind. A subpath that reached the barrel would still be
*small enough to look fine* in a bundle report; what it would not be is side-effect-free, and
the byte budget alone would not have said so. That is why the deny-list and the
registry-is-empty assertion in `link.test.ts` are separate checks rather than one.

## What shipped (R1, R2, R3, R4, R5, R6, R7 — the package, ahead of its gate — 2026-09-13)

Recorded after the fact, which is the failure this intent exists to correct: `paratext`
reached npm at 0.2.0 with five source files and 40 tests and no Stage 1 or Stage 2 artifact.
What is here is a reading of the code, not a memory of it.

- **R1, R3** — `capability.ts`. `Capability` is five fields of plain data; the registry is one
  `Map` keyed by `name`; `register` replaces rather than rejects, which is how a caller whose
  terminal we mis-detect corrects the guess in three lines. `capabilities()` and
  `capability(name)` read it without emitting. Since R13, the `when` half lives in
  `supports.ts` and is re-exported here unchanged.
- **R2** — `emit(runtime, name, fields)`: the encoded template when `supports()` holds, the
  rendered `fallback` when it does not, and for an unregistered name whatever text the caller
  supplied. Never a throw, because output is not the place to discover a typo at three in the
  morning. **The requirement's "never an empty string" clause did not survive the reading**;
  see the claims section.
- **R4** — `check(document)`, `refusals()`, `isDeprecation()`. It reads the family schema's
  own `required` list so a field added there cannot be forgotten here, and returns one line
  per problem, prefixed with the path a reader has to go and edit (`capabilities.link: …`).
  It was **presence-checking, not schema validation** until 2026-09-16 — the largest single
  defect this reading found, measured in the claims section. `shape.ts` closed it: the same
  call now enforces `type`, `oneOf`, `const`, `minLength`, `minimum`, `items` and
  `additionalProperties: false`, every refusal carries a family error code, and `register()`
  goes through it too, which is what keeps a malformed `when` out of the registry `emit()`
  reads.
- **R5** — `runtime.ts`. `Runtime` is `{ env, isTTY: { stdout }, cwd? }` and `processRuntime()`
  is the only function in the package that names `process`. `cwd` is optional because nothing
  deciding *support* reads it and a two-line test literal should not have to carry it;
  `setCwd()` with no argument is its only caller, and it exists so that matching
  `ansi-escapes`' `process.cwd()` default did not put a second process reference in the
  package.
- **R6** — `template.ts`, three rules and no more: `{field}`, `{field|base64}`, and `[ … ]`
  emitted only when every field inside it has a non-empty value. `fieldsUsed()` reports what a
  template reads, which is what lets a capability be inspected without being run. Anything
  needing a fourth rule is a field the caller should have computed.
- **R7** — `builtins.ts`, seven records, registered through the public `register()` so a
  built-in cannot hold a power a stranger's plugin lacks. The table under *Every feature* is
  the authority on codes and fields; three of them are not what this requirement first said.

## What shipped (R8 — the `ansi-escapes` surface — 2026-09-14)

Measured: the row moved **0 / 4 → 1 / 4, 25.0%**, which is this row's ceiling, and the case
that turned green is `named export(s)` — the one of its four that touches OSC.

Three decisions, none obvious from the requirement:

- **Every name `ansi-escapes` exports is declared; thirty-three of the thirty-seven are
  `undefined`.** A drop-in has to *load*, and ESM refuses a named import of a name the module
  does not export — so `import ansiEscapes, { cursorTo } from 'paratext'` was a `SyntaxError`
  that took the file down before a line of it ran. That was the whole of the 0 / 4: not one
  assertion failed, the module never loaded. Declared-and-empty is the smallest thing that
  fixes it without implementing CSI, and TypeScript types each as `undefined`, so calling one
  is a **compile** error. The default export carries only the four that are implemented: an
  `undefined` CSI key on it would read as a claim being made and not kept.
- **The root's `link` and `image` are the incumbent's functions, not the capability
  records.** They collided, and the alternative was worse than a breaking change: a caller
  who swapped `from 'ansi-escapes'` for `from 'paratext'` would have got an object shaped
  nothing like a function, silently. The rule is stated rather than ad hoc — *a record export
  survives unless `ansi-escapes` has that name* — so `bell`, `clipboard`, `cwd`, `notify` and
  `title` are untouched, and the two that moved are `capability('link')` and
  `capability('image')`, or `paratext/link`'s `LINK`.
- **`image`'s encode template gained `[;preserveAspectRatio={…}][;size={…}]`**, upstream's
  last two options in upstream's order, which makes `image()` byte-identical to the incumbent
  rather than merely call-compatible. `size` is optional in the protocol and required by
  xterm.js, which is why upstream always writes it.

One defect this found, worth recording because the test that found it was written for a
different reason. `ansi-escapes.ts` is `emit()` over three built-in capabilities, and `emit()`
answers an *unregistered* name with whatever text the caller passed — by design, because
output is not the place to discover a typo. Reached with an empty registry it therefore
returned `Docs` for `link('Docs', url)`: no error, no bytes, and the URL quietly gone. The
module now registers the built-ins itself rather than trusting whoever imported it. This is
closeout's `onExit()` failure in a different package.

## What shipped (R9 — one suite of three, and why the other two are blocked — 2026-09-14)

None of it is a tarball: `npm pack ansi-escapes && tar tzf … | grep -c test` is `0`, so all
three suites come from a shallow clone at the annotated release tag (`ansi-escapes` v7.3.0 →
`73e652ef`, `terminal-link` v5.0.0 → `975358c3`, `term-img` v7.1.0 → `c495c815`).

| suite | control | target `paratext` | state |
| :-- | --: | --: | :-- |
| `ansi-escapes` 7.3.0 | **4 / 4, 100.0%** | **1 / 4, 25.0%** — the ceiling | active, baselined |
| `terminal-link` 5.0.0 | did not run | — | planned, suite not committed |
| `term-img` 7.1.0 | did not run | — | planned, suite committed |

- **The ceiling on this row is 1 / 4, not 4 / 4.** `default export`, `clearTerminal` and
  `synchronized output` assert CSI — `cursorTo(2, 2)`, the clear sequence, `ESC [ ? 2026 h/l`
  — which this design puts out of scope. Only `named export(s)` touches OSC. The three cannot
  be subtracted as `excludes`: ava's TAP prints counts and no per-case names, and
  `summarize()` refuses an exclusion it cannot name. So the ceiling is prose in the host
  entry, and 25% on this row means *complete*, not *a quarter*.
- **`term-img`'s suite runs headless**, which was the real question about it. Every one of
  its 18 cases sets `TERM_PROGRAM` / `KONSOLE_VERSION` / `process.platform` by hand and
  asserts a returned string or a thrown `UnsupportedTerminalError`; nothing is rendered and
  no tty is touched. It is ungraded only because `term-img` is in neither manifest.

What each blocked row needs, exactly — all of it in files a package lane may not write:

- `terminal-link`: `terminal-link` **and** `supports-hyperlinks` declared in the root
  manifest. The second is not optional for the control alone — its ten cases `import
  supportsHyperlinks from 'supports-hyperlinks'` in the *test*, so the target run needs it
  too. Committing the vendored suite without it turns `vendored-suite.test.ts` red, which is
  why the suite is not in `vendor/`. It also needs `rootPackage()` in
  `compat-oracle/src/vendor.ts` to carry the host's `ava: { serial: true }`, or ten cases
  that mutate one shared module object run concurrently.
- `term-img`: `term-img` declared in the root manifest, and a `controlFailures` allowance for
  `iTerm2 support`, which calls `iterm2-version()` and reads the installed iTerm2's
  Info.plist — green on a Mac, red on a Linux runner.
- Both: a missing incumbent does not produce a red row, it produces `ERR_MODULE_NOT_FOUND`
  out of `packageRoot()` inside `writeInternalShims` and takes the whole `npm run compat`
  process down. Worth a guard in `run.ts` so one absent package costs one row rather than
  every row.

**Until all three land, the npm description's "drop-in" claim is removed** (decision 3 of the
ecosystem plan) — one row of three is not a drop-in claim.

## What shipped (R10 — the family schema, and the host — 2026-09-14)

The schema half: the capability shape is `$defs/capability`, reached through a `capabilities`
key, and all seven `packages/*/src/schema.json` hash to one value. `check()` reads
`$defs/capabilityDocument` and takes either shape, the bare one with a `deprecated:` line
(PLAN D2 — accepted for one minor release, removed at 1.0).

The host half: `src/plugin.ts`, described under *Extending it*. Three refusal codes, all of
them already in flagstaff's `PluginErrorCode`, so the vocabulary lock needed nothing added.

**That file was the point, not the feature.** `scripts/plugin-schema-lock.test.ts` and
`scripts/schema-sync.mjs` both find a host by looking for `src/plugin.ts`. Until it existed
paratext's copy of the family schema was outside the lock that keeps the copies
byte-identical: it happened to match flagstaff's, and nothing in the repository would have
said so if it stopped.

**It cost flagstaff five byte budgets and they are not raised here.** `dist/schema.json` goes
3,451 B → 6,531 B, and every flagstaff entry that reaches the plugin registry carries it. The
budget is per *entry point*, the schema is one *file*, and folding a section in makes every
host pay for every other host's contract. Two ways out, and the second is the one to take:
raise the five budgets, or split publication from bundling — keep one byte-identical
`src/schema.json` as the contract each package exports, and have `schema-to-dist.mjs` project
it to the sections that host actually validates.

## What the design claimed and the code does not do

Found by reading the code against this file on 2026-09-15, and corrected above rather than
left standing. A design that claims more than the package does is worse than one that claims
nothing.

- **"`emit()` never returns an empty string" (R2, and success criterion 1 of the intent) is
  false**, and false by design. Five of the seven built-ins carry `fallback: ''` — `title`,
  `clipboard`, `cwd`, `bell`, and `image` whenever no caption was supplied — because a window
  title has nothing to say in a log. Measured on a piped runtime: `title`, `clipboard`,
  `cwd`, `bell` and `image` all return `''`; only `link` and `notify` print. The clause that
  is true and worth keeping is the other one: **it never emits OSC on a terminal that is not
  believed to understand it.** The intent's success criterion should be reworded to that;
  `intent.md` is this lane's file and the sentence is corrected there too.
- **R4's "validates against `schema.json`" overstated `check()` — fixed 2026-09-16, and the
  replacement claim is narrower than the one it replaces.** It read the schema's
  `$defs.capability.required` array and asserted presence, and hand-checked that `encode` was
  a non-empty string and `fallback` a string. Nothing read `type`, `oneOf`, `minimum`,
  `minLength` or `additionalProperties: false`. Measured: a capability with `osc: { nope:
  true }`, `when: 'not an object'` and an undeclared `extra: 1` was accepted by both `check()`
  and `plugin.validate()`, and the `when` case was a live rule-6 hole — a string destructures
  to four `undefined` clauses, so `supports()` returned `true` and the capability emitted into
  a pipe. `src/shape.ts` now enforces `type`, `oneOf`, `const`, `minLength`, `minimum`,
  `items` and `additionalProperties: false`, which is every keyword the capability entry
  writes. It does **not** enforce `$ref`, `pattern`, `minItems`, `maxLength`, `enum`, `allOf`,
  `anyOf` or `not`; none of them appears under a capability today, so R4 should be read as
  "validates the constructs the capability shape uses", not "validates the schema".
- **R7 named three of the seven OSC codes wrongly** — `cwd` as OSC 7 (it is OSC 50, followed
  by OSC 9;9), `notify` as "OSC 9 / 777" (only 9 is emitted; 777 appears nowhere in the
  package), `title` as "OSC 0/2" (only 0). The records in `builtins.ts` are the truth and the
  requirement now matches them.
- **R11 read `Not built` while half of it existed.** `.sdlc/bands/foundation-ceilings.json`
  was created after this design was last written and carries a `paratext` entry. The half
  that is genuinely missing is the B4 benchmark row.
- **`compat-oracle/src/hosts.ts` still says "target `paratext` **0 / 4**"** in the
  `ansi-escapes` note, after R8 made it 1 / 4. **Not corrected here, and the reason is a
  second drift.** `.sdlc/LANES.md` grants a package lane "its own entries in
  `packages/compat-oracle/src/hosts.ts`" as the second exception to the ownership table, and
  `scripts/lanes.ts` does not implement that paragraph — it reads the table and the
  `.changeset` grant and nothing else, so `--check lane/paratext` rejects the edit as a
  stray. That is the same class of defect the script's own `shared()` comment says it exists
  to prevent, committed again one paragraph further down. The enforced contract wins over the
  prose one, so the one-line correction is handed to whoever owns `scripts/lanes.ts` and
  `LANES.md` rather than smuggled past the check.
- **`designComplete()` in `scripts/plan-progress.ts` reads only one of the two shapes.** It
  matches `^## What shipped \((R…)\)` headings; `seniority`'s
  `| R11 | **Built** | … |` table is invisible to it, which is why step 3.2 is red as well.
  This design uses the heading shape for that reason. `scripts/**` is the integrator's.

## Rejected alternatives

- **Extending `ansi-escapes` upstream.** Its maintainer declined runtime detection by
  design ("emit and let the terminal ignore"); the fallback behaviour is the whole
  difference and cannot be a PR.
- **Detecting support by querying the terminal (DA1/XTVERSION).** Round-trips on stdin,
  hangs under a pipe, and still cannot answer per-capability. A table plus a fallback is
  honest about what is knowable.
- **A fixed list of built-ins with no `register`.** Rejected for the reason in "Why a
  registry".
- **A `paratext/capability` subpath instead of `paratext/link`** (R13). It would have carried
  the registry, and therefore `schema.json`, and therefore most of the root — which is the
  problem, not a smaller version of it. The narrow entry is narrow because one capability is
  what the consumer asked for; a second consumer wanting OSC 1337 gets `paratext/image` on
  the same pattern, with its own budget in `weight.test.ts`.
- **Copying the `link` record into `link.ts`** rather than moving it. Two copies pass every
  test on the day they are written. See the mutation table.

## Out of scope

Each with the reason, because "out of scope" without one is indistinguishable from "not
done yet".

- **CSI — cursor, erase, scroll regions, the alternate screen, synchronized output.** This is
  `ansi-escapes`' larger half and 31 of the names the root declares as `undefined`. It is out
  because it already has two owners in this family: `flagstaff` draws the grid and `closeout`
  puts it back, and a second implementation inside this package is the copy PRINCIPLES rule 2
  exists to prevent.
- **Reading files for `image`.** `term-img` accepts a path, which means `node:fs` in a
  package that otherwise touches nothing but strings. The caller reads the file and owns the
  I/O; this package owns bytes-to-escape.
- **Any styling.** `link` returns the text unstyled. Colour is SGR and SGR is `roundel`;
  wrapping the result in a roundel token is one call and keeps the two layers separable.
- **Querying the terminal to find out what it supports.** DA1/XTVERSION round-trip on stdin,
  hang under a pipe, and still cannot answer per-capability. The honest design is a table of
  guesses that a caller can replace, plus a projection for when the guess is wrong.
- **Shipping a capability for every protocol a terminal has.** Kitty's graphics protocol,
  Sixel, WezTerm's user-vars, Ghostty's progress bar: each is a plain record, and the
  extension surface exists so that whoever needs one does not wait for a release of this
  package. `iTerm.annotation` and ConEmu's progress bar are declared `undefined` on the root
  for the loading reason and become real the day someone writes the record.
- **Deciding *whether* a CLI should print a hyperlink.** paratext answers "will this terminal
  render it" and "what does it look like if not". Whether `--help` wants a `Docs` column at
  all is the caller's layout decision; `supportsLink(runtime)` is there so the caller can make
  it without emitting anything.

## What shipped (R11, R12 — the B4 row, and the first consumer — 2026-09-16)

Two requirements that had been half-built and unbuildable respectively, for the same
reason: the work was in files this lane may not write. Both landed on 2026-09-16, in the
lanes that own those files.

**R11 — the ceiling and the B4 row.** The integrator re-measured every foundation layer in
one pass, because five of six had drifted from the 2026-09-14 figures and each package
could only report its own drift. `ours` reads **66,305** against a ceiling of **30,912**,
the tree-inclusive bytes of `ansi-escapes` — a ratio of **2.145**.

The B4 row exists now too: `benchmarks/fixtures/entry-points.ts` carries a
`paratext` ÷ `ansi-escapes` pair with the incumbent pinned to **7.3.0, the exact version
compat-oracle grades**, because the weight we compare against has to be the weight of the
release whose own suite we pass. It measures **11,059 bundled bytes, a ratio of 2.542**,
ratcheted at 2.55.

**Both numbers say this layer is over what it replaces, and neither is softened.** paratext
is the one foundation layer of six that does not hold against its D1 ceiling. The ratchets
exist to stop it growing while that is dealt with; they are not claims of being lighter,
and `benchmarks/axes/weight.ts` says so where they are written.

**R12 — the first same-repo consumer.** `flagstaff/table` and `flagstaff/box` link through
`paratext/link`, and the narrow entry was chosen on a measurement rather than a preference:
2,410 B across 4 modules with no import-time side effect, against the root's 20,221 B
across 10 with `registerBuiltins()`. flagstaff declares `sideEffects: false` and `./table`'s
whole budget was 4,000 B.

The consumer's arrival paid for itself twice. It removed flagstaff's two inline OSC 8
sequences — the standing rule that a layer's job is not reimplemented by its callers — and
it made a gap legible that had been invisible: `paratext` was in neither `FAMILY_ORDER` nor
`FOUNDATION` in `scripts/package-shape-lock.test.ts`, so the new edge read as a dependency
from *outside* the family. A layer nothing consumed could not have shown that.

## What shipped (R9, the third suite — `paratext/term-img` at 12 / 18 — 2026-09-20)

The last of R9's three rows is graded. `term-img`'s eighteen cases ran against
`paratext/term-img` and **12 pass, 66.7%, up from 0 — and 12 is the ceiling.**

**The zero was the export map, not the surface.** The note written the day the row was
activated called it "a measured zero of the `ansi-escapes` shape", which reads as *nothing
is built*. The raw TAP was one line: `SyntaxError: The requested module './shim.js' does not
provide an export named 'UnsupportedTerminalError'`. The row was pointed at the package
root, whose default export is already `ansi-escapes`' object (R8), and `term-img`'s default
export is a function — one default cannot be both. That is D-006, and `terminal-link` hit
the same wall four days earlier. Every row in this repository at 100% targets a subpath.

**The six that stay red are D-030, named.** `iTerm2 support`, `WezTerm support`,
`Konsole support`, `Rio support`, `VSCode support` and `handles options parameter
correctly` — every one of them hands `terminalImage` a **path** and a terminal the suite has
just declared supported, and expects bytes back. D-030 says `image` takes bytes only, which
is what keeps `node:fs` out of this package. The façade refuses a string with a `TypeError`
naming the decision, and refuses it **at exactly the line upstream calls `fs.readFileSync`**
— after the argument check and after the terminal check. That placement is what makes the
number 12 and not 8: the four cases that hand a path to an *unsupported* terminal never
reach it, because upstream would not have opened the file either.

Turning the six green is available and is a lie — it means base64-ing the characters
`fixture.jpg` and calling them a JPEG. So **66.7% on this row means complete**, the way 25%
does on `ansi-escapes`, and the ceiling is written into the host entry beside the six names.

**The one divergence, argued rather than assumed.** The façade carries `term-img`'s own
terminal table — iTerm2 ≥ 3, WezTerm ≥ 20220319, Konsole ≥ 22.04, Rio ≥ 0.1.13, VSCode ≥
1.80, from the environment alone — rather than `IMAGE.when`, which also requires a tty. Not
because a tty clause would cost a case, but because `term-img`'s unsupported branch is
`fallback()`, and its default **throws**. Rule 6 says never put raw OSC into a pipe; it does
not license crashing a caller that the incumbent would merely have made an ugly log of.
Adding the tty clause here would turn every piped run into an `UnsupportedTerminalError`.
The root's `image()` keeps it, because there the projection really is a string. The
divergence belongs to one surface, and it is asserted in `term-img.test.ts` so that a later
"consistency" edit has to argue with it.

It is also, unlike `terminal-link`'s ceiling, **not** a peek inside somebody else's module
object: it is five version comparisons we wrote, deterministic on every machine, and it
replaces two of upstream's dependencies (`iterm2-version`, `ansi-escapes`) with nothing.

**One upstream defect fixed in passing.** `checkITermVersion` reads the major version as
`Number(version[0])` — the first *character* — so `10.2.1` reads as `1` and an iTerm2 seven
majors past the minimum is refused. The façade uses `Number.parseInt`. Nothing in the
vendored suite distinguishes the two (its case is `3.3.7`), so this is recorded here rather
than measured there, and `term-img.test.ts` pins it.

**The record moved, it did not multiply.** `IMAGE` and `ImageOptions` left `builtins.ts` and
`ansi-escapes.ts` for `image.ts`, so a subpath can reach OSC 1337 without `capability.js`
and its 6,756 B of `schema.json` — the same move `link.ts` made for OSC 8, and the same
refusal to copy instead. `builtins.ts` re-exports it as `image`, so the object the registry
ships and the object the façade renders are one object. `./term-img` measures **4,362 B**
and reaches no registry; the root paid **+399 B** for the new module boundary, and the
budget was raised from 20,500 to 20,900 with the arithmetic written into `weight.test.ts`.

R9 is now complete: three suites vendored, three graded, three ceilings written down —
`ansi-escapes` 1 / 4 (CSI is out of scope), `terminal-link` 8 / 10 (the suite mutates
another package's module object), `term-img` 12 / 18 (D-030).

### One thing this lane found and may not fix

`npm run lint` is red on `check:artifacts` for paratext, and **it is red on `main` too.**
Measured 2026-09-20 with `npm pack --dry-run` on each tree in turn:

| tree | gzipped | unpacked | against the band |
| :-- | --: | --: | :-- |
| `.sdlc/bands/artifact-size-baseline.json` | 22,113 | 66,080 | the recorded baseline |
| `main` | 25,966 | 80,007 | **+17.4% / +21.1%**, past the 10% allowance |
| this branch | 25,959 | 78,734 | **+17.4% / +19.1%** |

So the gate was already failing before `term-img` existed — `paratext/terminal-link` added
`terminal-link.js` and its declaration file without the band following — and this branch
ships **1,273 fewer unpacked bytes than `main`**, because moving `IMAGE` into its own module
took more prose out of `builtins.d.ts` and `ansi-escapes.d.ts` than the new subpath's
declarations put back. `.d.ts` files keep every doc comment by design
(`scripts/strip-comments.mjs` says so), so in this package a paragraph is a published byte.

The fix is one row of `.sdlc/bands/artifact-size-baseline.json`, which this lane does not
own and did not touch. `--update-baseline` is the wrong instrument for it: it rewrites every
package's row from the machine that ran it, and burgee's and flagstaff's rows would be
overwritten with this laptop's numbers — the same defect the compatibility page has.
