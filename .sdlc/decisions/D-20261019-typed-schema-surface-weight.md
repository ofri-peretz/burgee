---
id: D-20261019-typed-schema-surface-weight
subject: 'What may typed positionals, help bounds and the `--mcp` positional fix cost in bytes, and where does R1''s declaration check live?'
taken: 'Taken — on the owner''s delegation of budgets (2026-10-12): trim first, then raise by the measurement rounded up to 50 B'
date: '2026-10-19'
superseded_by: —
---

**Three ceilings rise and one bundled ceiling rises; no claim ratchet moves.** Measured on
`feat/typed-schema-surface` against `main` at `1dcf064a`, dist bytes from
`packages/burgee/src/weight.test.ts`'s walk, bundled bytes from
`npm run bench -- --axis weight --check`:

| Entry | Before | After | Ceiling was | Ceiling now | What the bytes are |
| :-- | --: | --: | --: | --: | :-- |
| `.` (dist) | 35,617 | 35,822 | 35,681 | **35,850** | `ctx.args` named on every run; one gate loading `typed-args.js` |
| `burgee` (bundled) | 24,285 | 24,431 | 24,290 | **24,500** | the same, minified; covers CI's ~32 B |
| `./help` | 9,087 | 9,228 | 9,130 | **9,250** | `(minimum: n)` / `(maximum: n)` |
| `./mcp` | 28,069 | 28,364 | 28,200 | **28,400** | a skipped optional positional is filled or refused |

`burgee ÷ cac` reads **2.337** against its 2.35 ratchet and `burgee/commander ÷ commander`
**1.417** against 1.42 (55,388 B against 55,400). Both are downward-only (D-157), so neither may
rise, and that is what decided where the code went.

**Trimmed first.**

- **R1's declaration check left `definition.ts`.** In the one door it cost **382 B in every
  front-end** (`./commander`, `./yargs`, `./plugin`, `./schema`, `./mcp`, both v17 and v14
  entries) and took both claim ratios over their ratchets (2.362 and 1.424). It now runs in
  `typed-args.js`, on the first run of a command whose arguments declare a type or choices,
  before any word is read; TypeScript refuses both mistakes where the command is written
  (`DeclaredArgument`). The cost: a JavaScript caller learns of `type: 'int'` on the first run of
  that command, not when it is declared. Recorded as a reading of `typed-positionals` R1.
- **S4's stdin gate folded into the same chunk.** `-` is only ever a `type: 'file'` argument's,
  and such a command loads `typed-args.js`, so `execute.ts` lost its own `stdin-dash.js` gate.
- **The argument's `type` on its `inputSchema` property was not built.** 78 B in `schema.js`,
  which every front-end reaches, put `./commander` 12 B and `./yargs` 31 B over and the commander
  bundle 20 B under its ceiling before CI's 32 B. It stays `typed-positionals` R4's remaining half.

**Value gained.** Typed positionals with a `fix` (an agent runs the closest choice), the bounds a
person reads in help, and `--mcp` calls that no longer hand a value to the wrong positional.

**Reversal.** Each ceiling may be lowered by the next PR that measures less.
