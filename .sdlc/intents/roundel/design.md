# Design — roundel

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1** `outputMode(rt): 'tty' | 'pipe' | 'json' | 'accessible' | 'ci'` is pure over
  `{ isTTY: { stdout }, env, json?: boolean }`. Precedence, first match wins: `json` if
  `rt.json`; `accessible` if `env.CLI_ACCESSIBLE`; `ci` if `env.CI` and not a TTY; `pipe`
  if not a TTY; else `tty`.
- **R2** `colorLevel(rt, { json }): 0 | 1 | 2 | 3` mirrors chalk's levels, and **obeys the
  user's explicit colour instruction in any output mode**. Precedence: `NO_COLOR` (non-empty)
  is `0` outright; then the `--color` flags read from an optional `rt.argv` (`--color=256`
  → 2; `--color=16m|full|truecolor|24bit` → 3; `--no-color`/`--color=false|never` → 0;
  `--color`/`=true|always` enables and lets detection pick, never below 1), which outrank a
  numeric `FORCE_COLOR`; then `FORCE_COLOR` itself (`0`/`false` off; a bare decimal an
  *exact* level clamped to 3, never a floor; `true`/empty enables and detects; anything else
  unset). With no instruction the order is supports-color's own: a pipe is `0` (Azure
  Pipelines — `TF_BUILD` *and* `AGENT_NAME` — the one exception, because that check sits
  above the non-TTY one); once detecting, `TERM=dumb` is the floor, a `CI` run is its
  vendor's level, and otherwise `TERM`/`COLORTERM` decide. `--json` alone is always `0`:
  structured output carries no escapes. **The output mode decides redraws (U2), never the
  level.**
- **R3** Tokens `error warn ok hint muted command flag value heading` are functions
  `(s: string) => string`, implemented over `util.styleText`. They are the **identity at
  level 0**, and paint identically at any level above it whatever the mode — because the
  level already obeys `NO_COLOR`, `FORCE_COLOR` and the `--color` flags in any mode, and is
  `0` on a pipe with no instruction. No third behaviour. Nothing else in the package touches
  ANSI.
- **R4** `fly(theme)` sets the process theme once; `theme` maps each token to a
  `styleText` format list or a `#rrggbb` (truecolor only, level 3). Defaults are the
  burgee brand: rock and juniper, lifted variants on dark.
- **R5** `contrast(fg, bg)` and `AA` — the WCAG maths — live here (`roundel/contrast`), and
  `fly()` throws when a truecolor token fails 4.5:1 against the declared ground. Levels 1
  and 2 are never checked or claimed.
- **R6** `roundel/chalk`: chalk 6's public API — chainable styles, `level`, `chalkStderr`,
  `supportsColor`, `Chalk` class — over R3, graded by chalk's own suite vendored into
  `compat-oracle`. Chalk's mutable `level` is honoured inside the façade only.
- **R7** Subpath isolation: `./policy`, `./tokens`, `./theme`, `./contrast`, `./chalk`; each
  `dist/` file imports only itself and `./policy.js`; `sideEffects: false`; root entry is
  re-exports only. Locked by `src/subpath-isolation.test.ts` and `src/weight.test.ts`.
- **R8** Ceilings, as weight rules: `./tokens` ≤ picocolors (3.3 KB, +10 ms); `./chalk` ≤
  chalk 6.0.0 bytes and ≤ picocolors spawn delta; re-measured when vendored.
- **R9** Nothing reads `process.*`; `process-reference-lock` extends here.
- **R10** ESM with `default` condition; `require('roundel/chalk')` works via `require(esm)`.
- **R11** `roundel/import`: `fromBase16(scheme)` and `fromITerm(plist)` produce a theme (a
  token map) from the two largest existing corpora of terminal palettes, contrast-checked on
  import (R5). The docs gallery is generated from them; hundreds of themes on day one, none
  hand-written. Data in, data out; no network, no bundled corpus — the user supplies the file.

### Evidence

Issue ids from [what 230 issues say about the output stack](../../research/output-stack-open-issues.md),
one row per requirement; the section number is the cluster the reading comes from. A row
with no issue behind it is a hypothesis and is measured before it locks.

