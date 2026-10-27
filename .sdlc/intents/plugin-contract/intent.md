# Intent — One plugin contract across all four layers

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md), U4 and U9,
> and of [`cli-modularity`](../cli-modularity/intent.md), M1–M6. The lineage says the plugin
> API is the product (Vite) and plugins are data (ESLint flat config). This intent makes
> that one contract, not four.

**Status:** shipped · **Opened:** 2026-09-08 · **Design:** [`spec.md`](./spec.md), re-grounded 2026-10-25 and accepted in [`D-20261025-plugin-contract-design-accepted`](../../decisions/D-20261025-plugin-contract-design-accepted.md) · **Owner:** @ofri-peretz

---

## What is wanted

A plugin is **one object** that any layer can host, and a user registers it **once**:

```js
export default {
  name: 'acme',
  tokens:     { error: '#b00020', hint: '#5a5a5a' },        // roundel — a theme
  spinners:   { acme: { frames: ['◐','◓','◑','◒'], interval: 80, static: '…' } }, // flagstaff
  components: { /* static + optional frame */ },              // flagstaff
  widgets:    { /* prompt kinds: static + optional frame */ },// caique
  commands:   [ /* defineCommand() nodes */ ],                // burgee (M4)
  hooks:      { /* enforce: 'pre' | 'post', filtered, declarative */ }, // burgee (M5)
};
```

- `register(plugin)` in any package accepts the whole object and keeps the keys it
  understands; unknown keys are ignored, never errors, so one plugin works on any subset of
  the family that is installed.
- One JSON Schema, `plugin.schema.json`, published from `burgee` and copied into every
  package tarball and into `llms.txt`; every layer validates against the same file.
- One command, `burgee plugin check <file>`, runs every installed layer's validation and
  renders every contribution in every mode; `flagstaff check` is the same command scoped.
- Every contribution has a static projection or is refused (U3); every contribution is
  inspectable without executing it (U4); a `frame` or a `hook` function is the only
  executable surface, and hooks are filtered before they load (Rolldown).
- The docs site's plugin gallery is generated from registered plugins' static projections.

## Why now

- Without this, four packages grow four plugin shapes, and the family's one structural
  advantage — a plugin never wires itself into three places — is lost in the first quarter.
- U9 says an agent must be able to write a plugin in one turn from the schema. One schema
  is a one-turn task; four are a research project.
- `cli-modularity` (M4 commands, M5 hooks) already specifies burgee's half; this intent
  adds the three output keys to the same object rather than beside it.

## Affected users and systems

- `packages/burgee`: `plugin.schema.json`, `burgee plugin check`, `register()` accepting
  the shared shape; `cli-modularity` design updated to cite this contract.
- `roundel`, `flagstaff`, `caique`: each `register()` reads its keys from the shared object.
- `apps/docs`: gallery and `llms.txt` carry the schema.
- `evals/`: the U9 authoring eval runs against the shared schema, weekly.

## Alignment with `cli-modularity`

Its R3 already says a plugin is data plus lazily-loaded behaviour, built with
`definePlugin({ name, commands, … })`, and its design rejects discovery by package-name
prefix and a marketplace. This intent adds keys to that same object and changes nothing
else: `definePlugin` remains the typed helper, the gallery is generated from *registered*
plugins (a projection, not a registry), and the keyword convention indexes the gallery only.

## Constraints

1. Data first: no plugin key may require a function except `frame` (per component or
   widget) and `hooks` (burgee, filtered, declarative form per `cli-modularity`).
2. No discovery: explicit `register()` or a `plugins: [...]` array on `defineProgram`
   (ordered, like ESLint flat config). Never a `package.json` field, never a directory scan.
3. A plugin registered in one layer never causes an import of another layer; the keys are
   read lazily by whichever package is asked.
4. Schema is versioned; a plugin declares `contract: 1`; a host refuses a newer contract
   with a `fix` that names the upgrade.

## Success criteria

