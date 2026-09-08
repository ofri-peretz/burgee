# roundel

The colours a CLI carries. One output policy decided once, semantic tokens over Node's own
`util.styleText`, a theme set once for a whole program, and the WCAG maths that refuses a
theme that would not read. Where chalk gives you `red` and picocolors gives you `red`
faster, roundel gives you `error` — and a pipe, a CI log, an AI agent and a screen reader
all get the plain string, because the policy said so, not each library for itself.

Zero dependencies. Node 24 or later. Every subpath costs only itself.

A **roundel** is a flag's colours carried onto another surface — the rings on an aircraft's
wing, the London Underground sign. Identity, expressed purely in colour, on something that is
not a flag.

## Use

```js
import { outputMode, colorLevel } from 'roundel/policy';
import { createTokens } from 'roundel/tokens';

const rt = { isTTY: { stdout: process.stdout.isTTY }, env: process.env };
const t = createTokens(rt);

console.log(t.heading('Commands:'));
console.log(`  ${t.command('deploy')}  ${t.muted('ship the current build')}`);
console.error(t.error('error:'), 'no target given', t.hint('(try --target prod)'));
```

Off a terminal every token returns its input unchanged. On one, it styles at the level the
policy allows: `FORCE_COLOR`, `NO_COLOR`, `TERM`, `COLORTERM` and the CI vendor, read the
way chalk reads them — with one deliberate difference: **no colour under any mode but
`tty`**, whatever `FORCE_COLOR` says. `outputMode(rt, { json })` is the one answer the whole
family reads: `tty`, `pipe`, `json`, `accessible` or `ci`.

## Subpaths

| Subpath | Gives you |
| :-- | :-- |
| `roundel/policy` | `outputMode(rt, { json? })`, `colorLevel(rt)` — pure over `{ isTTY: { stdout }, env }` |
| `roundel/tokens` | `createTokens(rt, { theme? })` → nine tokens: `error warn ok hint muted command flag value heading`; `PLAIN` for never |
| `roundel/theme` | `fly(theme, { ground? })` once per program; `DEFAULT_THEME`, `BRAND_THEME` |
| `roundel/contrast` | `contrast(a, b)`, `luminance`, `mix`, `AA` |

## Theme

```js
import { fly } from 'roundel/theme';

fly({ command: '#b97045', flag: '#3b896c', heading: ['bold', 'underline'] });
```

A token is a `styleText` format list or a `#rrggbb`. Hex renders as truecolor when the
terminal has it and falls back to the nearest 256-colour or basic colour below that. A hex
token is checked at `fly()` against the ground you declare (`#0a0a0a` by default) and
refused under 4.5:1, naming the token and the ratio. Format tokens are never checked: the
16-colour palette is the user's terminal theme, and a number there would be invented.

## Part of a family

A CLI on [burgee](https://github.com/ofri-peretz/burgee) declares what it is; roundel
carries its colours; flagstaff flies it; caique answers back. Each is an independent
package; none requires the others. `roundel/chalk` — chalk's API over these tokens, graded
by chalk's own test suite — follows.
