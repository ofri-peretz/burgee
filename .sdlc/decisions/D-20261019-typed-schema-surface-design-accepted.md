---
id: D-20261019-typed-schema-surface-design-accepted
subject: 'Are the designs of `typed-positionals`, `commander-schema` and `cli-help-renderer` accepted for the typed-schema-surface build, and which requirements does it build?'
taken: 'Taken — accepted by the coordinator under the owner''s delegation of Design→Build accepts'
date: '2026-10-19'
superseded_by: —
---

**Accepted by the coordinator under the owner's delegation.** The three designs were at `review`
and are accepted at Design→Build for one PR, `feat/typed-schema-surface`. Each intent moves to
`approved` on this record, and to `shipped` only where a per-criterion Status table cites a check
for every criterion.

| Intent | Requirements built | Re-grounded against `main` at `1dcf064a` |
| :-- | :-- | :-- |
| [`typed-positionals`](../intents/typed-positionals/spec.md) | **R1** (`ArgumentSpec.type`, `choices` on a native argument, the definition check), **R2** (`ctx.args`, typed by inference), **R3** (the usage error, with a `fix` where one value is exact); R4's `choices` half for native programs follows from R1, since `enum` is read from the manifest. Not built: R4's argument `type` on `inputSchema` and completions | R5 and R6 were already met by #1091 (`B-20261012-commander-argument-choices` is `closed`); the spec's budget constraint on `./commander` named a 61,100 B ceiling that commander-front-end-diet has since cut to 55,400 |
| [`commander-schema`](../intents/commander-schema/spec.md) | **R3**'s `--no-x` half (yargs #898): held, not built, now with a check citing it | C1, R2 and R4 are larger than this batch (see `B-20261019-commander-schema-remaining`); C2's and C3's positional half is `typed-positionals` |
| [`cli-help-renderer`](../intents/cli-help-renderer/spec.md) | **S1**'s last row: `minimum` and `maximum` rendered in help | S3 is the incumbent-parity contract; `help.ts` renders burgee-native help only, and neither `burgee/commander` nor `burgee/yargs` reaches it, so no graded screen can move |

**Three readings taken here rather than asked.**

- **`fix` on a positional follows E3, not the intent's sentence.** Criterion 1 of
  `typed-positionals` says `x` for an integer "is exit 2 with a `fix`". E3 says a `fix` is the
  exact line to run, "omitted rather than guessed", and no integer is the exact replacement for
  `x`. So the refusal carries a `fix` where exactly one value is right — the closest choice, when
  `suggestSimilar` names one; the rounded integer for `2.6` — and otherwise the usage block that
  every refusal without a `fix` teaches with (D-20260930). The option path does the same: its
  number errors carry a hint and no `fix`.
- **The declaration check runs on first use, not at `defineCommand`.** An unknown argument
  `type` and `choices` on a non-string one are refused by `typed-args.js` before any word is
  read, for a first-party and a plugin command alike, and by TypeScript where the command is
  written. In `definition.ts`'s door it cost 382 B in every front-end and broke two
  downward-only claim ratchets (D-20261019-typed-schema-surface-weight).
- **Help prints `(minimum: 1) (maximum: 20)`,** the JSON Schema's words that `--schema`
  publishes, after `(default: …)`: one vocabulary across the person's copy and the agent's.

**Reversal.** Each key is additive. Removing `ctx.args` or an `ArgumentSpec.type` value is a
major; changing the help annotation's words is a minor that moves no graded screen.
