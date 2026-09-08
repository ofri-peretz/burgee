# Intent — One plugin contract across all four layers

> Stage 1 artifact. Child of [`cli-output-stack`](../cli-output-stack/intent.md), U4 and U9,
> and of [`cli-modularity`](../cli-modularity/intent.md), M1–M6. The lineage says the plugin
> API is the product (Vite) and plugins are data (ESLint flat config). This intent makes
> that one contract, not four.

**Status:** review · **Opened:** 2026-09-08 · **Design:** [`design.md`](./design.md) (2026-09-08) · **Owner:** @ofri-peretz

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

- One schema file, byte-identical in every published tarball; a lock asserts it.
- The sample plugin above registers in all four packages and renders in all five modes.
- `burgee plugin check` on a plugin missing `static` fails with `E_NO_STATIC_PROJECTION`.
- The U9 eval passes weekly against the shared schema.

## Open questions

- Whether `tokens` accepts only hex (truecolor) or also styleText names. Proposed: both,
  hex is contrast-checked, names are not (roundel R5).
- Whether third-party plugins get a namespace on npm (`burgee-plugin-*`) or none. Proposed:
  a `keywords` convention only; the gallery indexes by keyword, not by name.
