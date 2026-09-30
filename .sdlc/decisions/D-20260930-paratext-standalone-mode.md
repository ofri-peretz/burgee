---
id: D-20260930-paratext-standalone-mode
subject: 'paratext: how does a program that uses paratext on its own, with no host that asked roundel, get the static projection in `accessible` mode on a terminal?'
taken: Owner — default stands
date: '2026-09-30'
superseded_by: —
---

**Owner.** Until they decide otherwise, the default is that **paratext is told the mode and never works it out itself.** `Runtime.mode` carries roundel's `outputMode(rt)`. When it is anything but `tty`, every capability renders its fallback, which is flagstaff's rule for `pipe`, `ci` and `accessible`. When it is absent, `processRuntime()` leaves it out, so support is decided from `when` alone, as it was before 2026-09-30.

**Why it cannot be decided here.** In the default, only one mode leaks OSC: `accessible` on a terminal. `ci` needs stdout to not be a TTY, and every built-in's `when` already refuses a pipe. To know `accessible` on its own, paratext would have to read `CLI_ACCESSIBLE`. `cli-output-stack` R2 gives that variable, and `CI`, exactly one reader in the family, which is `roundel/policy`. And paratext is a leaf, so it may not import roundel (`package-shape-lock`: a leaf depends on nothing in the repo). The requirement for this fix was to raise the question instead of adding an edge. The three ways out each break one rule, and choosing between them is a choice about package identity:

1. **A second reader.** `runtime.ts` reads `CLI_ACCESSIBLE` in `processRuntime()` and sets `mode: 'accessible'`. This is about 40 bytes and needs a `KNOWN` row against R2. It is the smallest diff and makes the standalone default correct.
2. **Keep the default blind (this is the default).** A program that wants the rule passes `{ ...processRuntime(), mode: outputMode(rt) }`. No rule moves, but a standalone paratext user who sets nothing still gets OSC under `CLI_ACCESSIBLE`.
3. **Move the mode function below both.** `outputMode` goes to a leaf that roundel and paratext could each carry a copy of. That is a copy, which `inline-implementation-lock` exists to stop.

This is also why flagstaff's `link.ts` does not pass `mode` yet. Wiring it to `outputMode` is a separate flagstaff change with its own weight allow-list edit (`roundel/policy` on `./box` and `./table`), and it should follow this decision rather than precede it.
