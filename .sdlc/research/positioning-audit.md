# Positioning audit — 2026-10-09

How each front page opens, how often it names an incumbent, and how far into the page each
capability no incumbent has first appears. Read from `main` at `fc0f897104`. This is the
measurement [`intents/positioning`](../intents/positioning/intent.md) is held to.

Recompute it with:

```bash
npx tsx scripts/positioning-audit.ts          # these tables, as Markdown
npx tsx scripts/positioning-audit.ts --json   # the same rows as data
```

## Method

- **Pages.** The root `README.md`, every published package's `README.md` (npm shows it, and
  `scripts/sync-package-docs.ts` projects it onto that package's own docs site as its landing
  page), and `apps/docs/content/docs/index.mdx`, the hand-written front door of the docs site.
- **Incumbents.** Not typed into the script. They are every host `packages/burgee/src/compat.ts`
  grades (`GRADED`), every package a drop-in rewrites (`DROP_INS`), and the scope of a scoped one
  (`clack`, `inquirer`). That is 32 names, the same list `burgee migrate` acts on. A name matches
  as a whole word, in any case. `which` and `rc` are English words before they are packages, so
  they count only when written as code.
- **Words.** Whitespace-separated tokens of the raw file, which is what `wc -w` counts. Badge
  URLs and HTML count as words, so per-100 rates are a little low against the prose a reader sees.
- **The first paragraph after the hero.** The hero is the lockup, the tagline (the first centred
  `<p>` that is prose), and the chrome under it: badge rows, the `Docs:` and `Migrating from:`
  line, the star and nav rows. Anything that has fewer than four words left after links, images
  and tags are removed counts as chrome. For an `.mdx` page the hero is the front matter.
- **Positions** are word offsets into the body, which starts at that first paragraph. So
  "first incumbent at word 8" means the eighth word a reader reads once past the badges.
- **Capabilities** are matched by how the pages spell them. `surfaces` is `--schema`, `--mcp`
  or "one declaration". `exit-codes` is "rewrite the command" or "exit-code contract".
  `fix-lines` is a `fix:` line. `explain` is `--explain` or provenance, but not npm provenance.
  `static-projection` is that phrase. `plugins-as-data` is `schema.json`, "plugins are data" or
  `npx <pkg> check`. `zero-deps` is "no dependency outside" or "zero dependencies". `own-suite`
  is "own suite", "own tests" or "graded by". The patterns are in the script. A page that says
  the thing in other words reads as `—`, so a dash means "not said this way", not "absent".

## Reading

| Page | Words | Incumbent mentions | per 100 words | First incumbent at body word | First paragraph names |
| :-- | --: | --: | --: | --: | :-- |
| `README.md` | 4975 | 104 | 2.1 | 8 | commander, yargs |
| `packages/bellpull/README.md` | 1984 | 47 | 2.4 | 52 | none |
| `packages/burgee/README.md` | 2158 | 78 | 3.6 | 57 | none |
| `packages/caique/README.md` | 3030 | 75 | 2.5 | 7 | clack, inquirer |
| `packages/closeout/README.md` | 3463 | 65 | 1.9 | 4 | exit-hook, restore-cursor, signal-exit |
| `packages/controlroom/README.md` | 1911 | 75 | 3.9 | 8 | ink |
| `packages/flagstaff/README.md` | 4242 | 133 | 3.1 | 1 | ink, ora |
| `packages/linegauge/README.md` | 1923 | 59 | 3.1 | 45 | none |
| `packages/paratext/README.md` | 1683 | 63 | 3.7 | 66 | none |
| `packages/roundel/README.md` | 2445 | 71 | 2.9 | 1 | chalk |
| `packages/seniority/README.md` | 3358 | 88 | 2.6 | 25 | none |
| `apps/docs/content/docs/index.mdx` | 414 | 12 | 2.9 | 8 | commander, yargs |

First body word at which each capability is said:

| Page | surfaces | exit-codes | fix-lines | explain | static-projection | plugins-as-data | zero-deps | own-suite |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: |
| `README.md` | 34 | 74 | — | 267 | 3249 | 751 | 92 | 1119 |
| `packages/bellpull/README.md` | 1566 | — | — | 1663 | — | 965 | 363 | 64 |
| `packages/burgee/README.md` | 86 | 319 | 1132 | 194 | — | 610 | — | 64 |
| `packages/caique/README.md` | 2619 | — | 684 | 2718 | — | 1250 | — | 17 |
| `packages/closeout/README.md` | 3042 | — | — | 3139 | — | 2496 | 77 | 12 |
| `packages/controlroom/README.md` | 1497 | — | — | 1594 | 70 | 1227 | — | 111 |
| `packages/flagstaff/README.md` | 3797 | — | 1873 | 3896 | 73 | 103 | — | 132 |
| `packages/linegauge/README.md` | 1493 | — | — | 779 | — | 754 | 33 | 1036 |
| `packages/paratext/README.md` | 1260 | — | — | 1359 | 99 | 383 | 114 | 84 |
| `packages/roundel/README.md` | 2069 | — | — | 2168 | — | 1914 | 91 | 635 |
| `packages/seniority/README.md` | 391 | — | — | 22 | — | 1204 | 81 | 33 |
| `apps/docs/content/docs/index.mdx` | 34 | 161 | — | 337 | — | — | 299 | 210 |

