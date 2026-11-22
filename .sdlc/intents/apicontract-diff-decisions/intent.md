# Intent — `apicontract diff` holds a change to the decision written in the contract

> Follows [`../apicontract-diff/`](../apicontract-diff/), which says *what* a change breaks. This
> intent is about *whether anyone meant it*. Raised by the owner on 2026-11-22 while working through
> a contract pipeline for a talk: "Contracts make mistakes impossible to compile. Judgment decides
> which changes are mistakes."

**Status:** draft · **Opened:** `2026-11-22` · **Owner:** `@ofri-peretz` · **Lane:** `ac-diff`

---

## What is wanted

A breaking change and a bug can be the same diff. A tool sees what changed, not why. Today the
"why" lives in a PR thread and is lost after the merge. This intent puts it in the contract, where
`apicontract diff` can check it on every later run:

```yaml
Balance:
  properties:
    amount:
      deprecated: true
      x-sunset: 2027-03-01        # removed after this date
      x-replaced-by: amountCents
    currency:
      enum: [USD, EUR, GBP, ILS]
      x-change: ADR-0091          # adding ILS was decided here
```

`apicontract diff <old> <new>` reads these **decision markers** on the new side and checks that
change and decision agree:

1. **A breaking change with no decision fails.** "breaking change with no decision: add `x-change`
   naming the decision, or revert. fix: …". This is the likely bug.
2. **A decision that matches no change fails.** A marker left behind after its change landed (or
   one written for a change that never happened) is stale.
3. **A field still present after its `x-sunset` date fails.** The decision is carried out, not
   forgotten. The date is compared with a `--today` the caller can pin, so the check is
   reproducible.
4. **A breaking decision needs a version move.** A new major path (`/v4`) or a major bump, which
   `--changeset` already writes from the verdict.
5. **`x-replaced-by` is followed.** The named member must exist in the new contract.

A non-breaking change needs no marker. A marker on a non-breaking change is allowed if it names a
decision (some teams record every enum addition), and is not counted as stale.

## Why now

- `diff` already sorts each change into breaking, unknown and non-breaking (`apicontract-diff`,
  shipped behind `D-20261118-contracts-program-go-ahead`). Today it ignores every `x-` keyword
  (`diff-schema.ts`), so markers can be added without changing a single existing verdict.
- No incumbent does this. oasdiff reports changes and has a deprecation-days check for
  `x-sunset`, but nothing ties a breaking change to a recorded decision, and nothing fails a stale
  marker. Schema diff tools for events have neither.
- The same check covers events: a renamed `gift_sent` property in a JSON Schema event is held to
  the same rule as an OpenAPI field, because `diff` reads both through one model.

## Affected users and systems

- `packages/apicontract/src/diff-*.ts`: read markers, pair them with findings.
- `packages/apicontract/src/command-diff.ts`: `--today`, the new finding codes, SARIF locations.
- Anyone running `apicontract diff` in CI: a breaking change that passed before (exit 1 already)
  now says what to add to pass on purpose.

## Constraints

- **Off by default for one release.** `--decisions` turns it on; the next minor makes it the
  default, with `--no-decisions` to opt out. Turning on a new failure silently would break every
  CI that runs `diff` today.
- The marker vocabulary is small and documented: `x-change`, `x-sunset`, `x-replaced-by`, plus
  OpenAPI's own `deprecated`. No free-form keys, so a typo (`x-chnage`) is reported, not ignored.
- `x-change`'s value is opaque text (an ADR id, a ticket, a URL). `diff` does not fetch it.
  Packages, never services.
- Every new finding carries a `fix:` line and a pointer, like every other `diff` finding.
- Zero new dependencies. Dates are ISO `YYYY-MM-DD`, compared as strings after validation.

## Success criteria

- Each of rules 1–5 has a planted case that fails without the rule and passes with it (rule 4 of
  the working agreement: a check proven to fail on the unfixed state).
- On the pinned corpus, `--decisions` changes no verdict on a contract that carries no markers.
- One worked example in the README: the `Balance` / `gift_sent` pair above, the CI lines, and
  the output for each rule.
- A reviewer agent's playbook (`contract-change-review`) can read the findings as JSON and list,
  per finding, who reads that member and what a migration needs. The playbook is a follow-up;
  the JSON shape it needs is in scope.

## Defaults taken

- Markers are read only on the new side. The old side's markers matter only for rule 2 (stale).
- A breaking change inside a member that already carries `deprecated: true` and an `x-sunset` in
  the past is the sunset being carried out, so it needs no new `x-change`.

## Rejected

- **A label on the PR instead of a marker in the spec** (`contract-change` label plus an ADR link
  in the PR body). It works in one forge and is lost after merge; the spec travels with the code.
- **Inferring intent from the ticket.** An agent can compare a diff with its ticket and flag a
  mismatch, but that is a reviewer's aid, not a gate. It stays in the playbook.
- **Failing on any change to an event schema.** Too blunt. Additive event changes are normal;
  the rule is the same as for the API: breaking needs a decision.
