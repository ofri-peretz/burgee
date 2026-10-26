# Design — The caller matrix

Intent: [`intent.md`](./intent.md). **Status:** shipped (2026-10-26).

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

## Status 2026-10-25

Built in batch 29. The intent stays `approved`, because 5 cells are `missing` and the first
criterion asks for none. Building them is out of scope here (§ Out of scope); each one is an
ordinary follow-on change that lowers the ceiling.

| R | state | where | check |
| :-- | :-- | :-- | :-- |
| R1 | built | `examples/conformance/src/callers.ts`: 11 features × 5 callers, each caller defined by its observable inputs; the sixth caller is named in a comment (D-068) | the lock below |
| R2 | built | every cell is `{ test, name }`, `{ na }` or `{ missing: true }` | `scripts/callers-lock.test.ts` › "names, in every held cell, a test file that exists and a test title that file contains", › "gives a reason for every cell that does not apply" |
| R3 | built | the lock, with `MISSING_CEILING = 5` | `scripts/callers-lock.test.ts` › "has a cell for every feature and every caller, and nothing besides", › "has no more missing cells than the ceiling, 5, which only falls" |
| R4 | built | `scripts/callers-page.ts` → `apps/docs/content/docs/callers.mdx`, in the docs nav after agent surfaces | `quality.yml` › "The published callers page is the one the caller matrix generates" (`npm run callers:page -- --check`), listed in `scripts/generated-page-gate-lock.test.ts` |
| R5 | built | the prompts cells cite `scripts/prompt-exit-codes.test.ts`; the accessible cells of spinner and prompts cite flagstaff's `loop.test.ts` and caique's `ask.test.ts` | the lock resolves each title |

**Proven red three ways**, each in a scratch edit of the registry. A title that does not exist
failed the second case. A deleted cell (`mcp` × `ci`) failed the first two. A sixth `missing`
cell failed the ceiling. `callers-page.ts --check` exited 1 on a committed page with one line
appended.

**The counts.** 43 held, 7 n/a, 5 missing. The missing cells are `errors` × `accessible`, and
`prompts`, `spinner`, `table` and `box` × `program`. For the four flagstaff components, the
`agent` and `accessible` cells cite the loop's own parameterised cases, because the loop is
where every component's mode is decided, and the `tty` and `ci` cells cite the component's own.

## Status 2026-10-26

The five `missing` cells each have a test, `MISSING_CEILING` is 0, and the page reads 48 held,
7 n/a, 0 missing. The intent is `shipped` ([`intent.md` § Shipped 2026-10-26](./intent.md#shipped-2026-10-26)
has each test and how it was proven red).

| cell | test |
| :-- | :-- |
| errors × accessible | `packages/burgee/src/json-failure.test.ts` › "$name: under CLI_ACCESSIBLE at a colour terminal, stderr is the labelled prose once, with no escape and no JSON" |
| prompts × program | `scripts/prompt-exit-codes.test.ts` › "under --mcp, a question is a tool error naming the flag, and the server answers the next call" |
| spinner, table, box × program | `scripts/components-under-mcp.test.ts` › "$name: the transport carries only JSON-RPC, the envelope leads, and the drawing follows as its static projection" |

The `program` cells of the three components are one parameterised test in `scripts/`, because the
cell is where two packages meet: burgee's server holds the process's stdout for the length of a
tool call, and flagstaff's loop picks the projection. A test inside either package could not import
the other. Still no state, so still no Quint model.

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