1. One schema file, byte-identical in every published tarball; a lock asserts it.
2. The sample plugin above registers in all four packages and renders in all five modes.
   *(Read 2026-10-25 as the family's sample, `examples/plugins/acme.mjs`, across every host. The
   hosts grew from four to ten.)*
3. `burgee check` on a plugin missing `static` fails with `E_NO_STATIC_PROJECTION`.
   *(Restated 2026-10-25 from `burgee plugin check`, the name that never shipped. The
   command is the one that "runs every installed layer's validation", spec R9.)*
4. The U9 eval passes weekly against the shared schema. *(Restated 2026-10-25: every
   **executed** weekly reading passes. A run the usage limit stopped is recorded `not-run`,
   not a failure, and it is not a reading.)*

## Re-read on the published packages — 2026-10-26

**C1–C3 hold on what npm serves. C4 still has no executed reading, so the intent stays
`approved`.** Version PR #1253 published all ten hosts on 2026-10-26 from `main` at `c4230e33`,
which carries #1240 (`burgee check` runs every installed layer's check). Unlike the four intents
stamped beside it in
[`D-20261026-shipped-on-published-patch`](../../decisions/D-20261026-shipped-on-published-patch.md),
this one never waited on a release alone.

Run on 2026-10-26 in an empty `mktemp -d` directory after `npm i bellpull@1.0.10 burgee@1.7.2
caique@1.5.1 closeout@1.1.8 controlroom@1.0.7 flagstaff@1.7.4 linegauge@1.1.5 paratext@1.0.11
roundel@1.2.1 seniority@1.1.1`:

