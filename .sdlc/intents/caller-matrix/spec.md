# Design — The caller matrix

Intent: [`intent.md`](./intent.md). **Status:** approved (2026-10-25).

> Written at the Design→Build gate of 2026-10-25 and accepted the same day by the coordinator under
> the owner's delegation
> ([D-20261025-caller-matrix-design-accepted](../../decisions/D-20261025-caller-matrix-design-accepted.md)).
> This intent is PRINCIPLES 5 made checkable: "every feature has a conformance case per caller".

---

## Design gate 2026-10-25

**Accepted for Build.** This is the first design for this intent. Most cells already have a
test somewhere in the packages, and what is missing is the one place that says which cell each
test fills and which cells nothing fills. So the build is a registry over tests that exist, plus
the lock and the page that read it. Writing tests for the empty cells is follow-on work, counted
and ratcheted down.

## Requirements

- **R1 — The matrix is data.** `examples/conformance/src/callers.ts` exports the matrix as one
  object. The features are help, errors, prompts, spinner, progress, table, box, theme,
  plugins, completions and MCP. The callers are `tty` (a human at a terminal), `agent` (pipe,
  `--json`, or a detected agent per N12), `ci`, `accessible` and `program` (`--schema`,
  `--mcp`, completions). A caller is defined by observable inputs only (intent constraint 1),
  named by roundel's mode policy.
- **R2 — Every cell says what holds it.** A cell is exactly one of three things:
  - `{ test, name }`, a test file and the title of a test in it;
  - `{ na: reason }`, where the feature does not apply and the static projection is what that
    caller gets (constraint 2);
  - `{ missing: true }`.
- **R3 — The registry is locked.** `scripts/callers-lock.test.ts` fails on any of three
  things: a cell naming a file or test title that does not exist, a feature or caller with no
  cell, or a `missing` count above the ceiling it pins. The ceiling may only fall.
- **R4 — The page is generated.** `scripts/callers-page.ts` renders
  `apps/docs/content/docs/callers.mdx` from the registry. Each cell is green (with a link to
  the test), n/a (with its reason) or missing. `quality.yml` runs it with `--check`, the way
  `bench:page -- --check` runs (constraint 3: never hand-edited).
- **R5 — The intent's success criteria map to cells.** The non-TTY criterion is the `ci` and
  `agent` cells of `prompts`, held by `scripts/prompt-exit-codes.test.ts` and B1's
  `non-tty-required` task. The accessible-transcript criterion is the `accessible` cells of
  `spinner` and `prompts`, held by `packages/flagstaff/src/loop.test.ts` and
  `packages/caique/src/ask.test.ts`.

## Design

A test title is the address, because the repository already addresses checks that way: every
restatement table cites `file › "title"`. The lock resolves a title by reading the test file
and matching a literal `it(` or `test(` title. A parameterised title (`%s`) matches by its
template. That makes renaming a test a red build, not a silent hole in the matrix.

The first build fills the registry from the existing suites. A cell is marked `missing` only
after a search finds nothing. Searching means the package's tests for the feature, roundel's
`policy.test.ts` for the mode, and `examples/conformance` for the front-ends. The initial
`missing` count becomes the ceiling.

The sixth caller stays recorded and unbuilt ([D-068](../../decisions/D-068.md)): web terminal
and chat surface are named in a comment on the caller list, with no cells.

## Verification

- `npx vitest run --config vitest.root.config.ts scripts/callers-lock.test.ts` is the loop.
  It is proven red three ways: by a cell naming a test title that does not exist, by deleting
  one cell, and by raising the `missing` count by one.
- `npx tsx scripts/callers-page.ts --check` exits non-zero when the committed page differs from
  the registry.
- No state, ordering or concurrency, so there is no Quint model.

## Rejected alternatives

- **A new conformance suite with one test per cell.** That is 55 tests, most of them
  duplicating checks that already exist in the packages, and two places asserting one
  behaviour drift apart. The registry points at the tests that already hold each cell.
- **Tagging tests with a caller in their titles and generating the matrix by scanning.** A
  title convention is enforced by nobody, and an untagged test silently becomes a missing cell.
  An explicit registry fails loudly.
- **A real screen-reader run.** Constraint 4 limits screen-reader claims to what a transcript
  can assert. An assistive-technology run is its own intent.

## Out of scope

- Writing tests for the `missing` cells. They are counted, published and ratcheted, and each
  is an ordinary follow-on change.
- "A first adopter's CLI passes the matrix" (intent S4). Adoption is `first-adopter`'s, and the
  matrix is a property of the family's packages.
