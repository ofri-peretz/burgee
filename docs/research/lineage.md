# Lineage — what we take from whom, and what that commits us to

Chosen 2026-09-07. Six sources, each reduced to decisions someone can hold us to rather
than an influence we can claim afterwards. Anything not listed here is not a reference
point, and "X does it this way" is not an argument unless X is on this page.

**These are living projects, not a snapshot.** Every one of them is under active
development and improving faster than we are, so this page is re-read at the start of
each wave and the decisions below are re-derived rather than inherited. A lineage that
freezes on the day it was written is how a project ends up citing a version of Vite that
no longer exists.

| Source | What we take | What it commits us to |
| :--- | :--- | :--- |
| **Vite** | the architecture, and that the plugin API *is* the product | TypeScript for everything users import or extend |
| **Rolldown** | filter before you cross a boundary | hook filters are first-class, evaluated before a plugin loads |
| **ESLint flat config** | plugins are data; config is an ordered array | a plugin is inspectable without being executed |
| **Standard Schema** | one declaration, types derived | options accept any Standard Schema validator |
| **oxlint** | how a native core survives a JS plugin boundary | the lint rule goes native; the framework does not |
| **TypeScript 7 / tsgo** | Go chosen for fidelity, not speed | any native port is graded by the existing suite |

## Vite — the architecture, and the plugin API as the product

Vite is TypeScript. It got fast by *calling* esbuild and rolldown for batch work, not by
becoming a binary, and its JS plugin API is a large part of why it won. That is the whole
shape of this project.

**Commits us to:** the engine stays TypeScript (§7 of `architecture.md`); native code only
where it owns its own process and does bulk work; and the plugin API is treated as a
product surface with its own docs, versioning and best-practice guide — not an
afterthought bolted on once the core is done.

**Also taken:** the `defineX` idiom. `defineConfig` → `defineCommand`, `definePlugin`.
It reads as configuration, it is a plain object, and the function exists only to carry
types.

## Rolldown — filter before you cross a boundary

Rolldown's plugin hooks accept a **filter that is evaluated on the Rust side before the
hook is invoked**, so most crossings never happen. Built-in plugins are implemented
natively to avoid the boundary entirely.

Our boundary is not FFI, it is **module loading** — and the same discipline applies.

**Commits us to:** hook filters as a first-class part of the plugin API. A plugin declares
*which commands a hook applies to* as data, and burgee evaluates that against the manifest
**before importing the plugin's module at all**:

```ts
definePlugin({
  name: 'telemetry',
  hooks: {
    preRun: { filter: { command: /^deploy( |$)/ }, handler: () => import('./telemetry.js') },
  },
});
```

A 250-command CLI with 20 plugins loads the one handler that matches, not twenty modules
that each decide they are not interested. This is the difference between a plugin system
that stays fast at scale and one that does not.

## ESLint flat config — plugins are data, config is an ordered array

Flat config made two moves worth copying: a plugin is a plain object (`rules`, `configs`,
`processors`) rather than a registration function, and configuration is an **array applied
in order**, so precedence is readable rather than inherited through a resolution
algorithm nobody can trace.

**Commits us to:** `definePlugin` returns data (see `cli-modularity` R3); composition is an
ordered array where later entries win; and a plugin can be read — by a person, an agent or
a CI job — **without being executed**, which is a security property and not only a
performance one.

## Standard Schema — one declaration, types derived

**Commits us to:** an option's `type` accepts any Standard Schema validator, so zod,
valibot and arktype all work with no adapter, and the TypeScript types of
`ctx.options` are *inferred from the schema* rather than written a second time
(S1). We do not ship a validator of our own, and we do not pick a favourite.

## oxlint — how a native core survives a JS plugin boundary

oxlint's raw transfer uses Rust's memory layout as the wire format so there is no
serialisation, and even then the bridge measurably slows it against native-only mode.
That is the honest ceiling on native-core-plus-JS-plugins, and it is why the *framework*
stays TypeScript (§7).

**Commits us to:** one native target and one only — `eslint-plugin-cli-floor` as an oxc
rule, which owns its process and works across thousands of files, the profile that pays.
If a native front-end is ever built (wave 5, conditional), it reads the static manifest and
never calls into JS.

## TypeScript 7 / tsgo — Go for fidelity, not speed

Microsoft chose **Go over Rust** because it allowed a near line-by-line port that preserved
identical type-checking behaviour. The decision was driven by behavioural fidelity to an
existing implementation, not by benchmarks.

**Commits us to:** if a native front-end is built, it is **Go**, for the same reason — our
binding constraint is fidelity against 2,304 upstream tests, not raw speed — and it is
graded by that existing suite rather than by a new one written to suit it.

## Not on this list, on purpose

- **oclif** — its build-time manifest is a good idea we already have by another route
  (flat config's plugins-as-data). Its *shape* is what `Z1` exists to prevent. Past tense.
- **Rollup** — the hook vocabulary we use (`enforce: 'pre' | 'post'`, named hooks)
  originated there, but it lives and improves in **Vite and Rolldown** now, and Rolldown
  adds the filters that make it work at scale. We take it from where it is being developed,
  not from where it started. Past tense.
- **preact/compat** — pay-per-import is already `K6` and locked by
  `packages/burgee/src/weight.test.ts`; it needs no separate lineage.
- **Vitest** — a strategy reference, not an architectural one. Its lesson (copy the
  incumbent's API) is recorded in `competitor-landscape.md` §5 and does not shape the code.

## We implement the incumbents; we do not wrap them

Stated plainly because it is the thing most likely to be misread. **`burgee/commander`
does not depend on commander.** It is commander's public surface — 151 methods —
reimplemented over burgee's engine, in our source tree. Same for `burgee/yargs` and its
108. A user installing burgee installs burgee and nothing else, and the weight lock
asserts every entry point imports nothing outside `node:`.

The only place the real incumbents appear is `compat-oracle`, which is private and never
published. It needs them as **reference implementations**: to run their own suites against
our code, and to run the same program through the real one and through ours to diff the
output byte for byte. Those are measuring instruments, and they never touch a user.