| | Criterion | Command, against the published tarballs | Output |
| :-- | :-- | :-- | :-- |
| C1 | One schema, byte-identical in every published tarball | `shasum -a 256` of `require.resolve('<pkg>/schema.json')` for all ten | one hash, `b13e801f702edfca…`, 18,911 B in all ten (the published copy is minified; it parses deep-equal to `packages/burgee/src/schema.json` on `main`) |
| C2 | The sample registers everywhere and renders in five modes | `burgee check acme.mjs`, the file `examples/plugins/acme.mjs` copied out | exit 0. `layers` lists roundel, flagstaff, linegauge, paratext, seniority, bellpull, closeout and caique, each `exitCode: 0`; flagstaff's renders the spinner in tty, pipe, ci, json and accessible. burgee's own `commands` show `doctor` |
| C3 | `burgee check` on a plugin missing `static` → `E_NO_STATIC_PROJECTION` | `burgee check nostatic.mjs`, one spinner with `frames` and `interval` and no `static` | `refused:` with code `E_NO_STATIC_PROJECTION`, message `flagstaff: s has no static projection`, and a fix that says to give it a `static`; exit 1 |
| C4 | The U9 eval passes weekly | `evals/history/` on `main`; `gh run list --workflow evals.yml` | **Met 2026-10-27:** run 40504387711 (2026-10-27, `db19cc6`), `evals/history/2026-10-27-db19cc6-40504387711.json` (#1299) executed and passed all 10 plugin cases (6–11 turns), counted as a weekly reading by [D-20261027-dispatched-eval-counts-as-weekly](../../decisions/D-20261027-dispatched-eval-counts-as-weekly.md). *Before that:* The newest executed weekly readings are still 2026-10-08 and 2026-10-09 (10 of 10 plugin cases). 2026-10-15 and 2026-10-22 were `not-run`. The next scheduled run is Saturday 2026-10-31 at 06:20 UTC (`cron: "20 6 * * 6"`, moved from Thursday to an hour after the weekly quota resets by D-20261027-close-three-workflow-gaps) |

**Shipped 2026-10-27.** C1–C3 hold on the published packages (#1281); C4 is met by run 40504387711 (2026-10-27, `db19cc6`), `evals/history/2026-10-27-db19cc6-40504387711.json` (#1299).

## Status

Graded 2026-10-25 on `main` at `b453b07b`, plus the PR that accepts the design. **Three of four
are met. The fourth has no current reading**, so the intent stays `approved` and does not ship
until a weekly eval run executes and passes.

| | Criterion | State | Evidence |
| :-- | :-- | :-- | :-- |
| C1 | One schema, byte-identical, locked | **Met**: ten hosts, one 25,395 B file | `scripts/plugin-schema-lock.test.ts` › "is byte-identical everywhere it is hosted" |
| C2 | The sample registers everywhere and renders in five modes | **Met** | `scripts/plugin-contract-lock.test.ts` › "one object registers into every host". `scripts/plugin-example-lock.test.ts` runs every host's `check` on `examples/plugins/acme.mjs`, and through `burgee check`, "…carries flagstaff's rendering of the spinner in all five modes" (tty, pipe, ci, json, accessible) |
| C3 | `burgee check` on a plugin missing `static` → `E_NO_STATIC_PROJECTION` | **Met** in the accepting PR | `scripts/plugin-example-lock.test.ts` › "burgee check refuses a spinner with no static projection, with flagstaff's own code and fix" |
| C4 | The U9 eval passes weekly | **Open: no current reading.** 10 of 10 plugin cases passed on 2026-10-08 (`c5843e3`) and 2026-10-09 (`3ff3b8e`). 2026-10-15 and 2026-10-22 were `not-run` (usage limit) | `evals/history/2026-10-0{8,9}-*.json`; `evals/history/2026-10-22-80c8eaa-39762001842.json` (`status: not-run`, `reason: usage-limit`) |

The requirement-by-requirement state is the [spec's Status table](./spec.md#status).

## Verified against `main` — 2026-09-09

*(Superseded by the Status section above; kept as the record of the first grading.)*

Checked criterion by criterion on `61bd11b9`. **One of four met, and that one only at the two
hosts that exist.** The status stays `review`.

- **One schema file, byte-identical in every published tarball, asserted by a lock** — met for
  two of four packages, which is what the lock can see. `packages/roundel/src/schema.json` and
  `packages/flagstaff/src/schema.json` are byte-identical (4,863 B, md5 `c7c9798b…`), and
  `scripts/plugin-schema-lock.test.ts` derives its host list from the tree — a package earns a
  check by having `src/plugin.ts` — so it asserts existence, the `./schema.json` export and
  byte-identity. `caique` and `burgee` ship no schema at all, so the lock finds them *not
  applicable* rather than failing them. A lock that only checks the packages that already
  comply is not yet the lock this criterion describes.
- **The sample plugin registers in all four packages and renders in all five modes** — not met.
  Two of four host plugins. `caique` has no widget surface; `burgee` has no `register()`, no
  plugin `commands` and no plugin `hooks`. No test registers one object across packages.
- **`burgee plugin check` fails with `E_NO_STATIC_PROJECTION`** — **stale, and met under the
  name that shipped.** `node packages/flagstaff/dist/cli.js check <a spinner with no static>`
  prints `E_NO_STATIC_PROJECTION` with its `fix` line and exits 1. Under the name the criterion
  uses, `burgee plugin check` returns `error: unknown command "plugin"`. The command shipped
  scoped to one layer; the criterion's "runs every installed layer's validation" is unbuilt, and
  the wording should be rewritten to `flagstaff check` or the cross-layer command should be.
- **The U9 eval passes weekly against the shared schema** — not met. `evals.yml` has never run
  on its `schedule`, and every PR run prints `Layer 2 — skipped: no credential`.

## Open questions

- Whether `tokens` accepts only hex **Decided 2026-09-20 → D-066.** (truecolor) or also styleText names. Proposed: both,
  hex is contrast-checked, names are not (roundel R5).
- Whether third-party plugins get a namespace on npm **Decided 2026-09-20 → D-067.** (`burgee-plugin-*`) or none. Proposed:
  a `keywords` convention only; the gallery indexes by keyword, not by name.