| R | Issues that support it | Standing |
| :-- | :-- | :-- |
| R1 | clack #286 (`isCI` where `isTTY` was meant); ora #218, #235 (declined); listr2 #716 (piped stdout steps the renderer down; UI to stderr by hand); cli-table3 #180; clack #585 (the `accessible` mode, opt-in by env) — §1, §2 | cited |
| R2 | picocolors #100 (`FORCE_COLOR=0` enables colour), #85 (use `tty.WriteStream.hasColors()`); chalk #624, #686 (numeric `FORCE_COLOR`, ansi256 downsampling); cli-table3 #357 (ANSI under `NO_COLOR=1`); listr2 #687; ink D#577; chalk v5.5/v5.6 emulator allow-list is the detection R2 refuses — §1, §17 | cited |
| R3 | chalk #666 (declined: "building abstractions over Chalk … is what we encourage"), #659, #635; picocolors #99; chalk #604 (styles `util.styleText` lacks are not offered); cli-table3 #357 and listr2 #687 (styling that ignores level 0) — §9, §17, §1 | cited |
| R4 | chalk #666 (declined), #677 (custom presets), #659 (dynamic colour names); clack #36 (themes, variants, icons), #345 (expose the style without the rendering), #379 (global settings) — §9 | cited |
| R5 | no issue in the ten trackers asks for contrast checking | hypothesis — measure before lock |
| R6 | picocolors #100, #92 ("regressions when projects migrate from chalk"); chalk #624, #686, #635 (the `level` model the façade must reproduce to pass chalk 6's suite) — §1, §17, U11 | cited |
| R7 | ink #976 (a DEV-only path installed for everyone); picocolors #70 ("doubling the package size"); chalk #617 (README is 25% of the tarball) — U5 | cited |
| R8 | picocolors #70; chalk #617; ink #976 (what a subpath costs when it is not isolated); chalk #669, #660 (per-call cost is a B4 row, not a ceiling here) — U5, §20 | cited |
| R9 | picocolors #97 (`process` is not defined on Cloudflare); chalk #615 (`navigator`), #655 (Vite); log-update #63 (declined: "this package targets Node.js"); ora #146 (declined: `WT_SESSION` "is not an API") — §15 | cited |
| R10 | picocolors #70 (35 reactions), #50, #59; chalk #632, #633, #641, #628, #627, #620 (declined, every one), #613, #661, #626; ora #239 (declined); listr2 #755, #745; Inquirer D#1270, D#1206 — §13, U10 | cited |
| R11 | no issue asks for a palette importer; clack #36 wants themes, not a corpus | hypothesis — measure before lock |

Revised 2026-09-08 while grading chalk's suite: FORCE_COLOR and --color are the user's
explicit colour instruction and apply in any mode; the mode still decides redraws (U2).
Before: level 0 under every mode but tty, which failed chalk's 11 force-colour cases and
would have surprised every CI user who sets FORCE_COLOR to get coloured logs.

## Design

```text
packages/roundel/src/
  policy.ts       outputMode, colorLevel                      (the only env reader)
  tokens.ts       the nine tokens over util.styleText; reads the theme set by fly()
  theme.ts        fly(), defaults (rock/juniper), truecolor → nearest styleText fallback
  contrast.ts     WCAG 2.2 maths, copied from burgee/contrast.ts (60 lines, on purpose)
  chalk.ts        the façade: Proxy-based chain builder, level, chalkStderr, supportsColor
  index.ts        export * from each — no side effects
  *.test.ts       policy truth table · tokens per mode snapshot · contrast vectors
  subpath-isolation.test.ts · weight.test.ts · shape.test.ts
```

**Order.** `policy` → `tokens` → `theme` + `contrast` → `chalk` → vendor chalk's suite in
`compat-oracle` → B4 rows. The first three ship as `0.1.0`; the façade ships when its pass
rate is on the scoreboard.

**How burgee uses it without importing it.** `burgee`'s help renderer keeps its four
`styleText` calls and gains `renderHelp(node, { theme })`, typed structurally as
`Record<token, (s) => s>`. A user who has `roundel` passes `roundel`'s tokens; a user who
does not gets the defaults. Zero bytes of `roundel` in `import 'burgee'`.

## Verification

- `npm test -w roundel` — R1 truth table (mode × env × TTY), R3 snapshot per mode, R5
  vectors from burgee's contrast tests, R7 isolation, R8 weight, shape (Z1).
- `npm run compat -- chalk` — pass rate, `--control` first.
- The check that would have caught the original problem (five libraries disagreeing about
  the terminal): the R1 truth table has one answer per input, and every component in the
  family is forbidden by the env grep from computing its own.

## Rejected alternatives

- **Depending on `burgee` for `contrast`.** Reverses the arrow (U1). Sixty lines duplicated
  beats a dependency; the two copies share a test vector file.
- **Chalk's mutable global level as the family's model.** It is why chalk and ora disagree.
  Kept only inside the façade to pass chalk's tests; everything else reads the policy.
- **Claiming contrast on 16-colour output.** The palette is the user's terminal theme;
  a number there would be invented.
- **Template-literal API (`chalk\`{red x}\``).** Removed in chalk 5; not resurrected.

## Out of scope

- Gradients, animations, hyperlinks (`ansi-escapes`) — `flagstaff` or never.
- Colour conversion beyond hex → nearest 256/16 (no HSL, no named CSS colours).
- A CLI. `roundel` is a library; `burgee brand` already owns the brand tooling.
