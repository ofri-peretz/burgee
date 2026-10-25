# Design — One plugin contract across all four layers

Intent: [`intent.md`](./intent.md). **Status:** approved — accepted by the coordinator under the
owner's delegation in
[`D-20261025-plugin-contract-design-accepted`](../../decisions/D-20261025-plugin-contract-design-accepted.md),
as re-grounded on `main` at `b453b07b` (below). The requirement-by-requirement state is the
[Status](#status) table at the end.

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
| `sample?: { running, done }` on a component — the two states a grader renders it with | `flagstaff/src/plugin.ts` | shipped 2026-09-09 |

Two things are *not* true yet, and they are what this design is:

1. **`tokens` is in the schema and nothing reads it.** It is described as "a roundel theme",
   and roundel does not know the plugin object exists. A plugin that ships a theme today is
   validated and then ignored — the worst of both, because it looks supported. (`glyphs`
   reads the same way at first glance and does not have this problem: flagstaff hosts it.
   See R4.)
2. **The schema is one file in one package.** The intent's first success criterion is one
   schema, byte-identical in every tarball, asserted by a lock. Today it is flagstaff's.

## Re-grounded on `main` — 2026-10-25

Checked at `b453b07b`, six weeks after this design was written. Every change to the text
below is listed here, and nothing else was edited.

1. **Ten hosts, not four.** Every package under `packages/` except `compat-oracle` now has
   `src/plugin.ts` and a byte-identical `src/schema.json` (25,395 B, md5 `bffd4521…`):
   bellpull, burgee, caique, closeout, controlroom, flagstaff, linegauge, paratext, roundel
   and seniority. R1 and R2 hold for all ten (`plugin-contract-lock`, `plugin-schema-lock`).
   Steps 1–3 of the build order are shipped, and so is the part of step 4 that hosts
   burgee's own keys.
2. **`schema:sync` exists in all but name.** The design said to write it "when the second host
   arrives". The lock's byte-identity case, together with each host's schema fragment
   (`schema fragments` in `plugin-schema-lock`), stood in for it. No change.
3. **Step 4's command is `burgee check`, not `burgee plugin check`.** It shipped under that
   name (2026-09-22, with eight sibling `check` commands, one per host). Until this change it
   read burgee's own keys only. It refused an object that carried only `tokens` with
   `E_NO_CONTRIBUTION`, "contributes nothing burgee reads". The intent asks for one command
   that "runs every installed layer's validation". That is **R9**, added below and built in
   the PR that accepts this design. Step 4 is no longer blocked on `cli-modularity`: burgee
   has hosted `commands` and `hooks` through `Manifest.use()` since 2026-09-17.
4. **R7 restated.** It said no key may require a function "except a component's or widget's
   `frame`, and burgee's `hooks`". R5a's own hosts contradict it: seniority's `read`,
   closeout's `run`, and burgee's command `run` and hook `handler` are functions, and so is
   the required `static` on a component or widget. The rule that holds, and that
   `plugin-schema-agreement` checks, is the one written below.
5. **R5a gained controlroom.** It hosts `keymaps` and `panes` (added 2026-09-27). It also
   gained linegauge's reversal: linegauge hosts `widths` (`plugin-contract-lock` › "linegauge
   hosts `widths`"), so "linegauge hosts nothing, by design" is struck in place.
6. **Out of scope, unchanged.** The docs gallery belongs to `docs-per-package`, which
   absorbed `docs-deploy`. Contract 2 stays out of scope, and the npm namespace was decided
   by D-067.

## Requirements

The standing rule behind every requirement here is PRINCIPLES.md rule 14 — extension is the
product. A layer that cannot be extended without a fork has failed it.

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
- **R5 — caique hosts `widgets`.** A widget is `{ static(spec), frame?(t, spec), sample? }`,
  the same shape a flagstaff component has, and a widget without `static` is refused with
  `E_NO_STATIC_PROJECTION` — the same code, the same message.

  **`sample` added 2026-09-09**, accepted at the Design→Build gate (see below). This
  requirement's whole content is *sameness*: a key the flagstaff component shape gains, the
  caique widget shape gains with it, or "the same shape a flagstaff component has" quietly
  becomes "the same shape except for one key" and the author who learned one has not learned
  the other. **Not built here.** caique's widget host is step 3 and its own PR; this records
  the obligation so that PR cannot land a widget shape without `sample` and call it R5.
- **R5a — Every layer hosts, or says why not.** (Added 2026-09-13; PRINCIPLES rule 14.)
  The four foundation packages and paratext were absent from R4–R5 because they postdate this
  design. Each now has a key or a stated refusal:
  - `paratext` hosts **`capabilities`** — its `{ name, osc, when, encode, fallback }` records
    move under this key and its `schema.json` is retired for the family's. Today it is a
    third schema shape (`409dbeb2…` against the family's `2f1bd1c6…`), which is exactly the
    divergence R2 exists to forbid.
  - `seniority` hosts **`sources`** — a resolution source `{ name, rank, read(runtime) }`; a
    plugin adds a vault, a remote config, a CI variable set, in rank order.
  - `closeout` hosts **`handlers`** — exit handlers with a declared phase, so a plugin's
    cleanup runs before terminal restore and never after it.
  - `bellpull` hosts **`resolvers`** — how an executable is found (`PATH`, a version manager,
    a container), since `which` is the part every environment does differently.
  - ~~`linegauge` **hosts nothing, by design.**~~ *(Reversed: linegauge hosts `widths`, a
    named set of code-point ranges and their column count, and its README says so.)*
  - `controlroom` hosts **`keymaps`** and **`panes`** *(added 2026-09-27)*.
  - `burgee` hosts `commands` and `hooks` (M4, M5) — declared in the intent, `definePlugin`
    exists, the hosting is partial and is tracked under `cli-modularity`.

- **R6 — One contract version.** `CONTRACT` is one number for the family. A host refuses a
  plugin declaring a higher contract with a `fix` naming the package to upgrade.
- **R7 — Data first.** *(Restated 2026-10-25; it named `frame` and `hooks` only, and R5a's
  hosts take more.)* A function is allowed only as a named member that the family schema
  describes and its host calls: `static` and `frame` on a component or widget, `read` on a
  seniority source, `run` on a closeout handler or a burgee command, and `handler` on a burgee
  hook. Everything else in a plugin is data, inspectable without running it, and the schema
  describes it at the data level (`plugin-schema-agreement`: the schema and each host give
  the same verdict on every data-level mistake).

  A `sample` (R5) is one of those contributions and does not weaken this. It is two named
  states of plain data — the schema admits objects, arrays, strings, numbers and booleans,
  and nothing that can carry behaviour — so a grader reads a component's declared states
  without executing anything its author wrote. The registry copies it to whatever depth it
  has and freezes each level, so the author's own object is not shared by reference either.
- **R9 — One `check` runs every installed layer.** *(Added 2026-10-25, the intent's third
  criterion.)* `burgee check <file>` hands each key another layer hosts to that layer's own
  `check` and reports one row per layer under `layers`: `{ host, keys, run, exitCode,
  output }`. The layer's `check` is found where Node would resolve the package from the
  plugin's directory (the nearest `node_modules/<host>` at or above it, found with seniority's
  `findUp`) and run as a command, by its bin, with the same file, through bellpull's `run`
  within its default deadline. burgee already depends on both packages, and
  `inline-implementation-lock` holds that it walks and spawns through them. It is never imported, so R3 holds for burgee too. A layer
  that is not installed gets a row whose `run` is the `npx` command to use, and no
  `exitCode`. A layer that exits non-zero makes the check refuse. The refusal uses that
  layer's own `code`, message and `fix`, read off the family's two refusal lines,
  `CODE: message` and an indented `fix: …` (R8), or `E_PLUGIN_SCHEMA` with the command to run when the layer printed
  something else. `E_NO_CONTRIBUTION` now means that no layer of the family reads anything in
  the object. Which key belongs to which layer is a table, `LAYERS` in `check.ts`.
  `plugin-check-lock` holds the table to the family schema: every schema key burgee does not
  read is routed, and each layer it names has a built bin of its own name.

  Not routed: caique's own ids inside `locales` (`caique.…`). `locales` is burgee's key,
  and a pack with no caique ids would be refused by `caique check` as contributing nothing.
  An author runs `caique check` for those ids, and `burgee check` already leaves them to
  caique (`isOwnedElsewhere`).

- **R8 — One error vocabulary.** `E_PLUGIN_SCHEMA`, `E_PLUGIN_CONTRACT`,
  `E_NO_STATIC_PROJECTION` mean the same thing and carry the same `fix` shape in every
  layer, so a plugin author debugging against one package has learned all four.

  **Locked 2026-09-09.** This was a sentence and nothing else, and it was already false:
  `flagstaff check` printed `E_NO_CONTRIBUTION` and `E_COMPONENT_THREW` as bare string
  literals in `cli.ts`, outside `PluginErrorCode` in `plugin.ts`. Both are now members of
  that union, and `scripts/plugin-error-vocabulary-lock.test.ts` reads the declaration out
  of each host's source and refuses any `'E_…'` literal the host ships that is not in it —
  plus any code a host declares that the vocabulary home does not know, so a downstream
  layer cannot fork the vocabulary. A vocabulary anything can add to inline is not one.

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

## Accepted at the Design→Build gate (2026-09-09)

Recorded here rather than in a commit message or a review thread: repo rule 1 is that a
decision living only in a chat log cannot be reviewed, diffed or replayed, and rule 3 is that
a human — not the agent that wrote the code — accepts at Design→Build.

**The optional `sample` on a component, and caique taking the key too (R5, R7).** A component
may declare `sample: { running, done }`; `flagstaff check` renders it with that, and states
the assumed `{ phase }` shape out loud when there is none. R7 holds because the key is inert
data with two required keys and nothing that can carry behaviour, so it does not turn a
plugin into a program. Because R5's claim is that a widget is *the same shape* a component
is, the key is part of the widget shape as well, and caique's host owes it.

*The alternative not taken:* scope `sample` to flagstaff only and let caique's widget shape
diverge. Cheaper today, and it spends R5 — the moment the two shapes differ by a key, "the
same shape" stops being a fact a lock can hold and becomes prose, and the family has two
component shapes to document instead of one.

**`E_NO_CONTRIBUTION` and `E_COMPONENT_THREW` into the typed union (R8).** Both are refusals
only a renderer can discover, so `check` is the right place to raise them; being raised there
is not a reason to spell them there. They join `PluginErrorCode`, which stays the single
source — no second list — and the lock above makes the membership checkable.

*The alternative not taken:* take the behaviour now and leave the vocabulary untyped as a
follow-up. That is how the codes got there in the first place. The two refusals are useful
whether or not they are typed, so the follow-up has no forcing function, and R8 stays a claim
no check can test — which is the state this repo has shipped nine defects out of.

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
| One vocabulary, locked (R8) | `scripts/plugin-error-vocabulary-lock.test.ts` | a refusal code spelled inline instead of declared, or a host forking the vocabulary — proven by emitting a bare `E_BROKE_LATE` from `cli.ts` and by reverting the union to its pre-fix five |

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

## Status

On `main` at `b453b07b`, plus the PR that accepts this design. "Held by" names the check that
fails when the row stops being true.

| | Requirement | State | Held by |
| :-- | :-- | :-- | :-- |
| R1 | One object, every reader | **Built**, ten hosts | `scripts/plugin-contract-lock.test.ts` › "one object registers into every host" (validate, register, frozen, and dropping each host's key) |
| R2 | One schema file, byte-identical | **Built**, ten copies | `scripts/plugin-schema-lock.test.ts` › "is byte-identical everywhere it is hosted" |
| R3 | No layer imports another | **Built** | each package's `src/weight.test.ts` allow list. burgee's `check` runs other layers as commands, never by import (R9) |
| R4 | roundel hosts `tokens` | **Built** | `packages/roundel/src/plugin.test.ts` |
| R5 | caique hosts `widgets`, with `sample` | **Built** | `packages/caique/src/plugin.test.ts` › "a widget without `static` is E_NO_STATIC_PROJECTION…", "carries `sample`…" |
| R5a | Every layer hosts, or says why not | **Built**, ten of ten host | `scripts/plugin-contract-lock.test.ts` › "every layer says what it hosts, in the generated section" |
| R6 | One contract version | **Built**: `CONTRACT = 1` in all ten. Each refuses a higher one. Equality across hosts is not locked | each host's `src/plugin.test.ts` (`contract: CONTRACT + 1` or `2` → `E_PLUGIN_CONTRACT`) |
| R7 | Data first (restated) | **Built** | `scripts/plugin-schema-agreement.test.ts` |
| R8 | One error vocabulary | **Built** | `scripts/plugin-error-vocabulary-lock.test.ts` |
| R9 | One `check` runs every installed layer | **Built** in this PR | `packages/burgee/src/check.test.ts` › "burgee check hands each other layer's keys to that layer's check" (14 cases). `scripts/plugin-check-lock.test.ts` › "burgee check routes every other layer's key to that layer". `scripts/plugin-example-lock.test.ts` › "burgee check runs every other layer's own check on it…", "…carries flagstaff's rendering of the spinner in all five modes" |

The intent's criteria are graded in [`intent.md`](./intent.md#status).
