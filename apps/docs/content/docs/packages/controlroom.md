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

A **control room** is where a system is watched and run from.

## Install

The reserved version installs, and gives you the one constant below:

```bash
npm install controlroom
pnpm add controlroom
yarn add controlroom
bun add controlroom
```

## Quick start

```js
import { status } from 'controlroom';

console.log(status); // 'reserved'
```

That is the whole of the package today. Everything under the headings below is planned, and
each plan is a requirement in the
[spec](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/controlroom/spec.md); this
README will change when one ships.

## Migrating

**None of this exists yet.** It is what the spec commits to, not something to try.

From **ink**, the planned path is one import, graded by Ink's own test suite (R11, R13):

```diff
- import { render, Box, Text } from 'ink';
+ import { render, Box, Text } from 'controlroom/ink';
```

Resolving `'ink'` to `controlroom/ink` through a `package.json` alias or `overrides` is meant
to run `@inkjs/ui`, `ink-spinner`, `ink-text-input` and `ink-select-input` unchanged (R17),
with no façade of their own.

From **blessed**, **neo-blessed** and **terminal-kit** there will be no drop-in — their surfaces
are too large to reproduce honestly. Each gets a coming-from guide and `burgee migrate`
codemod rules for the common screen, box, list and key patterns instead (R18).

## Compatibility

Not graded yet. No incumbent suite runs against this package, because there is nothing to run
it against. The plan is Ink's suite vendored into `compat-oracle` at a pinned release, with a
control run against real Ink and a baseline that only ratchets (R13), and `@inkjs/ui`'s suite
graded through the same alias (R17). Its row will appear on the
[compatibility page](https://burgee.interlace.tools/docs/compatibility) when it exists.

## Benchmarks

Every number here is produced by `npm run bench` and published at [burgee.interlace.tools/docs/benchmarks](https://burgee.interlace.tools/docs/benchmarks).

No suite is graded against this package yet, so there is no compatibility number to quote.

## For agents

Planned, not built: the reason the package exists is that a full-screen program is useless to
an agent today. When it ships, the same program that draws panes on a terminal will write:

- **stable lines** — its static projection — to a pipe, in CI and for a screen reader;
- **NDJSON events under `--json`**, on stderr, one per state change;
- and it will never wait for a key that nobody can press.

The family's machine-readable docs are at
[burgee.interlace.tools/llms.txt](https://burgee.interlace.tools/llms.txt).

## API

`status` — the string `'reserved'` — and its type, `Status`. There is nothing else to document
yet; the planned surface is in the
[spec](https://github.com/ofri-peretz/burgee/blob/main/.sdlc/intents/controlroom/spec.md).

When it ships, it will build on its siblings rather than beside them: flagstaff draws the
panes, caique reads the keys, closeout restores the terminal, linegauge measures, and roundel
decides the output mode.

## Where it sits

It hosts no plugin key of its own.

Nothing in this family builds on it yet, and it builds on nothing in this family.

## The family

Ten packages, one repository, one release pipeline. A CLI on burgee declares what it is, roundel
carries its colours, flagstaff flies it and caique answers back; each installs on its own, and none
takes a dependency from outside the family.

| Package | What it is | Replaces |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | The CLI framework: one declaration, every surface | commander and yargs |
| [roundel](https://roundel.interlace.tools/docs) | Colour: one output policy, semantic tokens, a theme | chalk |
| [flagstaff](https://flagstaff.interlace.tools/docs) | The frame loop: spinners, progress, boxes and tables | ora, log-update, boxen and cli-table3 |
| [caique](https://caique.interlace.tools/docs) | Prompts that are flags first, and never hang | inquirer and clack |
| [linegauge](https://linegauge.interlace.tools/docs) | Measuring, wrapping, truncating and slicing styled text | string-width, wrap-ansi, strip-ansi and slice-ansi |
| [paratext](https://paratext.interlace.tools/docs) | Hyperlinks, images, title, clipboard and notifications | ansi-escapes, terminal-link and term-img |
| [seniority](https://seniority.interlace.tools/docs) | Configuration precedence and discovery, with provenance | cosmiconfig, dotenv and rc |
| [closeout](https://closeout.interlace.tools/docs) | Exit handlers, terminal restore and a bounded shutdown | signal-exit, exit-hook and restore-cursor |
| [bellpull](https://bellpull.interlace.tools/docs) | Subprocesses, and which executable actually ran | cross-spawn and which |
| **controlroom** (this package) | Reserved, not usable yet — planned: full-screen, keyboard-driven terminal screens | ink, planned |

Every migration guide, and the family-wide [compatibility](https://burgee.interlace.tools/docs/compatibility)
and [benchmarks](https://burgee.interlace.tools/docs/benchmarks) pages, are on
[burgee.interlace.tools](https://burgee.interlace.tools/docs/packages).

## Contributing

Issues and pull requests are welcome at [ofri-peretz/burgee](https://github.com/ofri-peretz/burgee/issues); read
[CONTRIBUTING.md](https://github.com/ofri-peretz/burgee/blob/main/CONTRIBUTING.md) first. Report a vulnerability privately, as
[SECURITY.md](https://github.com/ofri-peretz/burgee/blob/main/SECURITY.md) describes — never in a public issue.

## Licence

MIT © Ofri Peretz — see [LICENSE](https://github.com/ofri-peretz/burgee/blob/main/packages/controlroom/LICENSE).
