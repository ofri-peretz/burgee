---
"hookset": patch
---

The codegraph hook indexes `.` from the repo folder instead of passing the folder path, so on Windows, where npx runs through a shell, a path with a space in it no longer splits.
