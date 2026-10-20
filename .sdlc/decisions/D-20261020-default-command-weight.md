---
id: D-20261020-default-command-weight
subject: 'What may a default command cost in bytes, and on which doors?'
taken: 'Taken — on the owner''s delegation of budgets (2026-10-12): trim first, then raise by the measurement rounded up to 50 B'
date: '2026-10-20'
superseded_by: —
---

**Two dist ceilings rise. No bundled ceiling and no claim ratchet moves.** Measured on
`feat/default-command` against `main` at `ed14fd92c2`. Dist bytes come from the walk in
`packages/burgee/src/weight.test.ts`, and bundled bytes from `bundledRecords` in
`benchmarks/axes/weight.ts`:

| Entry | Before | After | Ceiling was | Ceiling now | What the bytes are |
| :-- | --: | --: | --: | --: | :-- |
| `.` (dist) | 35,822 | 36,069 | 35,850 | **36,100** | `default` in `NODE_KEYS`; `defineProgram` refuses two defaults at one level |
| `./help` | 9,228 | 9,602 | 9,250 | **9,650** | the `(default)` mark, `[command]`, and `run-default.js`, the one lookup |
| `./completions` | 13,593 | 13,826 | inside | unchanged | a level offers its default's options |
| `./schema`, `./mcp`, every façade entry | — | −95 | inside | unchanged | `default` among the keys `--schema` passes through (+11), paid for by one loop in `optionProperty` |
| `burgee` (bundled) | 24,474 | 24,484 | 24,500 | unchanged | the `NODE_KEYS` entry, minified (main at `9348d2df83`, after #1203's seniority added 43 B) |
| `burgee/commander` (bundled) | 55,351 | 55,293 | 55,400 | unchanged | the schema key, less the loop's saving |
| `burgee/yargs` (bundled) | 108,794 | 108,736 | 108,850 | unchanged | the same |
| `burgee/commander` and v14, extra-typings, `burgee/yargs/v17` ("Everything", `/docs/weight`) | 55,653 / 56,002 / 110,312 | −58 each | ratchet | **lowered** to 55,595 / 55,944 / 110,254 | the same; `subpath-weight-lock.test.ts` |

`burgee ÷ cac` reads **2.343** against its 2.35 ratchet, and `burgee/commander ÷ commander`
**1.415** against 1.42. Both ratchets only go down (D-157), and that decided where the code went.
On `main` at `ed14fd92c2`, CI's B4 record read the same bundled figures as a local build (24,431, 55,351,
108,794), so there is no ~32 B CI allowance to add on top of these.

**Trimmed first.**

- **Help's composition left the `./help` door.** In `helpModel`, the default's arguments, options
  and examples at its parent cost the door 613 B. They are now built in `surfaces.js`
  (`withDefault`), next to the root's examples and exit codes, which no measured entry reaches
  statically. The door keeps only the mark and the usage word: 9,841 → 9,602.
- **One lookup, three readers.** Dispatch, help and completions share `run-default.ts` (`defaultOf`).
  Comparing joined paths instead of walking segments took it from 188 B to 144.
- **The façades pay nothing.** `--schema` passing `default` through put 11 B on every front-end,
  including the four entries whose over-incumbent ratchet sits at its last measurement, so the
  publishing side paid for it. `optionProperty` copied `default`, `minimum`, `maximum` and
  `sharedFrom` with four `if`s. It now copies them in one loop, in the same published order,
  and every front-end ends 95 B lighter in dist and 58 B lighter bundled. The four
  over-incumbent ratchets are lowered to the new measurement.
- **Nothing on the startup path but the key.** Dispatch is an `Again` line in `unresolved`, which
  is loaded only when argv resolves no runnable command. The B4 fixture imports `run`, which does
  not reach `defineProgram`, so the duplicate check is not in the bundled figure.

**Not trimmed.** The refusal for two defaults is 237 B on `.`. It has to run when the program is
declared, which is synchronous, so it cannot be loaded lazily. Putting it in `definition.ts`
would charge it to every front-end, and no façade declares `default`.

**Value gained.** `tool` runs its default command, help shows what the default takes
(yargs #1331), and `--schema` and completions say which command it is.

**Reversal.** Any of these ceilings may be lowered by the next PR that measures less.
