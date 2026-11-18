---
"oxmutate": minor
---

`static.readers` is now on by default: a static mutant runs only in the test files that read its value, with one survivor in twenty audited in every loading file and the run failing on a disagreement. Set `static.readers: 'off'` or pass `--no-static-readers` to run every loading file, as before. The read-tracking dry run is skipped when no tracked module is loaded by more than one test file.
