---
id: B-20261101-burgee-text-symbol-not-exported
section: B
status: open
source: first-adopter A4, oxmutate adoption report friction 1 (`.sdlc/research/adoption/oxmutate.md`)
recommendation: 'Export `TEXT` from the root entry of `burgee`, typed as the `unique symbol` it is, so an adopter imports it instead of repeating the registry string. A `withText(data, fn)` helper is the alternative; choose one, not both. A type-level case and a runtime case that `import { TEXT } from ''burgee''` is `Symbol.for(''burgee.text'')`, proven red on `burgee@1.9.4` first'
---

burgee defines `TEXT = Symbol.for('burgee.text')` in `packages/burgee/src/render.ts`, and the
renderer prints a result that carries a function under it as text. `packages/burgee/src/index.ts`
does not re-export it. So oxmutate, the first CLI built on burgee from its first commit, writes
`const TEXT = Symbol.for('burgee.text')` in its own `src/cli.ts` and sets `data[TEXT]` on both
commands' results.

It works only because the key is a registry symbol. If burgee renames the string, oxmutate's text
output falls back to the JSON rendering, and no type or test on either side notices.

This is B, not A, because it adds to the root entry's public API, and the root entry's bundle has a
ceiling. Choosing between a bare export and a helper is the decision.
