---
title: Packages
description: "burgee and the 9 packages it is built from: what each replaces, and the site its docs live on."
---

Every package in the family is published on its own, depends on nothing outside this
repository, and has a site of its own, or a section here until its site exists. Its page
is its README, projected; the family-wide pages — [compatibility](/docs/compatibility),
[comparison](/docs/comparison) and [gallery](/docs/gallery) — stay here, one copy each.

| Package | Replaces | Site |
| :-- | :-- | :-- |
| [burgee](https://burgee.interlace.tools/docs/packages/burgee) | commander and yargs | [burgee.interlace.tools](https://burgee.interlace.tools) |
| [bellpull](https://bellpull.interlace.tools/docs) | cross-spawn and which | [bellpull.interlace.tools](https://bellpull.interlace.tools) |
| [caique](https://caique.interlace.tools/docs) | inquirer and clack | [caique.interlace.tools](https://caique.interlace.tools) |
| [closeout](https://closeout.interlace.tools/docs) | signal-exit, exit-hook and restore-cursor | [closeout.interlace.tools](https://closeout.interlace.tools) |
| [controlroom](https://burgee.interlace.tools/docs/packages/controlroom) | ink, graded by ink's own suite | [burgee.interlace.tools](https://burgee.interlace.tools) |
| [flagstaff](https://flagstaff.interlace.tools/docs) | ora, log-update, boxen and cli-table3 | [flagstaff.interlace.tools](https://flagstaff.interlace.tools) |
| [linegauge](https://linegauge.interlace.tools/docs) | string-width, wrap-ansi, strip-ansi and slice-ansi | [linegauge.interlace.tools](https://linegauge.interlace.tools) |
| [paratext](https://paratext.interlace.tools/docs) | ansi-escapes, terminal-link and term-img | [paratext.interlace.tools](https://paratext.interlace.tools) |
| [roundel](https://roundel.interlace.tools/docs) | chalk | [roundel.interlace.tools](https://roundel.interlace.tools) |
| [seniority](https://seniority.interlace.tools/docs) | cosmiconfig, dotenv and rc | [seniority.interlace.tools](https://seniority.interlace.tools) |

## Which one do I need?

Two packages draw in a terminal. They split on whether the program owns the screen.

- **flagstaff, for inline output in a scrolling terminal.** Spinners, progress, task lists,
  boxes and tables, drawn in place under what the program has already printed and left in
  the scrollback as ordinary lines. It reads no keys. Usable today, with drop-in paths for
  ora, log-update, boxen and cli-table3.
- **controlroom, for a screen that reads keys.** Panes, tabs with key hints, focus and
  collapse, an input line, with keys routed to the program, either inline under the
  program's output or in the alternate screen. An ink program moves by its import, to
  `controlroom/ink`. Coming from blessed, neo-blessed or terminal-kit? The
  [coming-from guides](/docs/coming-from/blessed) map each one onto `open()`, and
  `burgee migrate` reports their sites.

If a program only draws, it is flagstaff, even when the drawing is busy. If it reads keys
while it draws, it is controlroom, and its inline screen keeps that in the main screen,
the shape of a chat CLI. A question asked once, such as a confirm or a pick, is neither:
it is a prompt, and prompts are caique's.

Off a terminal, flagstaff gives a pipe, CI, a screen reader and `--json` each component's
static projection, never a redraw, and controlroom does the same for a whole screen.
