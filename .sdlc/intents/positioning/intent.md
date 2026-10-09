# Intent — Positioning: capabilities first, proof second, adoption third

> Stage 1 artifact. Opened from the owner's review of the READMEs and the docs site on
> 2026-10-09, and measured in [`positioning-audit.md`](../../research/positioning-audit.md)
> before anything was changed.

**Status:** approved · **Opened:** 2026-10-09 · **Owner:** @ofri-peretz

---

## What is wanted

A reader who lands on any front page — the root README, a package README on npm, the docs
site — learns what burgee does before learning what it replaces. Each page answers three
questions, in this order:

1. **What does it do that nothing else does?** One declaration served as six surfaces; exit
   codes, `fix:` lines and `--explain` an agent can act on; a static projection off a TTY;
   plugins as data with a `check` command; no dependency outside the family across ten
   packages.
2. **How is that proven?** Each incumbent's own test suite, run against the drop-in in CI,
   and every comparison row the benchmarks publish, including the rows burgee loses.
3. **How do I switch?** One command, `npx burgee migrate`.

The drop-in path stays exactly as easy to find and to take. It moves from the first sentence
to the first section after the capabilities.

## Why now

The audit (`npx tsx scripts/positioning-audit.ts`, on `main` at `fc0f897104`):

- **The root README and the docs landing define burgee by its rivals.** Both lead with "a CLI
  framework that replaces commander and yargs, is drop-in compatible with both". The tagline
  above them ("Everything a CLI needs that isn't your CLI") says what it does; the next
  sentence takes it back.
- **Six of twelve front pages name an incumbent in their first paragraph.** flagstaff and
  roundel open on one at body word 1, closeout at word 4, caique at 7, controlroom and the root
  README at 8.
- **The pages name an incumbent every 26 to 53 words.** controlroom has 75 mentions in 1,911
  words, and flagstaff 133 in 4,242.
- **The capabilities come late.**
  - `fix:` lines first appear at body word 684 or later, in three pages of twelve.
  - The exit-code contract appears in three pages and in none of the nine other package READMEs.
  - Static projection appears at word 3,249 of the root README.
  - burgee's own README never says it has no dependency outside the family.
- **The docs navigation is organised around rivals.** `vs/` (commander, yargs, oclif, cac,
  citty) and `coming-from/` are top-level sections, and no page shows what an agent sees.

B1 now publishes per-task transcripts from every run on `main` (`b1-transcripts`), so the
agent page can show recorded sessions rather than describe them.

## Affected users and systems

- **Readers:** a maintainer evaluating a CLI framework, and a model asked "what is burgee?".
  Both take the first sentence they meet as the definition.
- **Pages:** the root `README.md`; the ten published package READMEs, which npm shows and
  `scripts/sync-package-docs.ts` projects onto each package's docs site; and
  `apps/docs/content/docs/index.mdx`, its `meta.json` navigation, and the `vs/*` pages.
- **New:** `apps/docs/content/docs/what-an-agent-sees.mdx`.
- **Published artifacts:** READMEs ship in every tarball, so each package README change is a
  patch release and moves `weight:converge` and the artifact baselines.
- **Unchanged:** `burgee migrate`, the compatibility grades, the benchmark claims.

## Constraints

- **Every comparison row stays, including the ones burgee loses:** cold start against cac,
  bundled bytes against commander alone, installed size. Nothing is removed from a table to
  make a page read better.
- **Every number is read from a committed result or held by a lock.** No figure is typed in
  without a source in the tree, and none is rounded in burgee's favour.
- **Plain measurement in plain words.** No superlatives the tables do not support.
- **Adoption stays one command.** `npx burgee migrate` and the drop-in import change remain on
  every page that has them today, one section down.
- **No URL breaks.** A `vs/*` page keeps its URL or redirects from it, and every link the
  docs apps carry still lands (`scripts/vercel-apps-lock.test.ts`).
- **No lock is weakened.** `scripts/readme-opening-lock.test.ts` still requires each package
  README to name what it replaces within 25 lines of its header. That is the adoption note, and
  it now sits after the opening paragraph rather than in it. `scripts/pitch-lock.test.ts`
  still holds the tagline.

## Success criteria

1. `npx vitest run --config vitest.root.config.ts scripts/positioning-lock.test.ts` passes.
   The first paragraph after the hero of the root README, every published package README and
   the docs landing names no incumbent from `compat.ts`'s `GRADED` and `DROP_INS`. The lock is
   proven red on the tree this intent was opened against.
2. The root README hero and the docs landing state, in this order: one declaration and its six
   surfaces; the contracts an agent relies on; one supply chain with no dependency outside the
   family; proof by the incumbents' own suites. "Replaces commander and yargs" sits in a
   "Switch in one command" section that opens with `npx burgee migrate`.
3. `/docs/what-an-agent-sees` is in the navigation. It quotes B1 transcripts from runs on
   `main`, and every number on it is in a landed `benchmarks/results/agent-cli-bench/*-ci.json`
   (held by a lock). It says plainly where the pooled agent-cost claim is not met, and why.
4. Each of the ten package READMEs opens with what the package does that its incumbent does
   not, then a one-line adoption note naming the incumbent and `npx burgee migrate`.
5. The `vs/*` pages are titled "Switching from X" under a "Switching" navigation group. Every
   honest table is kept, and every old URL resolves.
6. Re-running `scripts/positioning-audit.ts` shows no incumbent in any first paragraph, and the
   before and after lead sentences are recorded in `positioning-audit.md`.

## Open questions

- Whether the home page `<title>` keeps naming commander and yargs. **Decided 2026-10-09 →
  [D-20261009-positioning-home-title](../../decisions/D-20261009-positioning-home-title.md)**,
  as an owner decision with a default: the title stays and the body changes.
- Whether mentions per 100 words is gated. **Decided 2026-10-09 →
  [D-20261009-positioning-density-reported](../../decisions/D-20261009-positioning-density-reported.md)**:
  it is reported, not gated. The opening is what is held.
