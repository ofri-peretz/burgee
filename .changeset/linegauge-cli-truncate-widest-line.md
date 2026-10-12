---
"linegauge": minor
"burgee": patch
---

Two new drop-in subpaths, each graded by its incumbent's own suite and level with it. `linegauge/cli-truncate` is cli-truncate 6 (12 of 12): its default export and `position`, `space`, `preferTruncationOnSpace` and `truncationCharacter`, over linegauge's own `slice` and `width`. `linegauge/widest-line` is widest-line 6 (1 of 1) over `widest`. `truncate` and `widest` are unchanged. `burgee migrate` now rewrites `cli-truncate` and `widest-line`.
