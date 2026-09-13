---
'linegauge': patch
---

docs: the README describes the package that shipped

It opened with "**Not yet released.** This version reserves the name", under a heading
reading "What it will be", while `linegauge@0.1.0` was live on npm with a graded
string-width row on the public compatibility page. Anyone who installed it was told the
package does nothing.

Rewritten for someone installing it today: what the five functions are, why they are one
package rather than twelve, and what "without the edge fraying" actually guarantees — a
cluster is atomic, a style that was open gets closed, and the ellipsis is counted inside the
budget rather than added on top.

`strip` and the ASCII fast path are named as still at the gate, because they are.
