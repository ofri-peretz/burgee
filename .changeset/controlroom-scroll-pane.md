---
'controlroom': patch
---

A pane taller than its rectangle scrolls. Before this, `fit` kept a pane's first rows and dropped the rest, and no key could reach them. The focused pane now moves with `↑`/`↓`, PgUp/PgDn and Home/End, bound in the default keymap as `scroll.up`, `scroll.down`, `scroll.pageUp`, `scroll.pageDown`, `scroll.top` and `scroll.bottom` and listed by `hints()`. A pane at its bottom follows new lines like a log tail. Scrolled up, it stays where it was put, and its last row says how many lines are below (`↓ 180`). A resize re-clamps the position. Its position is reducer state, `ScreenState.scroll`, and `reduce(state, action, extents)` takes the pane heights that the new `extents()` measures.

A tall pane on a live screen now opens at its last rows, where before it showed its first rows. Those rows were unreachable before, so nothing that worked stops working, but a long static text in a short pane now opens at its end until someone presses Home.

Off a terminal nothing changes: a pipe, CI, a screen reader and an agent still get every line of every pane. `compose` with `live: false` now prints every line too, so a screen that closes inline leaves every line in the scrollback, not just the page it was on.
