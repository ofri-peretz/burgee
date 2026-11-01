---
id: D-20261101-oxmutate-option-casts-not-a-burgee-fix
subject: 'first-adopter A4, oxmutate friction 3: oxmutate casts `options as Record<string, unknown>` and narrows each flag by hand, though burgee infers the option types. Does burgee change?'
taken: 'Taken by the agent closing first-adopter''s A4 under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-11-01'
date: '2026-11-01'
superseded_by: —
---

**No change to burgee. The casts are oxmutate's own mistake, and removing them is oxmutate's
follow-up.** The friction is recorded here so A4 holds: every friction point is an intent, a gap or
a decision not to fix it.

**What happened.** oxmutate's `src/cli.ts` casts a handler's `options` to `Record<string, unknown>`
and narrows each flag in `overridesFrom`. burgee already types them: `defineCommand`'s `run`
receives `CommandContext<InferOptions<…>, InferArgs<…>>`. The adoption report's probe of
2026-11-01 type-checks `options.since` as `string | undefined` and `options.concurrency` as
`number | undefined` with no cast
([`.sdlc/research/adoption/oxmutate.md`](../research/adoption/oxmutate.md), friction 3).

**Why not a burgee change.** The behaviour the adopter needed exists, is typed, and is documented:
`apps/docs/content/docs/api/index.md` shows `run`'s signature with `InferOptions` and has an
`InferOptions` section. Nothing in burgee was missing or wrong. A guide example would not have
prevented a cast written before the author looked at the inferred type.

**What is not decided here.** The report calls it a documentation signal. That is not filed as
work: one adopter writing a cast is not evidence that the reference is unclear. If a second adopter
casts the same way, this decision is the place to reopen it.
