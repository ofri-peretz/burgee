# Intent — `oxmutate-container`: mutation testing with the host a black box

**Status:** approved · **Opened:** 2026-11-18 · **Owner:** @ofri-peretz · **Parent:**
[`oxmutate-fastest`](../oxmutate-fastest/intent.md)

---

## What is wanted

The owner's words, 2026-11-18 and 2026-11-19: oxmutate should "run inside a local docker it will
spawn and the user will be able to configure", allow "maximum customization" with "a sugar syntax",
and "run mutation testing in all options docker allows, but specifically in a decoupled way from the
main machine, so it will be a blackbox for the machine."

1. `container: true` runs the whole mutation run inside containers oxmutate starts; the host hands
   the source in and gets the reports back, and mounts nothing.
2. Every option Docker (or Podman) has is reachable: named keys for the common ones, pass-through
   for the rest.
3. The tests run with least privilege: no capabilities, no network unless asked.

## Why now

A mutation run executes the project's tests thousands of times with deliberately broken code. On a
developer's machine that is CPU, disk churn and test side effects the machine has to absorb;
isolating it is the next step after making it fast (`oxmutate-fastest`).

## Constraints

- No new dependency: the container CLI is the user's own (`docker`, `podman`), and oxmutate starts
  it through `bellpull` (the inline-implementation lock).
- Verdicts are the project's own oxmutate's, unchanged: the container changes where a run happens,
  not what it decides.
- A run that cannot start says why and what to do (a `fix:` line), as every oxmutate error does.

## Success criteria

- The checks in [`spec.md`](./spec.md) R1–R7 pass, each with the test or measurement it names.
- A project with no `node_modules` on the host runs under `--container`, on Docker and on Podman.
- Nothing labelled `dev.oxmutate=1` is left behind by an `ephemeral` run.
