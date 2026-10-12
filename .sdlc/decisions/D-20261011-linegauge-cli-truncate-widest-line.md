---
id: D-20261011-linegauge-cli-truncate-widest-line
subject: '`linegauge` said its truncation was checked case by case against `cli-truncate`, with no number: how do `cli-truncate` and `widest-line` get one without changing `truncate` and `widest`?'
taken: Taken
date: '2026-10-11'
superseded_by: —
---

**Each gets a façade subpath named for it. `linegauge/cli-truncate` grades 12 / 12 against cli-truncate 6.1.1's control of 12 / 12, and `linegauge/widest-line` grades 1 / 1 against widest-line 6.0.0's control of 1 / 1** (`graded-override-targets` R5, R6). Measured on darwin arm64, Node 24.13.0. Before the façades existed, each target run reported `target not built yet`.

- **`linegauge/cli-truncate` uses cli-truncate's arithmetic over linegauge's cut and measure.** The spec says "over `linegauge/truncate`", but the two disagree at the edges, by design. `truncate` counts the ellipsis inside the budget and cuts by measured width. cli-truncate cuts by position, and a middle cut splits an odd budget its own way. cli-truncate also moves a mark inside the closing SGR at two positions out of three, and the existing `truncate.test.ts` records that difference on purpose. Changing `truncate` would change the family's API, and the intent forbids that. So the façade reproduces cli-truncate's steps over `slice` and `width`. Those are graded level with the two packages cli-truncate depends on: `slice-ansi` at 104 / 104 and `string-width` at 233 / 233. `cli-truncate.test.ts` holds the façade byte-equal to the installed incumbent over 1,980 inputs: every position, option, budget and refusal.
- **`linegauge/widest-line` is widest-line's one string over `widest`**, split on `\n`. `widest` keeps taking any iterable of lines.
- `subpath-isolation.test.ts` allows each façade to reach the entry it is built over (`slice`, `widest`). The rule's existing exception, `truncate` → `slice`, is the same kind of composition.

**Weight.** `scripts/subpath-weight-lock.test.ts` measures the whole surface, bundled, against the incumbent's at its graded release:

| subpath | ours | incumbent |
| :-- | --: | --: |
| `linegauge/cli-truncate` | 14,191 | 20,675 |
| `linegauge/widest-line` | 5,742 | 6,079 |

`ceilings.json` records the one-symbol bundle and the dist closure for each entry.

**For the owner.** `linegauge`'s changeset is a `minor`, because it adds two public entry points.
