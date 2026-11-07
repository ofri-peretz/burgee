---
"linegauge": patch
---

One fix.

- **A plugin that claims a printable ASCII code point is honoured on every path.** `width`, `wrap` and `slice` answered printable ASCII as one column per character before asking the plugin, so with `~` registered as two columns `width('~')` was 1 while `width('~é')` was 3, `wrap('~~', 2, { hard: true })` kept both on one row, and `slice('~~', 0, 2)` returned both. The ASCII shortcut now applies only while no plugin claims anything, as `measure` already did.
