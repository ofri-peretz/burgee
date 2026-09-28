---
title: controlroom
description: "Reserved, and not usable yet: full-screen, keyboard-driven terminal screens with a static projection for pipes, CI and --json. The planned drop-in path for ink. Its only export today is status = 'reserved'."
---

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

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/LICENSE).

## Benchmarks

Every number here is produced by `npm run bench` and published at [/docs/benchmarks](/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.
## Where it sits

It hosts no plugin key of its own.

Nothing in this family builds on it yet, and it builds on nothing in this family.
