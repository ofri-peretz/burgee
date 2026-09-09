# Design — One plugin contract across all four layers

Intent: [`intent.md`](./intent.md). **Status:** draft — awaiting the Design→Build gate.

> Written 2026-09-08 against what `flagstaff` already ships, not against a blank page.
> `packages/flagstaff/src/plugin.ts` and `schema.json` are the contract as built; this
> design's job is to make the other three layers read the *same* object and the same file,
> and to prove they do. Most of the work is a lock and two small hosts, not a new format.

---

## What already exists

`flagstaff/plugin` is the contract, working, with the shape the intent asks for:

| Piece | Where | State |
| :-- | :-- | :-- |
| `Plugin` — `{ name, contract, tokens, glyphs, spinners, borders, components }` | `flagstaff/src/plugin.ts` | shipped |
| `schema.json`, the same file that ships in the tarball | `flagstaff/src/schema.json` | shipped |
| `CONTRACT = 1`, refused when a plugin declares higher | `flagstaff/src/plugin.ts` | shipped |
| `E_NO_STATIC_PROJECTION` at `register()` | `flagstaff/src/plugin.ts` | shipped |
| `additionalProperties: true`, so another layer's keys pass validation untouched | `flagstaff/src/schema.json` | shipped |
| Importers that make the corpus real — `fromCliSpinners`, `fromCliBoxes` | `flagstaff/src/import.ts` | shipped |

Two things are *not* true yet, and they are what this design is:

1. **`tokens` is in the schema and nothing reads it.** It is described as "a roundel theme",
   and roundel does not know the plugin object exists. A plugin that ships a theme today is
   validated and then ignored — the worst of both, because it looks supported. (`glyphs`
   reads the same way at first glance and does not have this problem: flagstaff hosts it.
   See R4.)
2. **The schema is one file in one package.** The intent's first success criterion is one
   schema, byte-identical in every tarball, asserted by a lock. Today it is flagstaff's.

## Requirements

- **R1 — One object, four readers.** A plugin is one plain object. `register(plugin)` in any
  layer keeps the keys that layer understands and ignores the rest without error, so the
  same object works on any subset of the family that is installed.
- **R2 — One schema file, byte-identical.** `plugin.schema.json` is authored once and
  present, byte-for-byte, in every package that hosts plugins. A lock fails when two copies
  differ, naming both paths and the first differing line.
- **R3 — No layer imports another.** `roundel` reading `tokens` must not make `roundel`
  depend on `flagstaff`, in `package.json`, in `dist/`, or in the weight lock's `allow`
  list. The keys are read structurally; the type is declared, not imported.
- **R4 — roundel hosts `tokens`.** `register(plugin)` collects them into a `Theme`, and
  `fly()` contrast-checks a plugin's hex tokens exactly as it checks a hand-written theme —
  a plugin cannot smuggle an unreadable colour past R5 of the roundel design.

  **Narrowed 2026-09-08, while building it.** This requirement said "`tokens` and `glyphs`",
  and glyphs are not roundel's. `flagstaff/plugin` already hosts them and already exports
  `glyph(meaning)`; the schema describes them as symbols "by meaning: `ok`, `fail`, `warn`,
  `info`, `running`" that change "every built-in that draws one" — and roundel draws
  nothing, it decides colour. Hosting them in two packages would create exactly the drift
  this contract exists to prevent, and it would give a plugin author two answers to "where
  does my `✔` go". One key, one host.
- **R5 — caique hosts `widgets`.** A widget is `{ static(spec), frame?(t, spec) }`, the same
  shape a flagstaff component has, and a widget without `static` is refused with
  `E_NO_STATIC_PROJECTION` — the same code, the same message.
- **R6 — One contract version.** `CONTRACT` is one number for the family. A host refuses a
  plugin declaring a higher contract with a `fix` naming the package to upgrade.
- **R7 — Data first.** No key may require a function except a component's or widget's
  `frame`, and burgee's `hooks`. Every other contribution is inspectable without running it.
- **R8 — One error vocabulary.** `E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT`,
  `E_NO_STATIC_PROJECTION` mean the same thing and carry the same `fix` shape in every
  layer, so a plugin author debugging against one package has learned all four.

## Design

### Where the schema lives, and how it stays identical

