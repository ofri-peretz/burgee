# Design — roundel

Intent: [`intent.md`](./intent.md). **Status:** approved.

---

## Requirements

- **R1** `outputMode(rt): 'tty' | 'pipe' | 'json' | 'accessible' | 'ci'` is pure over
  `{ isTTY: { stdout }, env, json?: boolean }`. Precedence, first match wins: `json` if
  `rt.json`; `accessible` if `env.CLI_ACCESSIBLE`; `ci` if `env.CI` and not a TTY; `pipe`
  if not a TTY; else `tty`.
- **R2** `colorLevel(rt): 0 | 1 | 2 | 3` mirrors chalk's levels from `NO_COLOR`,
  `FORCE_COLOR`, `TERM`, `COLORTERM` and TTY-ness, and is `0` under every mode but `tty`.
- **R3** Tokens `error warn ok hint muted command flag value heading` are functions
  `(s: string) => string`, implemented over `util.styleText`, and return `s` unchanged
  when `colorLevel === 0`. Nothing else in the package touches ANSI.
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
