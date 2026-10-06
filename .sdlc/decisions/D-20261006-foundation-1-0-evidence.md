---
id: D-20261006-foundation-1-0-evidence
subject: 'Do roundel, paratext, closeout and bellpull meet the 1.0 bar D-170 set, and on what evidence'
taken: Taken
date: '2026-10-06'
superseded_by: —
---

**Yes, all four meet every written 1.0 criterion. This records the evidence; it does not
release anything.** No changeset is written here. Cutting 1.0.0 is the owner's call, as it was
for D-170 and D-20260930-closeout-1-0-evidence. This decision also refreshes closeout's evidence,
because closeout has gained tests and `bracketedPaste` since 2026-09-30.

All measurements were taken at `cd345466ed` on darwin with Node 24.13.0.

## Criterion 1: the spec is fully built

No spec has a `Not built` status row.

- **roundel** has 12 `Built` rows.
- **paratext** records each requirement under a `## What shipped` entry, and `plan-progress`
  reports `✓ 3.1 paratext R8-R12 built`.
- **closeout:** `✓ 3.3 closeout at 1.0`.
- **bellpull:** its spec says "12 of 12" and has no `Not built` row. R8 was the last one closed,
  on the Linux reading of D-20260930-bellpull-first-hit-resolve.

## Criterion 2: every drop-in passes 100% of its incumbent's own suite at the latest release, level with its control

The latest releases come from `npm view` on 2026-10-06. Each one is also the vendored version,
so nothing needed re-vendoring. The grades come from
`node packages/compat-oracle/dist/bin.js <hosts>`, run once without and once with `--control`.

| package | drop-in | incumbent (latest) | ours | control |
| :-- | :-- | :-- | --: | --: |
| roundel | `roundel/chalk` | chalk 6.0.1 | 59 / 59 | 59 / 59 |
| paratext | `paratext` (csi) | ansi-escapes 7.3.0 | 4 / 4 | 4 / 4 |
| paratext | `paratext/terminal-link` | terminal-link 5.0.0 | 8 / 8 | 8 / 8 |
| paratext | `paratext/term-img` | term-img 7.1.0 | 18 / 18 | 18 / 18 |
| closeout | `closeout/restore-cursor` | restore-cursor 5.1.0 | 6 / 6 | 6 / 6 |
| closeout | `closeout/exit-hook` | exit-hook 5.1.0 | 21 / 21 | 21 / 21 |
| closeout | `closeout/signal-exit` | signal-exit 4.1.0 | 126 / 135 | 126 / 135 |
| bellpull | `bellpull/cross-spawn` | cross-spawn 7.0.6 | 68 / 68 | 68 / 68 |
| bellpull | `bellpull/node-which` | which 7.0.0 | 5 / 5 | 5 / 5 |

signal-exit's darwin row is the case D-20260930-closeout-1-0-evidence already explained, and
nothing about it has changed:

- 8 cases are Linux-only signals that darwin does not register.
- 1 case is the declared `controlFailures` case, which signal-exit 4.1.0 also fails against
  itself.
- `GRADED` records the ubuntu reference, 134 / 135 on both sides.

Every drop-in therefore passes as many cases as its incumbent in the same harness, which is
D-137's "level".

**Not a drop-in, and so not part of the bar:** bellpull's `execa` row. It is graded against the
package root because there is no execa façade (bellpull R7: `run` resolves where execa throws).
It reads 0 / 1048 against a control of 1047–1048. R9 asks only that this row be vendored and
ratcheted, and that its partial number be published as partial, never rounded up. 1.0 does not
claim execa compatibility.

## Criterion 3: the coverage gate

Each package was measured with `npx vitest run --coverage.enabled`.

| package | tests | statements | branches | functions | lines |
| :-- | --: | --: | --: | --: | --: |
| roundel | 382 (+2 skipped) | 412 / 412 | 289 / 289 | 104 / 104 | 343 / 343 |
| paratext | 283 | 527 / 527 | 423 / 423 | 101 / 101 | 401 / 401 |
| closeout | 251 | 394 / 394 | 199 / 199 | 111 / 111 | 333 / 333 |
| bellpull | 326 (+7 skipped) | 496 / 496 | 383 / 383 | 102 / 102 | 410 / 410 |

Every package reads 100% on all four measures.

## What 1.0 would promise, on D-170's terms

1.0 would promise every published entry, the plugin `schema.json` and the `bin`, plus each
drop-in above, graded at the major named.

- **roundel** (0.6.3): `.`, `./policy`, `./tokens`, `./plugin`, `./theme`, `./contrast`,
  `./chalk`, `./terminal`, `./import`, `./schema.json`, and the `roundel` bin.
- **paratext** (0.9.0): `.`, `./csi`, `./link`, `./plugin`, `./term-img`, `./terminal-link`,
  `./schema.json`, and the `paratext` bin.
- **closeout** (0.7.0): `.`, `./once`, `./cursor`, `./plugin`, `./restore-cursor`,
  `./exit-hook`, `./signal-exit`, `./signal-exit/signals`, `./schema.json`, and the
  `closeout` bin.
- **bellpull** (0.5.2): `.`, `./which`, `./node-which`, `./cross-spawn`, `./plugin`,
  `./schema.json`, and the `bellpull` bin.

## Out of scope

- Earlier majors of every incumbent. `SUPPORTED_MAJORS` keeps `burgee migrate` off them.
- execa compatibility, as stated above.

## Known caveats that do not block the bar

- closeout's R8 byte miss, recorded in D-20260930-closeout-1-0-evidence.
- bellpull's spawn-vs-tinyexec reading is not being refreshed while the benchmark job (B2–B4)
  fails on main because the `flagstaff/log-update` workload exits with no output. That
  is a flagstaff benchmark defect, not a bellpull one, and R8 rests on the 2026-09-30 ubuntu
  reading of 0.992–0.997.