The intent proposes publishing it from `burgee` and copying outward. **Copy from
`flagstaff`, not `burgee`.** flagstaff is where the schema was written and where every
`$defs` entry (`spinner`, `border`, `component`) is already exercised by a suite; burgee
hosts commands and hooks, which are a *superset* concern and are specified in
`cli-modularity`, not here. Making the file's home the package that most exercises it keeps
the authoring and the test in one place — and R2 is a lock, so which copy is the source
matters only for who edits it.

`packages/flagstaff/src/schema.json` is the source. A lock reads every
`packages/*/src/schema.json`, compares bytes, and fails on the first difference. A
`scripts/sync-schema.ts` (or `npm run schema:sync`) copies the source over the others, so
the fix for a red lock is one command rather than three manual edits.

**Why copies rather than a shared package.** A shared `@burgee/plugin-schema` would be the
obvious answer and is the wrong one here: U6 says zero external dependencies and every
package is an independent product, and a package that four packages depend on is a
dependency whether or not we publish it. A copied file plus a lock has the same guarantee
with none of the coupling — and the guarantee is checkable in CI rather than asserted in a
README.

### roundel gains `roundel/plugin`

One new file, `packages/roundel/src/plugin.ts`, and one new subpath:

```js
import { register } from 'roundel/plugin';
import { fly } from 'roundel/theme';

register(acme);          // keeps acme.tokens; ignores glyphs, spinners, components
fly(theme(), runtime);   // the plugin's tokens are in it, contrast-checked like any other
```

It declares the `Plugin` shape structurally rather than importing flagstaff's type (R3):
roundel needs `{ name, contract?, tokens? }` and nothing else, and a structural declaration
is what makes "any subset of the family" true instead of aspirational.

Order of registration is registration order, like ESLint flat config: the last plugin to
contribute a token wins, and `registered()` reports the winner and the plugin it came from
so `burgee plugin check` can print the shadowing.

### caique gains `caique/plugin`

`widgets` is the one key in the intent that has no host at all. A widget is the prompt
analogue of a flagstaff component:

```js
widgets: {
  'acme-rating': {
    static: (spec) => `${spec.message}\n  enter 1-5: `,
    frame: (t, spec) => /* the raw-mode drawing, optional */,
  },
}
```

`static(spec)` is what a pipe, an agent and a screen reader get; it is what
`ask()`'s `projection()` already returns for the six built-ins, so a plugin widget slots
into the same surface. `frame` is optional and drives `caique/raw`. A widget without
`static` is refused at `register()` — the same rule as U3 everywhere else, and the reason a
third-party prompt cannot break the non-TTY guarantee that is caique's whole point.

### Order to do it in

1. **The lock first** (`schema-identity.test.ts` + `schema:sync`), while there is exactly
   one copy. A lock written after the second copy exists is a lock written against a bug.
2. **roundel/plugin** — `tokens` has a schema entry and no host, so this is the shortest
   path from "documented" to "true". (`glyphs` turned out to have one already: see R4.)
3. **caique/plugin** — `widgets`, plus the schema entry it needs, propagated by `schema:sync`.
4. **burgee** — `plugin.schema.json` in the tarball, `burgee plugin check <file>` running
   every installed layer's validation. `commands` and `hooks` stay specified by
   `cli-modularity`; this intent adds no burgee key of its own.

Steps 1–3 are independent of `cli-modularity` and can land without it. Step 4 cannot.

## What shipped (step 1 — the schema lock — 2026-09-08)

`scripts/plugin-schema-lock.test.ts`, written while there was still exactly one copy of the
schema, as the order above says. It derives the host list from the tree — a package hosts
plugins when `src/plugin.ts` exists — so a new host is covered the moment it is created.

It found one: `PluginError`'s fix for `E_PLUGIN_SCHEMA` told a plugin author to "compare the
object against flagstaff/schema.json", and that specifier did not resolve. The file shipped
in the tarball; the `exports` entry was missing. An error whose fix is a dead end is worse
than an error with no fix.

No `schema:sync` script. With one copy there is nothing to sync, and a script whose fix
never fires is a script to write when the second host arrives.

## What shipped (step 2 — roundel hosts `tokens` — 2026-09-08)

`roundel/plugin`: `register()`, `theme()`, `contributions()`, `reset()`, and the family's
error vocabulary — `E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT` — with the same `fix` shape
flagstaff uses (R8).

**The claim R1 makes is asserted against a flagstaff plugin object**, not a roundel-shaped
one: the fixture carries `glyphs`, `spinners` and `components`, and registering it here
keeps the theme and ignores the rest without complaining. That is what makes "works on any
subset of the family that is installed" true rather than hoped.

