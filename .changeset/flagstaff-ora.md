---
"flagstaff": minor
---

`flagstaff/ora` — ora 9's whole API, graded 99 / 99 by ora's own test suite. One import changes; the seventeen packages ora ships become two, 113,577 B of JavaScript becomes 55,641 B (49%), and the spinner corpus, the display width, the log symbols, the cursor control — restored on `SIGINT`, `SIGTERM` and `SIGHUP` as well as a clean exit — and the stdin discarder come with it. Both sides counted the same way from the entry point: shipped `.js` plus the `.json` a module imports, `package.json` excluded.
