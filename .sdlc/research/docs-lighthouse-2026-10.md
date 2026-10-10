# Docs sites: Lighthouse, 2026-10

All ten docs sites, measured on 2026-10-10: the home page, `/docs`, and one guide page each.
Two accessibility defects failed on our pages. Both came from the shared chassis, and both are
fixed once, in `apps/docs-chassis`. Best practices and SEO were already 100 on every page. No
performance finding was ours to fix. The evidence for each is below.

## Method

- **Tool.** Lighthouse 12.8.2 from npm, run as
  `lighthouse <url> --output=json --quiet --chrome-flags="--headless=new"`, with
  `--preset=desktop` added for desktop. The default (mobile) preset uses simulated throttling.
  The browser was HeadlessChrome 154 on macOS.
- **Pages.** Each site's `/`, its `/docs`, and one guide from its `sitemap.xml`. For burgee,
  which has no `guides/` section, the guide is `/docs/concepts/configuration`. The others are
  bellpull `guides/running`, caique `guides/asking`, closeout `guides/signals`, controlroom
  `guides/layout`, flagstaff `guides/tables`, linegauge `guides/wrapping`, paratext
  `guides/detection`, roundel `guides/themes` and seniority `guides/precedence`.
- **Runs.** Each URL ran 3 times per preset, in three passes over all URLs rather than three
  back-to-back runs, so a burst of load cannot sink all three runs of one row. The table
  reports the median per category. That is 180 runs, 12:43–13:34 EDT, against production at
  build `d68f63a68d` (the page's `x-build-sha`).
- **Load.** This machine runs Sophos, Docker and other agents. The 1-minute load average was
  recorded before every run: median 23, range 6–79 on 14 cores. **Performance is
  load-sensitive and the other three categories are not.** The performance cell shows the
  median load in brackets. The same page swings with load. For example, paratext `/docs` on
  mobile scored 87 / 87 / 96 at load 55 / 39 / 7, and seniority's guide 91 / 90 / 100 at load
  49 / 20 / 8. Every sub-95 mobile score in the table has a median load of 16 or higher.
- **Colour scheme.** Headless Chrome on this Mac reports `prefers-color-scheme: dark`, so the
  sweep measured the dark theme. Light mode was probed separately with
  `--blink-settings=preferredColorScheme=1`.
- **Failing audits.** These are audits scored below 0.9 in at least 2 of the 3 runs, ranked
  with accessibility, best-practices and SEO before performance, then by weight. Most
  performance entries are weight-0 "insights". `td-has-header` is weight 0 in Lighthouse 12,
  so it fails without moving the accessibility score.

## Results

Scores are medians of 3 runs. Perf is followed by the median load average in brackets. The
**after** column is perf / a11y / best-practices / SEO, measured on the fixed pages only. It
is a local `next start` of this branch's production build, 3 runs per preset, at a median load
of 8. See "Reading the after column" before comparing its perf with the left-hand perf.

| site | page | preset | perf (load) | a11y | best-practices | SEO | top failing audits | after (local) |
| :-- | :-- | :-- | --: | --: | --: | --: | :-- | :-- |
| burgee | home | mobile | 100 (21) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| burgee | home | desktop | 100 (20) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| burgee | docs | mobile | 98 (25) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| burgee | docs | desktop | 100 (24) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| burgee | guide | mobile | 96 (22) | 100 | 100 | 100 | `largest-contentful-paint`, `legacy-javascript-insight`, `network-dependency-tree-insight` | — |
| burgee | guide | desktop | 100 (25) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| bellpull | home | mobile | 100 (24) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| bellpull | home | desktop | 100 (21) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| bellpull | docs | mobile | 100 (24) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 93 (14) / 100 / 100 / 100 |
| bellpull | docs | desktop | 100 (21) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (12) / 100 / 100 / 100 |
| bellpull | guide | mobile | 100 (18) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| bellpull | guide | desktop | 100 (19) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| caique | home | mobile | 100 (19) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| caique | home | desktop | 100 (25) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| caique | docs | mobile | 95 (23) | 96 | 100 | 100 | `color-contrast`, `largest-contentful-paint`, `legacy-javascript-insight` | 93 (8) / 100 / 100 / 100 |
| caique | docs | desktop | 100 (22) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (9) / 100 / 100 / 100 |
| caique | guide | mobile | 100 (19) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 94 (8) / 100 / 100 / 100 |
| caique | guide | desktop | 100 (17) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (9) / 100 / 100 / 100 |
| closeout | home | mobile | 98 (16) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| closeout | home | desktop | 100 (21) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| closeout | docs | mobile | 100 (22) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 93 (7) / 100 / 100 / 100 |
| closeout | docs | desktop | 100 (23) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (7) / 100 / 100 / 100 |
| closeout | guide | mobile | 100 (20) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| closeout | guide | desktop | 100 (19) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| controlroom | home | mobile | 99 (35) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| controlroom | home | desktop | 100 (40) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| controlroom | docs | mobile | 100 (39) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 94 (8) / 100 / 100 / 100 |
| controlroom | docs | desktop | 100 (39) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (9) / 100 / 100 / 100 |
| controlroom | guide | mobile | 100 (36) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 94 (9) / 100 / 100 / 100 |
| controlroom | guide | desktop | 100 (35) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (8) / 100 / 100 / 100 |
| flagstaff | home | mobile | 100 (36) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| flagstaff | home | desktop | 100 (39) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| flagstaff | docs | mobile | 95 (54) | 96 | 100 | 100 | `color-contrast`, `largest-contentful-paint`, `legacy-javascript-insight` | 93 (8) / 100 / 100 / 100 |
| flagstaff | docs | desktop | 100 (46) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (8) / 100 / 100 / 100 |
| flagstaff | guide | mobile | 92 (41) | 100 | 100 | 100 | `td-has-header`, `largest-contentful-paint`, `legacy-javascript-insight` | 94 (7) / 100 / 100 / 100 |
| flagstaff | guide | desktop | 100 (32) | 100 | 100 | 100 | `td-has-header`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (7) / 100 / 100 / 100 |
| linegauge | home | mobile | 100 (29) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| linegauge | home | desktop | 100 (27) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| linegauge | docs | mobile | 100 (25) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 93 (7) / 100 / 100 / 100 |
| linegauge | docs | desktop | 100 (23) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (8) / 100 / 100 / 100 |
| linegauge | guide | mobile | 98 (22) | 100 | 100 | 100 | `td-has-header`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 94 (8) / 100 / 100 / 100 |
| linegauge | guide | desktop | 100 (20) | 100 | 100 | 100 | `td-has-header`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (8) / 100 / 100 / 100 |
| paratext | home | mobile | 93 (44) | 100 | 100 | 100 | `largest-contentful-paint`, `legacy-javascript-insight`, `network-dependency-tree-insight` | — |
| paratext | home | desktop | 100 (39) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| paratext | docs | mobile | 87 (39) | 96 | 100 | 100 | `color-contrast`, `largest-contentful-paint`, `speed-index` | 94 (8) / 100 / 100 / 100 |
| paratext | docs | desktop | 100 (28) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (9) / 100 / 100 / 100 |
| paratext | guide | mobile | 100 (25) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| paratext | guide | desktop | 100 (23) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| roundel | home | mobile | 100 (27) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| roundel | home | desktop | 100 (26) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| roundel | docs | mobile | 100 (26) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 93 (8) / 100 / 100 / 100 |
| roundel | docs | desktop | 100 (25) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (8) / 100 / 100 / 100 |
| roundel | guide | mobile | 100 (24) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| roundel | guide | desktop | 100 (22) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| seniority | home | mobile | 100 (19) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| seniority | home | desktop | 100 (18) | 100 | 100 | 100 | `legacy-javascript-insight`, `network-dependency-tree-insight`, `render-blocking-insight` | — |
| seniority | docs | mobile | 95 (16) | 96 | 100 | 100 | `color-contrast`, `largest-contentful-paint`, `legacy-javascript-insight` | 93 (10) / 100 / 100 / 100 |
| seniority | docs | desktop | 100 (18) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (9) / 100 / 100 / 100 |
| seniority | guide | mobile | 91 (20) | 96 | 100 | 100 | `color-contrast`, `largest-contentful-paint`, `legacy-javascript-insight` | 94 (8) / 100 / 100 / 100 |
| seniority | guide | desktop | 100 (23) | 96 | 100 | 100 | `color-contrast`, `legacy-javascript-insight`, `network-dependency-tree-insight` | 100 (9) / 100 / 100 / 100 |

After the fix, no page has an accessibility, best-practices or SEO audit below 0.9.

### Reading the after column

The local after-run's perf column cannot be compared with production's. The bytes are the
same: bellpull `/docs` on mobile transferred 558,763 B locally and 561,869 B from production.
The decoded size differed by 428 B, which is the longer theme colour strings. The protocol is
not the same. `next start` serves HTTP/1.1 and Vercel serves h2, and Lighthouse's simulated
mobile throttling models HTTP/1.1's connection limit as a longer chain before the LCP paint.
Locally, LCP render delay was 2.7 s against 0.45 s in production for the same `<p>`, and
desktop, which is not throttled, was 100 in both. The change itself is colour values and table
markup. It adds no script, stylesheet, font or image.

## What failed, and what fixed it

### `color-contrast` on 12 of the 30 pages

`github-dark`'s comment colour `#6a737d` measured 3.82:1 on the dark card `#14131c`. A
light-mode probe found the matching failure in `github-light`: its orange `#e36209` measured
3.48:1 on the white card. These are fumadocs' default code themes, and every app compiles
through `docs-chassis/source-config`.

- **Fix, once at the source.** `apps/docs-chassis/src/source-config.mjs` now passes
  `rehypeCodeOptions: { themes: { light: 'github-light-default', dark: 'github-dark-default' } }`.
  That is GitHub's own pair, tuned for AA. fumadocs spreads its other defaults
  (`defaultColor: false` and the notation transformers) under `themes`, so nothing else
  changes. No brand colour was touched. The card grounds in `global.css` stay as they are, and
  so do the contrast locks under `packages/*/src`.
- **The check.** `apps/docs-chassis/src/code-contrast.test.ts` loads the configured themes
  through fumadocs' own highlighter. It holds every token foreground to 4.5:1 against the
  `--color-fd-card` value that `global.css` states for `:root` and for `.dark`. It skips
  `carriage-return`, a whitespace-only scope. It fails on the old pair with
  `#e36209` 3.49, `#22863a` 4.48 and `#6a737d` 3.83, among others, and passes on the new
  pair.
- **After.** Accessibility is 100 on all 12 pages in both presets. The light-mode probe of
  seniority `/docs` went from `color-contrast` failing (7 nodes) to passing.

### `td-has-header` on flagstaff and linegauge's guides, and on many unmeasured pages

Two content patterns caused it:

1. **Row-labelled tables.** These are written with an empty top-left cell, as in
   `| | passing | rate |`: every "coming from" compatibility table, the burgee "vs" and
   comparison pages, `contrast.mdx`, and the README-generated API tables. GFM renders the row
   labels as plain `<td>` under an empty `<th>`. A probe of five unmeasured pages found it on
   all five: roundel `coming-from/chalk`, burgee `comparison`, `vs/commander` and `contrast`,
   and controlroom `guides/static-projection`.
   - **Fix, once at the source.** `apps/docs-chassis/src/rehype-row-headers.mjs` is a rehype
     plugin in the shared MDX pipeline. When a table's top-left header cell is empty, the
     corner becomes a `<td>` and each body row's first cell becomes `<th scope="row">`. Tables
     whose corner has text are untouched. Because it runs in the shared pipeline, the generated
     `index.md` and `changelog.md` pages are covered without editing their sources.
2. **A blank column header** in a 3+-column option table, as in `| option | default | |`.
   Only the author can name that column, so this is a content fix. The column became
   `meaning` in flagstaff `guides/boxes` and `guides/tables` and in linegauge
   `guides/cutting`, `guides/measuring` and `guides/wrapping`. It became `Outcome` in burgee's
   generated `benchmarks.mdx` and in its generator, `scripts/bench-page.ts`.
   `bench:page --check` still matches.

**The check.** `apps/docs-chassis/src/rehype-row-headers.test.ts` pins the plugin's rewrite
and its no-op case, and asserts that the plugin is in `source-config`'s `rehypePlugins`. It
also scans every app's `content/` for a table of three or more columns whose header has an
empty cell after the first. That scan listed exactly the 6 files above before the fix.

**After.** `td-has-header` passes on flagstaff `guides/tables` and linegauge
`guides/wrapping`. The built HTML of roundel `coming-from/chalk` now carries
`<th scope="row">`.

## What is not ours, with the evidence

These audits fail on every page. None of them is caused by this repository's code.

- **`legacy-javascript` / `legacy-javascript-insight` (~22 KiB).** The signals are
  `Array.prototype.at`, `Array.prototype.flat` and others in the Next.js framework chunk
  (`0dzfsm6h13fyr.js`, the React DOM and Next runtime). That chunk is Next's built-in
  `polyfill-module`, which an app cannot opt out of. The remaining signal, `Math.trunc`, is
  in the posthog-js chunk.
- **`render-blocking-insight` / `network-dependency-tree-insight`.** Both point at one 17 KB
  stylesheet: Next's single CSS chunk, document → CSS, a chain of length 2 and about 50 ms. No
  third-party origin is in the chain, and Lighthouse reports no preconnect candidates.
  Inlining it (`experimental.inlineCss`) would trade a cached stylesheet for an extra
  ~17 KB on every HTML response. That is not a clear win for docs a reader browses
  page to page, so it was not done.
- **`unused-javascript` (~184 KiB on bellpull `/docs`).** posthog-js accounts for 92 KB of
  its 108 KB chunk. The rest is fumadocs' search client, loaded after hydration at low
  priority (Orama, 48 of 71 KB, and a micromark/mdast chunk, 26 of 29 KB), plus the Next
  framework chunk.
- **Mobile `largest-contentful-paint`.** The LCP element is server-rendered text (`<p>`). It
  has no load delay and no web font (the CSS has no `@font-face`). What varies is render
  delay, and it follows machine load, as shown in Method. Under Lantern simulation, a late
  observed paint pulls the JS downloads into the LCP chain. This is load noise and was not
  chased.

**posthog-js is ours by choice, and was left as it is.** It is the largest chunk on every page
(108 KB transferred), but Lighthouse's `bootup-time` does not list it (under its 50 ms floor),
and TBT is 0–50 ms on every page. Deferring it to a dynamic import would drop exceptions raised
before it loads. It would also fork `analytics.tsx` from the blog provider it was copied from.
That is a call for the owner, not a Lighthouse fix.

## Reproducing

Lighthouse 12.8.2, `--chrome-flags="--headless=new"`, mobile and `--preset=desktop`, 3 passes,
median per category. For any new perf number, record the 1-minute load average next to it.