**A misspelt token is refused, not dropped.** A plugin whose `errror` key is silently
ignored looks like it worked, and its author debugs the wrong thing. The refusal names the
ten valid names.

**Registering does not fly.** A plugin contributing colour must not decide *when* colour is
decided; `theme()` hands a `Theme` to the program, and the program calls `fly()` once. The
contrast gate is therefore not re-implemented here — one gate, in the place that had it, and
a plugin token below 4.5:1 throws exactly as a hand-written one does.

It reaches nothing: its only import is a type, erased by `verbatimModuleSyntax`. 2,812 B,
most of it the refusal messages.

Six mutations proved the suite bites: an unknown token dropped instead of refused (2 red),
earlier plugin winning instead of later (1), a bad colour accepted (1), a newer contract
accepted (1), an unnamed plugin registering (1), and `register()` keeping a plugin that
failed validation (1).

Not yet: `caique/plugin` (step 3), and burgee (step 4, blocked on `cli-modularity`).

## Verification

The loop: `npm test && npm run lint && npx tsx scripts/check-published-artifacts.ts`.

| Check | File | What it catches |
| :-- | :-- | :-- |
| Schema identity (R2) | `packages/*/src/schema-identity.test.ts` | one copy edited, the others not — proven by editing one byte of one copy and watching it go red |
| No cross-layer import (R3) | the existing `weight.test.ts` and `subpath-isolation.test.ts` in each package | a `roundel/plugin` that reached for flagstaff would break the `allow` list, which already fails on an unlisted bare specifier |
| roundel hosts tokens (R4) | `packages/roundel/src/plugin.test.ts` | a registered plugin's tokens absent from the flown theme; an unreadable hex accepted |
| caique hosts widgets (R5) | `packages/caique/src/plugin.test.ts` | a widget without `static` accepted |
| Same object, four hosts (R1) | `packages/*/src/plugin.test.ts`, one shared fixture | a host that errors on another layer's key rather than ignoring it |
| Error vocabulary (R8) | the same fixture | a code or `fix` shape that drifted between layers |

**The check that would have caught the problem this intent names:** the R1 fixture. The
present state — `tokens` in the schema, no reader — passes every test in the repo today,
because nothing asserts that a validated key is also *hosted*. One fixture registered in
every layer, asserting what each kept, turns "documented but ignored" from invisible into
red.

## Rejected alternatives

- **A shared `@burgee/plugin-schema` package.** Same guarantee, but it makes four
  independent products share a dependency, which U6 forbids and which would make the
  family's install story "and one more package". A copied file with a lock is checkable in
  CI; a shared package is only checkable at install time.
- **Publishing the schema from `burgee`.** The intent proposes it. burgee hosts commands
  and hooks, which are `cli-modularity`'s subject, and it exercises none of the
  render-side `$defs`. Authoring where the tests are is the cheaper arrangement, and R2
  makes the choice of source a convention rather than a constraint.
- **`roundel` importing flagstaff's `Plugin` type.** Types erase, so it would cost nothing
  at run time — and it would still put `flagstaff` in roundel's `devDependencies` and in
  its README's dependency story. A structural declaration of the four keys roundel reads
  is three lines and keeps the claim "none requires the others" literally true.
- **Discovery by `package.json` field or directory scan.** Already rejected in
  `cli-modularity`; restated because it is the option that comes back every quarter. A
  plugin that loads because it is installed is a plugin nobody chose.
- **A registry or marketplace.** Nothing here runs as a service. The gallery is generated
  from *registered* plugins' static projections — a projection, not a registry.
- **One `register()` in one package that forwards to the others.** It would read well and
  would require every layer to be installed, turning four independent products into one
  framework. Each layer keeps its own `register()`; the *object* is what is shared.

## Out of scope

- `commands` and `hooks` — specified by [`cli-modularity`](../cli-modularity/intent.md)
  M4/M5. This design adds no burgee-side key.
- `burgee plugin check` as a shipped command (step 4). It needs burgee's plugin host, which
  is `cli-modularity`'s work; the design records where it lands, not how it is built.
- The docs gallery's plugin page. `scripts/gallery-page.ts` already generates from
  components; extending it to registered plugins is `docs-deploy`.
- Contract 2. `CONTRACT = 1` is the only version this design describes; R6 says what a host
  does when it meets a higher one, which is all that is needed until there is one.
- A namespace on npm for third-party plugins. The intent's open question stands: a
  `keywords` convention, and the gallery indexes by keyword. Nothing here depends on it.
