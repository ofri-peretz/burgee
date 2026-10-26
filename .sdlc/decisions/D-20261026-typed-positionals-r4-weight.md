---
id: D-20261026-typed-positionals-r4-weight
subject: 'typed-positionals R4 publishes an argument''s JSON type and offers its choices in completions: are 94 B on every façade ratchet, and 3.2 KB in the completion chunk, worth it?'
taken: 'Taken by the coordinator under the owner''s delegation (burgee-owner-delegates-tradeoffs), 2026-10-26'
date: '2026-10-26'
superseded_by: —
---

**Yes. The four over-incumbent façade ratchets in `scripts/subpath-weight-lock.test.ts` rise by
94 B each**, measured on the regenerated `/docs/weight` page: `burgee/commander` and
`burgee/commander/extra-typings` 55,601 → 55,695, `burgee/commander/v14` 55,950 → 56,044,
`burgee/yargs/v17` 110,260 → 110,354. **Three static-graph budgets in
`packages/burgee/src/weight.test.ts` rise**, each the measurement plus the ~32 B CI reads heavier,
rounded up to the next 50 B: `./completions` 16,000 → 18,550 (measured 18,491), `./mcp` 28,400 →
28,500 (28,428), `./commander/v14` 112,750 → 112,800 (112,767).

**What costs the bytes.**

- *`schema.js`, 94 B minified, in every front-end* because `--schema` and `--mcp` are.
  `argumentProperty` publishes the argument's JSON type instead of `string` for all (30 B), and
  its `default` as that type — `0.5`, not `"0.5"`, for a `number` argument (64 B). 134 B in the
  unminified static walk.
- *`completions.js`, +3,257 B unminified,* the four shells' scripts for a positional with
  `choices`: bash and PowerShell count the slot the cursor is in (a valued flag's value not
  among the words), fish gets one slot function and a `complete` line per listed positional,
  zsh lists the choices as the slot's action. `complete-dynamic.js` +72 B: a slot with
  `choices` and no completer offers its choices when a script asks the program.

**Why pay it.**

- *The type.* An agent reading `inputSchema` was told an `integer` argument is any string. A
  client that validates a call against the schema it was given had no way to know `x` would be
  refused with exit 2. That is the contract disagreeing with itself across two surfaces. It is
  the gap commander-env V2 closed for `env` (D-20261025-commander-env-v2-facade-weight), at the
  same place.
- *The typed default.* Publishing `type: 'number'` beside `default: '0.5'` would make that
  disagreement worse. A client that pre-fills a default sends a string its own validator then
  refuses. The 64 B are what stops the first half of this change creating a new defect.
- *The completions.* They are R4's last surface (criterion 2) and the reason the intent was
  held at `approved`. They are in a chunk the engine and the commander front-end load only on
  `completion <shell>`, through a dynamic import, so no program pays for them at startup (K6).
  They are offered from the script, never by running the program (D3). That is why each shell
  carries its own counting rather than one call back to `__complete`.

The ratchets stay ratchets: a later change that shrinks the façade lowers them again. The
README's generated claims move with them (`npm run readme:gates`): `lighter-than-commander`
reads 1.417× against its 1.42× ratchet (was 1.415×), and `lighter-than-yargs-at-parity` 0.548×
(was 0.547×). Both still hold.

**Rejected.**

- *Publish the type and leave `default` a string*: 64 B cheaper, and it ships a schema that
  contradicts itself.
- *Coerce the default with `JSON.parse`*: fewer bytes, but a malformed default would throw
  inside `--schema`, which must succeed with no configuration (N8).
- *Route a listed positional through `__complete` in bash, fish and PowerShell*: far fewer bytes
  in `completions.js`, and it breaks D3 for every program with a choice positional. Today those
  programs never run on TAB.
