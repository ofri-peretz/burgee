---
'roundel': patch
'flagstaff': patch
---

One `Runtime` seam per package, and one file in each that names the process (Y9).

`roundel/src/runtime.ts` and `flagstaff/src/runtime.ts` each declare a `Runtime` — the slice
of the world that package actually needs — and a `processRuntime()` that is the only place
the real process is named. Six files stop naming it: `roundel/chalk`, and flagstaff's `cli`,
`ora`, `boxen`, `cursor` and `log-update`.

Nothing about the ports' behaviour moved, and the shape of each seam is what holds that.
roundel's returns a literal, because chalk's contract is to detect the terminal once at
import; flagstaff's hands back the live process narrowed to the interface, because its
incumbents read the process at call time — boxen takes `stdout.columns` every time a box is
drawn, so a box drawn after a resize still uses the new width, and ora still hooks the real
stream objects and still looks up `kill` when it re-signals a swallowed Ctrl+C. The
compatibility rows are unchanged: chalk 58/58, ora 99/99, log-update 99/99, boxen 84/84,
restore-cursor 6/6.
