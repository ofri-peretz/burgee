<p align="center">
  <a href="https://github.com/ofri-peretz/burgee/tree/main/packages/controlroom" target="blank">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/controlroom-lockup.svg" />
      <img src="https://raw.githubusercontent.com/ofri-peretz/burgee/main/brand-assets/controlroom-lockup-light.svg" alt="controlroom" width="360" />
    </picture>
  </a>
</p>

<p align="center">
  Full-screen terminal screens that still print clean lines to a pipe. Reserved; not usable yet.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/controlroom"><img src="https://img.shields.io/npm/v/controlroom?style=flat-square&color=0a6b47" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/status-reserved-a84c17?style=flat-square" alt="Status: reserved, not usable yet" />
  <img src="https://img.shields.io/badge/runtime%20dependencies-0-0a6b47?style=flat-square" alt="Zero runtime dependencies" />
  <img src="https://img.shields.io/badge/Node.js-20.19%2B%20%7C%2022.13%2B-green.svg?style=flat-square" alt="Node.js 20.19+ or 22.13+" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT" />
</p>

<p align="center">
  Docs: <a href="https://burgee.interlace.tools/docs/packages/controlroom">https://burgee.interlace.tools/docs/packages/controlroom</a>
</p>

**Reserved; not usable yet.** This version exports one constant, `status = 'reserved'`, and
nothing else. There is no screen, no layout and no `controlroom/ink` to import today, so
don't build on it. The design is approved, and it is set out in the intent:
[`.sdlc/intents/controlroom/`](https://github.com/ofri-peretz/burgee/tree/main/.sdlc/intents/controlroom).

**What it is for.** controlroom will replace **ink** and `@inkjs/ui` in the burgee family. It
draws full-screen, keyboard-driven terminal screens: panes, tabs with key hints, a checklist,
a log tail, and sections that collapse. It uses the alternate screen and lays itself out
again on resize. The same program gives every other caller a **static projection**: stable
lines in a pipe, in CI and for a screen reader, and NDJSON events under `--json` for an
agent. It never waits for a key that nobody can press.

**How Ink programs move.** `controlroom/ink` is planned as a drop-in for `ink`, graded by
Ink's own test suite, with its pass rate published. Resolving `'ink'` to it is meant to run
`@inkjs/ui`, `ink-spinner`, `ink-text-input` and `ink-select-input` unchanged. blessed,
neo-blessed and terminal-kit get migration guides and `burgee migrate` rules instead of a
drop-in. None of this exists yet. Each is a requirement in the spec, and the README will
change when one ships.

A **control room** is where a system is watched and run from.

```js
import { status } from 'controlroom';

console.log(status); // 'reserved'
```

---

Part of the [burgee](https://github.com/ofri-peretz/burgee) family. When it ships, it will
build on its siblings rather than beside them: flagstaff draws the panes, caique reads the
keys, closeout restores the terminal, linegauge measures, and roundel decides the output
mode. Each sibling is an independent package that a program can adopt on its own.

MIT © Ofri Peretz — see [LICENSE](./LICENSE).

## Benchmarks

Every number here is produced by `npm run bench` and published at [/docs/benchmarks](/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.
## Where it sits

It hosts no plugin key of its own.

Nothing in this family builds on it yet, and it builds on nothing in this family.
