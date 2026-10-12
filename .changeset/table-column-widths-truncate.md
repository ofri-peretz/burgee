---
"flagstaff": minor
---

A `table()` column can say what happens past its width: `columns: [{ overflow: 'truncate' }]` cuts a cell to one row ending in `…`, by display width through `linegauge/truncate`, with a link kept around the text that survives. `'wrap'`, the default, is the behaviour tables have always had. `tableComponent()`'s static projection prints every cell whole whatever `columns` says.