Lead sentences, the first sentence of the first paragraph after the hero:

| Page | Lead sentence |
| :-- | :-- |
| `README.md` | A CLI framework that replaces commander and yargs, is drop-in compatible with both, and serves every command through every format a caller wants — help, JSON, schema, MCP, completions — from one declaration. |
| `packages/bellpull/README.md` | A bellpull is the cord in one room wired to a bell in another. |
| `packages/burgee/README.md` | A burgee is the small swallowtail flag a boat flies to say which club or fleet it belongs to — a flag of identity, not of instruction. |
| `packages/caique/README.md` | 1.0. (a release-status line; the paragraph names the `caique/inquirer` and `caique/clack` drop-ins next) |
| `packages/closeout/README.md` | It replaces signal-exit, exit-hook and restore-cursor, each through a drop-in subpath graded by the incumbent's own suite. |
| `packages/controlroom/README.md` | What it is for. controlroom replaces ink and `@inkjs/ui` in the burgee family. |
| `packages/flagstaff/README.md` | ora animates a spinner on a terminal and, off one, writes the line it started with and the line it stopped with — every state in between is lost to the log an agent reads back. |
| `packages/linegauge/README.md` | A printer's line gauge is the steel rule marked in picas and points: a compositor holds it against a line of type and checks it fits the measure it was set to. |
| `packages/paratext/README.md` | *Paratext* is the literary term for everything around a text that is not the text — the title, the cover, the margins, the notes. |
| `packages/roundel/README.md` | chalk gives you `red`; picocolors gives you `red` for fewer bytes. |
| `packages/seniority/README.md` | One resolution for flags, environment variables, config files, a `package.json` field and declared defaults — in a fixed order, with provenance. |
| `apps/docs/content/docs/index.mdx` | burgee is a CLI framework that replaces commander and yargs, is drop-in compatible with both, and serves every command through every format a caller wants. |

## What it says

1. **Six of twelve openings name an incumbent in the first paragraph,** and the two that
   describe the framework itself (root README, docs landing) are both of them. Each defines
   burgee as "a CLI framework that replaces commander and yargs" before saying what it does.
   Four more lead with etymology (bellpull, burgee, linegauge, paratext), which names no rival
   but does not say what the package does either.
2. **An incumbent is the first or nearly the first thing read on five pages.** flagstaff and
   roundel open on it (body word 1), closeout at word 4, caique at 7, controlroom and the root
   README at 8.
3. **The pages name an incumbent every 26 to 53 words** (1.9 to 3.9 per hundred). controlroom
   is densest at 75 in 1,911 words, and flagstaff has the most at 133 in 4,242. The brief that
   opened this intent counted 92 and 97 for those two by a method it did not state. These
   counts use the derived list above, so they will not match it exactly. The order holds either
   way.
4. **The capabilities arrive late or not at all.**
   - `fix:` lines appear in three pages of twelve, at body word 684 or later.
   - The exit-code contract appears in three pages (root README, burgee, docs landing). None of
     the nine other package READMEs says what an agent does with an exit code.
   - Static projection, flagstaff's and controlroom's defining property, appears in four pages:
     controlroom, flagstaff and paratext at word 70 to 99, and the root README at word 3,249.
   - Proof by the incumbent's own suite is early in eight package READMEs (word 12 to 132), but
     at word 635 of roundel's, 1,036 of linegauge's and 1,119 of the root README.
   - **burgee's own README never says it has no dependency outside the family.** The root
     README says it at word 92.
5. **The docs navigation is organised around rivals.** `meta.json` lists `migrate`,
   `coming-from` (blessed, neo-blessed, terminal-kit) and `vs` (commander, yargs, oclif, cac,
   citty) as top-level sections. There is no page for what an agent sees when it drives a
   burgee CLI, which is the capability the README's agent section and B1 are about.
6. **The package docs landings are projections,** so they read exactly as their READMEs do.
   Fixing a README fixes its site.

## After — positioning R1, R2 and R4

The same script, after the root README, the docs landing and the ten package READMEs were
rewritten (`.sdlc/intents/positioning/`). No first paragraph names an incumbent, and
`scripts/positioning-lock.test.ts` holds that. Every page still names its incumbents, in an
adoption note right after the opening, in the switch section, and in the compatibility and
benchmark tables. Densities barely move, which is the intended result: the proof stays, and
the opening changes.

