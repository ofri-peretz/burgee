# Design — `triggerlist`

Intent: [`intent.md`](./intent.md). **Status:** draft.

---

## Requirements

- **R1** A checklist schema: `id`, `trigger.paths` (globs), optional `trigger.pattern` (regex on
  added or removed lines), `question`, `check`, `sources` (PR, incident, decision or lock-test
  links). Validated by `validator`.
- **R2** `triggerlist match <base> [--json]` prints the items whose triggers fire for
  `git diff <base>...HEAD`, each with the file:line that fired it.
- **R3** `triggerlist compile --budget <bytes>` writes `REVIEW.md`, one line per rule with a link,
  and fails when over budget with a `fix:` naming the lowest-firing items to drop.
- **R4** `triggerlist seed` drafts items from lock-test header comments and decision files, for a
  person to edit. It never writes the checklist directly.
- **R5** A reusable review step: reads `REVIEW.md` and the checklist from the base branch,
  runs `match`, passes the items and the previous round's findings to the reviewer, records the
  head SHA, and marks a result stale if the head moved. Built as `triggerlist brief` (the
  reviewer's prompt, tested) plus the composite action `.github/actions/triggerlist-review`, not
  a `workflow_call` workflow: a called workflow renames the caller's check to `review / <job>`,
  which would break every repository that requires `review`.
- **R6** `triggerlist protect <base>` lists gate files changed alongside non-gate files; exit 0
  in observe mode, 1 in enforce.

## Design

- A burgee CLI, like provedone.
- Gate files are declared in the checklist file's header, so each repo names its own.
- Previous findings are read from the last review comment on the PR, matched by a marker.
- Order: R1–R2, R4 on this repo, R3 to write the first `REVIEW.md`, R5 replacing burgee's
  `claude-code-review.yml`, then eslint and interlace call it, then R6.

## Verification

- `packages/triggerlist/src/*.test.ts`: a fixture repo with planted diffs, one per trigger kind,
  asserting exactly which items fire.
- R5: a fixture PR that edits `REVIEW.md`; the workflow's prompt contains the base version.
- oxmutate through `mutation:changed`.

## Rejected alternatives

- **A second reviewer model.** The post reports stacking reviewers often does worse than tuning
  one.
- **Every rule in the prompt every time.** The playbook measured about 535 KB of rules against a
  150 KB limit; rules past the limit drop silently. Selection by trigger is the fix.
- **CODEOWNERS alone for self-edit protection.** With one owner it approves its own change.

## Out of scope

- Measuring whether the reviewer catches bugs. That is `replz`.
- Writing the reviewer. It stays the existing Claude review action.
