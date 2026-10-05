---
"flagstaff": minor
---

`frameWriter()` from `flagstaff/loop`: paint a whole frame and only the changed rows are written, in one synchronized-output block. `hoist` repaints through it, so a terminal frame no longer redraws unchanged text. New `flagstaff/log-tail` (the last lines of a stream, `┊` and `◆`, a static projection that appends) and `flagstaff/tab-bar` (the active tab's label off a terminal), each registered through `register()`. The task list's pending mark is the replaceable `pending` glyph.