| Page | Words | Incumbent mentions | per 100 words | First incumbent at body word | First paragraph names |
| :-- | --: | --: | --: | --: | :-- |
| `README.md` | 5119 | 101 | 2.0 | 171 | none |
| `packages/bellpull/README.md` | 1997 | 47 | 2.4 | 47 | none |
| `packages/burgee/README.md` | 2222 | 78 | 3.5 | 80 | none |
| `packages/caique/README.md` | 3097 | 79 | 2.6 | 49 | none |
| `packages/closeout/README.md` | 3495 | 65 | 1.9 | 56 | none |
| `packages/controlroom/README.md` | 1906 | 75 | 3.9 | 86 | none |
| `packages/flagstaff/README.md` | 4251 | 133 | 3.1 | 76 | none |
| `packages/linegauge/README.md` | 1948 | 59 | 3.0 | 53 | none |
| `packages/paratext/README.md` | 1701 | 63 | 3.7 | 70 | none |
| `packages/roundel/README.md` | 2452 | 73 | 3.0 | 79 | none |
| `packages/seniority/README.md` | 3369 | 88 | 2.6 | 62 | none |
| `apps/docs/content/docs/index.mdx` | 597 | 12 | 2.0 | 326 | none |

| Page | surfaces | exit-codes | fix-lines | explain | static-projection | plugins-as-data | zero-deps | own-suite |
| :-- | --: | --: | --: | --: | --: | --: | --: | --: |
| `README.md` | 4 | 56 | 78 | 87 | 3393 | 858 | 115 | 144 |
| `packages/bellpull/README.md` | 1579 | — | — | 1676 | — | 978 | 42 | 61 |
| `packages/burgee/README.md` | 8 | 43 | 52 | 59 | — | 674 | 73 | 92 |
| `packages/caique/README.md` | 2686 | — | 751 | 2785 | — | 1317 | — | 62 |
| `packages/closeout/README.md` | 3077 | — | — | 3174 | — | 2531 | 48 | 69 |
| `packages/controlroom/README.md` | 1492 | — | — | 1589 | 52 | 1222 | — | 95 |
| `packages/flagstaff/README.md` | 3806 | — | 1882 | 3905 | 26 | 60 | — | 88 |
| `packages/linegauge/README.md` | 1518 | — | — | 804 | — | 779 | 48 | 67 |
| `packages/paratext/README.md` | 1278 | — | — | 1377 | 50 | 401 | 65 | 94 |
| `packages/roundel/README.md` | 2076 | — | — | 2175 | — | 1921 | 68 | 93 |
| `packages/seniority/README.md` | 402 | — | — | 20 | — | 1215 | 92 | 73 |
| `apps/docs/content/docs/index.mdx` | 8 | 139 | 149 | 164 | — | — | 226 | 257 |

| Page | Lead sentence after |
| :-- | :-- |
| ``README.md` | One declaration, six surfaces. |
| ``packages/bellpull/README.md` | bellpull runs a subprocess, resolves the executable it names, and returns one structured result that every caller can read: `format()` for a person, `toJson()` for `--json`, `toEvent()` for an agent. |
| ``packages/burgee/README.md` | burgee is a CLI framework built on one declaration. |
| ``packages/caique/README.md` | caique asks a question only when someone can answer it. |
| ``packages/closeout/README.md` | closeout runs every exit handler exactly once, on every path out of the process, restores the terminal, and holds shutdown to a deadline so it cannot hang. |
| ``packages/controlroom/README.md` | controlroom draws keyboard-driven terminal screens — panes, tabs with key hints, a checklist, a log tail, sections that collapse — either inline, under a transcript that flows into the terminal's own scrollback, or in the alternate screen, laid out again on resize. |
| ``packages/flagstaff/README.md` | flagstaff is a terminal frame loop: it hoists a component, holds it, changes it and lowers it. |
| ``packages/linegauge/README.md` | linegauge measures, wraps, truncates and slices styled terminal text without the edge fraying, grapheme-correct over the platform's own `Intl.Segmenter`. |
| ``packages/paratext/README.md` | paratext owns everything around terminal output that is not the output: hyperlinks, inline images, the window title, the clipboard, desktop notifications, the working directory and the bell — OSC, the escape class (`ESC ]`) that addresses the terminal *program* rather than the character grid. |
| ``packages/roundel/README.md` | roundel is the colours a CLI carries: one output policy decided once from the runtime, nine semantic tokens over `util.styleText` — `error`, `hint`, `command` and `flag` rather than `red` and `blue` — and a theme that changes them all together, contrast-checked before it flies. |
| ``packages/seniority/README.md` | seniority resolves flags, environment variables, config files, a `package.json` field and declared defaults in one fixed order, with provenance: every value can say where it came from. |
| ``apps/docs/content/docs/index.mdx` | burgee is a CLI framework built on one declaration. |

## What it does not measure

- Whether a reader understands the page. The counts are proxies for ordering. The fix is
  judged by the opening paragraphs themselves, which the intent quotes before and after.
- The comparison tables. Rows that name an incumbent because they measure against it, including
  the rows burgee loses (cold start against cac, bytes against commander, installed size), are
  the proof. The intent keeps every one of them.
