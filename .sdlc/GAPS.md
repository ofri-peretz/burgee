# Gaps — every open one, and what closes it

Opened 2026-09-23 on the owner's instruction *"close all small and big gaps"*. The living tracker:
a gap is struck when its PR merges, and a gap that needs a decision says so rather than being
built on a guess. Sources: every `Not built` row in `.sdlc/intents/*/spec.md`, the compat
baselines in `packages/compat-oracle/baseline/`, and the claims in `benchmarks/claims.ts`.

**Every gap is one file, `.sdlc/gaps/<id>.md`; this file holds the policy and no gaps.**
`npm run ledger -- gaps` prints them as the tables this file used to hold, and
`npm run ledger -- gaps --open` prints only the open ones. Until 2026-09-27 they were four
tables here, and every PR that opened or struck a row edited this one file — so two in flight
together conflicted
([D-20260927-per-entry-ledgers](./decisions/D-20260927-per-entry-ledgers.md)).

- **Striking a gap** is `status: closed` in its file, with the closing evidence written into
  its body the way a struck row always carried it (`~~…~~ — **closed**: …`).
- **Opening a gap** is `npm run ledger -- new gap <A|B|C|release> <slug>`, which writes
  `.sdlc/gaps/<letter>-YYYYMMDD-<slug>.md` with every field empty; `scripts/gaps-lock.test.ts`
  fails until it is filled in. The sequential ids already written — A1..A30, B1..B22, C1..C7 —
  keep their names, and the sequence stopped there: two branches each taking "the next
  number" take the same one, which is how the ledger came to hold **two C5s**. The release
  queue's C5 (opened in #450, cited by six workflows) kept the id; section C's struck lint
  row, added later in #463, is now `C-20260922-cli-floor-lint`.

Each file's front matter carries `id`, `section` (`A`, `B`, `C` or `release`), `status`
(`open` or `closed`) and its section's two remaining columns; the body is the gap itself.

Three kinds, because they close three different ways:

- **A — build it.** The design is accepted; what is missing is code, a suite, or a sentence
  that states a measured fact. One PR each, every one with a check proven to fail first.
  Columns: `source`, `done_when`.
- **B — decide, then build.** The requirement asks for public API or restates what the
  package promises. AI_NATIVE_SDLC rule 3: a human accepts at Design→Build. Each row carries
  the recommended answer, so accepting is one word. Columns: `source`, `recommendation`.
- **C — needs something from outside the repo.** A credential, a spend, or an adopter.
  Columns: `source`, `needs`.

## B — decide, then build

All taken 2026-09-23 under the owner's delegation ("you should be able to close the open
decisions yourself"). The ruling is the decision in `.sdlc/decisions/`; for B12 and B13
it differs from the recommendation this table carried. What each one asks to be
built moved to A15–A25.

## Release queue — owner actions

Settings only the repository owner can change. The release loop runs without them — the Version
PR falls back to `GITHUB_TOKEN` and unblocks itself (D-110) — but each one removes a workaround.
Numbered on from C, because each needs something from outside the repo; `section: release`,
columns `setting` and `done_when`.
